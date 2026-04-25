const express = require("express");
const router = express.Router();
const remboursementController = require("../controllers/remboursementController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.get("/", authenticate, authorizePermission("commandes_view"), remboursementController.getAllRemboursements);
router.get("/commandes-payees-non-facturees", authenticate, authorizePermission("commandes_view"), remboursementController.getCommandesPayeesNonFacturees);
router.get("/:id", authenticate, authorizePermission("commandes_view"), remboursementController.getRemboursementById);
router.post("/", authenticate, authorizePermission("commandes_view"), remboursementController.store);
router.put("/:id", authenticate, authorizePermission("commandes_view"), remboursementController.update);
router.put("/:id/valider", authenticate, remboursementController.valider);
router.put("/:id/rejeter", authenticate, remboursementController.rejeter);
router.delete("/:id", authenticate, remboursementController.destroy);

module.exports = router;
