-- WorkLanc: seed diverse mock OPEN jobs for freelancer browse / find-work
-- Safe to re-run: uses fixed uids and ON CONFLICT DO NOTHING.
-- Requires at least one client account (uses the first two client accounts found).

BEGIN;

-- Remove prior seed rows so re-run refreshes content.
DELETE FROM jobs
WHERE uid IN (
  'seedjob00000000000000000000000001',
  'seedjob00000000000000000000000002',
  'seedjob00000000000000000000000003',
  'seedjob00000000000000000000000004',
  'seedjob00000000000000000000000005',
  'seedjob00000000000000000000000006',
  'seedjob00000000000000000000000007',
  'seedjob00000000000000000000000008'
);

WITH client_accounts AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM accounts
  WHERE type = 'client'
),
seed_rows AS (
  SELECT * FROM (VALUES
    (
      'seedjob00000000000000000000000001'::text,
      1,
      'Build a Fintech SaaS Dashboard (React + Node)',
      'full-stack-development',
      '[{"label":"React","value":"react"},{"label":"Node.js","value":"nodejs"},{"label":"PostgreSQL","value":"postgresql"},{"label":"TypeScript","value":"typescript"}]'::jsonb,
      'large', '3-6', 'intermediate', 'yes',
      'global', '["GB","DE","US"]'::jsonb,
      'hourly', 55.00, 90.00, NULL,
      'We are building a B2B fintech dashboard for portfolio managers. You will implement responsive UI screens, REST integrations, and role-based access. The stack is React, TypeScript, Node.js, and PostgreSQL. Clear daily standups, async-friendly team, and well-defined milestones for the first release.',
      '["Describe your recent experience with similar projects","Include a link to your GitHub profile and/or website"]'::jsonb,
      'fluent_or_better', 'more_than_30_hrs_week', 'independent', 'two_weeks', 'one_person',
      NOW() - INTERVAL '6 hours'
    ),
    (
      'seedjob00000000000000000000000002',
      2,
      'Product Photo for E-commerce Listing ($250 fixed)',
      'design-creative',
      '[{"label":"Photography","value":"photography"},{"label":"Product Photography","value":"product-photography"},{"label":"Adobe Lightroom","value":"adobe-lightroom"}]'::jsonb,
      'small', '1-3', 'entry', 'no',
      'global', '[]'::jsonb,
      'fixed', NULL, NULL, 250.00,
      'Need clean white-background product photos for a skincare line launching next month. You will receive 12 products by mail, shoot each from 3 angles, and deliver edited JPEGs sized for Shopify. No advanced retouching required beyond basic color correction and cropping.',
      '[]'::jsonb,
      'any_level', 'less_than_30_hrs_week', 'no_preference', 'one_week', 'one_person',
      NOW() - INTERVAL '1 day'
    ),
    (
      'seedjob00000000000000000000000003',
      1,
      'Senior React Native Engineer for Health App MVP',
      'mobile-development',
      '[{"label":"React Native","value":"react-native"},{"label":"iOS","value":"ios"},{"label":"Android","value":"android"},{"label":"Firebase","value":"firebase"}]'::jsonb,
      'medium', '3-6', 'expert', 'yes',
      'global', '["europe","americas"]'::jsonb,
      'hourly', 70.00, 110.00, NULL,
      'Looking for a senior mobile engineer to ship an MVP for a wellness tracking app. Scope includes authentication, onboarding, habit tracking, push notifications, and App Store / Play Store submission support. Must have shipped at least two production React Native apps.',
      '["What frameworks have you worked with?","Please list any certifications related to this project"]'::jsonb,
      'conversational_or_better', 'more_than_30_hrs_week', 'independent', 'one_to_three_days', 'one_person',
      NOW() - INTERVAL '2 days'
    ),
    (
      'seedjob00000000000000000000000004',
      2,
      'WordPress Landing Page with Booking Form',
      'web-development',
      '[{"label":"WordPress","value":"wordpress"},{"label":"HTML5","value":"html5"},{"label":"CSS","value":"css"},{"label":"JavaScript","value":"javascript"}]'::jsonb,
      'medium', '1-3', 'intermediate', 'no',
      'local', '["California","Texas","New York"]'::jsonb,
      'fixed', NULL, NULL, 1200.00,
      'Create a conversion-focused landing page on WordPress for a local dental clinic. Includes hero, services, testimonials, FAQ, and an embedded booking form (Calendly or similar). Mobile-first design, fast load times, and basic on-page SEO setup required.',
      '[]'::jsonb,
      'native_or_bilingual_only', 'less_than_30_hrs_week', 'agency', 'one_week', 'one_person',
      NOW() - INTERVAL '3 days'
    ),
    (
      'seedjob00000000000000000000000005',
      1,
      'Remote Data Entry & Catalog Cleanup',
      'admin-support',
      '[{"label":"Data Entry","value":"data-entry"},{"label":"Typing","value":"typing"},{"label":"Microsoft Excel","value":"microsoft-excel"}]'::jsonb,
      'small', '1-3', 'entry', 'no',
      'local', '["America/New_York","America/Chicago"]'::jsonb,
      'hourly', 12.00, 18.00, NULL,
      'We need help cleaning and standardizing a product catalog spreadsheet (~2,000 rows). Tasks include fixing typos, normalizing categories, verifying SKUs, and flagging duplicates. Must be detail-oriented and comfortable working in Google Sheets or Excel with filter views and basic formulas.',
      '[]'::jsonb,
      'any_level', 'not_sure', 'no_preference', 'one_month', 'more_than_one_person',
      NOW() - INTERVAL '5 days'
    ),
    (
      'seedjob00000000000000000000000006',
      2,
      'AWS DevOps: Migrate Monolith to ECS + CI/CD',
      'devops-solutions',
      '[{"label":"Amazon Web Services","value":"aws"},{"label":"Docker","value":"docker"},{"label":"Terraform","value":"terraform"},{"label":"GitHub Actions","value":"github-actions"}]'::jsonb,
      'large', '6+', 'expert', 'yes',
      'global', '[]'::jsonb,
      'hourly', 85.00, 130.00, NULL,
      'We are migrating a Node.js monolith from a single EC2 instance to ECS Fargate with blue/green deployments. You will design the pipeline, containerize services, set up staging/production environments, and document runbooks. Strong AWS and IaC experience required.',
      '["Describe your approach to testing and improving QA"]'::jsonb,
      'fluent_or_better', 'more_than_30_hrs_week', 'independent', 'two_weeks', 'one_person',
      NOW() - INTERVAL '8 days'
    ),
    (
      'seedjob00000000000000000000000007',
      1,
      'UI/UX Designer for B2B Analytics Platform',
      'design-creative',
      '[{"label":"Figma","value":"figma"},{"label":"UI Design","value":"ui-design"},{"label":"UX Research","value":"ux-research"},{"label":"Design Systems","value":"design-systems"}]'::jsonb,
      'medium', '3-6', 'intermediate', 'no',
      'global', '["FR","ES","IT"]'::jsonb,
      'hourly', 40.00, 65.00, NULL,
      'Redesign key flows for a B2B analytics product: dashboard home, report builder, and team settings. Deliverables include wireframes, high-fidelity Figma screens, component specs, and a short usability test plan. Experience with data-heavy interfaces is a plus.',
      '[]'::jsonb,
      'conversational_or_better', 'less_than_30_hrs_week', 'independent', 'one_week', 'one_person',
      NOW() - INTERVAL '12 days'
    ),
    (
      'seedjob00000000000000000000000008',
      2,
      'SEO Blog Writer for SaaS (10 articles / month)',
      'writing',
      '[{"label":"SEO Writing","value":"seo-writing"},{"label":"Content Writing","value":"content-writing"},{"label":"SaaS","value":"saas"}]'::jsonb,
      'small', '6+', 'entry', 'no',
      'global', '["GB","AU","CA"]'::jsonb,
      'fixed', NULL, NULL, 800.00,
      'Ongoing content partnership for a project management SaaS. Write 10 SEO-optimized blog posts per month (1,200–1,500 words each) targeting long-tail keywords we provide. Tone is professional but approachable. Include meta descriptions and internal linking suggestions.',
      '["Include a link to your GitHub profile and/or website"]'::jsonb,
      'native_or_bilingual_only', 'less_than_30_hrs_week', 'no_preference', 'one_month', 'one_person',
      NOW() - INTERVAL '20 days'
    )
  ) AS v(
    uid, account_rn, title, category_slug, skills,
    project_size, duration, experience_level, contract_to_hire,
    location_type, location_preferences,
    budget_type, budget_min, budget_max, budget_fixed,
    description, screening_questions,
    english_level, hours_per_week, talent_type, hire_date, professionals_needed,
    published_at
  )
)
INSERT INTO jobs (
  uid, account_id, status, current_step, title, category_slug, skills,
  project_size, duration, experience_level, contract_to_hire,
  location_type, location_preferences,
  budget_type, budget_currency, budget_min, budget_max, budget_fixed,
  description, screening_questions,
  english_level, hours_per_week, talent_type, hire_date, professionals_needed,
  published_at
)
SELECT
  s.uid,
  ca.id,
  'open',
  '/nx/job-post/review',
  s.title,
  s.category_slug,
  s.skills,
  s.project_size,
  s.duration,
  s.experience_level,
  s.contract_to_hire,
  s.location_type,
  s.location_preferences,
  s.budget_type,
  'USD',
  s.budget_min,
  s.budget_max,
  s.budget_fixed,
  s.description,
  s.screening_questions,
  s.english_level,
  s.hours_per_week,
  s.talent_type,
  s.hire_date,
  s.professionals_needed,
  s.published_at
FROM seed_rows s
JOIN client_accounts ca ON ca.rn = s.account_rn
ON CONFLICT (uid) DO NOTHING;

COMMIT;
