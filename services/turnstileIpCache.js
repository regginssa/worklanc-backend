const VERIFIED_TTL_MS = 30 * 60 * 1000;
const verifiedIps = new Map();

const isIpTurnstileVerified = (ip) => {
  const row = verifiedIps.get(ip);
  if (!row) return false;
  if (Date.now() >= row.expiresAt) {
    verifiedIps.delete(ip);
    return false;
  }
  return true;
};

const markIpTurnstileVerified = (ip) => {
  if (!ip) return;
  verifiedIps.set(ip, { expiresAt: Date.now() + VERIFIED_TTL_MS });
};

module.exports = { isIpTurnstileVerified, markIpTurnstileVerified };
