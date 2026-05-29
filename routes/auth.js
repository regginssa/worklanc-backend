const router = require("express").Router();
const controllers = require("../controllers/auth");
const requireAuth = require("../middleware/requireAuth");

router.post("/signup", controllers.signup);
router.post("/signin", controllers.signin);
router.post("/oauth", controllers.oauth);
router.get("/me", requireAuth, controllers.me);
router.patch("/me", requireAuth, controllers.updateMe);

module.exports = router;
