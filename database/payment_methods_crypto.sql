-- WorkLanc: extend payment_methods for crypto wallets + one method per type per user
-- Safe to re-run.

BEGIN;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_user_crypto_unique
    ON payment_methods (user_id)
    WHERE type = 'crypto';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_crypto_address_chain
    ON payment_methods (crypto_address, crypto_chain)
    WHERE type = 'crypto' AND crypto_address IS NOT NULL;

COMMENT ON COLUMN payment_methods.crypto_address IS
    'Public wallet address for crypto deposit method.';
COMMENT ON COLUMN payment_methods.crypto_chain IS
    'Blockchain network: solana | ethereum | bnb.';
COMMENT ON COLUMN payment_methods.crypto_token IS
    'Preferred deposit token id (chrle, usdc, eth, etc.).';
COMMENT ON COLUMN payment_methods.crypto_label IS
    'Optional user-provided wallet nickname.';

COMMIT;
