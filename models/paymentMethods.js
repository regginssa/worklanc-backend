const pool = require("../config/db");

const toPublicCardRow = (row) => ({
  uid: row.uid,
  type: "card",
  provider: row.provider,
  brand: row.card_brand,
  last4: row.card_last4,
  expMonth: row.card_exp_month,
  expYear: row.card_exp_year,
  billingName: row.billing_name,
  isDefault: row.is_default,
  createdAt: row.created_at,
});

const toPublicCryptoRow = (row) => ({
  uid: row.uid,
  type: "crypto",
  provider: "crypto",
  address: row.crypto_address,
  chain: row.crypto_chain,
  token: row.crypto_token,
  label: row.crypto_label,
  isDefault: row.is_default,
  createdAt: row.created_at,
});

const listCardsByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT *
     FROM payment_methods
     WHERE user_id = $1 AND type = 'card'
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(toPublicCardRow);
};

const listCryptoByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT *
     FROM payment_methods
     WHERE user_id = $1 AND type = 'crypto'
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(toPublicCryptoRow);
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

const countCryptoByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM payment_methods
     WHERE user_id = $1 AND type = 'crypto'`,
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
  isDefault = true,
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
  return toPublicCardRow(result.rows[0]);
};

const createCrypto = async ({
  userId,
  address,
  chain,
  token,
  label,
  isDefault = true,
}) => {
  const result = await pool.query(
    `INSERT INTO payment_methods (
       user_id,
       type,
       provider,
       crypto_address,
       crypto_chain,
       crypto_token,
       crypto_label,
       is_default
     )
     VALUES ($1, 'crypto', 'crypto', $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, address, chain, token, label ?? null, isDefault],
  );
  return toPublicCryptoRow(result.rows[0]);
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
    return existing?.type === "card" ? toPublicCardRow(existing) : null;
  }

  values.push(uid, userId);
  const result = await pool.query(
    `UPDATE payment_methods
     SET ${sets.join(", ")}
     WHERE uid = $${i++} AND user_id = $${i} AND type = 'card'
     RETURNING *`,
    values,
  );
  return result.rows[0] ? toPublicCardRow(result.rows[0]) : null;
};

const updateCrypto = async (uid, userId, data) => {
  const sets = [];
  const values = [];
  let i = 1;

  const fieldMap = {
    address: "crypto_address",
    chain: "crypto_chain",
    token: "crypto_token",
    label: "crypto_label",
    isDefault: "is_default",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (data[key] === undefined) continue;
    sets.push(`${column} = $${i++}`);
    values.push(data[key]);
  }

  if (sets.length === 0) {
    const existing = await getByUidAndUserId(uid, userId);
    return existing?.type === "crypto" ? toPublicCryptoRow(existing) : null;
  }

  values.push(uid, userId);
  const result = await pool.query(
    `UPDATE payment_methods
     SET ${sets.join(", ")}
     WHERE uid = $${i++} AND user_id = $${i} AND type = 'crypto'
     RETURNING *`,
    values,
  );
  return result.rows[0] ? toPublicCryptoRow(result.rows[0]) : null;
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

module.exports = {
  listCardsByUserId,
  listCryptoByUserId,
  getByUidAndUserId,
  countCardsByUserId,
  countCryptoByUserId,
  createCard,
  createCrypto,
  updateCard,
  updateCrypto,
  deleteByUidAndUserId,
};
