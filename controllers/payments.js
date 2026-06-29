const Users = require("../models/users");
const PaymentMethods = require("../models/paymentMethods");
const StripeService = require("../services/stripe");

const VALID_CRYPTO_CHAINS = new Set(["solana", "ethereum", "bnb"]);

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

const saveStripeCardFromPaymentMethod = async (user, paymentMethodId) => {
  const existingCount = await PaymentMethods.countCardsByUserId(user.id);
  if (existingCount > 0) {
    throw Object.assign(
      new Error("You can only save one debit or credit card."),
      { status: 409 },
    );
  }

  const customerId = await ensureStripeCustomer(user);
  const paymentMethod = await StripeService.attachPaymentMethod(
    paymentMethodId,
    customerId,
  );

  if (paymentMethod.type !== "card" || !paymentMethod.card) {
    throw Object.assign(new Error("Only card payment methods are supported"), {
      status: 400,
    });
  }

  return PaymentMethods.createCard({
    userId: user.id,
    stripePaymentMethodId: paymentMethod.id,
    cardBrand: paymentMethod.card.brand,
    cardLast4: paymentMethod.card.last4,
    cardExpMonth: paymentMethod.card.exp_month,
    cardExpYear: paymentMethod.card.exp_year,
    billingName: paymentMethod.billing_details?.name ?? null,
    isDefault: true,
  });
};

const listMyPaymentMethods = async (req, res) => {
  try {
    const [cards, cryptoWallets] = await Promise.all([
      PaymentMethods.listCardsByUserId(req.user.id),
      PaymentMethods.listCryptoByUserId(req.user.id),
    ]);
    return res.status(200).json({ cards, cryptoWallets });
  } catch (e) {
    console.error("listMyPaymentMethods error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const saveStripePaymentMethod = async (req, res) => {
  try {
    const paymentMethodId = req.body?.paymentMethodId;
    if (!paymentMethodId || typeof paymentMethodId !== "string") {
      return res.status(400).json({ message: "paymentMethodId is required" });
    }

    const user = await Users.getById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const card = await saveStripeCardFromPaymentMethod(user, paymentMethodId);
    return res.status(201).json({ card });
  } catch (e) {
    if (e.status === 400 || e.status === 409) {
      return res.status(e.status).json({ message: e.message });
    }
    if (e.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        message: e.message || "Unable to save card. Please check your details.",
      });
    }
    console.error("saveStripePaymentMethod error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const saveCryptoWallet = async (req, res) => {
  try {
    const { address, chain, token, label } = req.body ?? {};

    if (!address || typeof address !== "string") {
      return res.status(400).json({ message: "address is required" });
    }
    if (!chain || !VALID_CRYPTO_CHAINS.has(chain)) {
      return res.status(400).json({ message: "Unsupported chain." });
    }
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "token is required" });
    }

    const existing = await PaymentMethods.getCryptoByUserChainAndToken(
      req.user.id,
      chain,
      token,
    );
    if (existing) {
      return res.status(409).json({
        message:
          "You already have a billing method for this network and token.",
      });
    }

    const wallet = await PaymentMethods.createCrypto({
      userId: req.user.id,
      address: address.trim(),
      chain,
      token,
      label: label?.trim() || null,
      isDefault: true,
    });

    return res.status(201).json({ wallet });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({
        message: "This wallet is already linked to another account.",
      });
    }
    console.error("saveCryptoWallet error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updatePaymentMethod = async (req, res) => {
  try {
    const { uid } = req.params;
    const existing = await PaymentMethods.getByUidAndUserId(uid, req.user.id);
    if (!existing) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    if (existing.type === "card") {
      const paymentMethodId = req.body?.paymentMethodId;
      if (!paymentMethodId || typeof paymentMethodId !== "string") {
        return res.status(400).json({ message: "paymentMethodId is required" });
      }

      const user = await Users.getById(req.user.id);
      const customerId = await ensureStripeCustomer(user);

      const paymentMethod = await StripeService.attachPaymentMethod(
        paymentMethodId,
        customerId,
      );

      if (paymentMethod.type !== "card" || !paymentMethod.card) {
        return res
          .status(400)
          .json({ message: "Only card payment methods are supported" });
      }

      const oldStripeId = existing.stripe_payment_method_id;

      const card = await PaymentMethods.updateCard(uid, req.user.id, {
        stripePaymentMethodId: paymentMethod.id,
        cardBrand: paymentMethod.card.brand,
        cardLast4: paymentMethod.card.last4,
        cardExpMonth: paymentMethod.card.exp_month,
        cardExpYear: paymentMethod.card.exp_year,
        billingName: paymentMethod.billing_details?.name ?? null,
      });

      if (oldStripeId && oldStripeId !== paymentMethod.id) {
        await StripeService.detachPaymentMethod(oldStripeId);
      }

      return res.status(200).json({ card });
    }

    if (existing.type === "crypto") {
      const { address, label } = req.body ?? {};

      if (!address || typeof address !== "string") {
        return res.status(400).json({ message: "address is required" });
      }

      const wallet = await PaymentMethods.updateCrypto(uid, req.user.id, {
        address: address.trim(),
        label: label?.trim() || null,
      });

      return res.status(200).json({ wallet });
    }

    return res.status(400).json({ message: "Unsupported payment method type." });
  } catch (e) {
    if (e.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        message: e.message || "Unable to update payment method.",
      });
    }
    if (e.code === "23505") {
      return res.status(409).json({
        message: "This wallet is already linked to another account.",
      });
    }
    console.error("updatePaymentMethod error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deletePaymentMethod = async (req, res) => {
  try {
    const { uid } = req.params;
    const existing = await PaymentMethods.getByUidAndUserId(uid, req.user.id);
    if (!existing) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    if (existing.type === "card" && existing.stripe_payment_method_id) {
      await StripeService.detachPaymentMethod(existing.stripe_payment_method_id);
    }

    await PaymentMethods.deleteByUidAndUserId(uid, req.user.id);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("deletePaymentMethod error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  listMyPaymentMethods,
  saveStripePaymentMethod,
  saveCryptoWallet,
  updatePaymentMethod,
  deletePaymentMethod,
};
