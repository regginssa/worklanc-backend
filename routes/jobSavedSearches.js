const router = require("express").Router();
const requireAuth = require("../middleware/requireAuth");
const controllers = require("../controllers/jobSavedSearches");

router.get("/", requireAuth, controllers.list);
router.post("/", requireAuth, controllers.create);

module.exports = router;

