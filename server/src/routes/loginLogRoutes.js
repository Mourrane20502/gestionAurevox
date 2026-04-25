const express = require("express");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const { getLoginLogs } = require("../controllers/loginLogController");

const router = express.Router();

// Accessible aux rôles ayant la permission "login_journal_view"
router.get("/", authenticate, authorizePermission("login_journal_view"), getLoginLogs);

module.exports = router;

