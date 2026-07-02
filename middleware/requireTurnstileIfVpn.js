const { getClientIp } = require("../utils/clientIp");
const { isRiskyConnection } = require("../services/vpnDetection");
const { verifyTurnstileToken } = require("../services/turnstile");
const {
  isIpTurnstileVerified,
  markIpTurnstileVerified,
} = require("../services/turnstileIpCache");

const EXEMPT_PREFIXES = ["/security/risk", "/security/turnstile"];

const requireTurnstileIfVpn = async (req, res, next) => {
  try {
    if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      return next();
    }

    const ip = getClientIp(req);
    const risky = await isRiskyConnection(ip);
    if (!risky) {
      return next();
    }

    if (isIpTurnstileVerified(ip)) {
      return next();
    }

    const token = req.headers["x-turnstile-token"];
    if (typeof token === "string" && token.length > 0) {
      const result = await verifyTurnstileToken({ token, remoteIp: ip });
      if (result.success) {
        markIpTurnstileVerified(ip);
        return next();
      }
    }

    return res.status(403).json({
      code: "TURNSTILE_REQUIRED",
      message: "Verification required",
    });
  } catch (error) {
    console.error("requireTurnstileIfVpn error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = requireTurnstileIfVpn;
