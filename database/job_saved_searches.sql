BEGIN;

CREATE TABLE IF NOT EXISTS job_saved_searches (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_saved_searches_user_id
  ON job_saved_searches (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_job_saved_searches_updated_at ON job_saved_searches;
CREATE TRIGGER trg_job_saved_searches_updated_at
  BEFORE UPDATE ON job_saved_searches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

