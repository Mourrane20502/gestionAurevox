const express = require("express");
const {
    login,
    verify,
    getCaptcha,
    verifyTwoFactorLogin,
    getTwoFactorStatus,
    startTwoFactorSetup,
    enableTwoFactor,
    disableTwoFactor,
} = require("../controllers/authController");
const authenticate = require("../middleware/authMiddleware");
const { verifyCaptcha } = require("../middleware/verifyCaptcha");
const router = express.Router();

router.get("/captcha", getCaptcha);
router.post("/login", verifyCaptcha, login);
router.post("/login/2fa", verifyTwoFactorLogin);
router.get("/verify", authenticate, verify);
router.get("/2fa/status", authenticate, getTwoFactorStatus);
router.post("/2fa/setup", authenticate, startTwoFactorSetup);
router.post("/2fa/enable", authenticate, enableTwoFactor);
router.post("/2fa/disable", authenticate, disableTwoFactor);

module.exports = router;

