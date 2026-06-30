const Users = require("../models/users");

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const getConfig = () => {
  const clientId = process.env.PAYONEER_CLIENT_ID;
  const clientSecret = process.env.PAYONEER_CLIENT_SECRET;
  const programId = process.env.PAYONEER_PROGRAM_ID;
  const apiBase =
    process.env.PAYONEER_API_BASE_URL ||
    (process.env.PAYONEER_ENV === "production"
      ? "https://api.payoneer.com"
      : "https://api.sandbox.payoneer.com");
  const redirectUrl =
    process.env.PAYONEER_REDIRECT_URL ||
    `${process.env.FRONTEND_URL || "http://localhost:3000"}/nx/payments/disbursement-methods`;

  return {
    clientId,
    clientSecret,
    programId,
    apiBase: apiBase.replace(/\/$/, ""),
    redirectUrl,
    isConfigured: Boolean(clientId && clientSecret && programId),
  };
};

const isConfigured = () => getConfig().isConfigured;

const getAccessToken = async () => {
  const { clientId, clientSecret, apiBase, isConfigured: configured } =
    getConfig();

  if (!configured) {
    throw Object.assign(new Error("Payoneer is not configured on the server."), {
      status: 503,
    });
  }

  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch(`${apiBase}/v4/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error_description ||
      data?.message ||
      data?.error ||
      "Unable to authenticate with Payoneer.";
    throw Object.assign(new Error(message), { status: 502 });
  }

  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
};

const payoneerRequest = async (path, options = {}) => {
  const { apiBase } = getConfig();
  const token = await getAccessToken();

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error_description ||
      data?.message ||
      data?.error ||
      "Payoneer request failed.";
    throw Object.assign(new Error(message), {
      status: response.status >= 500 ? 502 : 400,
      payoneer: data,
    });
  }

  return data;
};

const buildPayeeId = (user) => `worklanc_${user.uid}`;

const mapPayoneerStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (["active", "approved", "verified"].includes(normalized)) return "active";
  if (["inactive", "suspended", "closed"].includes(normalized)) {
    return "inactive";
  }
  if (["declined", "rejected"].includes(normalized)) return "declined";
  return "pending";
};

const registerPayee = async ({ user, email }) => {
  const { programId, redirectUrl } = getConfig();
  const payeeId = buildPayeeId(user);

  const payload = {
    payee_id: payeeId,
    client_session_id: payeeId,
    redirect_url: redirectUrl,
    payee: {
      type: "individual",
      contact: {
        email: email.trim(),
        first_name: user.first_name,
        last_name: user.last_name,
      },
    },
  };

  const data = await payoneerRequest(
    `/v4/programs/${programId}/payees/registration-link`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  const result = data?.result ?? data;
  const registrationLink =
    result?.registration_link || result?.registrationLink || null;

  if (!registrationLink) {
    throw Object.assign(
      new Error("Payoneer did not return a registration link."),
      { status: 502 },
    );
  }

  return {
    payeeId,
    email: email.trim(),
    registrationLink,
    status: "pending",
  };
};

const getPayeeStatus = async (payeeId) => {
  const { programId } = getConfig();

  const data = await payoneerRequest(
    `/v4/programs/${programId}/payees/${encodeURIComponent(payeeId)}/status`,
    { method: "GET" },
  );

  const result = data?.result ?? data;
  const rawStatus =
    result?.status?.type ||
    result?.status ||
    result?.account_status ||
    "pending";

  return {
    status: mapPayoneerStatus(rawStatus),
    raw: result,
  };
};

module.exports = {
  isConfigured,
  registerPayee,
  getPayeeStatus,
  buildPayeeId,
  mapPayoneerStatus,
};
