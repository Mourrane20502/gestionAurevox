const express = require("express");
const router = express.Router();
const { getAllFournisseurs, getFournisseurById, createFournisseur, updateFournisseur, deleteFournisseur } = require("../controllers/fournisseursController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const upload = require("../middleware/upload");

router.get("/", authenticate, authorizePermission("fournisseurs_view"), getAllFournisseurs);
router.get("/:id", authenticate, authorizePermission("fournisseurs_view"), getFournisseurById);
router.post("/", authenticate, authorizePermission("fournisseurs_view"), upload.single("regularite_pdf"), createFournisseur);
router.put("/:id", authenticate, authorizePermission("fournisseurs_view"), upload.single("regularite_pdf"), updateFournisseur);
router.delete("/:id", authenticate, authorizePermission("fournisseurs_view"), deleteFournisseur);

module.exports = router;
