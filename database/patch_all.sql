-- WorkLanc: single incremental patch for an EXISTING database
-- ---------------------------------------------------------------------------
-- Run this ONE file in pgAdmin when schema changes fail if applied separately.
-- Safe to re-run. Does NOT drop users, accounts, or talent_profiles.
--
-- Fresh empty database? Use instead:
--   1. users.sql
--   2. categories.sql
--   3. skills.sql
--   4. talent_profiles.sql
--
-- WARNING: Section 6 drops and recreates portfolio tables (data loss for
-- portfolios only). Testimonials and all other talent data are preserved.

BEGIN;

-- ===========================================================================
-- 1. Shared helpers
-- ===========================================================================
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

-- ===========================================================================
-- 2. users + accounts
-- ===========================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS uid TEXT;
UPDATE users SET uid = generate_public_uid() WHERE uid IS NULL;
ALTER TABLE users ALTER COLUMN uid SET DEFAULT generate_public_uid();
ALTER TABLE users ALTER COLUMN uid SET NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_military_veteran BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS military_veteran_declined BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_uid_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_uid_unique UNIQUE (uid);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_uid ON users (uid);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN users.military_veteran_declined IS
    'TRUE when the user chose not to disclose veteran status.';

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS uid TEXT;
UPDATE accounts SET uid = generate_public_uid() WHERE uid IS NULL;
ALTER TABLE accounts ALTER COLUMN uid SET DEFAULT generate_public_uid();
ALTER TABLE accounts ALTER COLUMN uid SET NOT NULL;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS membership_tier VARCHAR(10);
UPDATE accounts SET membership_tier = 'basic' WHERE membership_tier IS NULL;
ALTER TABLE accounts ALTER COLUMN membership_tier SET DEFAULT 'basic';
ALTER TABLE accounts ALTER COLUMN membership_tier SET NOT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS company_website TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS company_size VARCHAR(20);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_uid_unique'
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_uid_unique UNIQUE (uid);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_membership_tier_valid'
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_membership_tier_valid
            CHECK (membership_tier IN ('basic', 'plus'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_company_size_valid'
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_company_size_valid
            CHECK (
                company_size IS NULL OR
                company_size IN ('just_me', '2_9', '10_99', '100_499', '500_4999', '5000_plus')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_uid ON accounts (uid);

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN accounts.company_name IS
    'Client company name collected during client onboarding.';
COMMENT ON COLUMN accounts.company_website IS
    'Client company website URL collected during client onboarding.';
COMMENT ON COLUMN accounts.company_size IS
    'Client organization size: just_me | 2_9 | 10_99 | 100_499 | 500_4999 | 5000_plus.';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'talent_profiles'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'talent_profiles_account_id_fkey'
    ) THEN
        ALTER TABLE talent_profiles
            ADD CONSTRAINT talent_profiles_account_id_fkey
            FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE;
    END IF;
END $$;

-- ===========================================================================
-- 3. Military veteran service
-- ===========================================================================
CREATE TABLE IF NOT EXISTS user_military_service (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country                 VARCHAR(255) NOT NULL,
    country_code            VARCHAR(2) NOT NULL DEFAULT 'US',
    service_first_name      VARCHAR(255) NOT NULL,
    service_last_name       VARCHAR(255) NOT NULL,
    active_duty_start_date  DATE NOT NULL,
    active_duty_end_date    DATE NOT NULL,
    branch                  VARCHAR(64) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_military_service_user_unique UNIQUE (user_id),
    CONSTRAINT user_military_service_branch_valid
        CHECK (branch IN (
            'army_and_ground_forces',
            'navy_coast_guard_and_marine_forces',
            'air_force',
            'space_force'
        )),
    CONSTRAINT user_military_service_dates_valid
        CHECK (active_duty_end_date >= active_duty_start_date)
);

ALTER TABLE user_military_service
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

UPDATE user_military_service
SET country_code = 'US'
WHERE country_code IS NULL;

ALTER TABLE user_military_service
    ALTER COLUMN country_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_military_service_user_id
    ON user_military_service (user_id);

DROP TRIGGER IF EXISTS trg_user_military_service_updated_at ON user_military_service;
CREATE TRIGGER trg_user_military_service_updated_at
    BEFORE UPDATE ON user_military_service
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN user_military_service.country_code IS
    'ISO 3166-1 alpha-2 country code for the service country.';

-- ===========================================================================
-- 4. talent_profiles availability
-- ===========================================================================
ALTER TABLE talent_profiles
    ADD COLUMN IF NOT EXISTS hours_per_week VARCHAR(20);

ALTER TABLE talent_profiles
    ADD COLUMN IF NOT EXISTS open_to_contract_to_hire BOOLEAN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'talent_profiles_hours_per_week_valid'
    ) THEN
        ALTER TABLE talent_profiles
            ADD CONSTRAINT talent_profiles_hours_per_week_valid
            CHECK (hours_per_week IS NULL
                   OR hours_per_week IN ('more_than_30', 'less_than_30',
                                         'as_needed', 'none'));
    END IF;
END $$;

COMMENT ON COLUMN talent_profiles.hours_per_week IS
    'Availability: more_than_30 | less_than_30 | as_needed | none.';
COMMENT ON COLUMN talent_profiles.open_to_contract_to_hire IS
    'Whether the talent is open to contract-to-hire roles; NULL when unset.';

-- ===========================================================================
-- 5. Testimonial status values (preserves rows)
-- ===========================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'talent_testimonials'
    ) THEN
        UPDATE talent_testimonials
        SET status = 'confirmed'
        WHERE status IN ('submitted', 'verified');

        ALTER TABLE talent_testimonials
            DROP CONSTRAINT IF EXISTS talent_testimonials_status_valid;

        ALTER TABLE talent_testimonials
            ADD CONSTRAINT talent_testimonials_status_valid
            CHECK (status IN ('pending', 'confirmed', 'declined'));

        COMMENT ON COLUMN talent_testimonials.status IS
            'pending: awaiting client response; confirmed: client approved; declined: client declined.';
    END IF;
