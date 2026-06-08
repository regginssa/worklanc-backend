-- WorkLanc: add availability columns to talent_profiles (safe re-run)
-- Run when an existing database predates hours_per_week / open_to_contract_to_hire.

BEGIN;

ALTER TABLE talent_profiles
  ADD COLUMN IF NOT EXISTS hours_per_week VARCHAR(20);

ALTER TABLE talent_profiles
  ADD COLUMN IF NOT EXISTS open_to_contract_to_hire BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'talent_profiles_hours_per_week_valid'
  ) THEN
    ALTER TABLE talent_profiles
      ADD CONSTRAINT talent_profiles_hours_per_week_valid
      CHECK (hours_per_week IS NULL
             OR hours_per_week IN ('more_than_30', 'less_than_30',
                                   'as_needed', 'none'));
  END IF;
END $$;

COMMENT ON COLUMN talent_profiles.hours_per_week IS
  'Availability: more_than_30 | less_than_30 | as_needed | none.';
COMMENT ON COLUMN talent_profiles.open_to_contract_to_hire IS
  'Whether the talent is open to contract-to-hire roles; NULL when unset.';

COMMIT;
