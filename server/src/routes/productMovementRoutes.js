const express = require("express");
const router = express.Router();

const { getAllMovements } = require("../controllers/productMovementController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.get("/", authenticate, authorizePermission("products_movements_view"), getAllMovements);

module.exports = router;

