-- Client onboarding columns on accounts (safe to re-run)
BEGIN;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS company_website TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS company_size VARCHAR(20);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_company_size_valid'
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_company_size_valid
            CHECK (
                company_size IS NULL OR
                company_size IN ('just_me', '2_9', '10_99', '100_499', '500_4999', '5000_plus')
            );
    END IF;
END $$;

COMMENT ON COLUMN accounts.company_name IS
    'Client company name collected during client onboarding.';
COMMENT ON COLUMN accounts.company_website IS
    'Client company website URL collected during client onboarding.';
COMMENT ON COLUMN accounts.company_size IS
    'Client organization size: just_me | 2_9 | 10_99 | 100_499 | 500_4999 | 5000_plus.';

COMMIT;
