const pool = require("../config/db");
const { toTitleCase } = require("../utils/format");

// CREATE USER
const create = async (user) => {
  const {
    firstName,
    lastName,
    email,
    countryCode,
    password,
    role = "user",
    accountType,
    signinOption,
    googleId,
    appleId,
  } = user;

  const result = await pool.query(
    `INSERT INTO users
    (
      first_name,
      last_name,
      email,
      country_code,
      password,
      role,
      account_type,
      signin_option,
      google_id,
      apple_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *`,
    [
      toTitleCase(firstName),
      toTitleCase(lastName),
      email,
      countryCode,
      password,
      role,
      accountType,
      signinOption,
      googleId,
      appleId,
    ],
  );

  return result.rows[0];
};

// GET ALL USERS
const getAll = async () => {
  const result = await pool.query(`SELECT * FROM users`);
  return result.rows;
};

// GET USER BY ID
const getById = async (id) => {
  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0];
};

// GET USER BY EMAIL
const getByEmail = async (email) => {
  const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    email,
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

// UPDATE USER
const update = async (id, data) => {
  const { first_name, last_name, country_code } = data;

  const result = await pool.query(
    `UPDATE users
     SET first_name = $1,
         last_name = $2,
         country_code = $3
     WHERE id = $4
     RETURNING *`,
    [first_name, last_name, country_code, id],
  );

  return result.rows[0];
};

// DELETE USER
const deleteOne = async (id) => {
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return true;
};

module.exports = {
  create,
  getAll,
  getById,
  getByEmail,
  getByGoogleId,
  getByAppleId,
  linkGoogleId,
  linkAppleId,
  update,
  deleteOne,
};
