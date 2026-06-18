const Accounts = require("../models/accounts");
const {
  toPublicAccount,
  resolveRedirect,
  firstOnboardingStep,
  accountStartsCompleted,
  TALENT_ONBOARDING_STEPS,
  CLIENT_ONBOARDING_STEPS,
} = require("../utils/auth");

const ACCOUNT_TYPES = ["talent", "client"];
const MEMBERSHIP_TIERS = ["basic", "plus"];
const COMPANY_SIZES = [
  "just_me",
  "2_9",
  "10_99",
  "100_499",
  "500_4999",
  "5000_plus",
];

// GET /accounts — accounts owned by the current user
const list = async (req, res) => {
  try {
    const accounts = await Accounts.getByUserId(req.user.id);
    return res.status(200).json({ accounts: accounts.map(toPublicAccount) });
  } catch (e) {
    console.error("accounts.list error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /accounts — add a second account (e.g. a freelancer adding a client
// account from settings). One account per type per user.
const create = async (req, res) => {
  try {
    const { type } = req.body;

    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ message: "A valid account type is required" });
    }

    const existing = await Accounts.getByUserAndType(req.user.id, type);
    if (existing) {
      return res
        .status(409)
        .json({ message: `You already have a ${type} account` });
    }

    const account = await Accounts.create({
      userId: req.user.id,
      type,
      onboardingCompleted: accountStartsCompleted(type),
      onboardingStep: firstOnboardingStep(type),
    });

    return res.status(201).json({
      account: toPublicAccount(account),
      redirectTo: resolveRedirect(account),
    });
  } catch (e) {
    console.error("accounts.create error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /accounts/:id/onboarding — advance or complete onboarding
const updateOnboarding = async (req, res) => {
  try {
    const { id } = req.params;
    const { step, completed, companyName, companyWebsite, companySize, membershipTier } =
      req.body;

    const account = await Accounts.getById(id);
    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ message: "Account not found" });
    }

    const allowedSteps =
      account.type === "talent"
        ? TALENT_ONBOARDING_STEPS
        : account.type === "client"
          ? CLIENT_ONBOARDING_STEPS
          : [];

    if (step !== undefined && step !== null && !allowedSteps.includes(step)) {
      return res.status(400).json({ message: "Invalid onboarding step" });
    }

    if (
      account.type === "client" &&
      companySize !== undefined &&
      companySize !== null &&
      !COMPANY_SIZES.includes(companySize)
    ) {
      return res.status(400).json({ message: "Invalid company size" });
    }

    if (membershipTier !== undefined && !MEMBERSHIP_TIERS.includes(membershipTier)) {
      return res.status(400).json({ message: "Invalid membership tier" });
    }

    if (companyWebsite !== undefined && companyWebsite !== null) {
      try {
        const parsed = new URL(String(companyWebsite).trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return res.status(400).json({ message: "Company website must be a valid URL" });
        }
      } catch {
        return res.status(400).json({ message: "Company website must be a valid URL" });
      }
    }

    if (companyName !== undefined && String(companyName).trim().length === 0) {
      return res.status(400).json({ message: "Company name cannot be empty" });
    }

    let updated = account;
    if (
      account.type === "client" &&
      (companyName !== undefined ||
        companyWebsite !== undefined ||
        companySize !== undefined ||
        membershipTier !== undefined)
    ) {
      updated = await Accounts.updateClientProfile(id, {
        companyName: companyName === undefined ? undefined : String(companyName).trim(),
        companyWebsite:
          companyWebsite === undefined ? undefined : String(companyWebsite).trim(),
        companySize,
        membershipTier,
      });
    }

    if (step !== undefined || completed !== undefined) {
      updated = await Accounts.updateOnboarding(id, { step, completed });
    }

    return res.status(200).json({
      account: toPublicAccount(updated),
      redirectTo: resolveRedirect(updated),
    });
  } catch (e) {
    console.error("accounts.updateOnboarding error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { list, create, updateOnboarding };
