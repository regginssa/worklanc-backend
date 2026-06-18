const Users = require("../models/users");
const Accounts = require("../models/accounts");
const UserMilitaryService = require("../models/userMilitaryService");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const format = require("../utils/format");
const {
  issueToken,
  toPublicUser,
  resolveRedirect,
  pickActiveAccount,
  firstOnboardingStep,
  accountStartsCompleted,
} = require("../utils/auth");

const ACCOUNT_TYPES = ["talent", "client"];

// Ensure a user has an account of the given type, creating it if missing.
const ensureAccount = async (userId, type) => {
  const existing = await Accounts.getByUserAndType(userId, type);
  if (existing) return existing;

  return Accounts.create({
    userId,
    type,
    onboardingCompleted: accountStartsCompleted(type),
    onboardingStep: firstOnboardingStep(type),
  });
};

// Build the standard auth response: token + sanitized user (with accounts) +
// the route the client should navigate to next.
const buildAuthResponse = async (user, { activeAccount, isNewUser }) => {
  const accounts = await Accounts.getByUserId(user.id);
  const target =
    activeAccount &&
    accounts.find((a) => a.id === activeAccount.id);

  return {
    token: issueToken(user),
    user: toPublicUser(user, accounts),
    redirectTo: resolveRedirect(target || pickActiveAccount(accounts)),
    isNewUser: Boolean(isNewUser),
  };
};

