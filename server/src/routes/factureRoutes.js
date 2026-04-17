const express = require("express");
const router = express.Router();

const { 
    createFacture, getAllFactures, getFactureById, updateFacture, deleteFacture, 
    approveFacture, rejectFacture, markAsPaid, reopenFacture,
    sendFactureEmail, downloadFacturePdf, downloadFournisseurFacturePdf,
    sendFacturesBulkEmail,
    getFactureEmailHistory,
    getTopSoldProducts,
    getLeastSoldProducts,
} = require("../controllers/factureController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.post("/", authenticate, authorizePermission("factures_view"), createFacture);
router.get("/", authenticate, authorizePermission("factures_view"), getAllFactures);
router.get("/top-products", authenticate, authorizePermission("factures_view"), getTopSoldProducts);
router.get("/least-products", authenticate, authorizePermission("factures_view"), getLeastSoldProducts);
router.get("/email-history", authenticate, authorizePermission("factures_view"), getFactureEmailHistory);
router.post("/bulk-send-email", authenticate, authorizePermission("factures_view"), sendFacturesBulkEmail);
router.get("/:id", authenticate, authorizePermission("factures_view"), getFactureById);
router.put("/:id", authenticate, authorizePermission("factures_view"), updateFacture);
router.delete("/:id", authenticate, authorizePermission("factures_view"), deleteFacture);
router.put("/:id/approve", authenticate, authorizePermission("factures_view"), approveFacture);
router.put("/:id/reject", authenticate, authorizePermission("factures_view"), rejectFacture);
router.put("/:id/mark-paid", authenticate, authorizePermission("factures_view"), markAsPaid);
router.put("/:id/reopen", authenticate, authorizePermission("factures_view"), reopenFacture);

router.post("/:id/send-email", authenticate, authorizePermission("factures_view"), sendFactureEmail);
router.get("/:id/pdf/download", downloadFacturePdf);
router.get("/fournisseur/:id/pdf/download", authenticate, authorizePermission("fournisseurs_view"), downloadFournisseurFacturePdf);

module.exports = router;
