const { verifyTurnstileSession } = require("../utils/turnstileSession");

const requireTurnstileSession = (requiredScope) => (req, res, next) => {
  try {
    const sessionToken = req.headers["x-turnstile-session"];
    if (!sessionToken || typeof sessionToken !== "string") {
      return res.status(403).json({ message: "Turnstile verification required" });
    }

    const payload = verifyTurnstileSession(sessionToken);
    if (!payload || payload.typ !== "turnstile") {
      return res.status(403).json({ message: "Invalid Turnstile session" });
    }

    if (req.user?.id && String(req.user.id) !== String(payload.sub)) {
      return res.status(403).json({ message: "Turnstile session mismatch" });
    }

    if (requiredScope && payload.scope !== requiredScope) {
      return res.status(403).json({ message: "Invalid Turnstile session scope" });
    }

    req.turnstile = payload;
    return next();
  } catch (_error) {
    return res.status(403).json({ message: "Turnstile verification expired" });
  }
};

module.exports = requireTurnstileSession;
