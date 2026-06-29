const router = require("express").Router();
const controllers = require("../controllers/connects");
const requireAuth = require("../middleware/requireAuth");

router.get("/bundles", requireAuth, controllers.listBundles);
router.post("/checkouts", requireAuth, controllers.createCheckout);
router.patch("/checkouts/:uid/promo", requireAuth, controllers.applyCheckoutPromo);
router.get("/checkouts/:uid", requireAuth, controllers.getCheckout);
router.post("/checkouts/:uid/pay/card", requireAuth, controllers.payCheckoutWithCard);

module.exports = router;
