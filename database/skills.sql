-- WorkLanc: skills + category_skills tables
-- Run AFTER categories.sql in pgAdmin

BEGIN;

DROP TABLE IF EXISTS category_skills CASCADE;
DROP TABLE IF EXISTS skills CASCADE;

CREATE TABLE skills (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT skills_slug_unique UNIQUE (slug),
    CONSTRAINT skills_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX idx_skills_active ON skills (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_skills_name ON skills (name);

COMMENT ON TABLE skills IS 'Reusable skill tags for freelancer profiles and job matching.';

CREATE TABLE category_skills (
    category_id     BIGINT NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    skill_id        BIGINT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (category_id, skill_id)
);

CREATE INDEX idx_category_skills_skill_id ON category_skills (skill_id);

COMMENT ON TABLE category_skills IS 'Links skills to categories for filtered skill pickers.';

-- Add skills and category_skills rows here when you have skill data.

COMMIT;
