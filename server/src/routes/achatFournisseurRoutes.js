const express = require("express");
const router = express.Router();
const achatsController = require("../controllers/achatFournisseurController");
const { logProductMovement } = require("../utils/productMovementLogger");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const upload = require("../middleware/upload");

router.get("/", authenticate, authorizePermission("fournisseurs_view"), achatsController.getAllAchats);
router.get("/numero/:numero", authenticate, authorizePermission("fournisseurs_view"), achatsController.getAchatByNumero);
router.get("/:id", authenticate, authorizePermission("fournisseurs_view"), achatsController.getAchatById);
router.post("/batch", authenticate, authorizePermission("fournisseurs_view"), achatsController.createAchatBatch);
router.post("/", authenticate, authorizePermission("fournisseurs_view"), achatsController.createAchat);
router.put("/:id/facture", authenticate, authorizePermission("fournisseurs_view"), upload.single("facture"), achatsController.uploadAchatFacture);
router.delete("/:id/facture", authenticate, authorizePermission("fournisseurs_view"), achatsController.deleteAchatFacture);
router.put("/:id", authenticate, authorizePermission("fournisseurs_view"), achatsController.updateAchat);
router.delete("/:id", authenticate, authorizePermission("fournisseurs_view"), achatsController.deleteAchat);
router.put("/:id/approve", authenticate, authorizePermission("fournisseurs_view"), achatsController.approveAchat);
router.put("/:id/reject", authenticate, authorizePermission("fournisseurs_view"), achatsController.rejectAchat);


module.exports = router;
