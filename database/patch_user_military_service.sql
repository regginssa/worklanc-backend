-- WorkLanc: military veteran disclosure + service history (safe re-run)
-- Run when an existing database predates user_military_service.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS military_veteran_declined BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.military_veteran_declined IS
  'TRUE when the user chose not to disclose veteran status.';

CREATE TABLE IF NOT EXISTS user_military_service (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country                 VARCHAR(255) NOT NULL,
    country_code            VARCHAR(2) NOT NULL DEFAULT 'US',
    service_first_name      VARCHAR(255) NOT NULL,
    service_last_name       VARCHAR(255) NOT NULL,
    active_duty_start_date  DATE NOT NULL,
    active_duty_end_date    DATE NOT NULL,
    branch                  VARCHAR(64) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_military_service_user_unique UNIQUE (user_id),
    CONSTRAINT user_military_service_branch_valid
        CHECK (branch IN (
            'army_and_ground_forces',
            'navy_coast_guard_and_marine_forces',
            'air_force',
            'space_force'
        )),
    CONSTRAINT user_military_service_dates_valid
        CHECK (active_duty_end_date >= active_duty_start_date)
);

CREATE INDEX IF NOT EXISTS idx_user_military_service_user_id
    ON user_military_service (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_user_military_service_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_military_service_updated_at
      BEFORE UPDATE ON user_military_service
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

COMMIT;
