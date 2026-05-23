const Categories = require("../models/categories");

const getAll = async (req, res) => {
  try {
    const categories = await Categories.getAll();
    res.status(200).json(categories);
  } catch (e) {
    console.error("getAll categories error: ", e);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getAll };
