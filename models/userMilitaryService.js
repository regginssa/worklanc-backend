const pool = require("../config/db");
const { toTitleCase } = require("../utils/format");

const getByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT *
     FROM user_military_service
     WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
};

const upsert = async (userId, data) => {
  const {
    country,
    countryCode,
    firstName,
    lastName,
    activeDutyStartDate,
    activeDutyEndDate,
    branch,
  } = data;

  const result = await pool.query(
    `INSERT INTO user_military_service
      (user_id, country, country_code, service_first_name, service_last_name,
       active_duty_start_date, active_duty_end_date, branch)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       country = EXCLUDED.country,
       country_code = EXCLUDED.country_code,
       service_first_name = EXCLUDED.service_first_name,
       service_last_name = EXCLUDED.service_last_name,
       active_duty_start_date = EXCLUDED.active_duty_start_date,
       active_duty_end_date = EXCLUDED.active_duty_end_date,
       branch = EXCLUDED.branch
     RETURNING *`,
    [
      userId,
      country.trim(),
      countryCode.trim().toUpperCase(),
      toTitleCase(firstName),
      toTitleCase(lastName),
      activeDutyStartDate,
      activeDutyEndDate,
      branch,
    ],
  );

  return result.rows[0];
};

const deleteByUserId = async (userId) => {
  await pool.query(`DELETE FROM user_military_service WHERE user_id = $1`, [
    userId,
  ]);
  return true;
};

module.exports = {
  getByUserId,
  upsert,
  deleteByUserId,
};
