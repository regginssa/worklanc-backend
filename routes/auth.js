const router = require("express").Router();
const controllers = require("../controllers/auth");

router.post("/signup", controllers.signup);
router.post("/signin", controllers.signin);
router.post("/oauth", controllers.oauth);

module.exports = router;
