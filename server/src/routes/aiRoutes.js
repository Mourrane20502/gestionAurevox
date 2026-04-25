const express = require("express");
const { askIA } = require("../controllers/aiController");
const authenticate = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/ask", authenticate, askIA);

module.exports = router;
