const pool = require("../config/db");
const {
  defaultNotificationSettings,
  mergeNotificationSettings,
} = require("../utils/notificationSettings");

const getByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT settings
     FROM user_notification_settings
     WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.settings ?? null;
};

const getMergedByUserId = async (userId) => {
  const stored = await getByUserId(userId);
  return mergeNotificationSettings(stored || {});
};

const upsert = async (userId, patch) => {
  const current = await getMergedByUserId(userId);
  const next = { ...current, ...patch };

  const result = await pool.query(
    `INSERT INTO user_notification_settings (user_id, settings)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
       settings = EXCLUDED.settings
     RETURNING settings`,
    [userId, JSON.stringify(next)],
  );

  return result.rows[0].settings;
};

const ensureDefaults = async (userId) => {
  const existing = await getByUserId(userId);
  if (existing) return mergeNotificationSettings(existing);

  const defaults = defaultNotificationSettings();
  const result = await pool.query(
    `INSERT INTO user_notification_settings (user_id, settings)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING settings`,
    [userId, JSON.stringify(defaults)],
  );

  if (result.rows[0]?.settings) {
    return mergeNotificationSettings(result.rows[0].settings);
  }

  return getMergedByUserId(userId);
};

module.exports = {
  getByUserId,
  getMergedByUserId,
  upsert,
  ensureDefaults,
};
