-- Connect bundle expiry date (set when purchase completes).
-- Safe to re-run.

BEGIN;

ALTER TABLE connect_checkouts
    ADD COLUMN IF NOT EXISTS connects_expire_at TIMESTAMPTZ;

COMMENT ON COLUMN connect_checkouts.expires_at IS
    'When this pending checkout session expires if unpaid (not Connect bundle expiry).';
COMMENT ON COLUMN connect_checkouts.connects_expire_at IS
    'When purchased Connects expire: set to completed_at + 1 year on successful payment.';

COMMIT;
