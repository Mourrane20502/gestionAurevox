const express = require("express");
const router = express.Router();
const { getAllBanques, createBanque, updateBanque, deleteBanque } = require("../controllers/banqueController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.get("/", authenticate, getAllBanques);

router.post("/", authenticate, authorizePermission("banque_view"), createBanque);
router.put("/:id", authenticate, authorizePermission("banque_view"), updateBanque);
router.delete("/:id", authenticate, authorizePermission("banque_view"), deleteBanque);

module.exports = router;
