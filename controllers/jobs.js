const Accounts = require("../models/accounts");
const Jobs = require("../models/jobs");
const JobReads = require("../models/jobReads");
const Users = require("../models/users");
const {
  JOB_POST_STEPS,
  validateStep,
  validateForPublish,
  validateReviewFields,
  getNextStep,
  getPrevStep,
} = require("../utils/jobValidation");

const getClientAccount = async (userId) =>
  Accounts.getByUserAndType(userId, "client");

const mergeJob = (existing, patch) => ({
  title: patch.title !== undefined ? patch.title : existing.title,
  skills:
    patch.skills !== undefined ? patch.skills : existing.skills ?? [],
  projectSize:
    patch.projectSize !== undefined
      ? patch.projectSize
      : existing.project_size,
  duration:
    patch.duration !== undefined ? patch.duration : existing.duration,
  experienceLevel:
    patch.experienceLevel !== undefined
      ? patch.experienceLevel
      : existing.experience_level,
  contractToHire:
    patch.contractToHire !== undefined
      ? patch.contractToHire
      : existing.contract_to_hire,
  locationType:
    patch.locationType !== undefined
      ? patch.locationType
      : existing.location_type,
  locationPreferences:
    patch.locationPreferences !== undefined
      ? patch.locationPreferences
      : existing.location_preferences ?? [],
  budgetType:
    patch.budgetType !== undefined ? patch.budgetType : existing.budget_type,
  budgetMin:
    patch.budgetMin !== undefined ? patch.budgetMin : existing.budget_min,
  budgetMax:
    patch.budgetMax !== undefined ? patch.budgetMax : existing.budget_max,
  budgetFixed:
    patch.budgetFixed !== undefined ? patch.budgetFixed : existing.budget_fixed,
  description:
    patch.description !== undefined
      ? patch.description
      : existing.description,
  screeningQuestions:
    patch.screeningQuestions !== undefined
      ? patch.screeningQuestions
      : existing.screening_questions ?? [],
  englishLevel:
    patch.englishLevel !== undefined
      ? patch.englishLevel
      : existing.english_level,
  hoursPerWeek:
    patch.hoursPerWeek !== undefined
      ? patch.hoursPerWeek
      : existing.hours_per_week,
  talentType:
    patch.talentType !== undefined ? patch.talentType : existing.talent_type,
  hireDate:
    patch.hireDate !== undefined ? patch.hireDate : existing.hire_date,
  professionalsNeeded:
    patch.professionalsNeeded !== undefined
      ? patch.professionalsNeeded
      : existing.professionals_needed,
  umaRecruiterEnabled:
    patch.umaRecruiterEnabled !== undefined
      ? patch.umaRecruiterEnabled
      : existing.uma_recruiter_enabled,
});

const assertJobOwnership = async (req, uid) => {
  const account = await getClientAccount(req.user.id);
  if (!account) {
    return { error: { status: 400, message: "You need a client account first" } };
  }

  const job = await Jobs.getByUid(uid);
  if (!job || job.account_id !== account.id) {
    return { error: { status: 404, message: "Job not found" } };
  }

  return { account, job };
};

