-- Connect bundle catalog + checkout transactions
-- Safe to re-run.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS available_connects INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.available_connects IS
    'Connect balance available to the talent account for proposals.';

CREATE TABLE IF NOT EXISTS connect_bundle_options (
    id              SERIAL PRIMARY KEY,
    connect_amount  INTEGER NOT NULL,
    price_cents     INTEGER NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT connect_bundle_options_amount_positive
        CHECK (connect_amount > 0),
    CONSTRAINT connect_bundle_options_price_positive
        CHECK (price_cents > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connect_bundle_options_amount_active
    ON connect_bundle_options (connect_amount)
    WHERE is_active = TRUE;

INSERT INTO connect_bundle_options (connect_amount, price_cents, sort_order)
SELECT v.connect_amount, v.price_cents, v.sort_order
FROM (VALUES
    (100, 1500, 1),
    (200, 2500, 2),
    (300, 3500, 3),
    (400, 4500, 4),
    (500, 5500, 5)
) AS v(connect_amount, price_cents, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM connect_bundle_options b WHERE b.connect_amount = v.connect_amount
);

CREATE TABLE IF NOT EXISTS connect_checkouts (
    id                          BIGSERIAL PRIMARY KEY,
    uid                         TEXT NOT NULL DEFAULT generate_public_uid(),
    user_id                     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    bundle_option_id            INTEGER NOT NULL REFERENCES connect_bundle_options (id),
    connect_amount              INTEGER NOT NULL,
    subtotal_cents              INTEGER NOT NULL,
    discount_cents              INTEGER NOT NULL DEFAULT 0,
    total_cents                 INTEGER NOT NULL,
    promo_code                  VARCHAR(64),
    status                      VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_method              VARCHAR(20),
    saved_payment_method_uid    TEXT REFERENCES payment_methods (uid) ON DELETE SET NULL,
    stripe_payment_intent_id    TEXT,
    failure_message             TEXT,
    completed_at                TIMESTAMPTZ,
    cancelled_at                TIMESTAMPTZ,
    expires_at                  TIMESTAMPTZ NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT connect_checkouts_uid_unique UNIQUE (uid),
    CONSTRAINT connect_checkouts_status_valid
        CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed', 'expired')),
    CONSTRAINT connect_checkouts_payment_method_valid
        CHECK (payment_method IS NULL OR payment_method IN ('card', 'paypal', 'crypto')),
    CONSTRAINT connect_checkouts_subtotal_non_negative CHECK (subtotal_cents >= 0),
    CONSTRAINT connect_checkouts_discount_non_negative CHECK (discount_cents >= 0),
    CONSTRAINT connect_checkouts_total_non_negative CHECK (total_cents >= 0),
    CONSTRAINT connect_checkouts_amount_positive CHECK (connect_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_connect_checkouts_user_id
    ON connect_checkouts (user_id);

CREATE INDEX IF NOT EXISTS idx_connect_checkouts_status
    ON connect_checkouts (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connect_checkouts_user_pending_bundle_promo
    ON connect_checkouts (
        user_id,
        bundle_option_id,
        COALESCE(LOWER(TRIM(promo_code)), '')
    )
    WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_connect_checkouts_updated_at ON connect_checkouts;
CREATE TRIGGER trg_connect_checkouts_updated_at
    BEFORE UPDATE ON connect_checkouts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE connect_bundle_options IS
    'Fixed Connect purchase bundles shown on the buy page.';
COMMENT ON TABLE connect_checkouts IS
    'In-progress and completed Connect purchase checkouts. Pending rows are reused for the same bundle + promo.';

COMMIT;
