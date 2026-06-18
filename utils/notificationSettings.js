const NOTIFICATION_LEVELS = new Set(["all", "important", "nothing"]);
const MESSAGE_COUNTER_LEVELS = new Set(["all", "important"]);
const EMAIL_INTERVALS = new Set([
  "immediate",
  "15_minutes",
  "1_hour",
  "1_day",
]);
const RECRUITING_EMAIL_SCOPES = new Set([
  "only_jobs_i_posted",
  "jobs_my_team_and_i_posted",
]);
const CONTRACT_EMAIL_SCOPES = new Set([
  "only_freelancers_i_have_hired",
  "freelancers_my_team_and_i_have_hire",
]);

const RECRUITING_OPTIONS = [
  "proposal_received",
  "interview_accepted_or_offer_terms_modified",
  "interview_or_offer_declined_or_withdrawn",
  "offer_accepted",
  "job_posting_will_expire_soon",
  "no_interviews_have_been_initiated",
];

const FREELANCER_AND_AGENCY_PROPOSALS_OPTIONS = [
  "an_interview_is_initiated",
  "an_offer_or_interview_invitation_is_received",
  "a_proposal_is_rejected",
  "a_job_i_applied_to_has_been_cancelled_or_closed",
  "a_proposal_is_withdrawn",
];

const CONTRACTS_OPTIONS = [
  "a_hire_is_made_or_a_contract_begins",
  "time_logging_begins",
  "contract_terms_are_modified",
  "a_contract_ends",
  "a_timelog_is_ready_for_review",
  "feedback_changes_are_made",
  "daily_snapshot_of_time_recorded_by_your_freelancers",
  "weekly_billing_digest",
  "other_contract_related_messages",
];

const GROUPS_AND_INVITATIONS_OPTIONS = [
  "group_membership_events_occur",
  "someone_forwards_me_a_freelancers_profile",
  "someone_sends_me_an_invitation",
  "team_access_is_revoked",
];

const MEMBERSHIP_OPTIONS = ["subscription_related_event_occur"];

const MISCELLANEOUS_OPTIONS = [
  "worklanc_has_a_tip_to_help_me_start",
  "notify_me_of_worklanc_events_happening_in_my_local_area",
  "i_have_purchased_or_received_connects",
];

const PROJECT_RECOMMENDATIONS_OPTIONS = [
  "send_recommendations_if_i_qualify_as_top_worklanc_talent",
];

const COMMUNICATIONS_FROM_WORKLANC_OPTIONS = [
  "send_me_genuinely_useful_emails_every_now_and_then_to_help_me_get_the_most_out_of_worklanc",
];

const CHECKBOX_FIELD_OPTIONS = {
  recruiting: RECRUITING_OPTIONS,
  freelancerAndAgencyProposals: FREELANCER_AND_AGENCY_PROPOSALS_OPTIONS,
  contracts: CONTRACTS_OPTIONS,
  groupsAndInvitations: GROUPS_AND_INVITATIONS_OPTIONS,
  membership: MEMBERSHIP_OPTIONS,
  miscellaneous: MISCELLANEOUS_OPTIONS,
  projectRecommendationsForTopTalent: PROJECT_RECOMMENDATIONS_OPTIONS,
  communicationsFromWorklanc: COMMUNICATIONS_FROM_WORKLANC_OPTIONS,
};

const defaultNotificationSettings = () => ({
  desktopShowNotifications: "all",
  desktopPlaySound: false,
  desktopMessageCounter: "all",
  mobileShowNotifications: "all",
  mobileMessageCounter: "all",
  emailUnreadActivity: "all",
  emailUnreadActivityInterval: "immediate",
  emailOnlyWhenOfflineOrIdle: false,
  recruitingEmailScope: "only_jobs_i_posted",
  recruiting: [...RECRUITING_OPTIONS],
  freelancerAndAgencyProposals: [...FREELANCER_AND_AGENCY_PROPOSALS_OPTIONS],
  contractsEmailScope: "only_freelancers_i_have_hired",
  contracts: [...CONTRACTS_OPTIONS],
  groupsAndInvitations: [...GROUPS_AND_INVITATIONS_OPTIONS],
  membership: [...MEMBERSHIP_OPTIONS],
  miscellaneous: [...MISCELLANEOUS_OPTIONS],
  projectRecommendationsForTopTalent: [...PROJECT_RECOMMENDATIONS_OPTIONS],
  communicationsFromWorklanc: [...COMMUNICATIONS_FROM_WORKLANC_OPTIONS],
});

const isStringArray = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const validateCheckboxArray = (field, value) => {
  const allowed = CHECKBOX_FIELD_OPTIONS[field];
  if (!allowed) return false;
  if (!isStringArray(value)) return false;
  return value.every((item) => allowed.includes(item));
};

const validatePatch = (patch) => {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Invalid notification settings payload");
  }

  const keys = Object.keys(patch);
  if (keys.length === 0) {
    throw new Error("No notification settings provided");
  }

  for (const key of keys) {
    const value = patch[key];

    if (key === "desktopShowNotifications" || key === "mobileShowNotifications") {
      if (!NOTIFICATION_LEVELS.has(value)) {
        throw new Error(`Invalid value for ${key}`);
      }
      continue;
    }

    if (key === "desktopMessageCounter" || key === "mobileMessageCounter") {
      if (!MESSAGE_COUNTER_LEVELS.has(value)) {
        throw new Error(`Invalid value for ${key}`);
      }
      continue;
    }

    if (key === "emailUnreadActivity") {
      if (!NOTIFICATION_LEVELS.has(value)) {
        throw new Error(`Invalid value for ${key}`);
      }
      continue;
    }

    if (key === "emailUnreadActivityInterval") {
      if (!EMAIL_INTERVALS.has(value)) {
        throw new Error(`Invalid value for ${key}`);
      }
      continue;
    }

    if (
      key === "desktopPlaySound" ||
      key === "emailOnlyWhenOfflineOrIdle"
    ) {
      if (typeof value !== "boolean") {
        throw new Error(`Invalid value for ${key}`);
      }
      continue;
    }

    if (key === "recruitingEmailScope") {
      if (!RECRUITING_EMAIL_SCOPES.has(value)) {
        throw new Error(`Invalid value for ${key}`);
      }
      continue;
    }

    if (key === "contractsEmailScope") {
      if (!CONTRACT_EMAIL_SCOPES.has(value)) {
        throw new Error(`Invalid value for ${key}`);
      }
      continue;
    }

    if (CHECKBOX_FIELD_OPTIONS[key]) {
      if (!validateCheckboxArray(key, value)) {
        throw new Error(`Invalid value for ${key}`);
      }
      continue;
    }

    throw new Error(`Unknown notification setting: ${key}`);
  }
};

const mergeNotificationSettings = (stored = {}) => ({
  ...defaultNotificationSettings(),
  ...(stored && typeof stored === "object" ? stored : {}),
});

module.exports = {
  defaultNotificationSettings,
  mergeNotificationSettings,
  validatePatch,
};
