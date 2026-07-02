const router = require("express").Router();
const controllers = require("../controllers/security");

router.get("/risk", controllers.getRisk);
router.post("/turnstile/verify", controllers.verifyTurnstile);

module.exports = router;
