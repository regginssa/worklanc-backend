const COMPANY_SIZE_LABELS = {
  just_me: "It's just me",
  "2_9": "Small company (2-9 people)",
  "10_99": "Mid-sized company (10-99 people)",
  "100_499": "Large company (100-499 people)",
  "500_4999": "Enterprise company (500-4,999 people)",
  "5000_plus": "Enterprise company (5,000+ people)",
};

const DURATION_LABELS = {
  "6+": "More than 6 months",
  "3-6": "3 to 6 months",
  "1-3": "1 to 3 months",
};

const EXPERIENCE_LABELS = {
  entry: "Entry level",
  intermediate: "Intermediate",
  expert: "Expert",
};

const HOURS_PER_WEEK_LABELS = {
  more_than_30_hrs_week: "More than 30 hrs/week",
  less_than_30_hrs_week: "Less than 30 hrs/week",
  not_sure: "I'm not sure",
};

const toPublicClient = (row) => {
  const jobsPosted = Number(row.jobs_posted ?? 0);
  const openJobs = Number(row.open_jobs ?? 0);
  const completedJobs = Number(row.completed_jobs ?? 0);
  const hireRate =
    jobsPosted > 0 ? Math.round((completedJobs / jobsPosted) * 100) : 0;

  const locationParts = [row.city, row.state, row.country_code].filter(Boolean);

  return {
    companyName: row.company_name || null,
    companySize: row.company_size || null,
    companySizeLabel: row.company_size
      ? COMPANY_SIZE_LABELS[row.company_size] || null
      : null,
    countryCode: row.country_code || null,
    city: row.city || null,
    state: row.state || null,
    timezone: row.timezone || null,
    locationLabel: locationParts.length > 0 ? locationParts.join(", ") : null,
    memberSince: row.user_created_at,
    paymentVerified: Boolean(row.phone_verified),
    jobsPosted,
    openJobs,
    completedJobs,
    hireRate,
    totalSpent: 0,
    hires: completedJobs,
    activeHires: 0,
    avgHourlyRatePaid: null,
    totalHours: 0,
    ratingAverage: null,
    reviewCount: 0,
  };
};

const toBrowseJobBase = (row) => ({
  uid: row.uid,
  title: row.title,
  description: row.description,
  categorySlug: row.category_slug,
  skills: row.skills ?? [],
  projectSize: row.project_size,
  duration: row.duration,
  durationLabel: row.duration ? DURATION_LABELS[row.duration] : null,
  experienceLevel: row.experience_level,
  experienceLabel: row.experience_level
    ? EXPERIENCE_LABELS[row.experience_level]
    : null,
  contractToHire: row.contract_to_hire,
  locationType: row.location_type,
  locationPreferences: row.location_preferences ?? [],
  budgetType: row.budget_type,
  budgetCurrency: row.budget_currency,
  budgetMin: row.budget_min != null ? Number(row.budget_min) : null,
  budgetMax: row.budget_max != null ? Number(row.budget_max) : null,
  budgetFixed: row.budget_fixed != null ? Number(row.budget_fixed) : null,
  hoursPerWeek: row.hours_per_week,
  hoursPerWeekLabel: row.hours_per_week
    ? HOURS_PER_WEEK_LABELS[row.hours_per_week]
    : null,
  englishLevel: row.english_level,
  screeningQuestions: row.screening_questions ?? [],
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  proposalCount: 0,
  interviewingCount: 0,
  invitesSent: 0,
  unansweredInvites: 0,
  requiredConnects: 20,
});

const toBrowseListItem = (row) => ({
  ...toBrowseJobBase(row),
  client: toPublicClient(row),
});

const toBrowseDetail = (row) => ({
  ...toBrowseJobBase(row),
  attachments: row.attachments ?? [],
  umaRecruiterEnabled: row.uma_recruiter_enabled,
  talentType: row.talent_type,
  hireDate: row.hire_date,
  professionalsNeeded: row.professionals_needed,
  client: toPublicClient(row),
  jobsInProgress: [],
  clientReviews: [],
});

module.exports = {
  toBrowseListItem,
  toBrowseDetail,
};
