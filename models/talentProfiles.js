const pool = require("../config/db");
const { toCamelCase } = require("../utils/format");

// Scalar columns that can be patched, keyed by their camelCase input name.
const SCALAR_COLUMNS = {
  title: "title",
  overview: "overview",
  hourlyRate: "hourly_rate",
  experienceLevel: "experience_level",
  goal: "goal",
  workPreference: "work_preference",
  visibility: "visibility",
  projectPreference: "project_preference",
  photoUrl: "photo_url",
  importSource: "import_source",
};

const getByUid = async (uid) => {
  const result = await pool.query(
    `SELECT id FROM talent_profiles WHERE uid = $1`,
    [uid],
  );
  const row = result.rows[0];
  if (!row) return null;
  return getFull(row.id);
};

const getRawByAccount = async (accountId, kind = "individual") => {
  const result = await pool.query(
    `SELECT * FROM talent_profiles WHERE account_id = $1 AND kind = $2`,
    [accountId, kind],
  );
  return result.rows[0];
};

// Get the profile for an account, creating an empty one on first access.
const ensureForAccount = async (accountId, kind = "individual") => {
  const existing = await getRawByAccount(accountId, kind);
  if (existing) return existing;

  const result = await pool.query(
    `INSERT INTO talent_profiles (account_id, kind) VALUES ($1, $2) RETURNING *`,
    [accountId, kind],
  );
  return result.rows[0];
};

const resolveCategoryId = async (slug) => {
  if (!slug) return null;
  const result = await pool.query(
    `SELECT id FROM categories WHERE slug = $1`,
    [slug],
  );
  return result.rows[0]?.id ?? null;
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

  // categorySlug -> category_id
  if (patch.categorySlug !== undefined) {
    const categoryId = await resolveCategoryId(patch.categorySlug);
    sets.push(`category_id = $${i++}`);
    values.push(categoryId);
  }

  if (sets.length === 0) return;

  values.push(id);
  await pool.query(
    `UPDATE talent_profiles SET ${sets.join(", ")} WHERE id = $${i}`,
    values,
  );
};

// --- child collections (replace-all semantics) ---------------------------

const replaceSpecialties = async (profileId, slugs = []) => {
  await pool.query(
    `DELETE FROM talent_specialties WHERE talent_profile_id = $1`,
    [profileId],
  );

  for (const slug of slugs) {
    const categoryId = await resolveCategoryId(slug);
    if (!categoryId) continue;
    await pool.query(
      `INSERT INTO talent_specialties (talent_profile_id, category_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [profileId, categoryId],
    );
  }
};

const replaceSkills = async (profileId, skills = []) => {
  await pool.query(`DELETE FROM talent_skills WHERE talent_profile_id = $1`, [
    profileId,
  ]);

  let order = 0;
  for (const skill of skills) {
    const name = typeof skill === "string" ? skill : skill?.name;
    if (!name || !name.trim()) continue;
    const skillId = typeof skill === "object" ? skill.skillId ?? null : null;
    await pool.query(
      `INSERT INTO talent_skills (talent_profile_id, skill_id, name, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (talent_profile_id, name) DO NOTHING`,
      [profileId, skillId, name.trim(), order++],
    );
  }
};

const replaceEmployment = async (profileId, items = []) => {
  await pool.query(
    `DELETE FROM talent_employment WHERE talent_profile_id = $1`,
    [profileId],
  );

  let order = 0;
  for (const item of items) {
    await pool.query(
      `INSERT INTO talent_employment
        (talent_profile_id, title, company, city, country,
         started_at, end_at, is_current, description, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        profileId,
        item.title || "",
        item.company || "",
        item.city ?? null,
        item.country ?? null,
        item.startedAt ?? null,
        item.isCurrent ? null : item.endAt ?? null,
        Boolean(item.isCurrent),
        item.description ?? null,
        order++,
      ],
    );
  }
};

const replaceEducation = async (profileId, items = []) => {
  await pool.query(
    `DELETE FROM talent_education WHERE talent_profile_id = $1`,
    [profileId],
  );

  let order = 0;
  for (const item of items) {
    await pool.query(
      `INSERT INTO talent_education
        (talent_profile_id, school, degree, field_of_study,
         started_year, end_year, description, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        profileId,
        item.school || "",
        item.degree ?? null,
        item.fieldOfStudy ?? null,
        item.startedYear ?? null,
        item.endYear ?? null,
        item.description ?? null,
        order++,
      ],
    );
  }
};

const replaceLanguages = async (profileId, items = []) => {
  await pool.query(
    `DELETE FROM talent_languages WHERE talent_profile_id = $1`,
    [profileId],
  );

  let order = 0;
  for (const item of items) {
    if (!item?.name || !item?.level) continue;
    await pool.query(
      `INSERT INTO talent_languages (talent_profile_id, name, level, sort_order)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (talent_profile_id, name) DO NOTHING`,
      [profileId, item.name, item.level, order++],
    );
  }
};

// Assemble the full profile (scalars + children + category) as camelCase.
const getFull = async (profileId) => {
  const profileResult = await pool.query(
    `SELECT tp.*, c.name AS category_name, c.slug AS category_slug
     FROM talent_profiles tp
     LEFT JOIN categories c ON c.id = tp.category_id
     WHERE tp.id = $1`,
    [profileId],
  );
  const row = profileResult.rows[0];
  if (!row) return null;

  const [specialties, skills, employment, education, languages] =
    await Promise.all([
      pool.query(
        `SELECT c.name, c.slug
         FROM talent_specialties ts
         JOIN categories c ON c.id = ts.category_id
         WHERE ts.talent_profile_id = $1
         ORDER BY c.sort_order ASC`,
        [profileId],
      ),
      pool.query(
        `SELECT id, uid, skill_id, name, sort_order FROM talent_skills
         WHERE talent_profile_id = $1 ORDER BY sort_order ASC`,
        [profileId],
      ),
      pool.query(
        `SELECT uid, title, company, city, country, started_at, end_at,
                is_current, description
         FROM talent_employment
         WHERE talent_profile_id = $1 ORDER BY sort_order ASC`,
        [profileId],
      ),
      pool.query(
        `SELECT uid, school, degree, field_of_study, started_year, end_year, description
         FROM talent_education
         WHERE talent_profile_id = $1 ORDER BY sort_order ASC`,
        [profileId],
      ),
      pool.query(
        `SELECT uid, name, level FROM talent_languages
         WHERE talent_profile_id = $1 ORDER BY sort_order ASC`,
        [profileId],
      ),
    ]);

  const profile = {
    id: row.id,
    uid: row.uid,
    account_id: row.account_id,
    kind: row.kind,
    title: row.title,
    overview: row.overview,
    hourly_rate: row.hourly_rate === null ? null : Number(row.hourly_rate),
    experience_level: row.experience_level,
    goal: row.goal,
    work_preference: row.work_preference,
    category: row.category_slug
      ? { name: row.category_name, slug: row.category_slug }
      : null,
    visibility: row.visibility,
    project_preference: row.project_preference,
    photo_url: row.photo_url,
    import_source: row.import_source,
    onboarding_completed: row.onboarding_completed,
    created_at: row.created_at,
    specialties: specialties.rows,
    skills: skills.rows,
    employment: employment.rows,
    education: education.rows,
    languages: languages.rows,
  };

  return toCamelCase(profile);
};

module.exports = {
  getByUid,
  getRawByAccount,
  ensureForAccount,
  updateScalars,
  replaceSpecialties,
  replaceSkills,
  replaceEmployment,
  replaceEducation,
  replaceLanguages,
  getFull,
};
