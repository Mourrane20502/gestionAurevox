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
} = require("../controllers/bonLivraisonController");

router.get("/", authenticate, authorizePermission("commandes_view"), getAllBonsLivraison);
router.get("/:id", authenticate, authorizePermission("commandes_view"), getBonLivraisonById);
router.post("/from-commande/:commandeId", authenticate, authorizePermission("commandes_view"), createBonLivraisonFromCommande);
router.put("/:id", authenticate, authorizePermission("commandes_view"), updateBonLivraison);
router.delete("/:id", authenticate, authorizePermission("commandes_view"), deleteBonLivraison);
router.put("/:id/approve", authenticate, authorizePermission("commandes_view"), approveBonLivraison);
router.put("/:id/reject", authenticate, authorizePermission("commandes_view"), rejectBonLivraison);

module.exports = router;
