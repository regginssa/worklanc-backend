-- Per-user notification preferences (shared across talent/client accounts).
-- Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS user_notification_settings (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notification_settings_user_id
    ON user_notification_settings (user_id);

DROP TRIGGER IF EXISTS trg_user_notification_settings_updated_at
    ON user_notification_settings;
CREATE TRIGGER trg_user_notification_settings_updated_at
    BEFORE UPDATE ON user_notification_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE user_notification_settings IS
    'Notification preferences for a login identity (not per account).';

COMMIT;