// POST /auth/signup — email + password
const signup = async (req, res) => {
  try {
    const { email, password, firstName, lastName, accountType } = req.body;
    const countryCode = req.body.countryCode || "US";
    const marketingOptIn =
      req.body.marketingOptIn ?? req.body.alert ?? true;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ message: "First and last name are required" });
    }

    if (!ACCOUNT_TYPES.includes(accountType)) {
      return res.status(400).json({ message: "A valid account type is required" });
    }

    const already = await Users.getByEmail(email);
    if (already) {
      return res
        .status(400)
        .json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await Users.create({
      firstName,
      lastName,
      email,
      countryCode,
      passwordHash,
      signupProvider: "email",
      marketingOptIn,
    });

    const account = await ensureAccount(user.id, accountType);

    const payload = await buildAuthResponse(user, {
      activeAccount: account,
      isNewUser: true,
    });
    return res.status(201).json(payload);
  } catch (e) {
    console.error("signup error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /auth/signin — email + password
const signin = async (req, res) => {
  try {
    const { email, password, accountType } = req.body;

    const user = await Users.getByEmail(email);
    if (!user) {
      return res.status(400).json({ message: "Account not found" });
    }

    if (!user.password_hash) {
      return res.status(400).json({
        message: `This account uses ${format.toTitleCase(
          user.signup_provider,
        )} sign in`,
      });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const accounts = await Accounts.getByUserId(user.id);
    const active = pickActiveAccount(accounts, accountType);

    const payload = await buildAuthResponse(user, {
      activeAccount: active,
      isNewUser: false,
    });
    return res.status(200).json(payload);
  } catch (e) {
    console.error("signin error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /auth/oauth — google / apple
//
// The frontend performs the provider handshake in-place (popup / one-tap) and
// posts the decoded profile here. No separate callback page: the response
// carries `redirectTo`, which is either the next incomplete onboarding step or
// /dashboard when onboarding is already done.
const oauth = async (req, res) => {
  try {
    const {
      provider,
      providerId,
      email,
      firstName,
      lastName,
      intent = "login",
      accountType,
      countryCode = "US",
    } = req.body;

    if (!["google", "apple"].includes(provider)) {
      return res.status(400).json({ message: "Unsupported social provider" });
    }
    if (!providerId) {
      return res.status(400).json({ message: "Provider id is required" });
    }
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (intent === "signup" && !ACCOUNT_TYPES.includes(accountType)) {
      return res
        .status(400)
        .json({ message: "A valid account type is required to sign up" });
    }

    // Find the user by their linked provider id first, then fall back to email
    // so an existing email user can connect a social provider.
    let user =
      provider === "google"
        ? await Users.getByGoogleId(providerId)
        : await Users.getByAppleId(providerId);

    if (!user) user = await Users.getByEmail(email);

    let isNewUser = false;

    if (!user) {
      if (intent === "login") {
        return res
          .status(404)
          .json({ message: "Account not found. Please sign up first." });
      }

      // Social-only signup: no usable password, store a random hash placeholder
      // so the column stays non-spoofable while password_hash semantics hold.
      const randomHash = await bcrypt.hash(
        crypto.randomBytes(32).toString("hex"),
        10,
      );

      user = await Users.create({
        firstName: firstName || "WorkLanc",
        lastName: lastName || "User",
        email,
        countryCode,
        passwordHash: randomHash,
        signupProvider: provider,
        googleId: provider === "google" ? providerId : null,
        appleId: provider === "apple" ? providerId : null,
        emailVerified: true,
      });
      isNewUser = true;
    } else {
      // Link the provider to the existing identity if not linked yet.
      if (provider === "google") {
        if (user.google_id && user.google_id !== providerId) {
          return res.status(400).json({ message: "Google account mismatch" });
        }
        if (!user.google_id) user = await Users.linkGoogleId(user.id, providerId);
      } else {
        if (user.apple_id && user.apple_id !== providerId) {
          return res.status(400).json({ message: "Apple account mismatch" });
        }
        if (!user.apple_id) user = await Users.linkAppleId(user.id, providerId);
      }
    }

    // For signup we guarantee the requested account exists; for login we use
    // whatever account the user already has.
    let active;
    if (intent === "signup") {
      active = await ensureAccount(user.id, accountType);
    } else {
      const accounts = await Accounts.getByUserId(user.id);
      active = pickActiveAccount(accounts, accountType);
    }

    const payload = await buildAuthResponse(user, {
      activeAccount: active,
      isNewUser,
    });
    return res.status(200).json(payload);
  } catch (e) {
    console.error("oauth error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /auth/me — current identity + accounts (requires auth)
const me = async (req, res) => {
  try {
    const accounts = await Accounts.getByUserId(req.user.id);
    return res.status(200).json({
      user: toPublicUser(req.user, accounts),
      redirectTo: resolveRedirect(pickActiveAccount(accounts)),
    });
  } catch (e) {
    console.error("me error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const MILITARY_BRANCHES = new Set([
  "army_and_ground_forces",
  "navy_coast_guard_and_marine_forces",
  "air_force",
  "space_force",
]);

const applyMilitaryVeteranUpdate = async (userId, militaryVeteran) => {
  const { status } = militaryVeteran || {};
  if (!status) {
    throw new Error("Military veteran status is required");
  }

  if (status === "served") {
    const {
      country,
      countryCode,
      firstName,
      lastName,
      activeDutyStartDate,
      activeDutyEndDate,
      branch,
    } = militaryVeteran;

    if (
      !country?.trim() ||
      !countryCode?.trim() ||
      !firstName?.trim() ||
      !lastName?.trim() ||
      !activeDutyStartDate ||
      !activeDutyEndDate ||
      !branch
    ) {
      throw new Error("Military service details are required");
    }

    if (!MILITARY_BRANCHES.has(branch)) {
      throw new Error("Invalid military service branch");
    }

    if (new Date(activeDutyEndDate) < new Date(activeDutyStartDate)) {
      throw new Error("Active duty end date must be on or after start date");
    }

    await Users.update(userId, {
      isMilitaryVeteran: true,
      militaryVeteranDeclined: false,
    });
    await UserMilitaryService.upsert(userId, {
      country,
      countryCode,
      firstName,
      lastName,
      activeDutyStartDate,
      activeDutyEndDate,
      branch,
    });
    return;
  }

  if (status === "not_served") {
    await Users.update(userId, {
      isMilitaryVeteran: false,
      militaryVeteranDeclined: false,
    });
    await UserMilitaryService.deleteByUserId(userId);
    return;
  }

  if (status === "declined") {
    await Users.update(userId, {
      isMilitaryVeteran: null,
      militaryVeteranDeclined: true,
    });
    await UserMilitaryService.deleteByUserId(userId);
    return;
  }

  if (status === "unset") {
    await Users.update(userId, {
      isMilitaryVeteran: null,
      militaryVeteranDeclined: false,
    });
    await UserMilitaryService.deleteByUserId(userId);
    return;
  }

  throw new Error("Invalid military veteran status");
};

// PATCH /auth/me — update identity fields (name, contact, address...).
const updateMe = async (req, res) => {
  try {
    const body = req.body || {};
    const { militaryVeteran, phoneVerified, ...identityPatch } = body;

    if (phoneVerified !== undefined) {
      return res.status(400).json({
        message: "Phone verification must be completed through /phone-verification/verify",
      });
    }

    if (
      identityPatch.phone !== undefined &&
      identityPatch.phone !== req.user.phone
    ) {
      identityPatch.phoneVerified = false;
    }

    if (militaryVeteran !== undefined) {
      await applyMilitaryVeteranUpdate(req.user.id, militaryVeteran);
    }

    const updated =
      Object.keys(identityPatch).length > 0
        ? await Users.update(req.user.id, identityPatch)
        : await Users.getById(req.user.id);
    const accounts = await Accounts.getByUserId(updated.id);
    return res.status(200).json({ user: toPublicUser(updated, accounts) });
  } catch (e) {
    if (
      e.message === "Military veteran status is required" ||
      e.message === "Military service details are required" ||
      e.message === "Invalid military service branch" ||
      e.message === "Active duty end date must be on or after start date" ||
      e.message === "Invalid military veteran status"
    ) {
      return res.status(400).json({ message: e.message });
    }
    console.error("updateMe error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /auth/logout — client-side JWT logout acknowledgement.
const logout = async (_req, res) => {
  try {
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (e) {
    console.error("logout error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { signup, signin, oauth, me, updateMe, logout };
