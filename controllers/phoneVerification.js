const Accounts = require("../models/accounts");
const Users = require("../models/users");
const { getTwilioClient } = require("../services/twilio/client");
const { toPublicUser } = require("../utils/auth");

const E164_PHONE = /^\+[1-9]\d{7,14}$/;

const normalizePhone = (phone) => String(phone || "").trim();

const isValidPhone = (phone) => E164_PHONE.test(phone);

const mapTwilioError = (error, action = "send") => {
  const code = error?.code;
  const status = error?.status;

  if (code === 60200 || code === 60205) {
    return { status: 400, message: "Invalid phone number" };
  }
  if (code === 60202 || code === 60203) {
    return {
      status: 429,
      message: "Too many verification attempts. Try again later.",
    };
  }
  if (code === 20404) {
    return { status: 400, message: "Verification code expired or not found" };
  }
  if (status === 404) {
    return { status: 400, message: "Verification code is invalid" };
  }

  return {
    status: 502,
    message:
      action === "verify"
        ? "Unable to verify code right now"
        : "Unable to send verification code right now",
  };
};

// POST /phone-verification/send
const sendCode = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    if (!isValidPhone(phone)) {
      return res
        .status(400)
        .json({ message: "Phone number must be in E.164 format" });
    }

    const { client, serviceSid } = getTwilioClient();

    await client.verify.v2.services(serviceSid).verifications.create({
      channel: "sms",
      to: phone,
    });

    await Users.update(req.user.id, {
      phone,
      phoneVerified: false,
    });

    return res.status(200).json({
      status: "pending",
      phone,
      message: "Verification code sent",
    });
  } catch (error) {
    if (error.message?.includes("not configured")) {
      console.error("sendCode config error:", error.message);
      return res
        .status(500)
        .json({ message: "SMS verification is not configured" });
    }

    const mapped = mapTwilioError(error, "send");
    if (mapped.status === 502) {
      console.error("sendCode twilio error:", error);
    }
    return res.status(mapped.status).json({ message: mapped.message });
  }
};

// POST /phone-verification/verify
const verifyCode = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || "").trim();

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    if (!isValidPhone(phone)) {
      return res
        .status(400)
        .json({ message: "Phone number must be in E.164 format" });
    }
    if (!code) {
      return res.status(400).json({ message: "Verification code is required" });
    }

    const { client, serviceSid } = getTwilioClient();

    const check = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({
        to: phone,
        code,
      });

    if (check.status !== "approved") {
      return res.status(400).json({ message: "Verification code is invalid" });
    }

    const updated = await Users.update(req.user.id, {
      phone,
      phoneVerified: true,
    });
    const accounts = await Accounts.getByUserId(updated.id);

    return res.status(200).json({
      status: "approved",
      user: toPublicUser(updated, accounts),
    });
  } catch (error) {
    if (error.message?.includes("not configured")) {
      console.error("verifyCode config error:", error.message);
      return res
        .status(500)
        .json({ message: "SMS verification is not configured" });
    }

    const mapped = mapTwilioError(error, "verify");
    if (mapped.status === 502) {
      console.error("verifyCode twilio error:", error);
    }
    return res.status(mapped.status).json({ message: mapped.message });
  }
};

module.exports = { sendCode, verifyCode };
