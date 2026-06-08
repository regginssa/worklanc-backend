const pool = require("../config/db");
const { toTitleCase } = require("../utils/format");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// CREATE USER (login identity only — accounts are created separately)
const create = async (user) => {
  const {
    firstName,
    lastName,
    email,
    countryCode = "US",
    passwordHash = null,
    signupProvider = "email",
    googleId = null,
    appleId = null,
    emailVerified = false,
    marketingOptIn = true,
  } = user;

  const result = await pool.query(
    `INSERT INTO users
      (
        first_name,
        last_name,
        email,
        password_hash,
        country_code,
        signup_provider,
        google_id,
        apple_id,
        email_verified,
        marketing_opt_in
      )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      toTitleCase(firstName),
      toTitleCase(lastName),
      normalizeEmail(email),
      passwordHash,
      countryCode,
      signupProvider,
      googleId,
      appleId,
      emailVerified,
      marketingOptIn,
    ],
  );

  return result.rows[0];
};

const getAll = async () => {
  const result = await pool.query(`SELECT * FROM users ORDER BY created_at DESC`);
  return result.rows;
};

const getById = async (id) => {
  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0];
};

const getByEmail = async (email) => {
  const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    normalizeEmail(email),
  ]);
  return result.rows[0];
};

const getByGoogleId = async (googleId) => {
  const result = await pool.query(`SELECT * FROM users WHERE google_id = $1`, [
    googleId,
  ]);
  return result.rows[0];
};

const getByAppleId = async (appleId) => {
  const result = await pool.query(`SELECT * FROM users WHERE apple_id = $1`, [
    appleId,
  ]);
  return result.rows[0];
};

const linkGoogleId = async (id, googleId) => {
  const result = await pool.query(
    `UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *`,
    [googleId, id],
  );
  return result.rows[0];
};

const linkAppleId = async (id, appleId) => {
  const result = await pool.query(
    `UPDATE users SET apple_id = $1 WHERE id = $2 RETURNING *`,
    [appleId, id],
  );
  return result.rows[0];
};

// UPDATE basic identity fields (partial — only provided keys are touched)
const update = async (id, data = {}) => {
  const fieldMap = {
    firstName: "first_name",
    lastName: "last_name",
    countryCode: "country_code",
    phone: "phone",
    phoneVerified: "phone_verified",
    emailVerified: "email_verified",
    dateOfBirth: "date_of_birth",
    streetAddress: "street_address",
    aptSuite: "apt_suite",
    city: "city",
    state: "state",
    zipCode: "zip_code",
    timezone: "timezone",
    avatarUrl: "avatar_url",
    marketingOptIn: "marketing_opt_in",
    isMilitaryVeteran: "is_military_veteran",
    militaryVeteranDeclined: "military_veteran_declined",
  };

  const sets = [];
  const values = [];
  let i = 1;

  for (const [key, column] of Object.entries(fieldMap)) {
    if (data[key] === undefined) continue;
    let value = data[key];
    if (key === "firstName" || key === "lastName") value = toTitleCase(value);
    sets.push(`${column} = $${i++}`);
    values.push(value);
  }

  if (sets.length === 0) return getById(id);

  values.push(id);
  const result = await pool.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values,
  );

  return result.rows[0];
};

const setPasswordHash = async (id, passwordHash) => {
  const result = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *`,
    [passwordHash, id],
  );
  return result.rows[0];
};

const deleteOne = async (id) => {
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return true;
};

const getByAccountId = async (accountId) => {
  const result = await pool.query(
    `SELECT u.*
     FROM users u
     INNER JOIN accounts a ON a.user_id = u.id
     WHERE a.id = $1`,
    [accountId],
  );
  return result.rows[0] || null;
};

const getByUid = async (uid) => {
  const result = await pool.query(`SELECT * FROM users WHERE uid = $1`, [uid]);
  return result.rows[0] || null;
};

module.exports = {
  create,
  getAll,
  getById,
  getByEmail,
  getByGoogleId,
  getByAppleId,
  getByAccountId,
  getByUid,
  linkGoogleId,
  linkAppleId,
  update,
  setPasswordHash,
  deleteOne,
  normalizeEmail,
};
