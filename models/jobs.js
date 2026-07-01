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

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const splitWords = (value) =>
  String(value || "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

const listOpenForBrowse = async (userId = null, filters = {}) => {
  const where = [
    `j.status = 'open'`,
    `j.title IS NOT NULL`,
    `char_length(trim(j.title)) > 0`,
  ];
  const values = [userId];
  let index = 2;

  if (filters.keyword) {
    where.push(`(
      j.title ILIKE $${index}
      OR COALESCE(j.description, '') ILIKE $${index}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(j.skills, '[]'::jsonb)) AS skill
        WHERE COALESCE(skill->>'label', '') ILIKE $${index}
          OR COALESCE(skill->>'value', '') ILIKE $${index}
      )
    )`);
    values.push(`%${filters.keyword}%`);
    index += 1;
  }

  const allWords = splitWords(filters.allOfTheseWords);
  allWords.forEach((word) => {
    where.push(`(
      j.title ILIKE $${index}
      OR COALESCE(j.description, '') ILIKE $${index}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(j.skills, '[]'::jsonb)) AS skill
        WHERE COALESCE(skill->>'label', '') ILIKE $${index}
          OR COALESCE(skill->>'value', '') ILIKE $${index}
      )
    )`);
    values.push(`%${word}%`);
    index += 1;
  });

  const anyWords = splitWords(filters.anyOfTheseWords);
  if (anyWords.length > 0) {
    const placeholders = anyWords.map(() => `$${index++}`);
    where.push(`(
      EXISTS (
        SELECT 1
        FROM unnest(ARRAY[${placeholders.join(", ")}]::text[]) AS needle
        WHERE j.title ILIKE needle
          OR COALESCE(j.description, '') ILIKE needle
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(j.skills, '[]'::jsonb)) AS skill
            WHERE COALESCE(skill->>'label', '') ILIKE needle
              OR COALESCE(skill->>'value', '') ILIKE needle
          )
      )
    )`);
    values.push(...anyWords.map((word) => `%${word}%`));
  }

  const noneWords = splitWords(filters.noneOfTheseWords);
  noneWords.forEach((word) => {
    where.push(`NOT (
      j.title ILIKE $${index}
      OR COALESCE(j.description, '') ILIKE $${index}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(j.skills, '[]'::jsonb)) AS skill
        WHERE COALESCE(skill->>'label', '') ILIKE $${index}
          OR COALESCE(skill->>'value', '') ILIKE $${index}
      )
    )`);
    values.push(`%${word}%`);
    index += 1;
  });

  if (filters.exactPhrase) {
    where.push(`(
      j.title ILIKE $${index}
      OR COALESCE(j.description, '') ILIKE $${index}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(j.skills, '[]'::jsonb)) AS skill
        WHERE COALESCE(skill->>'label', '') ILIKE $${index}
          OR COALESCE(skill->>'value', '') ILIKE $${index}
      )
    )`);
    values.push(`%${filters.exactPhrase.trim()}%`);
    index += 1;
  }

  if (filters.titleSearch) {
    where.push(`j.title ILIKE $${index}`);
    values.push(`%${filters.titleSearch.trim()}%`);
    index += 1;
  }

  if (filters.skillsSearch) {
    where.push(`EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(j.skills, '[]'::jsonb)) AS skill
      WHERE COALESCE(skill->>'label', '') ILIKE $${index}
        OR COALESCE(skill->>'value', '') ILIKE $${index}
    )`);
    values.push(`%${filters.skillsSearch.trim()}%`);
    index += 1;
  }

  if (filters.categorySlugs?.length) {
    where.push(`j.category_slug = ANY($${index}::text[])`);
    values.push(filters.categorySlugs);
    index += 1;
  }

  if (filters.experienceLevels?.length) {
    where.push(`j.experience_level = ANY($${index}::text[])`);
    values.push(filters.experienceLevels);
    index += 1;
  }

  if (filters.budgetTypes?.length) {
    where.push(`j.budget_type = ANY($${index}::text[])`);
    values.push(filters.budgetTypes);
    index += 1;
  }

  if (filters.duration?.length) {
    where.push(`j.duration = ANY($${index}::text[])`);
    values.push(filters.duration);
    index += 1;
  }

  if (filters.hoursPerWeek?.length) {
    where.push(`j.hours_per_week = ANY($${index}::text[])`);
    values.push(filters.hoursPerWeek);
    index += 1;
  }

  if (filters.contractToHire?.length) {
    where.push(`j.contract_to_hire = ANY($${index}::text[])`);
    values.push(filters.contractToHire);
    index += 1;
  }

  if (filters.locations?.length) {
    where.push(`(
      j.location_type = ANY($${index}::text[])
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(j.location_preferences, '[]'::jsonb)) AS pref
        WHERE pref = ANY($${index}::text[])
      )
    )`);
    values.push(filters.locations);
    index += 1;
  }

  const minHourlyRate = parseNumber(filters.minHourlyRate);
  if (minHourlyRate !== null) {
    where.push(`(
      j.budget_type <> 'hourly'
      OR j.budget_max IS NULL
      OR j.budget_max >= $${index}
    )`);
    values.push(minHourlyRate);
    index += 1;
  }

  const maxHourlyRate = parseNumber(filters.maxHourlyRate);
  if (maxHourlyRate !== null) {
    where.push(`(
      j.budget_type <> 'hourly'
      OR j.budget_min IS NULL
      OR j.budget_min <= $${index}
    )`);
    values.push(maxHourlyRate);
    index += 1;
  }

  const minFixedPrice = parseNumber(filters.minFixedPrice);
  if (minFixedPrice !== null) {
    where.push(`(
      j.budget_type <> 'fixed'
      OR j.budget_fixed IS NULL
      OR j.budget_fixed >= $${index}
    )`);
    values.push(minFixedPrice);
    index += 1;
  }

  const maxFixedPrice = parseNumber(filters.maxFixedPrice);
  if (maxFixedPrice !== null) {
    where.push(`(
      j.budget_type <> 'fixed'
      OR j.budget_fixed IS NULL
      OR j.budget_fixed <= $${index}
    )`);
    values.push(maxFixedPrice);
    index += 1;
  }

  const orderByMap = {
    best_matches: "j.published_at DESC NULLS LAST, j.created_at DESC",
    most_recent: "j.published_at DESC NULLS LAST, j.created_at DESC",
    client_spend: "stats.completed_jobs DESC, j.published_at DESC NULLS LAST",
    client_rating: "stats.completed_jobs DESC, stats.jobs_posted DESC, j.published_at DESC NULLS LAST",
  };
  const orderBy = orderByMap[filters.sortBy] || orderByMap.best_matches;

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
      stats.completed_jobs,
      (jr.id IS NOT NULL) AS is_read
    FROM jobs j
    JOIN LATERAL (${BROWSE_CLIENT_STATS_SQL}) stats ON true
    LEFT JOIN job_reads jr
      ON jr.job_id = j.id AND jr.user_id = $1
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}`,
    values,
  );
  return result.rows;
};

const getOpenForBrowseByUid = async (uid, userId = null) => {
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
      stats.completed_jobs,
      (jr.id IS NOT NULL) AS is_read
    FROM jobs j
    JOIN LATERAL (${BROWSE_CLIENT_STATS_SQL}) stats ON true
    LEFT JOIN job_reads jr
      ON jr.job_id = j.id AND jr.user_id = $2
    WHERE j.uid = $1 AND j.status = 'open'`,
    [uid, userId],
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
