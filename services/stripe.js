const Stripe = require("stripe");

let stripe = null;

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripe) {
    stripe = new Stripe(secretKey);
  }
  return stripe;
};

const createCustomer = async ({ email, name, userId }) => {
  const client = getStripe();
  return client.customers.create({
    email,
    name,
    metadata: { worklanc_user_id: String(userId) },
  });
};

const attachPaymentMethod = async (paymentMethodId, customerId) => {
  const client = getStripe();
  const paymentMethod = await client.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });
  await client.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  return paymentMethod;
};

const detachPaymentMethod = async (paymentMethodId) => {
  const client = getStripe();
  try {
    return await client.paymentMethods.detach(paymentMethodId);
  } catch (err) {
    if (err?.code === "resource_missing") return null;
    throw err;
  }
};

const retrievePaymentMethod = async (paymentMethodId) => {
  const client = getStripe();
  return client.paymentMethods.retrieve(paymentMethodId);
};

module.exports = {
  getStripe,
  createCustomer,
  attachPaymentMethod,
  detachPaymentMethod,
  retrievePaymentMethod,
};
