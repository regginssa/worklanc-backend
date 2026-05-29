const Accounts = require("../models/accounts");
const TalentProfiles = require("../models/talentProfiles");
const { toPublicAccount, resolveRedirect } = require("../utils/auth");

const getTalentAccount = (userId) =>
  Accounts.getByUserAndType(userId, "talent");

// GET /talent/profile — current user's individual talent profile
const getMine = async (req, res) => {
  try {
    const account = await getTalentAccount(req.user.id);
    if (!account) {
      return res.status(200).json({ profile: null, account: null });
    }

    const profile = await TalentProfiles.ensureForAccount(account.id);
    const full = await TalentProfiles.getFull(profile.id);

    return res.status(200).json({
      profile: full,
      account: toPublicAccount(account),
    });
  } catch (e) {
    console.error("talent.getMine error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /talent/profile — save a slice of onboarding data and (optionally)
// advance / complete the onboarding step. Every onboarding page posts here.
const patchMine = async (req, res) => {
  try {
    const account = await getTalentAccount(req.user.id);
    if (!account) {
      return res
        .status(400)
        .json({ message: "You need a talent account first" });
    }

    const profile = await TalentProfiles.ensureForAccount(account.id);
    const body = req.body || {};

    await TalentProfiles.updateScalars(profile.id, body);

    if (body.specialties !== undefined) {
      await TalentProfiles.replaceSpecialties(profile.id, body.specialties);
    }
    if (body.skills !== undefined) {
      await TalentProfiles.replaceSkills(profile.id, body.skills);
    }
    if (body.employment !== undefined) {
      await TalentProfiles.replaceEmployment(profile.id, body.employment);
    }
    if (body.education !== undefined) {
      await TalentProfiles.replaceEducation(profile.id, body.education);
    }
    if (body.languages !== undefined) {
      await TalentProfiles.replaceLanguages(profile.id, body.languages);
    }

    // Onboarding progress lives on the account (drives redirect/guard logic).
    let updatedAccount = account;
    if (
      body.onboardingStep !== undefined ||
      body.onboardingCompleted !== undefined
    ) {
      updatedAccount = await Accounts.updateOnboarding(account.id, {
        step: body.onboardingStep,
        completed: body.onboardingCompleted,
      });
    }

    const full = await TalentProfiles.getFull(profile.id);

    return res.status(200).json({
      profile: full,
      account: toPublicAccount(updatedAccount),
      redirectTo: resolveRedirect(updatedAccount),
    });
  } catch (e) {
    console.error("talent.patchMine error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getMine, patchMine };
