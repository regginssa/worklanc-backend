const Users = require("../models/users");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const format = require("../utils/format");

const issueToken = (user) => {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: "3d",
  });

  return {
    token: `Bearer ${token}`,
    user: format.toCamelCase(user),
  };
};

const signup = async (req, res) => {
  try {
    const { email, password, signinOption } = req.body;
    const already = await Users.getByEmail(email);
    if (already) return res.status(400).json({ message: "You already exist" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await Users.create({
      ...req.body,
      password: hashedPassword,
    });
    const payload = issueToken(newUser);
    res.status(200).json({ ...payload, isNewUser: true });
  } catch (e) {
    console.error("signup error: ", e);
    res.status(500).json({ message: "Internal server error" });
  }
};

const signin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await Users.getByEmail(email);

    if (!user) {
      return res.status(400).json({ message: "Account not found" });
    }

    if (user.signin_option !== "email") {
      return res.status(400).json({
        message: `You signed in with ${format.toTitleCase(user.signin_option)}`,
      });
    }

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const payload = issueToken(user);
    res.status(200).json({ ...payload, isNewUser: false });
  } catch (e) {
    res.status(500).json({ message: "Internal server error" });
  }
};

const oauth = async (req, res) => {
  try {
    const {
      signinOption,
      googleId,
      appleId,
      email,
      firstName,
      lastName,
      intent = "login",
      accountType,
      countryCode = "US",
    } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (!["google", "apple"].includes(signinOption)) {
      return res.status(400).json({ message: "Unsupported social provider" });
    }

    const providerId = signinOption === "google" ? googleId : appleId;
    if (!providerId) {
      return res.status(400).json({ message: "Provider id is required" });
    }

    let user =
      signinOption === "google"
        ? await Users.getByGoogleId(googleId)
        : await Users.getByAppleId(appleId);

    if (!user) {
      user = await Users.getByEmail(email);
    }

    if (!user) {
      if (intent === "login") {
        return res.status(404).json({
          message: "Account not found. Please sign up first.",
        });
      }

      if (!accountType || !["client", "talent"].includes(accountType)) {
        return res.status(400).json({
          message: "Account type is required for signup",
        });
      }

      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const newUser = await Users.create({
        firstName: firstName || "User",
        lastName: lastName || "",
        email,
        countryCode,
        password: hashedPassword,
        accountType,
        signinOption,
        googleId: signinOption === "google" ? googleId : null,
        appleId: signinOption === "apple" ? appleId : null,
      });

      const payload = issueToken(newUser);
      return res.status(200).json({ ...payload, isNewUser: true });
    }

    if (user.signin_option === "email") {
      return res.status(400).json({
        message:
          "An account with this email already exists. Sign in with email instead.",
      });
    }

    if (user.signin_option !== signinOption) {
      return res.status(400).json({
        message: `Please sign in with ${format.toTitleCase(user.signin_option)}`,
      });
    }

    if (signinOption === "google") {
      if (user.google_id && user.google_id !== googleId) {
        return res.status(400).json({ message: "Google account mismatch" });
      }
      if (!user.google_id) {
        user = await Users.linkGoogleId(user.id, googleId);
      }
    }

    if (signinOption === "apple") {
      if (user.apple_id && user.apple_id !== appleId) {
        return res.status(400).json({ message: "Apple account mismatch" });
      }
      if (!user.apple_id) {
        user = await Users.linkAppleId(user.id, appleId);
      }
    }

    const payload = issueToken(user);
    return res.status(200).json({ ...payload, isNewUser: false });
  } catch (e) {
    console.error("oauth error: ", e);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { signin, signup, oauth };
