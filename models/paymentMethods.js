const pool = require("../config/db");

const toPublicRow = (row) => ({
  uid: row.uid,
  type: row.type,
  provider: row.provider,
  brand: row.card_brand,
  last4: row.card_last4,
  expMonth: row.card_exp_month,
  expYear: row.card_exp_year,
  billingName: row.billing_name,
  isDefault: row.is_default,
  createdAt: row.created_at,
});

const listCardsByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT *
     FROM payment_methods
     WHERE user_id = $1 AND type = 'card'
     ORDER BY is_default DESC, created_at DESC`,
    [userId],
  );
  return result.rows.map(toPublicRow);
};

const getByUidAndUserId = async (uid, userId) => {
  const result = await pool.query(
    `SELECT *
     FROM payment_methods
     WHERE uid = $1 AND user_id = $2`,
    [uid, userId],
  );
  return result.rows[0] ?? null;
};

const countCardsByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM payment_methods
     WHERE user_id = $1 AND type = 'card'`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
};

const createCard = async ({
  userId,
  stripePaymentMethodId,
  cardBrand,
  cardLast4,
  cardExpMonth,
  cardExpYear,
  billingName,
  isDefault = false,
}) => {
  const result = await pool.query(
    `INSERT INTO payment_methods (
       user_id,
       type,
       provider,
       stripe_payment_method_id,
       card_brand,
       card_last4,
       card_exp_month,
       card_exp_year,
       billing_name,
       is_default
     )
     VALUES ($1, 'card', 'stripe', $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      stripePaymentMethodId,
      cardBrand,
      cardLast4,
      cardExpMonth,
      cardExpYear,
      billingName,
      isDefault,
    ],
  );
  return toPublicRow(result.rows[0]);
};

const updateCard = async (uid, userId, data) => {
  const sets = [];
  const values = [];
  let i = 1;

  const fieldMap = {
    stripePaymentMethodId: "stripe_payment_method_id",
    cardBrand: "card_brand",
    cardLast4: "card_last4",
    cardExpMonth: "card_exp_month",
    cardExpYear: "card_exp_year",
    billingName: "billing_name",
    isDefault: "is_default",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (data[key] === undefined) continue;
    sets.push(`${column} = $${i++}`);
    values.push(data[key]);
  }

  if (sets.length === 0) {
    const existing = await getByUidAndUserId(uid, userId);
    return existing ? toPublicRow(existing) : null;
  }

  values.push(uid, userId);
  const result = await pool.query(
    `UPDATE payment_methods
     SET ${sets.join(", ")}
     WHERE uid = $${i++} AND user_id = $${i}
     RETURNING *`,
    values,
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
};

const deleteByUidAndUserId = async (uid, userId) => {
  const result = await pool.query(
    `DELETE FROM payment_methods
     WHERE uid = $1 AND user_id = $2
     RETURNING *`,
    [uid, userId],
  );
  return result.rows[0] ?? null;
};

const clearDefaultForUser = async (userId) => {
  await pool.query(
    `UPDATE payment_methods
     SET is_default = FALSE
     WHERE user_id = $1 AND type = 'card'`,
    [userId],
  );
};

module.exports = {
  listCardsByUserId,
  getByUidAndUserId,
  countCardsByUserId,
  createCard,
  updateCard,
  deleteByUidAndUserId,
  clearDefaultForUser,
};
