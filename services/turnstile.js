const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const verifyTurnstileToken = async ({ token, remoteIp }) => {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("TURNSTILE_SECRET_KEY is not configured");
  }

  if (!token || typeof token !== "string") {
    return {
      success: false,
      errorCodes: ["missing-input-response"],
    };
  }

  const formData = new URLSearchParams();
  formData.set("secret", secretKey);
  formData.set("response", token);
  if (remoteIp) {
    formData.set("remoteip", remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  const data = await response.json();
  return {
    success: Boolean(data?.success),
    challengeTs: data?.challenge_ts || null,
    hostname: data?.hostname || null,
    errorCodes: Array.isArray(data?.["error-codes"]) ? data["error-codes"] : [],
  };
};

module.exports = { verifyTurnstileToken };
