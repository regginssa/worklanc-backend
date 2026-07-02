const router = require("express").Router();
const controllers = require("../controllers/talentProfiles");
const requireAuth = require("../middleware/requireAuth");
const optionalAuth = require("../middleware/optionalAuth");
const requireTurnstileSession = require("../middleware/requireTurnstileSession");

router.get(
  "/freelancers/:uid",
  optionalAuth,
  requireTurnstileSession("freelancer_profile"),
  controllers.getFreelancerByUid
);
router.get("/testimonials/:uid", controllers.getTestimonialRequest);
router.post("/testimonials/:uid/respond", controllers.respondToTestimonial);
router.get("/profile", requireAuth, controllers.getMine);
router.patch("/profile", requireAuth, controllers.patchMine);

module.exports = router;