END $$;

-- ===========================================================================
-- 6. Portfolio tables — drop & recreate (portfolio data is wiped)
-- ===========================================================================
DROP TABLE IF EXISTS talent_portfolio_assets CASCADE;
DROP TABLE IF EXISTS talent_portfolio_deliverables CASCADE; -- legacy, removed
DROP TABLE IF EXISTS talent_portfolio_skills CASCADE;
DROP TABLE IF EXISTS talent_portfolios CASCADE;

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

DROP TRIGGER IF EXISTS trg_talent_portfolios_updated_at ON talent_portfolios;
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
    file_url            TEXT,
    file_name           VARCHAR(255),
    mime_type           VARCHAR(127),
    text_format         VARCHAR(10),
    text_heading        VARCHAR(255),
    text_content        TEXT,
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

DROP TRIGGER IF EXISTS trg_talent_portfolio_assets_updated_at ON talent_portfolio_assets;
CREATE TRIGGER trg_talent_portfolio_assets_updated_at
    BEFORE UPDATE ON talent_portfolio_assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE talent_portfolio_assets IS
    'Media/text/link assets attached to a portfolio project.';
COMMENT ON COLUMN talent_portfolio_assets.text_format IS
    'markdown: text_content is markdown; plain: text_heading + text_content (description).';

-- ---------------------------------------------------------------------------
-- 7. user_notification_settings (per login identity)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_notification_settings (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notification_settings_user_id
    ON user_notification_settings (user_id);

DROP TRIGGER IF EXISTS trg_user_notification_settings_updated_at
    ON user_notification_settings;
CREATE TRIGGER trg_user_notification_settings_updated_at
    BEFORE UPDATE ON user_notification_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE user_notification_settings IS
    'Notification preferences for a login identity (not per account).';

-- ---------------------------------------------------------------------------
-- 8. jobs (client job posts) — see jobs.sql for full standalone script
-- ---------------------------------------------------------------------------
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
        CHECK (status IN ('draft', 'pending', 'open', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_uid ON jobs (uid);
CREATE INDEX IF NOT EXISTS idx_jobs_account_id ON jobs (account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (account_id, status);

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. payment_methods (Stripe cards)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id
    ON users (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN users.stripe_customer_id IS
    'Stripe Customer id (cus_...) for saved payment methods and future charges.';

CREATE TABLE IF NOT EXISTS payment_methods (
    id                          BIGSERIAL PRIMARY KEY,
    uid                         TEXT NOT NULL DEFAULT generate_public_uid(),
    user_id                     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type                        VARCHAR(20) NOT NULL DEFAULT 'card',
    provider                    VARCHAR(20) NOT NULL DEFAULT 'stripe',
    stripe_payment_method_id    TEXT NOT NULL,
    card_brand                  VARCHAR(32),
    card_last4                  VARCHAR(4),
    card_exp_month              SMALLINT,
    card_exp_year               SMALLINT,
    billing_name                VARCHAR(255),
    is_default                  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payment_methods_uid_unique UNIQUE (uid),
    CONSTRAINT payment_methods_type_valid
        CHECK (type IN ('card', 'paypal', 'crypto')),
    CONSTRAINT payment_methods_provider_valid
        CHECK (provider IN ('stripe', 'paypal', 'crypto')),
    CONSTRAINT payment_methods_stripe_pm_unique
        UNIQUE (stripe_payment_method_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id
    ON payment_methods (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_default
    ON payment_methods (user_id, is_default)
    WHERE is_default = TRUE;

DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE payment_methods IS
    'Saved billing methods per login identity (user). Stripe cards today; PayPal/crypto later.';

-- ---------------------------------------------------------------------------
-- 10. payment_methods crypto columns + one method per type per user
-- ---------------------------------------------------------------------------
ALTER TABLE payment_methods
    ALTER COLUMN stripe_payment_method_id DROP NOT NULL;

ALTER TABLE payment_methods
    ADD COLUMN IF NOT EXISTS crypto_address TEXT;

ALTER TABLE payment_methods
    ADD COLUMN IF NOT EXISTS crypto_chain VARCHAR(20);

ALTER TABLE payment_methods
    ADD COLUMN IF NOT EXISTS crypto_token VARCHAR(20);

ALTER TABLE payment_methods
    ADD COLUMN IF NOT EXISTS crypto_label VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_user_card_unique
    ON payment_methods (user_id)
    WHERE type = 'card';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_user_crypto_chain_token_unique
    ON payment_methods (user_id, crypto_chain, crypto_token)
    WHERE type = 'crypto'
      AND crypto_chain IS NOT NULL
      AND crypto_token IS NOT NULL;

DROP INDEX IF EXISTS idx_payment_methods_user_crypto_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_crypto_address_chain
    ON payment_methods (crypto_address, crypto_chain)
    WHERE type = 'crypto' AND crypto_address IS NOT NULL;

COMMIT;
