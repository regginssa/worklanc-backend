const pool = require("../config/db");

// CREATE an account (talent | client) for a user.
const create = async ({
  userId,
  type,
  onboardingCompleted = false,
  onboardingStep = null,
}) => {
  const result = await pool.query(
    `INSERT INTO accounts (user_id, type, onboarding_completed, onboarding_step)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [userId, type, onboardingCompleted, onboardingStep],
  );
  return result.rows[0];
};

const getByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows;
};

const getByUserAndType = async (userId, type) => {
  const result = await pool.query(
    `SELECT * FROM accounts WHERE user_id = $1 AND type = $2`,
    [userId, type],
  );
  return result.rows[0];
};

const getById = async (id) => {
  const result = await pool.query(`SELECT * FROM accounts WHERE id = $1`, [id]);
  return result.rows[0];
};

// Update onboarding progress. Pass step to move the resume point, and/or
// completed=true to finish (which clears the step).
const updateOnboarding = async (id, { step, completed }) => {
  const sets = [];
  const values = [];
  let i = 1;

  if (completed !== undefined) {
    sets.push(`onboarding_completed = $${i++}`);
    values.push(completed);

    // Completing onboarding clears the resume step.
    sets.push(`onboarding_step = $${i++}`);
    values.push(completed ? null : step ?? null);
  } else if (step !== undefined) {
    sets.push(`onboarding_step = $${i++}`);
    values.push(step);
  }

  if (sets.length === 0) return getById(id);

  values.push(id);
  const result = await pool.query(
    `UPDATE accounts SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values,
  );
  return result.rows[0];
};

const deleteOne = async (id) => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [id]);
  return true;
};

module.exports = {
  create,
  getByUserId,
  getByUserAndType,
  getById,
  updateOnboarding,
  deleteOne,
};
