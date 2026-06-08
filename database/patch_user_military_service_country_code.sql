-- WorkLanc: add country_code to user_military_service (safe re-run)

BEGIN;

ALTER TABLE user_military_service
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

UPDATE user_military_service
SET country_code = 'US'
WHERE country_code IS NULL;

ALTER TABLE user_military_service
  ALTER COLUMN country_code SET NOT NULL;

COMMENT ON COLUMN user_military_service.country_code IS
  'ISO 3166-1 alpha-2 country code for the service country.';

COMMIT;
