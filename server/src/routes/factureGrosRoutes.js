const express = require("express");
const {
    createFactureGros,
    getAllFactureGros,
    getFactureGrosById,
    updateFactureGros,
    deleteFactureGros,
    approveFactureGros,
    rejectFactureGros,
} = require("../controllers/factureGrosController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

const router = express.Router();

router.get("/", authenticate, authorizePermission("factures_gros_view"), getAllFactureGros);
router.get("/:id", authenticate, authorizePermission("factures_gros_view"), getFactureGrosById);
router.post("/", authenticate, authorizePermission("factures_gros_view"), createFactureGros);
router.put("/:id", authenticate, authorizePermission("factures_gros_view"), updateFactureGros);
router.delete("/:id", authenticate, authorizePermission("factures_gros_view"), deleteFactureGros);
router.put("/:id/approve", authenticate, authorizePermission("factures_gros_view"), approveFactureGros);
router.put("/:id/reject", authenticate, authorizePermission("factures_gros_view"), rejectFactureGros);

module.exports = router;
