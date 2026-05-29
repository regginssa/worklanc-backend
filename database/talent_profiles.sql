-- WorkLanc: talent profile tables (the freelancer-facing profile data)
-- Run order in pgAdmin:
--   1. users.sql        (users + accounts)
--   2. categories.sql   (categories)
--   3. skills.sql       (skills)
--   4. talent_profiles.sql   <-- this file
--
-- Why these live here and NOT on `users`
-- --------------------------------------
-- title / overview / hourly rate / experience / work history / education are
-- freelancer-PROFILE data, not login identity. A single user can hold a Talent
-- AND a Client account, and a Talent account can expose both an individual and
-- an agency profile. Identity columns on `users` can't represent that, so the
-- profile data hangs off `accounts` via `talent_profiles`.
--
-- `talent_profiles.kind` ('individual' | 'agency') lets one Talent account own
-- an individual profile and (later) an agency profile at the same time, with
-- UNIQUE(account_id, kind) capping it at one of each. Agency-specific fields
-- can be added to this table (or a child table) later without changing users.

BEGIN;

DROP TABLE IF EXISTS talent_languages CASCADE;
DROP TABLE IF EXISTS talent_education CASCADE;
DROP TABLE IF EXISTS talent_employment CASCADE;
DROP TABLE IF EXISTS talent_skills CASCADE;
DROP TABLE IF EXISTS talent_specialties CASCADE;
DROP TABLE IF EXISTS talent_profiles CASCADE;

-- ---------------------------------------------------------------------------
-- talent_profiles: one row per profile (individual / agency) of a talent account
-- ---------------------------------------------------------------------------
CREATE TABLE talent_profiles (
    id                  BIGSERIAL PRIMARY KEY,
    account_id          BIGINT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,

    kind                VARCHAR(10) NOT NULL DEFAULT 'individual',

    -- Professional role / headline ("title" step).
    title               VARCHAR(120),
    -- Bio shown on the profile ("overview" step).
    overview            TEXT,

    hourly_rate         NUMERIC(10, 2),

    -- "have you freelanced before?" step.
    experience_level    VARCHAR(20),
    -- "biggest goal for freelancing?" step.
    goal                VARCHAR(20),
    -- "how would you like to work?" step.
    work_preference     VARCHAR(20),

    -- Main category chosen in the "categories" step (specialties below).
    category_id         BIGINT REFERENCES categories (id) ON DELETE SET NULL,

    -- Profile settings (settings/profile page).
    visibility          VARCHAR(10) NOT NULL DEFAULT 'public',
    project_preference  VARCHAR(10),

    photo_url           TEXT,

    -- How the profile was first populated ("resume-import" step).
    import_source       VARCHAR(20),

    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_profiles_kind_valid
        CHECK (kind IN ('individual', 'agency')),
    CONSTRAINT talent_profiles_account_kind_unique UNIQUE (account_id, kind),
    CONSTRAINT talent_profiles_experience_valid
        CHECK (experience_level IS NULL
               OR experience_level IN ('beginner', 'junior', 'senior')),
    CONSTRAINT talent_profiles_goal_valid
        CHECK (goal IS NULL
               OR goal IN ('main_income', 'side_income',
                           'gain_experience', 'no_goal_yet')),
    CONSTRAINT talent_profiles_work_preference_valid
        CHECK (work_preference IS NULL
               OR work_preference IN ('find_jobs', 'sell_services')),
    CONSTRAINT talent_profiles_visibility_valid
        CHECK (visibility IN ('public', 'private')),
    CONSTRAINT talent_profiles_project_preference_valid
        CHECK (project_preference IS NULL
               OR project_preference IN ('both', 'long', 'short')),
    CONSTRAINT talent_profiles_import_source_valid
        CHECK (import_source IS NULL
               OR import_source IN ('resume', 'linkedin', 'manual')),
    CONSTRAINT talent_profiles_hourly_rate_positive
        CHECK (hourly_rate IS NULL OR hourly_rate >= 0)
);

CREATE INDEX idx_talent_profiles_account_id ON talent_profiles (account_id);
CREATE INDEX idx_talent_profiles_category_id ON talent_profiles (category_id);

CREATE TRIGGER trg_talent_profiles_updated_at
    BEFORE UPDATE ON talent_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_profiles IS 'Freelancer profile (individual/agency) for a talent account.';

-- ---------------------------------------------------------------------------
-- talent_specialties: the 1-3 subcategories chosen under the main category
-- ---------------------------------------------------------------------------
CREATE TABLE talent_specialties (
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,
    category_id         BIGINT NOT NULL REFERENCES categories (id) ON DELETE CASCADE,

    PRIMARY KEY (talent_profile_id, category_id)
);

CREATE INDEX idx_talent_specialties_category ON talent_specialties (category_id);

COMMENT ON TABLE talent_specialties IS '1-3 specialty subcategories per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_skills: up to 15 skills per profile (skill_id when matched to the
-- skills catalogue, name always stored for free-text / unmatched skills)
-- ---------------------------------------------------------------------------
CREATE TABLE talent_skills (
    id                  BIGSERIAL PRIMARY KEY,
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,
    skill_id            BIGINT REFERENCES skills (id) ON DELETE SET NULL,
    name                VARCHAR(255) NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT talent_skills_unique UNIQUE (talent_profile_id, name),
    CONSTRAINT talent_skills_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX idx_talent_skills_profile ON talent_skills (talent_profile_id);

COMMENT ON TABLE talent_skills IS 'Self-reported skills (max 15) per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_employment: work history
-- ---------------------------------------------------------------------------
CREATE TABLE talent_employment (
    id                  BIGSERIAL PRIMARY KEY,
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    title               VARCHAR(255) NOT NULL,
    company             VARCHAR(255) NOT NULL,
    city                VARCHAR(255),
    country             VARCHAR(255),
    started_at          DATE,
    end_at              DATE,
    is_current          BOOLEAN NOT NULL DEFAULT FALSE,
    description         TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_talent_employment_profile ON talent_employment (talent_profile_id);

CREATE TRIGGER trg_talent_employment_updated_at
    BEFORE UPDATE ON talent_employment
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_employment IS 'Work history entries per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_education
-- ---------------------------------------------------------------------------
CREATE TABLE talent_education (
    id                  BIGSERIAL PRIMARY KEY,
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    school              VARCHAR(255) NOT NULL,
    degree              VARCHAR(255),
    field_of_study      VARCHAR(255),
    started_year        INTEGER,
    end_year            INTEGER,
    description         TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_talent_education_profile ON talent_education (talent_profile_id);

CREATE TRIGGER trg_talent_education_updated_at
    BEFORE UPDATE ON talent_education
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_education IS 'Education history entries per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_languages (English is always present; others optional)
-- ---------------------------------------------------------------------------
CREATE TABLE talent_languages (
    id                  BIGSERIAL PRIMARY KEY,
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    name                VARCHAR(100) NOT NULL,
    level               VARCHAR(20) NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT talent_languages_unique UNIQUE (talent_profile_id, name),
    CONSTRAINT talent_languages_level_valid
        CHECK (level IN ('basic', 'conversational', 'fluent', 'native'))
);

CREATE INDEX idx_talent_languages_profile ON talent_languages (talent_profile_id);

COMMENT ON TABLE talent_languages IS 'Languages and proficiency per talent profile.';

COMMIT;
