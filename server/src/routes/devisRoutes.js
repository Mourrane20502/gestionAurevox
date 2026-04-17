const express = require("express");
const { createDevis, getAllDevis, getDevisById, updateDevis, deleteDevis, getNextDevisNumber, approveDevis, rejectDevis, sendDevisEmail, downloadDevisPdf } = require("../controllers/devisController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const router = express.Router();

router.get("/", authenticate, getAllDevis);
router.get("/next-number", authenticate, getNextDevisNumber);
router.get("/:id", authenticate, getDevisById);
// Route publique ou basique pour télécharger (selon les besoins de "donner un lien")
// Ici on ne met pas obligatoirement d'authentification complète si l'URL doit être partageable, mais par sécurité on peut commencer avec authenticate.
router.get("/:id/pdf/download", downloadDevisPdf);

router.post("/", authenticate, authorizePermission("devis_view"), createDevis);
router.put("/:id", authenticate, authorizePermission("devis_view"), updateDevis);
router.delete("/:id", authenticate, authorizePermission("devis_view"), deleteDevis);
router.put("/:id/approve", authenticate, authorizePermission("devis_view"), approveDevis);
router.put("/:id/reject", authenticate, authorizePermission("devis_view"), rejectDevis);
router.post("/:id/send-email", authenticate, authorizePermission("devis_view"), sendDevisEmail);

module.exports = router;
