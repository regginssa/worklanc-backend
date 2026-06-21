-- WorkLanc: track which open jobs a freelancer has viewed in find-work
-- Safe to re-run on an existing database.

BEGIN;

CREATE TABLE IF NOT EXISTS job_reads (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    job_id      BIGINT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    read_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT job_reads_user_job_unique UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_reads_user_id ON job_reads (user_id);
CREATE INDEX IF NOT EXISTS idx_job_reads_job_id ON job_reads (job_id);

COMMENT ON TABLE job_reads IS
    'Per-user read state for open jobs shown in the freelancer find-work feed.';

COMMIT;
