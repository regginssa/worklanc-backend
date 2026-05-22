const router = require("express").Router();
const controllers = require("../controllers/profile");
const optionalAuth = require("../middleware/optionalAuth");
const { upload } = require("../middleware/upload");

router.post(
  "/resume",
  optionalAuth,
  (req, res, next) => {
    upload.single("resume")(req, res, (err) => {
      if (!err) return next();

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File must be 5MB or smaller" });
      }

      return res.status(400).json({ message: err.message });
    });
  },
  controllers.uploadResume
);

module.exports = router;
