-- WorkLanc: client job posts
-- Safe to re-run on an existing database (uses IF NOT EXISTS where possible).
-- Fresh database: run after users.sql (accounts must exist).

BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_public_uid()
RETURNS TEXT AS $$
BEGIN
    RETURN replace(gen_random_uuid()::text, '-', '');
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE TABLE IF NOT EXISTS jobs (
    id                      BIGSERIAL PRIMARY KEY,
    uid                     TEXT NOT NULL DEFAULT generate_public_uid(),
    account_id              BIGINT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,

    status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
    current_step            VARCHAR(80) NOT NULL DEFAULT '/nx/job-post/title',

    title                   VARCHAR(255),
    category_slug           VARCHAR(80) NOT NULL DEFAULT 'full-stack-development',

    skills                  JSONB NOT NULL DEFAULT '[]'::jsonb,

    project_size            VARCHAR(20),
    duration                VARCHAR(10),
    experience_level        VARCHAR(20),
    contract_to_hire        VARCHAR(5),

    location_type           VARCHAR(10) NOT NULL DEFAULT 'local',
    location_preferences    JSONB NOT NULL DEFAULT '[]'::jsonb,

    budget_type             VARCHAR(10) NOT NULL DEFAULT 'hourly',
    budget_currency         VARCHAR(3) NOT NULL DEFAULT 'USD',
    budget_min              NUMERIC(12, 2),
    budget_max              NUMERIC(12, 2),
    budget_fixed            NUMERIC(12, 2),

    description             TEXT,
    attachments             JSONB NOT NULL DEFAULT '[]'::jsonb,

    uma_recruiter_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    screening_questions     JSONB NOT NULL DEFAULT '[]'::jsonb,
    english_level           VARCHAR(40),
    hours_per_week          VARCHAR(30),
    talent_type             VARCHAR(20),
    hire_date               VARCHAR(20),
    professionals_needed    VARCHAR(20),

    published_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT jobs_uid_unique UNIQUE (uid),
    CONSTRAINT jobs_status_valid
        CHECK (status IN ('draft', 'pending', 'open', 'completed', 'cancelled')),
    CONSTRAINT jobs_project_size_valid
        CHECK (project_size IS NULL OR project_size IN ('large', 'medium', 'small')),
    CONSTRAINT jobs_duration_valid
        CHECK (duration IS NULL OR duration IN ('6+', '3-6', '1-3')),
    CONSTRAINT jobs_experience_level_valid
        CHECK (experience_level IS NULL OR experience_level IN ('entry', 'intermediate', 'expert')),
    CONSTRAINT jobs_contract_to_hire_valid
        CHECK (contract_to_hire IS NULL OR contract_to_hire IN ('yes', 'no')),
    CONSTRAINT jobs_location_type_valid
        CHECK (location_type IN ('local', 'global')),
    CONSTRAINT jobs_budget_type_valid
        CHECK (budget_type IN ('hourly', 'fixed')),
    CONSTRAINT jobs_english_level_valid
        CHECK (
            english_level IS NULL OR english_level IN (
                'any_level',
                'conversational_or_better',
                'fluent_or_better',
                'native_or_bilingual_only'
            )
        ),
    CONSTRAINT jobs_hours_per_week_valid
        CHECK (
            hours_per_week IS NULL OR hours_per_week IN (
                'more_than_30_hrs_week',
                'less_than_30_hrs_week',
                'not_sure'
            )
        ),
    CONSTRAINT jobs_talent_type_valid
        CHECK (
            talent_type IS NULL OR talent_type IN ('no_preference', 'independent', 'agency')
        ),
    CONSTRAINT jobs_hire_date_valid
        CHECK (
            hire_date IS NULL OR hire_date IN (
                'one_to_three_days',
                'one_week',
                'two_weeks',
                'one_month'
            )
        ),
    CONSTRAINT jobs_professionals_needed_valid
        CHECK (
            professionals_needed IS NULL OR professionals_needed IN ('one_person', 'more_than_one_person')
        )
);

CREATE INDEX IF NOT EXISTS idx_jobs_uid ON jobs (uid);
CREATE INDEX IF NOT EXISTS idx_jobs_account_id ON jobs (account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (account_id, status);

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE jobs IS 'Client job posts created through the job-post wizard.';
COMMENT ON COLUMN jobs.current_step IS 'Next wizard route to resume when status is draft.';
COMMENT ON COLUMN jobs.status IS 'draft | pending (awaiting phone verify) | open | completed | cancelled.';
COMMENT ON COLUMN jobs.skills IS 'Array of {label, value} skill objects.';
COMMENT ON COLUMN jobs.location_preferences IS 'Array of state names, timezones, regions, or country codes.';
COMMENT ON COLUMN jobs.attachments IS 'Array of {name, url, size, mimeType} attachment metadata.';
COMMENT ON COLUMN jobs.screening_questions IS 'Array of screening question strings (max 5).';

COMMIT;
