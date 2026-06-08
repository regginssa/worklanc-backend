const Accounts = require("../models/accounts");
const TalentProfiles = require("../models/talentProfiles");
const Testimonials = require("../models/testimonials");
const Users = require("../models/users");
const { sendTestimonialRequestEmail } = require("../utils/testimonialEmail");
const UserMilitaryService = require("../models/userMilitaryService");
const {
  toPublicAccount,
  toPublicFreelancer,
  toPublicMilitaryService,
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
    if (body.testimonialRequest !== undefined) {
      const request = body.testimonialRequest;
      if (
        !request?.clientFirstName?.trim() ||
        !request?.clientLastName?.trim() ||
        !request?.clientEmail?.trim() ||
        !request?.requestMessage?.trim()
      ) {
        return res
          .status(400)
          .json({ message: "Testimonial request details are required" });
      }

      const testimonial = await TalentProfiles.createTestimonial(
        profile.id,
        request,
      );
      const talentUser = await Users.getByAccountId(profile.account_id);
      const talentName = talentUser
        ? `${talentUser.first_name} ${talentUser.last_name}`.trim()
        : "A WorkLanc freelancer";
      const frontendBase =
        process.env.FRONTEND_URL || "http://localhost:3000";
      const confirmUrl = `${frontendBase}/testimonials/confirm/${testimonial.uid}`;

      await sendTestimonialRequestEmail({
        clientEmail: request.clientEmail.trim(),
        clientFirstName: request.clientFirstName.trim(),
        talentName,
        requestMessage: request.requestMessage.trim(),
        confirmUrl,
      });
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
    const militaryServiceRow = user.is_military_veteran
      ? await UserMilitaryService.getByUserId(user.id)
      : null;

    return res.status(200).json({
      profile,
      freelancer: toPublicFreelancer(
        user,
        toPublicMilitaryService(militaryServiceRow, {
          includePrivateFields: isOwner,
        }),
      ),
      isOwner,
    });
  } catch (e) {
    console.error("talent.getFreelancerByUid error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const toPublicTestimonialRequest = (row) => ({
  uid: row.uid,
  status: row.status,
  clientFirstName: row.client_first_name,
  clientLastName: row.client_last_name,
  clientTitle: row.client_title,
  projectType: row.project_type,
  requestMessage: row.request_message,
  testimonialText: row.testimonial_text,
  talentFirstName: row.talent_first_name,
  talentLastName: row.talent_last_name,
  talentTitle: row.talent_title,
  talentProfileUid: row.talent_profile_uid,
});

// GET /talent/testimonials/:uid — public client response page.
const getTestimonialRequest = async (req, res) => {
  try {
    const row = await Testimonials.getByUid(req.params.uid);
    if (!row) {
      return res.status(404).json({ message: "Testimonial request not found" });
    }

    return res.status(200).json({
      testimonial: toPublicTestimonialRequest(row),
    });
  } catch (e) {
    console.error("talent.getTestimonialRequest error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /talent/testimonials/:uid/respond — client confirms or declines.
const respondToTestimonial = async (req, res) => {
  try {
    const { action, testimonialText } = req.body || {};

    if (!["confirm", "decline"].includes(action)) {
      return res.status(400).json({ message: "Action must be confirm or decline" });
    }

    if (action === "confirm" && !testimonialText?.trim()) {
      return res
        .status(400)
        .json({ message: "Testimonial text is required to confirm" });
    }

    const status = action === "confirm" ? "confirmed" : "declined";
    const updated = await Testimonials.respond(req.params.uid, {
      status,
      testimonialText: testimonialText?.trim() || null,
    });

    if (!updated) {
      const existing = await Testimonials.getByUid(req.params.uid);
      if (!existing) {
        return res.status(404).json({ message: "Testimonial request not found" });
      }
      return res.status(409).json({
        message: "This testimonial request has already been responded to",
        status: existing.status,
      });
    }

    return res.status(200).json({
      status: updated.status,
      testimonialText: updated.testimonial_text,
    });
  } catch (e) {
    console.error("talent.respondToTestimonial error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getMine,
  patchMine,
  getFreelancerByUid,
  getTestimonialRequest,
  respondToTestimonial,
};
