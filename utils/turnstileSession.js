const jwt = require("jsonwebtoken");

const TURNSTILE_SESSION_TTL_SECONDS = 30 * 60;

const issueTurnstileSession = ({ userId, scope }) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      typ: "turnstile",
      sub: String(userId),
      scope,
    },
    jwtSecret,
    {
      expiresIn: TURNSTILE_SESSION_TTL_SECONDS,
    }
  );
};

const verifyTurnstileSession = (token) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.verify(token, jwtSecret);
};

module.exports = {
  TURNSTILE_SESSION_TTL_SECONDS,
  issueTurnstileSession,
  verifyTurnstileSession,
};
