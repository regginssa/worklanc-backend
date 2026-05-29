const router = require("express").Router();
const controllers = require("../controllers/accounts");
const requireAuth = require("../middleware/requireAuth");

router.get("/", requireAuth, controllers.list);
router.post("/", requireAuth, controllers.create);
router.patch("/:id/onboarding", requireAuth, controllers.updateOnboarding);

module.exports = router;
