const express = require("express");
const router = express.Router();

const { getBilan } = require("../controllers/bilanController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.get("/", authenticate, authorizePermission("bilan_view"), getBilan);

module.exports = router;

