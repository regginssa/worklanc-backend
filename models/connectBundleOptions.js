const pool = require("../config/db");

const toPublicBundleRow = (row) => ({
  id: row.id,
  connectAmount: row.connect_amount,
  priceCents: row.price_cents,
  sortOrder: row.sort_order,
});

const listActive = async () => {
  const result = await pool.query(
    `SELECT id, connect_amount, price_cents, sort_order
     FROM connect_bundle_options
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, connect_amount ASC`,
  );
  return result.rows.map(toPublicBundleRow);
};

const getActiveByConnectAmount = async (connectAmount) => {
  const result = await pool.query(
    `SELECT id, connect_amount, price_cents, sort_order
     FROM connect_bundle_options
     WHERE is_active = TRUE AND connect_amount = $1`,
    [connectAmount],
  );
  return result.rows[0] ? toPublicBundleRow(result.rows[0]) : null;
};

const getActiveById = async (id) => {
  const result = await pool.query(
    `SELECT id, connect_amount, price_cents, sort_order
     FROM connect_bundle_options
     WHERE is_active = TRUE AND id = $1`,
    [id],
  );
  return result.rows[0] ? toPublicBundleRow(result.rows[0]) : null;
};

module.exports = {
  listActive,
  getActiveByConnectAmount,
  getActiveById,
};
