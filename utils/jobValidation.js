const JOB_POST_STEPS = [
  "/nx/job-post/title",
  "/nx/job-post/skills",
  "/nx/job-post/duration",
  "/nx/job-post/location",
  "/nx/job-post/budget",
  "/nx/job-post/add-description",
  "/nx/job-post/review",
];

const TITLE_MIN = 5;
const TITLE_MAX = 255;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 50000;
const SKILLS_MIN = 1;
const SKILLS_MAX = 10;
const SCREENING_MAX = 5;
const QUESTION_MAX = 255;

const PROJECT_SIZES = ["large", "medium", "small"];
const DURATIONS = ["6+", "3-6", "1-3"];
const EXPERIENCE_LEVELS = ["entry", "intermediate", "expert"];
const CONTRACT_TO_HIRE = ["yes", "no"];
const LOCATION_TYPES = ["local", "global"];
const BUDGET_TYPES = ["hourly", "fixed"];
const ENGLISH_LEVELS = [
  "any_level",
  "conversational_or_better",
  "fluent_or_better",
  "native_or_bilingual_only",
];
const HOURS_PER_WEEK = [
  "more_than_30_hrs_week",
  "less_than_30_hrs_week",
  "not_sure",
];
const TALENT_TYPES = ["no_preference", "independent", "agency"];
const HIRE_DATES = ["one_to_three_days", "one_week", "two_weeks", "one_month"];
const PROFESSIONALS_NEEDED = ["one_person", "more_than_one_person"];

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const validateSkills = (skills, { required = false } = {}) => {
  if (skills === undefined) return null;
  if (!Array.isArray(skills)) return "Skills must be an array";
  if (required && skills.length < SKILLS_MIN) {
    return `Add at least ${SKILLS_MIN} skill`;
  }
  if (skills.length > SKILLS_MAX) {
    return `You can add at most ${SKILLS_MAX} skills`;
  }
  for (const skill of skills) {
    if (!skill?.label?.trim() || !skill?.value?.trim()) {
      return "Each skill must have a label and value";
    }
  }
  return null;
};

const validateTitle = (title, { required = false } = {}) => {
  if (title === undefined) return null;
  const trimmed = String(title).trim();
  if (!trimmed) {
    return required ? "Job title is required" : null;
  }
  if (trimmed.length < TITLE_MIN) {
    return `Job title must be at least ${TITLE_MIN} characters`;
  }
  if (trimmed.length > TITLE_MAX) {
    return `Job title must be at most ${TITLE_MAX} characters`;
  }
  return null;
};

const validateDescription = (description, { required = false } = {}) => {
  if (description === undefined) return null;
  const trimmed = String(description).trim();
  if (!trimmed) {
    return required ? "Job description is required" : null;
  }
  if (trimmed.length < DESCRIPTION_MIN) {
    return `Description must be at least ${DESCRIPTION_MIN} characters`;
  }
  if (trimmed.length > DESCRIPTION_MAX) {
    return `Description must be at most ${DESCRIPTION_MAX} characters`;
  }
  return null;
};

const validateBudget = (job, { required = false } = {}) => {
  const { budgetType, budgetMin, budgetMax, budgetFixed } = job;

  if (budgetType !== undefined && !BUDGET_TYPES.includes(budgetType)) {
    return "Invalid budget type";
  }

  if (!required && budgetType === undefined) return null;

  const type = budgetType || "hourly";

  if (type === "hourly") {
    const min = budgetMin !== undefined ? Number(budgetMin) : null;
    const max = budgetMax !== undefined ? Number(budgetMax) : null;

    if (required && (min === null || max === null)) {
      return "Hourly rate range is required";
    }
    if (min !== null && (Number.isNaN(min) || min < 1)) {
      return "Minimum hourly rate must be at least $1";
    }
    if (max !== null && (Number.isNaN(max) || max < 1)) {
      return "Maximum hourly rate must be at least $1";
    }
    if (min !== null && max !== null && max < min) {
      return "Maximum hourly rate must be greater than or equal to minimum";
    }
    if (max !== null && max > 9999) {
      return "Maximum hourly rate is too high";
    }
  }

  if (type === "fixed") {
    const fixed = budgetFixed !== undefined ? Number(budgetFixed) : null;
    if (required && (fixed === null || fixed <= 0)) {
      return "Fixed project budget is required";
    }
    if (fixed !== null && (Number.isNaN(fixed) || fixed < 5)) {
      return "Fixed budget must be at least $5";
    }
    if (fixed !== null && fixed > 10000000) {
      return "Fixed budget is too high";
    }
  }

  return null;
};

const validateScope = (job, { required = false } = {}) => {
  const { projectSize, duration, experienceLevel, contractToHire } = job;

  if (projectSize !== undefined && !PROJECT_SIZES.includes(projectSize)) {
    return "Invalid project size";
  }
  if (duration !== undefined && !DURATIONS.includes(duration)) {
    return "Invalid project duration";
  }
  if (
    experienceLevel !== undefined &&
    !EXPERIENCE_LEVELS.includes(experienceLevel)
  ) {
    return "Invalid experience level";
  }
  if (
    contractToHire !== undefined &&
    !CONTRACT_TO_HIRE.includes(contractToHire)
  ) {
    return "Invalid contract-to-hire selection";
  }

  if (!required) return null;

  if (!projectSize) return "Project size is required";
  if (!duration) return "Project duration is required";
  if (!experienceLevel) return "Experience level is required";
  if (!contractToHire) return "Contract-to-hire selection is required";

  return null;
};

