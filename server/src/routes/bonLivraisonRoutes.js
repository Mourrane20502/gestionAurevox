const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
/** Liste / détail / valider ou refuser (centre d’approbation inclus). */
const authorizeBlReadOrApprove = authorizePermission.authorizeAnyPermission([
    "bons_livraison_view",
    "commandes_view",
    "approvals_view",
]);
/** Création depuis commande, PDF, e-mail, mise à jour, suppression. */
const authorizeBlWrite = authorizePermission.authorizeAnyPermission([
    "bons_livraison_view",
    "commandes_view",
]);
const {
    getAllBonsLivraison,
    getBonLivraisonById,
    createBonLivraisonFromCommande,
    approveBonLivraison,
    rejectBonLivraison,
    updateBonLivraison,
    deleteBonLivraison,
    downloadBonLivraisonPdf,
    sendBonLivraisonEmail,
} = require("../controllers/bonLivraisonController");

router.get("/", authenticate, authorizeBlReadOrApprove, getAllBonsLivraison);
router.post(
    "/from-commande/:commandeId",
    authenticate,
    authorizeBlWrite,
    createBonLivraisonFromCommande
);
router.get("/:id/pdf/download", authenticate, authorizeBlWrite, downloadBonLivraisonPdf);
router.post("/:id/send-email", authenticate, authorizeBlWrite, sendBonLivraisonEmail);
router.put("/:id/approve", authenticate, authorizeBlReadOrApprove, approveBonLivraison);
router.put("/:id/reject", authenticate, authorizeBlReadOrApprove, rejectBonLivraison);
router.get("/:id", authenticate, authorizeBlReadOrApprove, getBonLivraisonById);
router.put("/:id", authenticate, authorizeBlWrite, updateBonLivraison);
router.delete("/:id", authenticate, authorizeBlWrite, deleteBonLivraison);

module.exports = router;
