const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();

const isPrivateIp = (ip) =>
  !ip ||
  ip === "::1" ||
  ip === "127.0.0.1" ||
  ip.startsWith("10.") ||
  ip.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

const readCache = (ip) => {
  const row = cache.get(ip);
  if (!row) return null;
  if (Date.now() >= row.expiresAt) {
    cache.delete(ip);
    return null;
  }
  return row.isRisky;
};

const writeCache = (ip, isRisky) => {
  cache.set(ip, { isRisky, expiresAt: Date.now() + CACHE_TTL_MS });
};

const isRiskyConnection = async (ip) => {
  if (process.env.TURNSTILE_FORCE_VPN === "true") {
    return true;
  }

  if (isPrivateIp(ip)) {
    return false;
  }

  const cached = readCache(ip);
  if (cached !== null) {
    return cached;
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
    );
    const data = await response.json();
    const isRisky =
      data?.status === "success" && (Boolean(data.proxy) || Boolean(data.hosting));
    writeCache(ip, isRisky);
    return isRisky;
  } catch (error) {
    console.error("vpnDetection.isRiskyConnection error:", error);
    writeCache(ip, false);
    return false;
  }
};

module.exports = { isRiskyConnection };
