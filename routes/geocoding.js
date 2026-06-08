const router = require("express").Router();
const controllers = require("../controllers/geocoding");

router.get("/autocomplete", controllers.autocomplete);

module.exports = router;
