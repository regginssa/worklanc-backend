const router = require("express").Router();
const controllers = require("../controllers/phoneVerification");
const requireAuth = require("../middleware/requireAuth");

router.post("/send", requireAuth, controllers.sendCode);
router.post("/verify", requireAuth, controllers.verifyCode);

module.exports = router;
