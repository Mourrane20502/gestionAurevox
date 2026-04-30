const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
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

router.get("/", authenticate, authorizePermission("commandes_view"), getAllBonsLivraison);
router.get("/:id", authenticate, authorizePermission("commandes_view"), getBonLivraisonById);
router.post("/from-commande/:commandeId", authenticate, authorizePermission("commandes_view"), createBonLivraisonFromCommande);
router.put("/:id", authenticate, authorizePermission("commandes_view"), updateBonLivraison);
router.delete("/:id", authenticate, authorizePermission("commandes_view"), deleteBonLivraison);
router.put("/:id/approve", authenticate, authorizePermission("commandes_view"), approveBonLivraison);
router.put("/:id/reject", authenticate, authorizePermission("commandes_view"), rejectBonLivraison);
router.get("/:id/pdf/download", authenticate, authorizePermission("commandes_view"), downloadBonLivraisonPdf);
router.post("/:id/send-email", authenticate, authorizePermission("commandes_view"), sendBonLivraisonEmail);

module.exports = router;
