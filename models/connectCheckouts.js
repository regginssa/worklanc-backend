const pool = require("../config/db");

const CHECKOUT_TTL_DAYS = 7;

const toPublicCheckoutRow = (row) => ({
  uid: row.uid,
  connectAmount: row.connect_amount,
  subtotalCents: row.subtotal_cents,
  discountCents: row.discount_cents,
  totalCents: row.total_cents,
  promoCode: row.promo_code,
  status: row.status,
  paymentMethod: row.payment_method,
  savedPaymentMethodUid: row.saved_payment_method_uid,
  completedAt: row.completed_at,
  checkoutExpiresAt: row.expires_at,
  connectsExpireAt: row.connects_expire_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const expireStaleForUser = async (userId, client = pool) => {
  await client.query(
    `UPDATE connect_checkouts
     SET status = 'expired', updated_at = NOW()
     WHERE user_id = $1
       AND status = 'pending'
       AND expires_at < NOW()`,
    [userId],
  );
};

const findReusablePending = async (userId, bundleOptionId, promoCode, client = pool) => {
  const result = await client.query(
    `SELECT *
     FROM connect_checkouts
     WHERE user_id = $1
       AND bundle_option_id = $2
       AND status = 'pending'
       AND expires_at > NOW()
       AND COALESCE(LOWER(TRIM(promo_code)), '') = COALESCE(LOWER(TRIM($3::text)), '')
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, bundleOptionId, promoCode],
  );
  return result.rows[0] ?? null;
};

const createPending = async ({
  userId,
  bundleOptionId,
  connectAmount,
  subtotalCents,
  discountCents,
  totalCents,
  promoCode,
}) => {
  const result = await pool.query(
    `INSERT INTO connect_checkouts (
       user_id,
       bundle_option_id,
       connect_amount,
       subtotal_cents,
       discount_cents,
       total_cents,
       promo_code,
       status,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW() + ($8 || ' days')::interval)
     RETURNING *`,
    [
      userId,
      bundleOptionId,
      connectAmount,
      subtotalCents,
      discountCents,
      totalCents,
      promoCode,
      String(CHECKOUT_TTL_DAYS),
    ],
  );
  return toPublicCheckoutRow(result.rows[0]);
};

const getByUidAndUserId = async (uid, userId) => {
  const result = await pool.query(
    `SELECT *
     FROM connect_checkouts
     WHERE uid = $1 AND user_id = $2`,
    [uid, userId],
  );
  return result.rows[0] ?? null;
};

const getPublicByUidAndUserId = async (uid, userId) => {
  const row = await getByUidAndUserId(uid, userId);
  return row ? toPublicCheckoutRow(row) : null;
};

const markProcessing = async (uid, userId, { paymentMethod, savedPaymentMethodUid }) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'processing',
         payment_method = $3,
         saved_payment_method_uid = $4,
         failure_message = NULL,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'failed')
       AND expires_at > NOW()
     RETURNING *`,
    [uid, userId, paymentMethod, savedPaymentMethodUid],
  );
  return result.rows[0] ?? null;
};

const markCompleted = async (uid, userId, stripePaymentIntentId) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'completed',
         stripe_payment_intent_id = $3,
         completed_at = NOW(),
         connects_expire_at = NOW() + INTERVAL '1 year',
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status = 'processing'
     RETURNING *`,
    [uid, userId, stripePaymentIntentId],
  );
  return result.rows[0] ?? null;
};

const updatePromoAndPricing = async (
  uid,
  userId,
  { promoCode, subtotalCents, discountCents, totalCents },
) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET promo_code = $3,
         subtotal_cents = $4,
         discount_cents = $5,
         total_cents = $6,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'failed')
       AND expires_at > NOW()
     RETURNING *`,
    [uid, userId, promoCode, subtotalCents, discountCents, totalCents],
  );
  return result.rows[0] ?? null;
};

const syncPricing = async (
  uid,
  userId,
  { subtotalCents, discountCents, totalCents },
) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET subtotal_cents = $3,
         discount_cents = $4,
         total_cents = $5,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'failed', 'processing')
     RETURNING *`,
    [uid, userId, subtotalCents, discountCents, totalCents],
  );
  return result.rows[0] ?? null;
};

const markFailed = async (uid, userId, failureMessage) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'failed',
         failure_message = $3,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'processing')
     RETURNING *`,
    [uid, userId, failureMessage],
  );
  return result.rows[0] ?? null;
};

const resetToPending = async (uid, userId) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'pending',
         payment_method = NULL,
         saved_payment_method_uid = NULL,
         failure_message = NULL,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status = 'processing'
     RETURNING *`,
    [uid, userId],
  );
  return result.rows[0] ?? null;
};

module.exports = {
  CHECKOUT_TTL_DAYS,
  toPublicCheckoutRow,
  expireStaleForUser,
  findReusablePending,
  createPending,
  getByUidAndUserId,
  getPublicByUidAndUserId,
  markProcessing,
  markCompleted,
  markFailed,
  resetToPending,
  updatePromoAndPricing,
  syncPricing,
};
