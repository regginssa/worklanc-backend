const router = require("express").Router();

router.use("/auth", require("./auth"));
router.use("/accounts", require("./accounts"));
router.use("/talent", require("./talent"));
router.use("/categories", require("./categories"));
router.use("/profile", require("./profile"));
router.use("/upload", require("./upload"));

module.exports = router;
