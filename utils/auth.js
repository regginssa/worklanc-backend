const jwt = require("jsonwebtoken");

const DASHBOARD_PATH = "/dashboard";

// Ordered Talent onboarding flow. `onboarding_step` stores one of these paths
// (the next route the user must complete). This is the single source of truth
// for where to drop a user after sign-in / OAuth.
const TALENT_ONBOARDING_STEPS = [
  "/nx/create-profile",
  "/nx/create-profile/experience",
  "/nx/create-profile/goal",
  "/nx/create-profile/work-preference",
  "/nx/create-profile/resume-import",
  "/nx/create-profile/categories",
  "/nx/create-profile/skills",
  "/nx/create-profile/title",
  "/nx/create-profile/employment",
  "/nx/create-profile/education",
  "/nx/create-profile/languages",
  "/nx/create-profile/overview",
  "/nx/create-profile/rate",
  "/nx/create-profile/location",
  "/nx/create-profile/submit",
];

const CLIENT_BUSINESS_PLUS_TRIAL_PATH =
  "/nx/plans/client/business-plus/1mo-trial-net-new-1";

const CLIENT_ONBOARDING_STEPS = [
  "/nx/client-onboarding/company-size",
  CLIENT_BUSINESS_PLUS_TRIAL_PATH,
  "/nx/client-onboarding/verify-phone",
];

// Where a freshly created account should begin onboarding.
const firstOnboardingStep = (type) => {
  if (type === "talent") return TALENT_ONBOARDING_STEPS[0];
  if (type === "client") return CLIENT_ONBOARDING_STEPS[0];
  return null;
};

const accountStartsCompleted = () => false;

// Resolve where to redirect a user for a given account.
const resolveRedirect = (account) => {
  if (!account) return DASHBOARD_PATH;
  if (account.onboarding_completed) return DASHBOARD_PATH;
  if (account.type === "talent") {
    return account.onboarding_step || TALENT_ONBOARDING_STEPS[0];
  }
  if (account.type === "client") {
    return account.onboarding_step || CLIENT_ONBOARDING_STEPS[0];
  }
  return DASHBOARD_PATH;
};

// When signing in without an explicit account context, prefer an account that
// still needs onboarding so the user is nudged to finish it; otherwise the
// first account they created.
const pickActiveAccount = (accounts = [], preferredType) => {
  if (preferredType) {
    const match = accounts.find((a) => a.type === preferredType);
    if (match) return match;
  }

  const incomplete = accounts.filter((a) => !a.onboarding_completed);
  if (incomplete.length === 1) return incomplete[0];
  if (incomplete.length > 1) return incomplete[incomplete.length - 1];

  return accounts[0] || null;
};

const toPublicAccount = (account) => ({
  id: account.id,
  uid: account.uid,
  type: account.type,
  membershipTier: account.membership_tier ?? "basic",
  companyName: account.company_name ?? "",
  companyWebsite: account.company_website ?? "",
  companySize: account.company_size ?? null,
  onboardingCompleted: account.onboarding_completed,
  onboardingStep: account.onboarding_step,
  createdAt: account.created_at,
});

// Strip secrets and expose only client-safe identity fields.
const toPublicUser = (user, accounts = []) => ({
  id: user.id,
  uid: user.uid,
  firstName: user.first_name,
  lastName: user.last_name,
  email: user.email,
  countryCode: user.country_code,
  signupProvider: user.signup_provider,
  googleLinked: Boolean(user.google_id),
  appleLinked: Boolean(user.apple_id),
  emailVerified: user.email_verified,
  phone: user.phone || null,
  phoneVerified: user.phone_verified,
  idVerified: user.id_verified,
  isMilitaryVeteran: user.is_military_veteran ?? null,
  militaryVeteranDeclined: Boolean(user.military_veteran_declined),
  avatarUrl: user.avatar_url || null,
  dateOfBirth: user.date_of_birth || null,
  streetAddress: user.street_address || null,
  aptSuite: user.apt_suite || null,
  city: user.city || null,
  state: user.state || null,
  zipCode: user.zip_code || null,
  timezone: user.timezone || null,
  marketingOptIn: user.marketing_opt_in,
  connectsBalance: user.connects_balance ?? 0,
  createdAt: user.created_at,
  accounts: accounts.map(toPublicAccount),
});

const toPublicMilitaryService = (row, { includePrivateFields = false } = {}) => {
  if (!row) return null;

  const service = {
    country: row.country,
    countryCode: row.country_code,
    branch: row.branch,
  };

  if (includePrivateFields) {
    return {
      ...service,
      firstName: row.service_first_name,
      lastName: row.service_last_name,
      activeDutyStartDate: row.active_duty_start_date,
      activeDutyEndDate: row.active_duty_end_date,
    };
  }

  return service;
};

// Public freelancer card fields for /freelancers/:uid (no email).
const toPublicFreelancer = (user, militaryService = null) => ({
  uid: user.uid,
  firstName: user.first_name,
  lastName: user.last_name,
  avatarUrl: user.avatar_url || null,
  city: user.city || null,
  countryCode: user.country_code,
  timezone: user.timezone || null,
  phoneVerified: user.phone_verified,
  idVerified: user.id_verified,
  isMilitaryVeteran: user.is_military_veteran ?? null,
  militaryVeteranDeclined: Boolean(user.military_veteran_declined),
  militaryService,
});

const issueToken = (user) =>
  `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: "3d",
  })}`;

module.exports = {
  toPublicMilitaryService,
  DASHBOARD_PATH,
  TALENT_ONBOARDING_STEPS,
  CLIENT_ONBOARDING_STEPS,
  CLIENT_BUSINESS_PLUS_TRIAL_PATH,
  firstOnboardingStep,
  accountStartsCompleted,
  resolveRedirect,
  pickActiveAccount,
  toPublicAccount,
  toPublicUser,
  toPublicFreelancer,
  issueToken,
};
