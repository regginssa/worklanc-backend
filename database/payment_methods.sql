-- WorkLanc: payment methods (Stripe cards, future PayPal/crypto)
-- Run after users.sql or via patch_all.sql section 9.

BEGIN;

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

COMMIT;
