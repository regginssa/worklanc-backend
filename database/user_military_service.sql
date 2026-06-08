-- WorkLanc: military service details for users who declared they served.
-- One row per user; tied to users.is_military_veteran = TRUE.

CREATE TABLE user_military_service (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country                 VARCHAR(255) NOT NULL,
    country_code            VARCHAR(2) NOT NULL,
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

CREATE INDEX idx_user_military_service_user_id
    ON user_military_service (user_id);

CREATE TRIGGER trg_user_military_service_updated_at
    BEFORE UPDATE ON user_military_service
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE user_military_service IS
    'Official-style military service details for veteran users.';
COMMENT ON COLUMN user_military_service.branch IS
    'army_and_ground_forces | navy_coast_guard_and_marine_forces | air_force | space_force';
