const express = require("express");
const {
    createCommandeGros,
    getAllCommandeGros,
    getCommandeGrosById,
    updateCommandeGros,
    deleteCommandeGros,
    approveCommandeGros,
    rejectCommandeGros,
} = require("../controllers/commandeGrosController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

const router = express.Router();

router.get("/", authenticate, authorizePermission("commandes_gros_view"), getAllCommandeGros);
router.get("/:id", authenticate, authorizePermission("commandes_gros_view"), getCommandeGrosById);
router.post("/", authenticate, authorizePermission("commandes_gros_view"), createCommandeGros);
router.put("/:id", authenticate, authorizePermission("commandes_gros_view"), updateCommandeGros);
router.delete("/:id", authenticate, authorizePermission("commandes_gros_view"), deleteCommandeGros);
router.put("/:id/approve", authenticate, authorizePermission("commandes_gros_view"), approveCommandeGros);
router.put("/:id/reject", authenticate, authorizePermission("commandes_gros_view"), rejectCommandeGros);

module.exports = router;
