-- User connects balance + idempotent credit flag on completed checkouts.
-- Safe to re-run.

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'available_connects'
    ) THEN
        ALTER TABLE users RENAME COLUMN available_connects TO connects_balance;
    ELSIF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'connects_balance'
    ) THEN
        ALTER TABLE users
            ADD COLUMN connects_balance INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

ALTER TABLE users
    ALTER COLUMN connects_balance SET DEFAULT 0;

UPDATE users
SET connects_balance = COALESCE(connects_balance, 0)
WHERE connects_balance IS NULL;

ALTER TABLE connect_checkouts
    ADD COLUMN IF NOT EXISTS connects_credited BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.connects_balance IS
    'Current Connect balance for the user (proposals / job applications).';
COMMENT ON COLUMN connect_checkouts.connects_credited IS
    'TRUE once purchased Connects have been added to users.connects_balance.';

COMMIT;
