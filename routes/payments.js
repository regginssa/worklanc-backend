const router = require("express").Router();
const controllers = require("../controllers/payments");
const requireAuth = require("../middleware/requireAuth");

router.get("/methods", requireAuth, controllers.listMyPaymentMethods);
router.post("/stripe/save", requireAuth, controllers.saveStripePaymentMethod);
router.post("/crypto/wallets", requireAuth, controllers.saveCryptoWallet);
router.patch("/methods/:uid", requireAuth, controllers.updatePaymentMethod);
router.delete("/methods/:uid", requireAuth, controllers.deletePaymentMethod);

module.exports = router;
