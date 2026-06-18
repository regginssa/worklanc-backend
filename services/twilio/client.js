const twilio = require("twilio");

let cachedClient = null;

const getTwilioConfig = () => {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!serviceSid) {
    throw new Error(
      "TWILIO_VERIFY_SERVICE_SID is not configured. Create a Verify Service at https://console.twilio.com/us1/develop/verify/services and set the Service SID (starts with VA...).",
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_CLIENT_SECRET;

  if (accountSid?.startsWith("AC") && authToken) {
    return { client: twilio(accountSid, authToken), serviceSid };
  }

  const apiKeySid =
    process.env.TWILIO_API_KEY_SID ||
    (accountSid?.startsWith("SK") ? accountSid : null);
  const apiKeySecret =
    process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_CLIENT_SECRET;
  const parentAccountSid = process.env.TWILIO_PARENT_ACCOUNT_SID;

  if (apiKeySid?.startsWith("SK") && apiKeySecret && parentAccountSid?.startsWith("AC")) {
    return {
      client: twilio(apiKeySid, apiKeySecret, { accountSid: parentAccountSid }),
      serviceSid,
    };
  }

  throw new Error(
    "Twilio credentials are not configured. Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET + TWILIO_PARENT_ACCOUNT_SID",
  );
};

const getTwilioClient = () => {
  if (!cachedClient) {
    cachedClient = getTwilioConfig();
  }
  return cachedClient;
};

module.exports = { getTwilioClient };
