const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const { getAllCaisse, createCaisse, updateCaisse, deleteCaisse } = require("../controllers/caisseController");

router.get("/", authenticate, authorizePermission("caisse_view"), getAllCaisse);
router.post("/", authenticate, authorizePermission("caisse_view"), createCaisse);
router.put("/:id", authenticate, authorizePermission("caisse_view"), updateCaisse);
router.delete("/:id", authenticate, authorizePermission("caisse_view"), deleteCaisse);

module.exports = router;
