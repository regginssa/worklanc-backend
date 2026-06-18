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
  updateScalars,
  deleteById,
  toPublicJob,
};
