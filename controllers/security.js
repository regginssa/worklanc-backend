const { verifyTurnstileToken } = require("../services/turnstile");
const {
  issueTurnstileSession,
  TURNSTILE_SESSION_TTL_SECONDS,
} = require("../utils/turnstileSession");

const ALLOWED_SCOPES = new Set(["find_work", "freelancer_profile"]);

const verifyTurnstile = async (req, res) => {
  try {
    const { token, scope } = req.body || {};

    if (!ALLOWED_SCOPES.has(scope)) {
      return res.status(400).json({ message: "Invalid Turnstile scope" });
    }

    const result = await verifyTurnstileToken({
      token,
      remoteIp: req.ip,
    });

    if (!result.success) {
      return res.status(400).json({
        message: "Turnstile verification failed",
        errorCodes: result.errorCodes,
      });
    }

    const sessionToken = issueTurnstileSession({
      userId: req.user?.id ?? "anonymous",
      scope,
    });

    return res.status(200).json({
      token: sessionToken,
      expiresIn: TURNSTILE_SESSION_TTL_SECONDS,
      scope,
    });
  } catch (e) {
    console.error("security.verifyTurnstile error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { verifyTurnstile };
