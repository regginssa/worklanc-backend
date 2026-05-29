const router = require("express").Router();
const controllers = require("../controllers/talentProfiles");
const requireAuth = require("../middleware/requireAuth");

router.get("/profile", requireAuth, controllers.getMine);
router.patch("/profile", requireAuth, controllers.patchMine);

module.exports = router;
