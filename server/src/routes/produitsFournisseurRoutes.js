const express = require("express");
const router = express.Router();
const { getAllProduitsFournisseurs } = require("../controllers/produitsFournisseurController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

// On réutilise la permission fournisseurs_view pour limiter l'accès
router.get("/", authenticate, authorizePermission("fournisseurs_view"), getAllProduitsFournisseurs);

module.exports = router;

