-- WorkLanc: users (login identity) + accounts (talent/client) tables
-- Run this file in pgAdmin. Independent of categories.sql / skills.sql.
--
-- ⚠️  WHEN TO USE WHICH SCRIPT
-- ----------------------------
-- users.sql (this file)
--   Fresh / empty database ONLY. Drops and recreates users + accounts.
--   If talent_profiles already exists, DROP accounts CASCADE removes its FK
--   (you will see a NOTICE) — re-run talent_profiles.sql afterwards, or use
--   patch_users_accounts.sql instead to keep talent_* data.
--
-- patch_users_accounts.sql
--   Safe upgrade on an existing database. Adds columns (uid, membership_tier,
--   etc.) without dropping any table. Use this when talent_* tables must stay.
--
-- Design notes
-- ------------
-- A single login identity lives in `users`. Authentication data only
-- (email/password + linked social providers + verification state).
--
-- A person can operate WorkLanc through more than one "account". Just like
-- Upwork, the same login can hold BOTH a Talent account and a Client account.
-- That is why account-type does NOT live on `users`; it lives in `accounts`,
-- with a UNIQUE(user_id, type) constraint so a user has at most one Talent and
-- one Client account.
--
-- Onboarding is tracked per account, so the Talent flow and (future) Client
-- flow can be resumed independently. `onboarding_step` stores the next route a
-- user should land on; it is the single source of truth used by the OAuth /
-- sign-in flow to decide where to redirect.
--
-- A Talent account can later expose multiple talent "profiles" (an individual
-- profile and/or an agency profile). Those will be modelled in a future
-- `talent_profiles` table keyed by account_id with a `kind` of
-- 'individual' | 'agency'. The account/identity split above is what makes that
-- possible without touching `users`.

BEGIN;

DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Keep updated_at fresh on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Opaque public identifier for URLs and external APIs (32-char hex).
-- Internal BIGINT `id` columns stay for joins; never expose them in URLs.
CREATE OR REPLACE FUNCTION generate_public_uid()
RETURNS TEXT AS $$
BEGIN
    RETURN replace(gen_random_uuid()::text, '-', '');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ---------------------------------------------------------------------------
-- users: login identity + auth
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id                BIGSERIAL PRIMARY KEY,
    uid               TEXT NOT NULL DEFAULT generate_public_uid(),

    first_name        VARCHAR(255) NOT NULL,
    last_name         VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,

    -- NULL when the account was created purely via a social provider and the
    -- user has never set a WorkLanc password.
    password_hash     TEXT,

    country_code      VARCHAR(2) NOT NULL DEFAULT 'US',

    -- How the user originally signed up. Linked providers below can grow over
    -- time (e.g. an email user later connects Google).
    signup_provider   VARCHAR(20) NOT NULL DEFAULT 'email',

    google_id         VARCHAR(255),
    apple_id          VARCHAR(255),

    email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    phone             VARCHAR(32),
    phone_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    id_verified       BOOLEAN NOT NULL DEFAULT FALSE,
    -- NULL = not declared; TRUE/FALSE once the user opts in or out.
    is_military_veteran BOOLEAN,
    -- TRUE when the user chose not to disclose veteran status.
    military_veteran_declined BOOLEAN NOT NULL DEFAULT FALSE,

    -- Identity-level personal / contact details (shared across all of the
    -- user's accounts; collected in the onboarding "location" step and used
    -- for verification + payments).
    date_of_birth     DATE,
    street_address    VARCHAR(255),
    apt_suite         VARCHAR(255),
    city              VARCHAR(255),
    state             VARCHAR(255),
    zip_code          VARCHAR(32),
    timezone          VARCHAR(64),

    -- Encrypted S3 media token (see upload/asset API). Identity-level avatar.
    avatar_url        TEXT,

    -- "Send me helpful emails / job leads" opt-in from sign-up.
    marketing_opt_in  BOOLEAN NOT NULL DEFAULT TRUE,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_uid_unique UNIQUE (uid),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_google_id_unique UNIQUE (google_id),
    CONSTRAINT users_apple_id_unique UNIQUE (apple_id),
    CONSTRAINT users_signup_provider_valid
        CHECK (signup_provider IN ('email', 'google', 'apple')),
    CONSTRAINT users_email_not_empty CHECK (char_length(trim(email)) > 0),
    CONSTRAINT users_first_name_not_empty CHECK (char_length(trim(first_name)) > 0),
    CONSTRAINT users_last_name_not_empty CHECK (char_length(trim(last_name)) > 0)
);

CREATE INDEX idx_users_uid ON users (uid);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_apple_id ON users (apple_id) WHERE apple_id IS NOT NULL;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE users IS 'Login identity + authentication. Account roles live in accounts.';
COMMENT ON COLUMN users.uid IS 'Public opaque ID; use in URLs instead of id.';
COMMENT ON COLUMN users.password_hash IS 'NULL for social-only logins.';
COMMENT ON COLUMN users.signup_provider IS 'Provider used at first sign-up: email | google | apple.';
COMMENT ON COLUMN users.id_verified IS 'Government-ID verification completed.';
COMMENT ON COLUMN users.is_military_veteran IS 'Self-declared military veteran status; NULL when not set.';
COMMENT ON COLUMN users.military_veteran_declined IS 'TRUE when the user chose not to disclose veteran status.';
COMMENT ON COLUMN users.avatar_url IS 'Encrypted S3 token for the user profile photo.';

-- ---------------------------------------------------------------------------
-- accounts: a user can hold one talent AND one client account
-- ---------------------------------------------------------------------------
CREATE TABLE accounts (
    id                    BIGSERIAL PRIMARY KEY,
    uid                   TEXT NOT NULL DEFAULT generate_public_uid(),
    user_id               BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    type                  VARCHAR(10) NOT NULL,

    -- Subscription tier (same values for talent and client accounts).
    -- UI labels differ by account type (e.g. "Freelancer Plus" vs "Business Plus").
    membership_tier       VARCHAR(10) NOT NULL DEFAULT 'basic',

    onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
    -- Next onboarding route to resume at. NULL once onboarding is completed.
    onboarding_step       VARCHAR(80),

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT accounts_uid_unique UNIQUE (uid),
    CONSTRAINT accounts_type_valid CHECK (type IN ('talent', 'client')),
    CONSTRAINT accounts_membership_tier_valid
        CHECK (membership_tier IN ('basic', 'plus')),
    CONSTRAINT accounts_user_type_unique UNIQUE (user_id, type)
);

CREATE INDEX idx_accounts_uid ON accounts (uid);
CREATE INDEX idx_accounts_user_id ON accounts (user_id);

CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE accounts IS 'Talent/Client accounts owned by a single user identity.';
COMMENT ON COLUMN accounts.uid IS 'Public opaque ID; use in URLs instead of id.';
COMMENT ON COLUMN accounts.membership_tier IS 'Subscription tier: basic | plus (shared by talent and client).';
COMMENT ON COLUMN accounts.onboarding_step IS 'Next route to resume onboarding; NULL when completed.';

COMMIT;
