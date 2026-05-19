const router = require("express").Router();

router.use("/api", require("./auth"));

module.exports = router;
