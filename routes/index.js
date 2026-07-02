const router = require("express").Router();
const requireTurnstileIfVpn = require("../middleware/requireTurnstileIfVpn");

router.use(requireTurnstileIfVpn);

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
router.use("/job-saved-searches", require("./jobSavedSearches"));
router.use("/payments", require("./payments"));
router.use("/connects", require("./connects"));
router.use("/disbursements", require("./disbursements"));
router.use("/security", require("./security"));

module.exports = router;
