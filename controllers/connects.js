const Users = require("../models/users");
const PaymentMethods = require("../models/paymentMethods");
const ConnectBundleOptions = require("../models/connectBundleOptions");
const ConnectCheckouts = require("../models/connectCheckouts");
const StripeService = require("../services/stripe");

const PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const normalizePromoCode = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
};

const ensureStripeCustomer = async (user) => {
  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  const customer = await StripeService.createCustomer({
    email: user.email,
    name: `${user.first_name} ${user.last_name}`.trim(),
    userId: user.id,
  });

  await Users.update(user.id, { stripeCustomerId: customer.id });
  return customer.id;
};

const validatePromoCodeInput = (promoCode) => {
  if (promoCode === undefined || promoCode === null || promoCode === "") {
    return { promoCode: null };
  }

  const trimmed = String(promoCode).trim();
  if (!PROMO_CODE_PATTERN.test(trimmed)) {
    return {
      error: "Promo code can only contain letters, numbers, hyphens, and underscores.",
    };
  }

  return { promoCode: normalizePromoCode(trimmed) };
};

const calculatePricing = (bundle, promoCode) => {
  const subtotalCents = bundle.priceCents;
  let discountCents = 0;

  // Promo validation/discount rules can be expanded later.
  if (promoCode) {
    discountCents = 0;
  }

  const totalCents = Math.max(subtotalCents - discountCents, 0);

  return { subtotalCents, discountCents, totalCents };
};

