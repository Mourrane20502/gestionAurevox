const express = require("express");
const router = express.Router();
const inventoryVerificationController = require("../controllers/inventoryVerificationController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.use(authenticate);

// Créer une vérification (écart enregistré depuis la page Inventaire)
router.post("/", authorizePermission("products_inventory_view"), inventoryVerificationController.create);

// Liste des vérifications (admin/responsable, pour la page Approbations)
router.get("/", authorizePermission("products_inventory_view"), inventoryVerificationController.getAll);

// Dernier retour admin par produit (verifie / a_revoir) pour la page Inventaire
router.get("/resolved", authorizePermission("products_inventory_view"), inventoryVerificationController.getResolved);

// Mettre à jour (message admin, statut)
router.patch("/:id", authorizePermission("products_inventory_view"), inventoryVerificationController.update);

// Supprimer
router.delete("/:id", authorizePermission("products_inventory_view"), inventoryVerificationController.delete);

module.exports = router;
