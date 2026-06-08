const router = require("express").Router();
const controllers = require("../controllers/upload");
const requireAuth = require("../middleware/requireAuth");
const { mediaUpload, MAX_FILE_SIZE } = require("../middleware/mediaUpload");

router.post(
  "/",
  requireAuth,
  (req, res, next) => {
    mediaUpload.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ message: `File must be ${MAX_FILE_SIZE / (1024 * 1024)}MB or smaller` });
      }

      return res.status(400).json({ message: err.message });
    });
  },
  controllers.uploadMedia,
);

router.get("/asset/:token", controllers.serveMedia);

module.exports = router;
