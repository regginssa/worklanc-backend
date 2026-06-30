-- WorkLanc: talent withdrawal methods (Payoneer + crypto payout wallets)
-- Run after users.sql or via patch_all.sql section 12.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tax_profile_complete BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS withdrawal_schedule VARCHAR(20);

COMMENT ON COLUMN users.tax_profile_complete IS
    'Whether the talent has completed tax information required for withdrawals.';
COMMENT ON COLUMN users.withdrawal_schedule IS
    'Talent withdrawal cadence: manual | weekly | monthly.';

CREATE TABLE IF NOT EXISTS withdrawal_methods (
    id                          BIGSERIAL PRIMARY KEY,
    uid                         TEXT NOT NULL DEFAULT generate_public_uid(),
    user_id                     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type                        VARCHAR(20) NOT NULL,
    provider                    VARCHAR(20) NOT NULL DEFAULT 'payoneer',
    payoneer_payee_id           TEXT,
    payoneer_email              VARCHAR(255),
    payoneer_registration_link  TEXT,
    payoneer_status             VARCHAR(20),
    crypto_address              TEXT,
    crypto_chain                VARCHAR(20),
    crypto_token                VARCHAR(20),
    crypto_label                VARCHAR(255),
    is_default                  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT withdrawal_methods_uid_unique UNIQUE (uid),
    CONSTRAINT withdrawal_methods_type_valid
        CHECK (type IN ('payoneer', 'crypto')),
    CONSTRAINT withdrawal_methods_provider_valid
        CHECK (provider IN ('payoneer', 'crypto')),
    CONSTRAINT withdrawal_methods_payoneer_status_valid
        CHECK (
            payoneer_status IS NULL
            OR payoneer_status IN ('pending', 'active', 'inactive', 'declined')
        ),
    CONSTRAINT withdrawal_methods_schedule_valid
        CHECK (
            (type = 'payoneer' AND crypto_address IS NULL AND crypto_chain IS NULL)
            OR (type = 'crypto' AND payoneer_payee_id IS NULL AND payoneer_email IS NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_methods_user_id
    ON withdrawal_methods (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_methods_user_payoneer_unique
    ON withdrawal_methods (user_id)
    WHERE type = 'payoneer';

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_methods_user_crypto_chain_unique
    ON withdrawal_methods (user_id, crypto_chain)
    WHERE type = 'crypto'
      AND crypto_chain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_methods_crypto_address_chain
    ON withdrawal_methods (crypto_address, crypto_chain)
    WHERE type = 'crypto' AND crypto_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_methods_payoneer_payee_id
    ON withdrawal_methods (payoneer_payee_id)
    WHERE payoneer_payee_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_withdrawal_methods_updated_at ON withdrawal_methods;
CREATE TRIGGER trg_withdrawal_methods_updated_at
    BEFORE UPDATE ON withdrawal_methods
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE withdrawal_methods IS
    'Talent payout methods: Payoneer account or verified crypto wallets (one per network).';

COMMIT;
