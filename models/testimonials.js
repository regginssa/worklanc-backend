const pool = require("../config/db");

const getByUid = async (uid) => {
  const result = await pool.query(
    `SELECT
        t.uid,
        t.client_first_name,
        t.client_last_name,
        t.client_title,
        t.project_type,
        t.request_message,
        t.testimonial_text,
        t.status,
        u.first_name AS talent_first_name,
        u.last_name AS talent_last_name,
        tp.title AS talent_title,
        tp.uid AS talent_profile_uid
     FROM talent_testimonials t
     INNER JOIN talent_profiles tp ON tp.id = t.talent_profile_id
     INNER JOIN accounts a ON a.id = tp.account_id
     INNER JOIN users u ON u.id = a.user_id
     WHERE t.uid = $1`,
    [uid],
  );
  return result.rows[0] || null;
};

const respond = async (uid, { status, testimonialText = null }) => {
  const result = await pool.query(
    `UPDATE talent_testimonials
     SET status = $2::varchar,
         testimonial_text = COALESCE($3::text, testimonial_text)
     WHERE uid = $1 AND status = 'pending'
     RETURNING uid, status, testimonial_text`,
    [uid, status, testimonialText],
  );
  return result.rows[0] || null;
};

module.exports = {
  getByUid,
  respond,
};
