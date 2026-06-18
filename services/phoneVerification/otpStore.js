const crypto = require("crypto");

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

/** @type {Map<string, { code: string, expiresAt: number, attempts: number }>} */
const store = new Map();

const storeKey = (userId, phone) => `${userId}:${phone}`;

const generateCode = () => String(crypto.randomInt(100000, 1000000));

const saveCode = (userId, phone) => {
  const code = generateCode();
  store.set(storeKey(userId, phone), {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  return code;
};

const verifyCode = (userId, phone, submittedCode) => {
  const key = storeKey(userId, phone);
  const entry = store.get(key);

  if (!entry) {
    return { ok: false, reason: "expired" };
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return { ok: false, reason: "expired" };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_VERIFY_ATTEMPTS) {
    store.delete(key);
    return { ok: false, reason: "too_many_attempts" };
  }

  const expected = Buffer.from(entry.code);
  const received = Buffer.from(String(submittedCode).trim());
  const matches =
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);

  if (!matches) {
    return { ok: false, reason: "invalid" };
  }

  store.delete(key);
  return { ok: true };
};

module.exports = { saveCode, verifyCode };
