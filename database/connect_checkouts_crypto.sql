-- Crypto payment fields for Connect checkouts (direct wallet → treasury model).
-- Safe to re-run.

BEGIN;

ALTER TABLE connect_checkouts
    ADD COLUMN IF NOT EXISTS crypto_chain VARCHAR(20),
    ADD COLUMN IF NOT EXISTS crypto_token VARCHAR(20),
    ADD COLUMN IF NOT EXISTS crypto_amount VARCHAR(64),
    ADD COLUMN IF NOT EXISTS crypto_treasury_address TEXT,
    ADD COLUMN IF NOT EXISTS crypto_sender_address TEXT,
    ADD COLUMN IF NOT EXISTS crypto_token_contract TEXT,
    ADD COLUMN IF NOT EXISTS crypto_token_price_usd VARCHAR(32),
    ADD COLUMN IF NOT EXISTS crypto_tx_hash TEXT,
    ADD COLUMN IF NOT EXISTS crypto_quote_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_connect_checkouts_crypto_tx_hash_unique
    ON connect_checkouts (crypto_tx_hash)
    WHERE crypto_tx_hash IS NOT NULL;

COMMENT ON COLUMN connect_checkouts.crypto_chain IS
    'Blockchain network for a crypto checkout quote (solana, ethereum, bnb).';
COMMENT ON COLUMN connect_checkouts.crypto_token IS
    'Token id charged at checkout (chrle, sol, usdc, etc.).';
COMMENT ON COLUMN connect_checkouts.crypto_amount IS
    'Exact quoted crypto amount the user must send (decimal string).';
COMMENT ON COLUMN connect_checkouts.crypto_treasury_address IS
    'Worklanc merchant treasury address that must receive the payment.';
COMMENT ON COLUMN connect_checkouts.crypto_sender_address IS
    'User wallet address expected to sign the on-chain transfer.';
COMMENT ON COLUMN connect_checkouts.crypto_token_contract IS
    'SPL/ERC-20/BEP-20 mint or contract address; NULL for native tokens.';
COMMENT ON COLUMN connect_checkouts.crypto_token_price_usd IS
    'USD price per token locked when the crypto quote was created.';
COMMENT ON COLUMN connect_checkouts.crypto_tx_hash IS
    'On-chain transaction hash or signature once payment is verified.';
COMMENT ON COLUMN connect_checkouts.crypto_quote_expires_at IS
    'When the locked crypto amount expires and checkout must be re-quoted.';

COMMIT;
