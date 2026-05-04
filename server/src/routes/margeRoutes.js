const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const { getMargeSummary } = require("../controllers/margeController");

router.get("/summary", authenticate, authorizePermission("factures_view"), getMargeSummary);

module.exports = router;
