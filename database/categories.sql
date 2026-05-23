-- WorkLanc: categories table + seed data
-- Run this file FIRST in pgAdmin, then run skills.sql

BEGIN;

DROP TABLE IF EXISTS category_skills CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

CREATE TABLE categories (
    id              BIGSERIAL PRIMARY KEY,
    parent_id       BIGINT REFERENCES categories (id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT categories_slug_unique UNIQUE (slug),
    CONSTRAINT categories_parent_slug_unique UNIQUE (parent_id, slug),
    CONSTRAINT categories_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX idx_categories_parent_id ON categories (parent_id);
CREATE INDEX idx_categories_parent_sort ON categories (parent_id, sort_order);
CREATE INDEX idx_categories_active ON categories (is_active) WHERE is_active = TRUE;

COMMENT ON TABLE categories IS 'Service taxonomy: top-level groups and nested subcategories.';
COMMENT ON COLUMN categories.parent_id IS 'NULL = top-level category.';

-- Top-level categories
INSERT INTO categories (parent_id, name, slug, sort_order) VALUES
    (NULL, 'Accounting & Consulting', 'accounting-consulting', 1),
    (NULL, 'Admin Support', 'admin-support', 2),
    (NULL, 'Customer Service', 'customer-service', 3),
    (NULL, 'Data Science & Analytics', 'data-science-analytics', 4),
    (NULL, 'Design & Creative', 'design-creative', 5),
    (NULL, 'Engineering & Architecture', 'engineering-architecture', 6),
    (NULL, 'IT & Networking', 'it-networking', 7),
    (NULL, 'Legal', 'legal', 8),
    (NULL, 'Sales & Marketing', 'sales-marketing', 9),
    (NULL, 'Translation', 'translation', 10),
    (NULL, 'Web, Mobile & Software Dev', 'web-mobile-software-dev', 11),
    (NULL, 'Writing', 'writing', 12);

-- Accounting & Consulting
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Personal & Professional Coaching', 'personal-professional-coaching', 1),
    ('Accounting & Bookkeeping', 'accounting-bookkeeping', 2),
    ('Financial Planning', 'financial-planning', 3),
    ('Recruiting & Human Resources', 'recruiting-human-resources', 4),
    ('Management Consulting & Analysis', 'management-consulting-analysis', 5),
    ('Other - Accounting & Consulting', 'other-accounting-consulting', 6)
) AS v(name, slug, sort_order)
WHERE p.slug = 'accounting-consulting';

-- Admin Support
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Data Entry & Transcription Services', 'data-entry-transcription-services', 1),
    ('Virtual Assistance', 'virtual-assistance', 2),
    ('Project Management', 'project-management', 3),
    ('Market Research & Product Reviews', 'market-research-product-reviews', 4)
) AS v(name, slug, sort_order)
WHERE p.slug = 'admin-support';

-- Customer Service
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Community Management & Tagging', 'community-management-tagging', 1),
    ('Customer Service & Tech Support', 'customer-service-tech-support', 2)
) AS v(name, slug, sort_order)
WHERE p.slug = 'customer-service';

-- Data Science & Analytics
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Data Analysis & Testing', 'data-analysis-testing', 1),
    ('Data Extraction/ETL', 'data-extraction-etl', 2),
    ('Data Mining & Management', 'data-mining-management', 3),
    ('AI & Machine Learning', 'ai-machine-learning', 4)
) AS v(name, slug, sort_order)
WHERE p.slug = 'data-science-analytics';

-- Design & Creative
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Art & Illustration', 'art-illustration', 1),
    ('Audio & Music Production', 'audio-music-production', 2),
    ('Branding & Logo Design', 'branding-logo-design', 3),
    ('NFT, AR/VR & Game Art', 'nft-ar-vr-game-art', 4),
    ('Graphic, Editorial & Presentation Design', 'graphic-editorial-presentation-design', 5),
    ('Performing Arts', 'performing-arts', 6),
    ('Photography', 'photography', 7),
    ('Product Design', 'product-design', 8),
    ('Video & Animation', 'video-animation', 9)
) AS v(name, slug, sort_order)
WHERE p.slug = 'design-creative';

-- Engineering & Architecture
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Building & Landscape Architecture', 'building-landscape-architecture', 1),
    ('Chemical Engineering', 'chemical-engineering', 2),
    ('Civil & Structural Engineering', 'civil-structural-engineering', 3),
    ('Contract Manufacturing', 'contract-manufacturing', 4),
    ('Electrical & Electronic Engineering', 'electrical-electronic-engineering', 5),
    ('Interior & Trade Show Design', 'interior-trade-show-design', 6),
    ('Energy & Mechanical Engineering', 'energy-mechanical-engineering', 7),
    ('Physical Sciences', 'physical-sciences', 8),
    ('3D Modeling & CAD', '3d-modeling-cad', 9)
) AS v(name, slug, sort_order)
WHERE p.slug = 'engineering-architecture';

-- IT & Networking
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Database Management & Administration', 'database-management-administration', 1),
    ('ERP/CRM Software', 'erp-crm-software', 2),
    ('Information Security & Compliance', 'information-security-compliance', 3),
    ('Network & System Administration', 'network-system-administration', 4),
    ('DevOps & Solution Architecture', 'devops-solution-architecture', 5)
) AS v(name, slug, sort_order)
WHERE p.slug = 'it-networking';

-- Legal
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Corporate & Contract Law', 'corporate-contract-law', 1),
    ('International & Immigration Law', 'international-immigration-law', 2),
    ('Finance & Tax Law', 'finance-tax-law', 3),
    ('Public Law', 'public-law', 4)
) AS v(name, slug, sort_order)
WHERE p.slug = 'legal';

-- Sales & Marketing
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Digital Marketing', 'digital-marketing', 1),
    ('Lead Generation & Telemarketing', 'lead-generation-telemarketing', 2),
    ('Marketing, PR & Brand Strategy', 'marketing-pr-brand-strategy', 3)
) AS v(name, slug, sort_order)
WHERE p.slug = 'sales-marketing';

-- Translation
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Language Tutoring & Interpretation', 'language-tutoring-interpretation', 1),
    ('Translation & Localization Services', 'translation-localization-services', 2)
) AS v(name, slug, sort_order)
WHERE p.slug = 'translation';

-- Web, Mobile & Software Dev
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Blockchain, NFT & Cryptocurrency', 'blockchain-nft-cryptocurrency', 1),
    ('AI Apps & Integration', 'ai-apps-integration', 2),
    ('Desktop Application Development', 'desktop-application-development', 3),
    ('Ecommerce Development', 'ecommerce-development', 4),
    ('Game Design & Development', 'game-design-development', 5),
    ('Mobile Development', 'mobile-development', 6),
    ('Other - Software Development', 'other-software-development', 7),
    ('Product Management & Scrum', 'product-management-scrum', 8),
    ('QA Testing', 'qa-testing', 9),
    ('Scripts & Utilities', 'scripts-utilities', 10),
    ('Web & Mobile Design', 'web-mobile-design', 11),
    ('Web Development', 'web-development', 12)
) AS v(name, slug, sort_order)
WHERE p.slug = 'web-mobile-software-dev';

-- Writing
INSERT INTO categories (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM categories p
CROSS JOIN (VALUES
    ('Sales & Marketing Copywriting', 'sales-marketing-copywriting', 1),
    ('Content Writing', 'content-writing', 2),
    ('Editing & Proofreading Services', 'editing-proofreading-services', 3),
    ('Professional & Business Writing', 'professional-business-writing', 4)
) AS v(name, slug, sort_order)
WHERE p.slug = 'writing';

COMMIT;
