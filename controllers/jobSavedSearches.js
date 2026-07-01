const JobSavedSearches = require("../models/jobSavedSearches");

const list = async (req, res) => {
  try {
    const rows = await JobSavedSearches.listByUserId(req.user.id);
    return res.status(200).json({ searches: rows });
  } catch (e) {
    console.error("jobSavedSearches.list error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const create = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const params = req.body?.params || {};

    if (!name) {
      return res.status(400).json({ message: "Search name is required" });
    }

    const row = await JobSavedSearches.create({
      userId: req.user.id,
      name,
      params,
    });
    return res.status(201).json({ search: row });
  } catch (e) {
    console.error("jobSavedSearches.create error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  list,
  create,
};

