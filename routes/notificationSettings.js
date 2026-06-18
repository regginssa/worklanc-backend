const router = require("express").Router();
const controllers = require("../controllers/notificationSettings");
const requireAuth = require("../middleware/requireAuth");

router.get("/me", requireAuth, controllers.getMyNotificationSettings);
router.patch("/me", requireAuth, controllers.updateMyNotificationSettings);

module.exports = router;
