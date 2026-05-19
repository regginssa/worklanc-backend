const router = require("express").Router();
const controllers = require("../controllers/auth");

router.post("/signup", controllers.signup);
router.post("/signin", controllers.signin);

module.exports = router;
