const pool = require("../config/db");

const toPublicPayoneerRow = (row) => ({
  uid: row.uid,
  type: "payoneer",
  email: row.payoneer_email,
  payeeId: row.payoneer_payee_id,
  registrationLink: row.payoneer_registration_link,
  status: row.payoneer_status ?? "pending",
  isDefault: row.is_default,
  createdAt: row.created_at,
});

const toPublicCryptoRow = (row) => ({
  uid: row.uid,
  type: "crypto",
  address: row.crypto_address,
  chain: row.crypto_chain,
  token: row.crypto_token ?? null,
  label: row.crypto_label,
  isDefault: row.is_default,
  createdAt: row.created_at,
});

const listByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT *
     FROM withdrawal_methods
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows;
};

const getPayoneerByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT *
     FROM withdrawal_methods
     WHERE user_id = $1 AND type = 'payoneer'
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
};

const getCryptoByUserChain = async (userId, chain) => {
  const result = await pool.query(
    `SELECT *
     FROM withdrawal_methods
     WHERE user_id = $1
       AND type = 'crypto'
       AND crypto_chain = $2`,
    [userId, chain],
  );
  return result.rows[0] ?? null;
};

const getByUidAndUserId = async (uid, userId) => {
  const result = await pool.query(
    `SELECT *
     FROM withdrawal_methods
     WHERE uid = $1 AND user_id = $2`,
    [uid, userId],
  );
  return result.rows[0] ?? null;
};

const hasDefaultMethod = async (userId) => {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM withdrawal_methods
       WHERE user_id = $1 AND is_default = TRUE
     ) AS has_default`,
    [userId],
  );
  return Boolean(result.rows[0]?.has_default);
};

const clearDefaultsForUser = async (userId, client = pool) => {
  await client.query(
    `UPDATE withdrawal_methods
     SET is_default = FALSE
     WHERE user_id = $1`,
    [userId],
  );
};

const createPayoneer = async ({
  userId,
  payeeId,
  email,
  registrationLink,
  status = "pending",
  isDefault = false,
}) => {
  const result = await pool.query(
    `INSERT INTO withdrawal_methods (
       user_id,
       type,
       provider,
       payoneer_payee_id,
       payoneer_email,
       payoneer_registration_link,
       payoneer_status,
       is_default
     )
     VALUES ($1, 'payoneer', 'payoneer', $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, payeeId, email, registrationLink, status, isDefault],
  );
  return toPublicPayoneerRow(result.rows[0]);
};

const updatePayoneer = async (userId, data) => {
  const sets = [];
  const values = [];
  let i = 1;

  const fieldMap = {
    payeeId: "payoneer_payee_id",
    email: "payoneer_email",
    registrationLink: "payoneer_registration_link",
    status: "payoneer_status",
    isDefault: "is_default",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (data[key] === undefined) continue;
    sets.push(`${column} = $${i++}`);
    values.push(data[key]);
  }

  if (sets.length === 0) {
    const existing = await getPayoneerByUserId(userId);
    return existing ? toPublicPayoneerRow(existing) : null;
  }

  values.push(userId);
  const result = await pool.query(
    `UPDATE withdrawal_methods
     SET ${sets.join(", ")}
     WHERE user_id = $${i} AND type = 'payoneer'
     RETURNING *`,
    values,
  );
  return result.rows[0] ? toPublicPayoneerRow(result.rows[0]) : null;
};

const createCrypto = async ({
  userId,
  address,
  chain,
  token,
  label,
  isDefault = false,
}) => {
  const result = await pool.query(
    `INSERT INTO withdrawal_methods (
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
    [userId, address, chain, token ?? null, label ?? null, isDefault],
  );
  return toPublicCryptoRow(result.rows[0]);
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
    `UPDATE withdrawal_methods
     SET ${sets.join(", ")}
     WHERE uid = $${i++} AND user_id = $${i} AND type = 'crypto'
     RETURNING *`,
    values,
  );
  return result.rows[0] ? toPublicCryptoRow(result.rows[0]) : null;
};

const deletePayoneerByUserId = async (userId) => {
  const result = await pool.query(
    `DELETE FROM withdrawal_methods
     WHERE user_id = $1 AND type = 'payoneer'
     RETURNING *`,
    [userId],
  );
  return result.rows[0] ?? null;
};

const deleteCryptoByUidAndUserId = async (uid, userId) => {
  const result = await pool.query(
    `DELETE FROM withdrawal_methods
     WHERE uid = $1 AND user_id = $2 AND type = 'crypto'
     RETURNING *`,
    [uid, userId],
  );
  return result.rows[0] ?? null;
};

const setDefaultPayoneer = async (userId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await clearDefaultsForUser(userId, client);
    const result = await client.query(
      `UPDATE withdrawal_methods
       SET is_default = TRUE
       WHERE user_id = $1 AND type = 'payoneer'
       RETURNING *`,
      [userId],
    );
    await client.query("COMMIT");
    return result.rows[0] ? toPublicPayoneerRow(result.rows[0]) : null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const setDefaultCrypto = async (uid, userId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await clearDefaultsForUser(userId, client);
    const result = await client.query(
      `UPDATE withdrawal_methods
       SET is_default = TRUE
       WHERE uid = $1 AND user_id = $2 AND type = 'crypto'
       RETURNING *`,
      [uid, userId],
    );
    await client.query("COMMIT");
    return result.rows[0] ? toPublicCryptoRow(result.rows[0]) : null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getUserWithdrawalSettings = async (userId) => {
  const result = await pool.query(
    `SELECT tax_profile_complete, withdrawal_schedule
     FROM users
     WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
};

const updateWithdrawalSchedule = async (userId, schedule) => {
  const result = await pool.query(
    `UPDATE users
     SET withdrawal_schedule = $2
     WHERE id = $1
     RETURNING withdrawal_schedule`,
    [userId, schedule],
  );
  return result.rows[0]?.withdrawal_schedule ?? null;
};

const listPublicByUserId = async (userId) => {
  const rows = await listByUserId(userId);
  const payoneer = rows.find((row) => row.type === "payoneer");
  const cryptoWallets = rows
    .filter((row) => row.type === "crypto")
    .map(toPublicCryptoRow);

  return {
    payoneer: payoneer ? toPublicPayoneerRow(payoneer) : null,
    cryptoWallets,
  };
};

module.exports = {
  listByUserId,
  listPublicByUserId,
  getPayoneerByUserId,
  getCryptoByUserChain,
  getByUidAndUserId,
  hasDefaultMethod,
  createPayoneer,
  updatePayoneer,
  createCrypto,
  updateCrypto,
  deletePayoneerByUserId,
  deleteCryptoByUidAndUserId,
  setDefaultPayoneer,
  setDefaultCrypto,
  getUserWithdrawalSettings,
  updateWithdrawalSchedule,
  toPublicPayoneerRow,
  toPublicCryptoRow,
};
