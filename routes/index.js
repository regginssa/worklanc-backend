const router = require("express").Router();

router.use("/auth", require("./auth"));
router.use("/accounts", require("./accounts"));
router.use("/notification-settings", require("./notificationSettings"));
router.use("/talent", require("./talent"));
router.use("/categories", require("./categories"));
router.use("/profile", require("./profile"));
router.use("/upload", require("./upload"));
router.use("/geocoding", require("./geocoding"));
router.use("/phone-verification", require("./phoneVerification"));
router.use("/jobs", require("./jobs"));

module.exports = router;
