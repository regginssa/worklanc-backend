-- WorkLanc: talent profile tables (the freelancer-facing profile data)
-- Run order in pgAdmin (fresh install):
--   1. users.sql              (users + accounts + generate_public_uid())
--   2. categories.sql         (categories)
--   3. skills.sql             (skills)
--   4. talent_profiles.sql    <-- this file
--
-- Existing database with talent data?
--   Run patch_all.sql (single file) instead of re-running this script.
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

DROP TABLE IF EXISTS talent_testimonials CASCADE;
DROP TABLE IF EXISTS talent_portfolio_assets CASCADE;
DROP TABLE IF EXISTS talent_portfolio_skills CASCADE;
DROP TABLE IF EXISTS talent_portfolios CASCADE;
DROP TABLE IF EXISTS talent_licenses CASCADE;
DROP TABLE IF EXISTS talent_certifications CASCADE;
DROP TABLE IF EXISTS talent_other_experiences CASCADE;
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
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
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

    -- Sidebar profile sections.
    video_intro_url     TEXT,
    -- How many hours per week the talent can currently work.
    hours_per_week      VARCHAR(20),
    -- NULL = no preference set yet.
    open_to_contract_to_hire BOOLEAN,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_profiles_uid_unique UNIQUE (uid),
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
        CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
    CONSTRAINT talent_profiles_hours_per_week_valid
        CHECK (hours_per_week IS NULL
               OR hours_per_week IN ('more_than_30', 'less_than_30',
                                     'as_needed', 'none'))
);

CREATE INDEX idx_talent_profiles_uid ON talent_profiles (uid);
CREATE INDEX idx_talent_profiles_account_id ON talent_profiles (account_id);
CREATE INDEX idx_talent_profiles_category_id ON talent_profiles (category_id);

CREATE TRIGGER trg_talent_profiles_updated_at
    BEFORE UPDATE ON talent_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_profiles IS 'Freelancer profile (individual/agency) for a talent account.';
COMMENT ON COLUMN talent_profiles.uid IS 'Public profile ID for /freelancers/:uid URLs.';
COMMENT ON COLUMN talent_profiles.hours_per_week IS 'Availability: more_than_30 | less_than_30 | as_needed | none.';
COMMENT ON COLUMN talent_profiles.open_to_contract_to_hire IS 'Whether the talent is open to contract-to-hire roles; NULL when unset.';
COMMENT ON COLUMN talent_profiles.video_intro_url IS 'URL of the talent video introduction.';

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
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,
    skill_id            BIGINT REFERENCES skills (id) ON DELETE SET NULL,
    name                VARCHAR(255) NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT talent_skills_uid_unique UNIQUE (uid),
    CONSTRAINT talent_skills_unique UNIQUE (talent_profile_id, name),
    CONSTRAINT talent_skills_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX idx_talent_skills_uid ON talent_skills (uid);
CREATE INDEX idx_talent_skills_profile ON talent_skills (talent_profile_id);

COMMENT ON TABLE talent_skills IS 'Self-reported skills (max 15) per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_employment: work history
-- ---------------------------------------------------------------------------
CREATE TABLE talent_employment (
    id                  BIGSERIAL PRIMARY KEY,
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
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
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_employment_uid_unique UNIQUE (uid)
);

CREATE INDEX idx_talent_employment_uid ON talent_employment (uid);
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
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    school              VARCHAR(255) NOT NULL,
    degree              VARCHAR(255),
    field_of_study      VARCHAR(255),
    started_year        INTEGER,
    end_year            INTEGER,
    description         TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_education_uid_unique UNIQUE (uid)
);

CREATE INDEX idx_talent_education_uid ON talent_education (uid);
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
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    name                VARCHAR(100) NOT NULL,
    level               VARCHAR(20) NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT talent_languages_uid_unique UNIQUE (uid),
    CONSTRAINT talent_languages_unique UNIQUE (talent_profile_id, name),
    CONSTRAINT talent_languages_level_valid
        CHECK (level IN ('basic', 'conversational', 'fluent', 'native'))
);

CREATE INDEX idx_talent_languages_uid ON talent_languages (uid);
CREATE INDEX idx_talent_languages_profile ON talent_languages (talent_profile_id);

COMMENT ON TABLE talent_languages IS 'Languages and proficiency per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_certifications
-- ---------------------------------------------------------------------------
CREATE TABLE talent_certifications (
    id                  BIGSERIAL PRIMARY KEY,
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    name                VARCHAR(255) NOT NULL,
    provider            VARCHAR(255) NOT NULL,
    provider_logo_url   TEXT,
    issued_date         DATE NOT NULL,
    expiration_date     DATE,
    description         TEXT,
    credential_id       VARCHAR(255),
    credential_url      TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_certifications_uid_unique UNIQUE (uid),
    CONSTRAINT talent_certifications_name_not_empty
        CHECK (char_length(trim(name)) > 0),
    CONSTRAINT talent_certifications_provider_not_empty
        CHECK (char_length(trim(provider)) > 0)
);

