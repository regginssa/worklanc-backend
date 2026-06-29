const router = require("express").Router();
const controllers = require("../controllers/connects");
const requireAuth = require("../middleware/requireAuth");

router.get("/bundles", requireAuth, controllers.listBundles);
router.get("/balance", requireAuth, controllers.getConnectsBalance);
router.post("/checkouts", requireAuth, controllers.createCheckout);
router.patch("/checkouts/:uid/promo", requireAuth, controllers.applyCheckoutPromo);
router.get("/checkouts/:uid", requireAuth, controllers.getCheckout);
router.post("/checkouts/:uid/pay/card", requireAuth, controllers.payCheckoutWithCard);
router.post(
  "/checkouts/:uid/pay/crypto/prepare",
  requireAuth,
  controllers.prepareCheckoutCryptoPayment,
);
router.post(
  "/checkouts/:uid/pay/crypto/confirm",
  requireAuth,
  controllers.confirmCheckoutCryptoPayment,
);

module.exports = router;
