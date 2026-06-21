const pool = require("../config/db");
const { toCamelCase } = require("../utils/format");

const SCALAR_COLUMNS = {
  title: "title",
  categorySlug: "category_slug",
  projectSize: "project_size",
  duration: "duration",
  experienceLevel: "experience_level",
  contractToHire: "contract_to_hire",
  locationType: "location_type",
  budgetType: "budget_type",
  budgetCurrency: "budget_currency",
  budgetMin: "budget_min",
  budgetMax: "budget_max",
  budgetFixed: "budget_fixed",
  description: "description",
  umaRecruiterEnabled: "uma_recruiter_enabled",
  englishLevel: "english_level",
  hoursPerWeek: "hours_per_week",
  talentType: "talent_type",
  hireDate: "hire_date",
  professionalsNeeded: "professionals_needed",
  status: "status",
  currentStep: "current_step",
  publishedAt: "published_at",
};

const toPublicJob = (row) => {
  if (!row) return null;
  const job = toCamelCase(row);
  job.skills = row.skills ?? [];
  job.locationPreferences = row.location_preferences ?? [];
  job.attachments = row.attachments ?? [];
  job.screeningQuestions = row.screening_questions ?? [];
  return job;
};

const create = async (accountId) => {
  const result = await pool.query(
    `INSERT INTO jobs (account_id) VALUES ($1) RETURNING *`,
    [accountId],
  );
  return result.rows[0];
};

const getByUid = async (uid) => {
  const result = await pool.query(`SELECT * FROM jobs WHERE uid = $1`, [uid]);
  return result.rows[0];
};

const getByAccountId = async (accountId) => {
  const result = await pool.query(
    `SELECT * FROM jobs
     WHERE account_id = $1
     ORDER BY updated_at DESC`,
    [accountId],
  );
  return result.rows;
};

const BROWSE_CLIENT_STATS_SQL = `
  SELECT
    a.id AS account_id,
    a.company_name,
    a.company_size,
    u.country_code,
    u.city,
    u.state,
    u.timezone,
    u.phone_verified,
    u.created_at AS user_created_at,
    COUNT(j2.*)::int AS jobs_posted,
    COUNT(j2.*) FILTER (WHERE j2.status = 'open')::int AS open_jobs,
    COUNT(j2.*) FILTER (WHERE j2.status = 'completed')::int AS completed_jobs
  FROM accounts a
  JOIN users u ON u.id = a.user_id
  LEFT JOIN jobs j2 ON j2.account_id = a.id
  WHERE a.id = j.account_id
  GROUP BY a.id, u.id
`;

const listOpenForBrowse = async () => {
  const result = await pool.query(
    `SELECT
      j.*,
      stats.company_name,
      stats.company_size,
      stats.country_code,
      stats.city,
      stats.state,
      stats.timezone,
      stats.phone_verified,
      stats.user_created_at,
      stats.jobs_posted,
      stats.open_jobs,
      stats.completed_jobs
    FROM jobs j
    JOIN LATERAL (${BROWSE_CLIENT_STATS_SQL}) stats ON true
    WHERE j.status = 'open'
      AND j.title IS NOT NULL
      AND char_length(trim(j.title)) > 0
    ORDER BY j.published_at DESC NULLS LAST, j.created_at DESC`,
  );
  return result.rows;
};

const getOpenForBrowseByUid = async (uid) => {
  const result = await pool.query(
    `SELECT
      j.*,
      stats.company_name,
      stats.company_size,
      stats.country_code,
      stats.city,
      stats.state,
      stats.timezone,
      stats.phone_verified,
      stats.user_created_at,
      stats.jobs_posted,
      stats.open_jobs,
      stats.completed_jobs
    FROM jobs j
    JOIN LATERAL (${BROWSE_CLIENT_STATS_SQL}) stats ON true
    WHERE j.uid = $1 AND j.status = 'open'`,
    [uid],
  );
  return result.rows[0];
};

const updateScalars = async (id, patch) => {
  const sets = [];
  const values = [];
  let i = 1;

  for (const [key, column] of Object.entries(SCALAR_COLUMNS)) {
    if (patch[key] === undefined) continue;
    sets.push(`${column} = $${i++}`);
    values.push(patch[key]);
  }

  const jsonColumns = {
    skills: "skills",
    locationPreferences: "location_preferences",
    attachments: "attachments",
    screeningQuestions: "screening_questions",
  };

  for (const [key, column] of Object.entries(jsonColumns)) {
    if (patch[key] === undefined) continue;
    sets.push(`${column} = $${i++}::jsonb`);
    values.push(JSON.stringify(patch[key]));
  }

  if (sets.length === 0) return getById(id);

  values.push(id);
  const result = await pool.query(
    `UPDATE jobs SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values,
  );
  return result.rows[0];
};

const getById = async (id) => {
  const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
  return result.rows[0];
};

const deleteById = async (id) => {
  await pool.query(`DELETE FROM jobs WHERE id = $1`, [id]);
  return true;
};

module.exports = {
  create,
  getByUid,
  getById,
  getByAccountId,
  listOpenForBrowse,
  getOpenForBrowseByUid,
  updateScalars,
  deleteById,
  toPublicJob,
};
