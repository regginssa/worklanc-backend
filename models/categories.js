const pool = require("../config/db");

const mapCategories = (rows) => {
  const childrenByParentId = rows
    .filter((row) => row.parent_id != null)
    .reduce((acc, row) => {
      if (!acc[row.parent_id]) acc[row.parent_id] = [];
      acc[row.parent_id].push(row);
      return acc;
    }, {});

  return rows
    .filter((row) => row.parent_id == null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((parent) => ({
      parent: {
        name: parent.name,
        slug: parent.slug,
        children: (childrenByParentId[parent.id] || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(({ name, slug }) => ({ name, slug })),
      },
    }));
};

const getAll = async () => {
  const result = await pool.query(
    `SELECT id, parent_id, name, slug, sort_order
     FROM categories
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, name ASC`,
  );
  return mapCategories(result.rows);
};

module.exports = { getAll, mapCategories };
