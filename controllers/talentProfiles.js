const Accounts = require("../models/accounts");
const TalentProfiles = require("../models/talentProfiles");
const Users = require("../models/users");
const {
  toPublicAccount,
  toPublicFreelancer,
  resolveRedirect,
} = require("../utils/auth");

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
    if (body.certifications !== undefined) {
      await TalentProfiles.replaceCertifications(
        profile.id,
        body.certifications,
      );
    }
    if (body.otherExperiences !== undefined) {
      await TalentProfiles.replaceOtherExperiences(
        profile.id,
        body.otherExperiences,
      );
    }
    if (body.licenses !== undefined) {
      await TalentProfiles.replaceLicenses(profile.id, body.licenses);
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

// GET /talent/freelancers/:uid — public profile view (optional auth for isOwner).
const getFreelancerByUid = async (req, res) => {
  try {
    const { uid } = req.params;
    let raw = await TalentProfiles.getRawByUid(uid);

    // Accept legacy links that used users.uid instead of talent_profiles.uid.
    if (!raw) {
      const userByUid = await Users.getByUid(uid);
      if (userByUid) {
        const talentAccount = await getTalentAccount(userByUid.id);
        if (talentAccount) {
          raw = await TalentProfiles.getRawByAccount(talentAccount.id);
        }
      }
    }

    if (!raw) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const account = await Accounts.getById(raw.account_id);
    if (!account || account.type !== "talent") {
      return res.status(404).json({ message: "Profile not found" });
    }

    const user = await Users.getByAccountId(raw.account_id);
    if (!user) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const isOwner = Boolean(req.user && req.user.id === user.id);
    if (raw.visibility === "private" && !isOwner) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const profile = await TalentProfiles.getFull(raw.id);

    return res.status(200).json({
      profile,
      freelancer: toPublicFreelancer(user),
      isOwner,
    });
  } catch (e) {
    console.error("talent.getFreelancerByUid error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getMine, patchMine, getFreelancerByUid };
