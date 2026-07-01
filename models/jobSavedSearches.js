const pool = require("../config/db");

const listByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT * FROM job_saved_searches
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );
  return result.rows;
};

const create = async ({ userId, name, params }) => {
  const result = await pool.query(
    `INSERT INTO job_saved_searches (user_id, name, params)
     VALUES ($1, $2, $3::jsonb)
     RETURNING *`,
    [userId, name, JSON.stringify(params || {})],
  );
  return result.rows[0];
};

module.exports = {
  listByUserId,
  create,
};

