-- WorkLanc: SAFE incremental update for users + accounts
-- ---------------------------------------------------------------------------
-- Use this when talent_* tables already exist and you must NOT wipe them.
-- Does NOT drop or recreate any table.
--
-- Run in pgAdmin when you only need new columns (uid, membership_tier, etc.)
-- after an earlier schema version.
--
-- NOT for empty databases — use users.sql for a full fresh install instead.

BEGIN;

-- Shared helpers (safe to re-run)
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

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS uid TEXT;
UPDATE users SET uid = generate_public_uid() WHERE uid IS NULL;
ALTER TABLE users ALTER COLUMN uid SET DEFAULT generate_public_uid();
ALTER TABLE users ALTER COLUMN uid SET NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_military_veteran BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

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

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS uid TEXT;
UPDATE accounts SET uid = generate_public_uid() WHERE uid IS NULL;
ALTER TABLE accounts ALTER COLUMN uid SET DEFAULT generate_public_uid();
ALTER TABLE accounts ALTER COLUMN uid SET NOT NULL;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS membership_tier VARCHAR(10);
UPDATE accounts SET membership_tier = 'basic' WHERE membership_tier IS NULL;
ALTER TABLE accounts ALTER COLUMN membership_tier SET DEFAULT 'basic';
ALTER TABLE accounts ALTER COLUMN membership_tier SET NOT NULL;

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
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_uid ON accounts (uid);

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Re-attach FK if talent_profiles lost it after a previous CASCADE drop of accounts
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

COMMIT;
