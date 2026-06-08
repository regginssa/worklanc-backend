const router = require("express").Router();
const controllers = require("../controllers/talentProfiles");
const requireAuth = require("../middleware/requireAuth");
const optionalAuth = require("../middleware/optionalAuth");

router.get("/freelancers/:uid", optionalAuth, controllers.getFreelancerByUid);
router.get("/profile", requireAuth, controllers.getMine);
router.patch("/profile", requireAuth, controllers.patchMine);

module.exports = router;
