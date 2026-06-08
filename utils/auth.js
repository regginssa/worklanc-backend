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

// Where a freshly created account should begin onboarding.
// Client onboarding has no flow yet, so client accounts go straight through.
const firstOnboardingStep = (type) =>
  type === "talent" ? TALENT_ONBOARDING_STEPS[0] : null;

const accountStartsCompleted = (type) => type !== "talent";

// Resolve where to redirect a user for a given account.
const resolveRedirect = (account) => {
  if (!account) return DASHBOARD_PATH;
  if (account.onboarding_completed) return DASHBOARD_PATH;
  if (account.type === "talent") {
    return account.onboarding_step || TALENT_ONBOARDING_STEPS[0];
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
  return accounts.find((a) => !a.onboarding_completed) || accounts[0] || null;
};

const toPublicAccount = (account) => ({
  id: account.id,
  uid: account.uid,
  type: account.type,
  membershipTier: account.membership_tier ?? "basic",
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
  avatarUrl: user.avatar_url || null,
  dateOfBirth: user.date_of_birth || null,
  streetAddress: user.street_address || null,
  aptSuite: user.apt_suite || null,
  city: user.city || null,
  state: user.state || null,
  zipCode: user.zip_code || null,
  timezone: user.timezone || null,
  marketingOptIn: user.marketing_opt_in,
  createdAt: user.created_at,
  accounts: accounts.map(toPublicAccount),
});

// Public freelancer card fields for /freelancers/:uid (no email).
const toPublicFreelancer = (user) => ({
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
});

const issueToken = (user) =>
  `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: "3d",
  })}`;

module.exports = {
  DASHBOARD_PATH,
  TALENT_ONBOARDING_STEPS,
  firstOnboardingStep,
  accountStartsCompleted,
  resolveRedirect,
  pickActiveAccount,
  toPublicAccount,
  toPublicUser,
  toPublicFreelancer,
  issueToken,
};
