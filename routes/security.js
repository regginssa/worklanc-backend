const router = require("express").Router();
const controllers = require("../controllers/security");
const optionalAuth = require("../middleware/optionalAuth");

router.post("/turnstile/verify", optionalAuth, controllers.verifyTurnstile);

module.exports = router;
