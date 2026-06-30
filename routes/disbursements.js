const router = require("express").Router();
const controllers = require("../controllers/disbursements");
const requireAuth = require("../middleware/requireAuth");

router.get("/context", requireAuth, controllers.getContext);
router.post("/payoneer/register", requireAuth, controllers.registerPayoneer);
router.post("/payoneer/refresh", requireAuth, controllers.refreshPayoneer);
router.delete("/payoneer", requireAuth, controllers.deletePayoneer);
router.post("/crypto/wallets", requireAuth, controllers.saveCryptoWallet);
router.patch("/crypto/wallets/:uid", requireAuth, controllers.updateCryptoWallet);
router.delete("/crypto/wallets/:uid", requireAuth, controllers.deleteCryptoWallet);
router.patch("/default", requireAuth, controllers.setDefaultMethod);
router.patch("/schedule", requireAuth, controllers.updateSchedule);

module.exports = router;
