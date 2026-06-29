-- Allow multiple crypto billing methods per user (one per network + token combo).
-- Safe to re-run.

BEGIN;

DROP INDEX IF EXISTS idx_payment_methods_user_crypto_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_user_crypto_chain_token_unique
    ON payment_methods (user_id, crypto_chain, crypto_token)
    WHERE type = 'crypto'
      AND crypto_chain IS NOT NULL
      AND crypto_token IS NOT NULL;

COMMIT;
