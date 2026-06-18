const router = require("express").Router();
const controllers = require("../controllers/jobs");
const requireAuth = require("../middleware/requireAuth");

router.post("/", requireAuth, controllers.create);
router.get("/", requireAuth, controllers.list);
router.get("/:uid", requireAuth, controllers.getOne);
router.patch("/:uid", requireAuth, controllers.patchOne);
router.post("/:uid/save-draft", requireAuth, controllers.saveDraft);
router.post("/:uid/publish", requireAuth, controllers.publish);
router.post("/:uid/activate", requireAuth, controllers.activate);
router.delete("/:uid", requireAuth, controllers.remove);

module.exports = router;