const validateLocation = (job, { required = false } = {}) => {
  const { locationType, locationPreferences } = job;

  if (locationType !== undefined && !LOCATION_TYPES.includes(locationType)) {
    return "Invalid location type";
  }
  if (locationPreferences !== undefined) {
    if (!Array.isArray(locationPreferences)) {
      return "Location preferences must be an array";
    }
    if (locationPreferences.length > 20) {
      return "Too many location preferences";
    }
  }

  if (required && !locationType) {
    return "Location type is required";
  }

  return null;
};

const validateScreeningQuestions = (questions) => {
  if (questions === undefined) return null;
  if (!Array.isArray(questions)) return "Screening questions must be an array";
  if (questions.length > SCREENING_MAX) {
    return `You can add at most ${SCREENING_MAX} screening questions`;
  }
  for (const q of questions) {
    const trimmed = String(q).trim();
    if (!trimmed) return "Screening questions cannot be empty";
    if (trimmed.length > QUESTION_MAX) {
      return `Each screening question must be at most ${QUESTION_MAX} characters`;
    }
  }
  return null;
};

const validateReviewFields = (job) => {
  const {
    englishLevel,
    hoursPerWeek,
    talentType,
    hireDate,
    professionalsNeeded,
    screeningQuestions,
    umaRecruiterEnabled,
  } = job;

  if (englishLevel !== undefined && !ENGLISH_LEVELS.includes(englishLevel)) {
    return "Invalid English level";
  }
  if (hoursPerWeek !== undefined && !HOURS_PER_WEEK.includes(hoursPerWeek)) {
    return "Invalid hours per week";
  }
  if (talentType !== undefined && !TALENT_TYPES.includes(talentType)) {
    return "Invalid talent type";
  }
  if (hireDate !== undefined && !HIRE_DATES.includes(hireDate)) {
    return "Invalid hire date";
  }
  if (
    professionalsNeeded !== undefined &&
    !PROFESSIONALS_NEEDED.includes(professionalsNeeded)
  ) {
    return "Invalid professionals needed selection";
  }
  if (umaRecruiterEnabled !== undefined && typeof umaRecruiterEnabled !== "boolean") {
    return "Invalid Uma recruiter setting";
  }

  return validateScreeningQuestions(screeningQuestions);
};

const validateStep = (step, job) => {
  switch (step) {
    case "/nx/job-post/title":
      return validateTitle(job.title, { required: true });
    case "/nx/job-post/skills":
      return (
        validateTitle(job.title, { required: true }) ||
        validateSkills(job.skills, { required: true })
      );
    case "/nx/job-post/duration":
      return (
        validateTitle(job.title, { required: true }) ||
        validateSkills(job.skills, { required: true }) ||
        validateScope(job, { required: true })
      );
    case "/nx/job-post/location":
      return (
        validateTitle(job.title, { required: true }) ||
        validateSkills(job.skills, { required: true }) ||
        validateScope(job, { required: true }) ||
        validateLocation(job, { required: true })
      );
    case "/nx/job-post/budget":
      return (
        validateTitle(job.title, { required: true }) ||
        validateSkills(job.skills, { required: true }) ||
        validateScope(job, { required: true }) ||
        validateLocation(job, { required: true }) ||
        validateBudget(job, { required: true })
      );
    case "/nx/job-post/add-description":
      return (
        validateTitle(job.title, { required: true }) ||
        validateSkills(job.skills, { required: true }) ||
        validateScope(job, { required: true }) ||
        validateLocation(job, { required: true }) ||
        validateBudget(job, { required: true }) ||
        validateDescription(job.description, { required: true })
      );
    default:
      return null;
  }
};

const validateForPublish = (job) => {
  return (
    validateTitle(job.title, { required: true }) ||
    validateSkills(job.skills, { required: true }) ||
    validateScope(job, { required: true }) ||
    validateLocation(job, { required: true }) ||
    validateBudget(job, { required: true }) ||
    validateDescription(job.description, { required: true }) ||
    validateReviewFields(job)
  );
};

const getNextStep = (currentStep) => {
  const index = JOB_POST_STEPS.indexOf(currentStep);
  if (index === -1 || index >= JOB_POST_STEPS.length - 1) return null;
  return JOB_POST_STEPS[index + 1];
};

const getPrevStep = (currentStep) => {
  const index = JOB_POST_STEPS.indexOf(currentStep);
  if (index <= 0) return null;
  return JOB_POST_STEPS[index - 1];
};

module.exports = {
  JOB_POST_STEPS,
  TITLE_MIN,
  TITLE_MAX,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  SKILLS_MIN,
  SKILLS_MAX,
  SCREENING_MAX,
  QUESTION_MAX,
  validateStep,
  validateForPublish,
  validateTitle,
  validateSkills,
  validateDescription,
  validateBudget,
  validateScope,
  validateLocation,
  validateReviewFields,
  getNextStep,
  getPrevStep,
};
