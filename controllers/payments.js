const Users = require("../models/users");
const PaymentMethods = require("../models/paymentMethods");
const StripeService = require("../services/stripe");

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

  const cardCount = await PaymentMethods.countCardsByUserId(user.id);
  const isDefault = cardCount === 0;

  if (isDefault) {
    await PaymentMethods.clearDefaultForUser(user.id);
  }

  return PaymentMethods.createCard({
    userId: user.id,
    stripePaymentMethodId: paymentMethod.id,
    cardBrand: paymentMethod.card.brand,
    cardLast4: paymentMethod.card.last4,
    cardExpMonth: paymentMethod.card.exp_month,
    cardExpYear: paymentMethod.card.exp_year,
    billingName: paymentMethod.billing_details?.name ?? null,
    isDefault,
  });
};

const listMyPaymentMethods = async (req, res) => {
  try {
    const cards = await PaymentMethods.listCardsByUserId(req.user.id);
    return res.status(200).json({ cards });
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
    if (e.status === 400) {
      return res.status(400).json({ message: e.message });
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

const updateStripePaymentMethod = async (req, res) => {
  try {
    const { uid } = req.params;
    const paymentMethodId = req.body?.paymentMethodId;
    if (!paymentMethodId || typeof paymentMethodId !== "string") {
      return res.status(400).json({ message: "paymentMethodId is required" });
    }

    const existing = await PaymentMethods.getByUidAndUserId(uid, req.user.id);
    if (!existing) {
      return res.status(404).json({ message: "Payment method not found" });
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
  } catch (e) {
    if (e.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        message: e.message || "Unable to update card. Please check your details.",
      });
    }
    console.error("updateStripePaymentMethod error: ", e);
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

    await StripeService.detachPaymentMethod(existing.stripe_payment_method_id);
    await PaymentMethods.deleteByUidAndUserId(uid, req.user.id);

    if (existing.is_default) {
      const remaining = await PaymentMethods.listCardsByUserId(req.user.id);
      if (remaining.length > 0) {
        await PaymentMethods.updateCard(remaining[0].uid, req.user.id, {
          isDefault: true,
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("deletePaymentMethod error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  listMyPaymentMethods,
  saveStripePaymentMethod,
  updateStripePaymentMethod,
  deletePaymentMethod,
};
