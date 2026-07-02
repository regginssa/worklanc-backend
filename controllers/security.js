const { getClientIp } = require("../utils/clientIp");
const { isRiskyConnection } = require("../services/vpnDetection");
const { verifyTurnstileToken } = require("../services/turnstile");
const {
  isIpTurnstileVerified,
  markIpTurnstileVerified,
} = require("../services/turnstileIpCache");

const getRisk = async (req, res) => {
  try {
    const ip = getClientIp(req);
    const risky = await isRiskyConnection(ip);
    const verified = isIpTurnstileVerified(ip);

    return res.status(200).json({
      requiresTurnstile: risky && !verified,
      reason: risky ? "vpn" : null,
    });
  } catch (e) {
    console.error("security.getRisk error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const verifyTurnstile = async (req, res) => {
  try {
    const ip = getClientIp(req);
    const { token } = req.body || {};

    const result = await verifyTurnstileToken({
      token,
      remoteIp: ip,
    });

    if (!result.success) {
      return res.status(400).json({
        code: "TURNSTILE_FAILED",
        message: "Turnstile verification failed",
        errorCodes: result.errorCodes,
      });
    }

    markIpTurnstileVerified(ip);

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("security.verifyTurnstile error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getRisk, verifyTurnstile };
