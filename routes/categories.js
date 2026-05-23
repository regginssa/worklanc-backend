const router = require("express").Router();
const controllers = require("../controllers/categories");

router.get("/", controllers.getAll);

module.exports = router;
