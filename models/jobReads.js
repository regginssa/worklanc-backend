const pool = require("../config/db");

const markRead = async (userId, jobId) => {
  const result = await pool.query(
    `INSERT INTO job_reads (user_id, job_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, job_id)
     DO UPDATE SET read_at = NOW()
     RETURNING *`,
    [userId, jobId],
  );
  return result.rows[0];
};

const getReadJobIdsForUser = async (userId) => {
  const result = await pool.query(
    `SELECT job_id FROM job_reads WHERE user_id = $1`,
    [userId],
  );
  return new Set(result.rows.map((row) => Number(row.job_id)));
};

module.exports = {
  markRead,
  getReadJobIdsForUser,
};