CREATE INDEX idx_talent_certifications_uid ON talent_certifications (uid);
CREATE INDEX idx_talent_certifications_profile
    ON talent_certifications (talent_profile_id);

CREATE TRIGGER trg_talent_certifications_updated_at
    BEFORE UPDATE ON talent_certifications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_certifications IS 'Professional certifications per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_other_experiences: non-employment experience highlights
-- ---------------------------------------------------------------------------
CREATE TABLE talent_other_experiences (
    id                  BIGSERIAL PRIMARY KEY,
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    subject             VARCHAR(255) NOT NULL,
    description         TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_other_experiences_uid_unique UNIQUE (uid),
    CONSTRAINT talent_other_experiences_subject_not_empty
        CHECK (char_length(trim(subject)) > 0)
);

CREATE INDEX idx_talent_other_experiences_uid ON talent_other_experiences (uid);
CREATE INDEX idx_talent_other_experiences_profile
    ON talent_other_experiences (talent_profile_id);

CREATE TRIGGER trg_talent_other_experiences_updated_at
    BEFORE UPDATE ON talent_other_experiences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_other_experiences IS 'Other experience entries (subject + description) per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_licenses: professional licenses (e.g. CPA, bar admission)
-- ---------------------------------------------------------------------------
CREATE TABLE talent_licenses (
    id                  BIGSERIAL PRIMARY KEY,
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    profession          VARCHAR(255) NOT NULL,
    jurisdiction        VARCHAR(255) NOT NULL,
    license_number      VARCHAR(255) NOT NULL,
    verification_url    TEXT,
    issued_date         DATE NOT NULL,
    expiration_date     DATE,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_licenses_uid_unique UNIQUE (uid),
    CONSTRAINT talent_licenses_profession_not_empty
        CHECK (char_length(trim(profession)) > 0),
    CONSTRAINT talent_licenses_jurisdiction_not_empty
        CHECK (char_length(trim(jurisdiction)) > 0),
    CONSTRAINT talent_licenses_number_not_empty
        CHECK (char_length(trim(license_number)) > 0)
);

CREATE INDEX idx_talent_licenses_uid ON talent_licenses (uid);
CREATE INDEX idx_talent_licenses_profile ON talent_licenses (talent_profile_id);

CREATE TRIGGER trg_talent_licenses_updated_at
    BEFORE UPDATE ON talent_licenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_licenses IS 'Professional licenses per talent profile.';

-- ---------------------------------------------------------------------------
-- talent_portfolios + skills + assets
-- ---------------------------------------------------------------------------
CREATE TABLE talent_portfolios (
    id                  BIGSERIAL PRIMARY KEY,
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    title               VARCHAR(255) NOT NULL,
    role                VARCHAR(255),
    description         TEXT NOT NULL,
    status              VARCHAR(10) NOT NULL DEFAULT 'published',
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_portfolios_uid_unique UNIQUE (uid),
    CONSTRAINT talent_portfolios_title_not_empty
        CHECK (char_length(trim(title)) > 0),
    CONSTRAINT talent_portfolios_description_not_empty
        CHECK (char_length(trim(description)) > 0),
    CONSTRAINT talent_portfolios_status_valid
        CHECK (status IN ('published', 'draft'))
);

CREATE INDEX idx_talent_portfolios_uid ON talent_portfolios (uid);
CREATE INDEX idx_talent_portfolios_profile ON talent_portfolios (talent_profile_id);
CREATE INDEX idx_talent_portfolios_status ON talent_portfolios (talent_profile_id, status);

CREATE TRIGGER trg_talent_portfolios_updated_at
    BEFORE UPDATE ON talent_portfolios
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_portfolios IS 'Portfolio projects per talent profile.';

