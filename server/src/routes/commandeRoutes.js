const express = require("express");
const router = express.Router();
const {
    createCommande,
    getAllCommandes,
    getCommandeById,
    updateCommande,
    deleteCommande,
    approveCommande,
    rejectCommande,
    reopenCommande,
    getNextCommandeNumber,
    sendCommandeEmail,
    downloadCommandePdf,
} = require("../controllers/commandeController");

const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const authorizeCommandesOrApprovals = authorizePermission.authorizeAnyPermission([
    "commandes_view",
    "approvals_view",
]);

router.post("/", authenticate, authorizePermission("commandes_view"), createCommande);
router.get("/", authenticate, authorizeCommandesOrApprovals, getAllCommandes);
router.get("/:id", authenticate, authorizeCommandesOrApprovals, getCommandeById);
router.put("/:id", authenticate, authorizePermission("commandes_view"), updateCommande);
router.delete("/:id", authenticate, authorizePermission("commandes_view"), deleteCommande);
router.put("/:id/approve", authenticate, authorizeCommandesOrApprovals, approveCommande);
router.put("/:id/reject", authenticate, authorizeCommandesOrApprovals, rejectCommande);
router.put("/:id/reopen", authenticate, authorizePermission("commandes_view"), reopenCommande);

router.post("/:id/send-email", authenticate, authorizePermission("commandes_view"), sendCommandeEmail);
router.get("/:id/pdf/download", downloadCommandePdf);

module.exports = router;