const listBundles = async (req, res) => {
  try {
    const bundles = await ConnectBundleOptions.listActive();
    return res.status(200).json({ bundles });
  } catch (e) {
    console.error("listBundles error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const createCheckout = async (req, res) => {
  try {
    const connectAmount = Number(req.body?.connectAmount);
    const promoValidation = validatePromoCodeInput(req.body?.promoCode);

    if (promoValidation.error) {
      return res.status(400).json({ message: promoValidation.error });
    }

    if (!Number.isInteger(connectAmount) || connectAmount <= 0) {
      return res.status(400).json({ message: "connectAmount must be a positive integer." });
    }

    const bundle = await ConnectBundleOptions.getActiveByConnectAmount(connectAmount);
    if (!bundle) {
      return res.status(400).json({ message: "Invalid Connect bundle selected." });
    }

    await ConnectCheckouts.expireStaleForUser(req.user.id);

    const existing = await ConnectCheckouts.findReusablePending(
      req.user.id,
      bundle.id,
      promoValidation.promoCode,
    );

    if (existing) {
      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(existing),
        reused: true,
      });
    }

    const pricing = calculatePricing(bundle, promoValidation.promoCode);

    const checkout = await ConnectCheckouts.createPending({
      userId: req.user.id,
      bundleOptionId: bundle.id,
      connectAmount: bundle.connectAmount,
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      totalCents: pricing.totalCents,
      promoCode: promoValidation.promoCode,
    });

    return res.status(201).json({ checkout, reused: false });
  } catch (e) {
    if (e.code === "23505") {
      const connectAmount = Number(req.body?.connectAmount);
      const promoValidation = validatePromoCodeInput(req.body?.promoCode);
      const bundle = await ConnectBundleOptions.getActiveByConnectAmount(connectAmount);

      if (bundle) {
        const existing = await ConnectCheckouts.findReusablePending(
          req.user.id,
          bundle.id,
          promoValidation.promoCode,
        );
        if (existing) {
          return res.status(200).json({
            checkout: ConnectCheckouts.toPublicCheckoutRow(existing),
            reused: true,
          });
        }
      }
    }

    console.error("createCheckout error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const applyCheckoutPromo = async (req, res) => {
  try {
    const { uid } = req.params;
    const promoValidation = validatePromoCodeInput(req.body?.promoCode);

    if (promoValidation.error) {
      return res.status(400).json({ message: promoValidation.error });
    }

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ message: "Checkout uid is required." });
    }

    await ConnectCheckouts.expireStaleForUser(req.user.id);

    const checkoutRow = await ConnectCheckouts.getByUidAndUserId(uid, req.user.id);
    if (!checkoutRow) {
      return res.status(404).json({ message: "Checkout not found." });
    }

    if (checkoutRow.status !== "pending" && checkoutRow.status !== "failed") {
      return res.status(409).json({ message: "Promo can only be applied to an open checkout." });
    }

    if (new Date(checkoutRow.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ message: "This checkout has expired." });
    }

    const currentPromo = normalizePromoCode(checkoutRow.promo_code);
    if (currentPromo === promoValidation.promoCode) {
      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(checkoutRow),
      });
    }

    const conflicting = await ConnectCheckouts.findReusablePending(
      req.user.id,
      checkoutRow.bundle_option_id,
      promoValidation.promoCode,
    );

    if (conflicting && conflicting.uid !== uid) {
      return res.status(409).json({
        message:
          "You already have an open checkout for this bundle and promo code.",
        existingCheckoutUid: conflicting.uid,
      });
    }

    const bundle = await ConnectBundleOptions.getActiveById(checkoutRow.bundle_option_id);
    if (!bundle) {
      return res.status(400).json({ message: "Connect bundle is no longer available." });
    }

    const pricing = calculatePricing(bundle, promoValidation.promoCode);

    try {
      const updated = await ConnectCheckouts.updatePromoAndPricing(uid, req.user.id, {
        promoCode: promoValidation.promoCode,
        subtotalCents: pricing.subtotalCents,
        discountCents: pricing.discountCents,
        totalCents: pricing.totalCents,
      });

      if (!updated) {
        return res.status(409).json({ message: "Unable to update promo for this checkout." });
      }

      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(updated),
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          message:
            "You already have an open checkout for this bundle and promo code.",
        });
      }
      throw error;
    }
  } catch (e) {
    console.error("applyCheckoutPromo error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getCheckout = async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ message: "Checkout uid is required." });
    }

    await ConnectCheckouts.expireStaleForUser(req.user.id);

    const checkout = await ConnectCheckouts.getPublicByUidAndUserId(uid, req.user.id);
    if (!checkout) {
      return res.status(404).json({ message: "Checkout not found." });
    }

    if (checkout.status === "expired") {
      return res.status(410).json({
        message: "This checkout has expired. Start again from the buy page.",
        checkout,
      });
    }

    if (checkout.status === "completed") {
      return res.status(200).json({ checkout, alreadyPaid: true });
    }

    if (checkout.status !== "pending" && checkout.status !== "failed") {
      return res.status(409).json({
        message: "This checkout is no longer available for payment.",
        checkout,
      });
    }

    return res.status(200).json({ checkout });
  } catch (e) {
    console.error("getCheckout error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const payCheckoutWithCard = async (req, res) => {
  try {
    const { uid } = req.params;
    const cardPaymentMethodUid = req.body?.cardPaymentMethodUid;

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ message: "Checkout uid is required." });
    }

    if (!cardPaymentMethodUid || typeof cardPaymentMethodUid !== "string") {
      return res.status(400).json({ message: "cardPaymentMethodUid is required." });
    }

    await ConnectCheckouts.expireStaleForUser(req.user.id);

    const checkoutRow = await ConnectCheckouts.getByUidAndUserId(uid, req.user.id);
    if (!checkoutRow) {
      return res.status(404).json({ message: "Checkout not found." });
    }

    if (checkoutRow.status === "completed") {
      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(checkoutRow),
        availableConnects: req.user.available_connects,
        alreadyPaid: true,
      });
    }

    if (checkoutRow.status !== "pending" && checkoutRow.status !== "failed") {
      return res.status(409).json({
        message: "This checkout is not available for payment.",
      });
    }

    if (new Date(checkoutRow.expires_at).getTime() <= Date.now()) {
      await ConnectCheckouts.markFailed(uid, req.user.id, "Checkout expired.");
      return res.status(410).json({ message: "This checkout has expired." });
    }

    if (checkoutRow.total_cents <= 0) {
      return res.status(400).json({ message: "Invalid checkout total." });
    }

    const bundle = await ConnectBundleOptions.getActiveById(checkoutRow.bundle_option_id);
    if (!bundle) {
      return res.status(400).json({ message: "Connect bundle is no longer available." });
    }

    const pricing = calculatePricing(
      bundle,
      normalizePromoCode(checkoutRow.promo_code),
    );

    if (
      pricing.totalCents !== checkoutRow.total_cents ||
      pricing.subtotalCents !== checkoutRow.subtotal_cents ||
      pricing.discountCents !== checkoutRow.discount_cents
    ) {
      const synced = await ConnectCheckouts.syncPricing(uid, req.user.id, pricing);
      if (synced) {
        checkoutRow.total_cents = synced.total_cents;
        checkoutRow.subtotal_cents = synced.subtotal_cents;
        checkoutRow.discount_cents = synced.discount_cents;
      }
    }

    const savedCard = await PaymentMethods.getByUidAndUserId(
      cardPaymentMethodUid,
      req.user.id,
    );

    if (!savedCard || savedCard.type !== "card") {
      return res.status(400).json({ message: "Saved card not found." });
    }

    if (!savedCard.stripe_payment_method_id) {
      return res.status(400).json({ message: "Saved card is missing Stripe details." });
    }

    const processing = await ConnectCheckouts.markProcessing(uid, req.user.id, {
      paymentMethod: "card",
      savedPaymentMethodUid: cardPaymentMethodUid,
    });

    if (!processing) {
      return res.status(409).json({ message: "Unable to start payment for this checkout." });
    }

    const user = await Users.getById(req.user.id);
    const customerId = await ensureStripeCustomer(user);

    try {
      const paymentIntent = await StripeService.createAndConfirmPaymentIntent({
        amountCents: checkoutRow.total_cents,
        customerId,
        paymentMethodId: savedCard.stripe_payment_method_id,
        metadata: {
          worklanc_checkout_uid: uid,
          worklanc_user_id: String(req.user.id),
          connect_amount: String(checkoutRow.connect_amount),
          promo_code: checkoutRow.promo_code || "",
        },
        idempotencyKey: `connect_checkout_${uid}`,
      });

      if (paymentIntent.status !== "succeeded") {
        await ConnectCheckouts.resetToPending(uid, req.user.id);
        return res.status(402).json({
          message: "Payment requires additional action. Try another card.",
        });
      }

      const completed = await ConnectCheckouts.markCompleted(
        uid,
        req.user.id,
        paymentIntent.id,
      );

      if (!completed) {
        return res.status(409).json({ message: "Payment recorded inconsistently. Contact support." });
      }

      const availableConnects = await Users.addAvailableConnects(
        req.user.id,
        checkoutRow.connect_amount,
      );

      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(completed),
        availableConnects,
      });
    } catch (stripeError) {
      const message =
        stripeError?.message || "Unable to process card payment. Please try again.";

      await ConnectCheckouts.markFailed(uid, req.user.id, message);

      if (stripeError?.type === "StripeCardError") {
        return res.status(402).json({ message });
      }

      console.error("payCheckoutWithCard stripe error: ", stripeError);
      return res.status(402).json({ message });
    }
  } catch (e) {
    console.error("payCheckoutWithCard error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  listBundles,
  createCheckout,
  applyCheckoutPromo,
  getCheckout,
  payCheckoutWithCard,
};
