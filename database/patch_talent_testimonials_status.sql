-- WorkLanc: align testimonial status values (safe re-run)
-- pending | confirmed | declined

BEGIN;

UPDATE talent_testimonials
SET status = 'confirmed'
WHERE status IN ('submitted', 'verified');

ALTER TABLE talent_testimonials
  DROP CONSTRAINT IF EXISTS talent_testimonials_status_valid;

ALTER TABLE talent_testimonials
  ADD CONSTRAINT talent_testimonials_status_valid
  CHECK (status IN ('pending', 'confirmed', 'declined'));

COMMENT ON COLUMN talent_testimonials.status IS
  'pending: awaiting client response; confirmed: client approved; declined: client declined.';

COMMIT;
