-- One crypto billing method per user per network (not per token).
-- Safe to re-run.

BEGIN;

-- Keep the earliest saved wallet when multiple exist for the same network.
DELETE FROM payment_methods pm
USING payment_methods pm2
WHERE pm.type = 'crypto'
  AND pm2.type = 'crypto'
  AND pm.user_id = pm2.user_id
  AND pm.crypto_chain = pm2.crypto_chain
  AND pm.crypto_chain IS NOT NULL
  AND pm.created_at > pm2.created_at;

DROP INDEX IF EXISTS idx_payment_methods_user_crypto_chain_token_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_user_crypto_chain_unique
    ON payment_methods (user_id, crypto_chain)
    WHERE type = 'crypto'
      AND crypto_chain IS NOT NULL;

COMMENT ON COLUMN payment_methods.crypto_token IS
    'Deprecated: checkout selects token at payment time. Nullable for network-only wallets.';

COMMIT;
