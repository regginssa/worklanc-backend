require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

const file = process.argv[2] || path.join(__dirname, "database", "jobs.sql");

async function run() {
  const sql = fs.readFileSync(file, "utf8");
  try {
    await pool.query(sql);
    console.log(`Applied ${path.basename(file)} successfully`);
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

run();