// GET /jobs/browse — open jobs for freelancer find-work feed
const browseList = async (req, res) => {
  try {
    const userId = req.user?.id ?? null;
    const rows = await Jobs.listOpenForBrowse(userId);
    const { toBrowseListItem } = require("../utils/jobBrowse");
    return res.status(200).json({
      jobs: rows.map(toBrowseListItem),
    });
  } catch (e) {
    console.error("jobs.browseList error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /jobs/browse/:uid — public job detail for freelancers
const browseOne = async (req, res) => {
  try {
    const userId = req.user?.id ?? null;
    const row = await Jobs.getOpenForBrowseByUid(req.params.uid, userId);
    if (!row) {
      return res.status(404).json({ message: "Job not found" });
    }

    const { toBrowseDetail } = require("../utils/jobBrowse");
    return res.status(200).json({ job: toBrowseDetail(row) });
  } catch (e) {
    console.error("jobs.browseOne error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /jobs/browse/:uid/read — mark a browse job as read for the current user
const markBrowseRead = async (req, res) => {
  try {
    const job = await Jobs.getOpenForBrowseByUid(req.params.uid);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    await JobReads.markRead(req.user.id, job.id);

    return res.status(200).json({ success: true, isRead: true });
  } catch (e) {
    console.error("jobs.markBrowseRead error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /jobs — create a new draft job post
const create = async (req, res) => {
  try {
    const account = await getClientAccount(req.user.id);
    if (!account) {
      return res
        .status(400)
        .json({ message: "You need a client account first" });
    }

    const job = await Jobs.create(account.id);
    return res.status(201).json({ job: Jobs.toPublicJob(job) });
  } catch (e) {
    console.error("jobs.create error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /jobs — list jobs for the current client account
const list = async (req, res) => {
  try {
    const account = await getClientAccount(req.user.id);
    if (!account) {
      return res.status(200).json({ jobs: [] });
    }

    const rows = await Jobs.getByAccountId(account.id);
    return res.status(200).json({
      jobs: rows.map(Jobs.toPublicJob),
    });
  } catch (e) {
    console.error("jobs.list error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /jobs/:uid
const getOne = async (req, res) => {
  try {
    const { error, job } = await assertJobOwnership(req, req.params.uid);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    return res.status(200).json({ job: Jobs.toPublicJob(job) });
  } catch (e) {
    console.error("jobs.getOne error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /jobs/:uid — save wizard step data
const patchOne = async (req, res) => {
  try {
    const { error, job } = await assertJobOwnership(req, req.params.uid);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const body = req.body || {};
    const { currentStep, direction } = body;

    if (currentStep && !JOB_POST_STEPS.includes(currentStep)) {
      return res.status(400).json({ message: "Invalid job post step" });
    }

    const reviewError = validateReviewFields(body);
    if (reviewError) {
      return res.status(400).json({ message: reviewError });
    }

    const merged = mergeJob(job, body);
    const stepToValidate = currentStep || job.current_step;

    if (direction === "next") {
      const validationError = validateStep(stepToValidate, merged);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }
    }

    const patch = { ...body };

    if (direction === "next" && currentStep) {
      const next = getNextStep(currentStep);
      if (next) patch.currentStep = next;
    } else if (direction === "back" && currentStep) {
      const prev = getPrevStep(currentStep);
      if (prev) patch.currentStep = prev;
    } else if (currentStep) {
      patch.currentStep = currentStep;
    }

    if (job.status !== "draft" && job.status !== "pending") {
      delete patch.status;
    } else if (!patch.status) {
      patch.status = "draft";
    }

    const updated = await Jobs.updateScalars(job.id, patch);
    return res.status(200).json({ job: Jobs.toPublicJob(updated) });
  } catch (e) {
    console.error("jobs.patchOne error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /jobs/:uid/save-draft — explicitly save as draft from review
const saveDraft = async (req, res) => {
  try {
    const { error, job } = await assertJobOwnership(req, req.params.uid);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const body = req.body || {};
    const reviewError = validateReviewFields(body);
    if (reviewError) {
      return res.status(400).json({ message: reviewError });
    }

    const updated = await Jobs.updateScalars(job.id, {
      ...body,
      status: "draft",
      currentStep: "/nx/job-post/review",
    });

    return res.status(200).json({ job: Jobs.toPublicJob(updated) });
  } catch (e) {
    console.error("jobs.saveDraft error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /jobs/:uid/publish — publish job (pending if phone not verified, else open)
const publish = async (req, res) => {
  try {
    const { error, job } = await assertJobOwnership(req, req.params.uid);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const body = req.body || {};
    const reviewError = validateReviewFields(body);
    if (reviewError) {
      return res.status(400).json({ message: reviewError });
    }

    const merged = mergeJob(job, body);
    const validationError = validateForPublish(merged);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const user = await Users.getById(req.user.id);
    const status = user?.phone_verified ? "open" : "pending";

    const updated = await Jobs.updateScalars(job.id, {
      ...body,
      status,
      currentStep: "/nx/job-post/review",
      publishedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      job: Jobs.toPublicJob(updated),
      phoneVerificationRequired: !user?.phone_verified,
    });
  } catch (e) {
    console.error("jobs.publish error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// DELETE /jobs/:uid
const remove = async (req, res) => {
  try {
    const { error, job } = await assertJobOwnership(req, req.params.uid);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    await Jobs.deleteById(job.id);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("jobs.remove error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /jobs/:uid/activate — move a pending job to open after phone verification
const activate = async (req, res) => {
  try {
    const { error, job } = await assertJobOwnership(req, req.params.uid);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    if (job.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending jobs can be activated" });
    }

    const user = await Users.getById(req.user.id);
    if (!user?.phone_verified) {
      return res
        .status(400)
        .json({ message: "Phone verification is required to publish" });
    }

    const updated = await Jobs.updateScalars(job.id, { status: "open" });
    return res.status(200).json({ job: Jobs.toPublicJob(updated) });
  } catch (e) {
    console.error("jobs.activate error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  browseList,
  browseOne,
  markBrowseRead,
  create,
  list,
  getOne,
  patchOne,
  saveDraft,
  publish,
  activate,
  remove,
};
