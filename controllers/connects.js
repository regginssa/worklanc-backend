const Users = require("../models/users");
const PaymentMethods = require("../models/paymentMethods");
const ConnectBundleOptions = require("../models/connectBundleOptions");
const ConnectCheckouts = require("../models/connectCheckouts");
const StripeService = require("../services/stripe");
const {
  assertTokenOnChain,
  CRYPTO_QUOTE_TTL_MINUTES,
} = require("../config/crypto");
const {
  fetchTokenPricesUsd,
  convertUsdCentsToCryptoAmount,
} = require("../services/cryptoPricing");
const { verifyCryptoPayment } = require("../services/cryptoVerification");

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

const toCryptoPaymentPayload = (checkoutRow) => ({
  chain: checkoutRow.crypto_chain,
  token: checkoutRow.crypto_token,
  amount: checkoutRow.crypto_amount,
  treasuryAddress: checkoutRow.crypto_treasury_address,
  senderAddress: checkoutRow.crypto_sender_address,
  tokenContract: checkoutRow.crypto_token_contract,
  quoteExpiresAt: checkoutRow.crypto_quote_expires_at,
  checkoutUid: checkoutRow.uid,
});

const listBundles = async (req, res) => {
  try {
    const bundles = await ConnectBundleOptions.listActive();
    return res.status(200).json({ bundles });
  } catch (e) {
    console.error("listBundles error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getConnectsBalance = async (req, res) => {
  try {
    const connectsBalance = await Users.getConnectsBalance(req.user.id);
    return res.status(200).json({ connectsBalance });
  } catch (e) {
    console.error("getConnectsBalance error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const listHistory = async (req, res) => {
  try {
    const search = req.query.search ?? "";
    const dateRange = req.query.dateRange ?? "last-30-days";

    const transactions = await ConnectCheckouts.listUserHistory(req.user.id, {
      search,
      dateRange,
    });

    return res.status(200).json({ transactions });
  } catch (e) {
    console.error("listHistory error: ", e);
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

    if (checkout.status === "processing" && checkout.paymentMethod === "crypto") {
      return res.status(200).json({ checkout });
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
      const connectsBalance = await Users.getConnectsBalance(req.user.id);
      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(checkoutRow),
        connectsBalance,
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

      const completion = await ConnectCheckouts.completeAndCreditConnects(
        uid,
        req.user.id,
        { stripePaymentIntentId: paymentIntent.id },
        checkoutRow.connect_amount,
      );

      if (!completion?.checkout) {
        return res.status(409).json({
          message: "Payment recorded inconsistently. Contact support.",
        });
      }

      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(completion.checkout),
        connectsBalance: completion.connectsBalance,
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

const prepareCheckoutCryptoPayment = async (req, res) => {
  try {
    const { uid } = req.params;
    const cryptoWalletUid = req.body?.cryptoWalletUid;
    const cryptoToken = String(req.body?.cryptoToken ?? "").toLowerCase();

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ message: "Checkout uid is required." });
    }

    if (!cryptoWalletUid || typeof cryptoWalletUid !== "string") {
      return res.status(400).json({ message: "cryptoWalletUid is required." });
    }

    if (!cryptoToken) {
      return res.status(400).json({ message: "cryptoToken is required." });
    }

    await ConnectCheckouts.expireStaleForUser(req.user.id);

    const checkoutRow = await ConnectCheckouts.getByUidAndUserId(uid, req.user.id);
    if (!checkoutRow) {
      return res.status(404).json({ message: "Checkout not found." });
    }

    if (checkoutRow.status === "completed") {
      const connectsBalance = await Users.getConnectsBalance(req.user.id);
      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(checkoutRow),
        connectsBalance,
        alreadyPaid: true,
      });
    }

    if (
      checkoutRow.status !== "pending" &&
      checkoutRow.status !== "failed" &&
      checkoutRow.status !== "processing"
    ) {
      return res.status(409).json({
        message: "This checkout is not available for payment.",
      });
    }

    if (new Date(checkoutRow.expires_at).getTime() <= Date.now()) {
      await ConnectCheckouts.markFailed(uid, req.user.id, "Checkout expired.");
      return res.status(410).json({ message: "This checkout has expired." });
    }

    const savedWallet = await PaymentMethods.getByUidAndUserId(
      cryptoWalletUid,
      req.user.id,
    );

    if (!savedWallet || savedWallet.type !== "crypto") {
      return res.status(400).json({ message: "Saved crypto wallet not found." });
    }

    const chain = savedWallet.crypto_chain;
    const tokenValidation = assertTokenOnChain(chain, cryptoToken);
    if (tokenValidation.error) {
      return res.status(400).json({ message: tokenValidation.error });
    }

    const hasReusableCryptoQuote =
      checkoutRow.status === "processing" &&
      checkoutRow.payment_method === "crypto" &&
      checkoutRow.saved_payment_method_uid === cryptoWalletUid &&
      checkoutRow.crypto_chain === chain &&
      checkoutRow.crypto_token === cryptoToken &&
      checkoutRow.crypto_amount &&
      checkoutRow.crypto_treasury_address &&
      checkoutRow.crypto_sender_address &&
      checkoutRow.crypto_quote_expires_at &&
      new Date(checkoutRow.crypto_quote_expires_at).getTime() > Date.now();

    if (hasReusableCryptoQuote) {
      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(checkoutRow),
        payment: toCryptoPaymentPayload(checkoutRow),
      });
    }

    const prices = await fetchTokenPricesUsd();
    const priceUsd = prices[cryptoToken];
    const quote = convertUsdCentsToCryptoAmount(
      checkoutRow.total_cents,
      cryptoToken,
      priceUsd,
    );

    if (quote.error) {
      return res.status(400).json({ message: quote.error });
    }

    const quoteExpiresAt = new Date(
      Date.now() + CRYPTO_QUOTE_TTL_MINUTES * 60 * 1000,
    );

    const locked = await ConnectCheckouts.lockCryptoQuote(uid, req.user.id, {
      savedPaymentMethodUid: cryptoWalletUid,
      cryptoChain: chain,
      cryptoToken,
      cryptoAmount: quote.amount,
      cryptoTreasuryAddress: tokenValidation.treasury,
      cryptoSenderAddress: savedWallet.crypto_address,
      cryptoTokenContract: tokenValidation.contract,
      cryptoTokenPriceUsd: quote.priceUsd,
      quoteExpiresAt,
    });

    if (!locked) {
      return res.status(409).json({
        message: "Unable to prepare crypto payment for this checkout.",
      });
    }

    return res.status(200).json({
      checkout: ConnectCheckouts.toPublicCheckoutRow(locked),
      payment: toCryptoPaymentPayload(locked),
    });
  } catch (e) {
    console.error("prepareCheckoutCryptoPayment error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const confirmCheckoutCryptoPayment = async (req, res) => {
  try {
    const { uid } = req.params;
    const txHash = String(req.body?.txHash ?? "").trim();

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ message: "Checkout uid is required." });
    }

    if (!txHash) {
      return res.status(400).json({ message: "txHash is required." });
    }

    await ConnectCheckouts.expireStaleForUser(req.user.id);

    const checkoutRow = await ConnectCheckouts.getByUidAndUserId(uid, req.user.id);
    if (!checkoutRow) {
      return res.status(404).json({ message: "Checkout not found." });
    }

    if (checkoutRow.status === "completed") {
      const connectsBalance = await Users.getConnectsBalance(req.user.id);
      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(checkoutRow),
        connectsBalance,
        alreadyPaid: true,
      });
    }

    if (checkoutRow.status !== "processing" || checkoutRow.payment_method !== "crypto") {
      return res.status(409).json({
        message: "Crypto payment has not been prepared for this checkout.",
      });
    }

    if (
      checkoutRow.crypto_quote_expires_at &&
      new Date(checkoutRow.crypto_quote_expires_at).getTime() < Date.now()
    ) {
      await ConnectCheckouts.resetToPending(uid, req.user.id);
      return res.status(410).json({
        message: "Crypto quote expired. Prepare payment again.",
      });
    }

    const existingTx = await ConnectCheckouts.getByCryptoTxHash(txHash);
    if (existingTx && existingTx.uid !== uid) {
      return res.status(409).json({
        message: "This transaction has already been used for another checkout.",
      });
    }

    if (existingTx?.status === "completed") {
      const connectsBalance = await Users.getConnectsBalance(req.user.id);
      return res.status(200).json({
        checkout: ConnectCheckouts.toPublicCheckoutRow(existingTx),
        connectsBalance,
        alreadyPaid: true,
      });
    }

    const verification = await verifyCryptoPayment({
      chain: checkoutRow.crypto_chain,
      txHash,
      treasuryAddress: checkoutRow.crypto_treasury_address,
      senderAddress: checkoutRow.crypto_sender_address,
      token: checkoutRow.crypto_token,
      tokenContract: checkoutRow.crypto_token_contract,
      expectedAmount: checkoutRow.crypto_amount,
    });

    if (!verification.ok) {
      if (verification.pending) {
        return res.status(200).json({
          message: verification.error,
          pending: true,
        });
      }

      await ConnectCheckouts.markFailed(uid, req.user.id, verification.error);
      return res.status(402).json({ message: verification.error });
    }

    const completion = await ConnectCheckouts.completeAndCreditConnects(
      uid,
      req.user.id,
      { cryptoTxHash: txHash },
      checkoutRow.connect_amount,
    );

    if (!completion?.checkout) {
      return res.status(409).json({
        message: "Payment recorded inconsistently. Contact support.",
      });
    }

    return res.status(200).json({
      checkout: ConnectCheckouts.toPublicCheckoutRow(completion.checkout),
      connectsBalance: completion.connectsBalance,
    });
  } catch (e) {
    console.error("confirmCheckoutCryptoPayment error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  listBundles,
  getConnectsBalance,
  listHistory,
  createCheckout,
  applyCheckoutPromo,
  getCheckout,
  payCheckoutWithCard,
  prepareCheckoutCryptoPayment,
  confirmCheckoutCryptoPayment,
};