CREATE TABLE talent_portfolio_skills (
    id                  BIGSERIAL PRIMARY KEY,
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    portfolio_id        BIGINT NOT NULL REFERENCES talent_portfolios (id) ON DELETE CASCADE,
    skill_id            BIGINT REFERENCES skills (id) ON DELETE SET NULL,
    name                VARCHAR(255) NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT talent_portfolio_skills_uid_unique UNIQUE (uid),
    CONSTRAINT talent_portfolio_skills_unique UNIQUE (portfolio_id, name),
    CONSTRAINT talent_portfolio_skills_name_not_empty
        CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX idx_talent_portfolio_skills_uid ON talent_portfolio_skills (uid);
CREATE INDEX idx_talent_portfolio_skills_portfolio
    ON talent_portfolio_skills (portfolio_id);

COMMENT ON TABLE talent_portfolio_skills IS
    'Skills and deliverables tagged on a portfolio project.';

CREATE TABLE talent_portfolio_assets (
    id                  BIGSERIAL PRIMARY KEY,
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    portfolio_id        BIGINT NOT NULL REFERENCES talent_portfolios (id) ON DELETE CASCADE,

    asset_type          VARCHAR(10) NOT NULL,
    -- File-based assets (image, pdf, video, audio): stored URL + metadata.
    file_url            TEXT,
    file_name           VARCHAR(255),
    mime_type           VARCHAR(127),
    -- Text asset (when asset_type = text).
    -- text_format = markdown  -> text_content holds markdown body.
    -- text_format = plain     -> text_heading + text_content (description).
    text_format         VARCHAR(10),
    text_heading        VARCHAR(255),
    text_content        TEXT,
    -- External link asset (when asset_type = link).
    link_url            TEXT,
    link_title          VARCHAR(255),
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_portfolio_assets_uid_unique UNIQUE (uid),
    CONSTRAINT talent_portfolio_assets_type_valid
        CHECK (asset_type IN ('image', 'pdf', 'video', 'text', 'link', 'audio')),
    CONSTRAINT talent_portfolio_assets_text_format_valid
        CHECK (text_format IS NULL OR text_format IN ('markdown', 'plain')),
    CONSTRAINT talent_portfolio_assets_payload_valid
        CHECK (
            (asset_type IN ('image', 'pdf', 'video', 'audio')
             AND file_url IS NOT NULL)
            OR (asset_type = 'link' AND link_url IS NOT NULL)
            OR (
                asset_type = 'text'
                AND text_format = 'markdown'
                AND text_content IS NOT NULL
                AND char_length(trim(text_content)) > 0
            )
            OR (
                asset_type = 'text'
                AND text_format = 'plain'
                AND text_heading IS NOT NULL
                AND char_length(trim(text_heading)) > 0
                AND text_content IS NOT NULL
                AND char_length(trim(text_content)) > 0
            )
        )
);

CREATE INDEX idx_talent_portfolio_assets_uid ON talent_portfolio_assets (uid);
CREATE INDEX idx_talent_portfolio_assets_portfolio
    ON talent_portfolio_assets (portfolio_id);

CREATE TRIGGER trg_talent_portfolio_assets_updated_at
    BEFORE UPDATE ON talent_portfolio_assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_portfolio_assets IS 'Media/text/link assets attached to a portfolio project.';

-- ---------------------------------------------------------------------------
-- talent_testimonials: client testimonial requests + verified responses
-- ---------------------------------------------------------------------------
CREATE TABLE talent_testimonials (
    id                  BIGSERIAL PRIMARY KEY,
    uid                 TEXT NOT NULL DEFAULT generate_public_uid(),
    talent_profile_id   BIGINT NOT NULL REFERENCES talent_profiles (id) ON DELETE CASCADE,

    client_first_name   VARCHAR(255) NOT NULL,
    client_last_name    VARCHAR(255) NOT NULL,
    client_email        VARCHAR(255) NOT NULL,
    client_linkedin_url TEXT,
    client_title        VARCHAR(255),
    project_type        VARCHAR(255),
    -- Message the talent sends when requesting the testimonial.
    request_message     TEXT,
    -- Filled in once the client submits; shown after WorkLanc verification.
    testimonial_text    TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    sort_order          INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT talent_testimonials_uid_unique UNIQUE (uid),
    CONSTRAINT talent_testimonials_client_first_name_not_empty
        CHECK (char_length(trim(client_first_name)) > 0),
    CONSTRAINT talent_testimonials_client_last_name_not_empty
        CHECK (char_length(trim(client_last_name)) > 0),
    CONSTRAINT talent_testimonials_client_email_not_empty
        CHECK (char_length(trim(client_email)) > 0),
    CONSTRAINT talent_testimonials_status_valid
        CHECK (status IN ('pending', 'confirmed', 'declined'))
);

CREATE INDEX idx_talent_testimonials_uid ON talent_testimonials (uid);
CREATE INDEX idx_talent_testimonials_profile ON talent_testimonials (talent_profile_id);
CREATE INDEX idx_talent_testimonials_status ON talent_testimonials (talent_profile_id, status);

CREATE TRIGGER trg_talent_testimonials_updated_at
    BEFORE UPDATE ON talent_testimonials
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_testimonials IS 'Client testimonial requests and verified testimonials per talent profile.';

COMMIT;
