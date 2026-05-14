const express = require("express");
const {
    getBrandingLogo,
    getAllGestionnaires,
    getGestionnaireById,
    createGestionnaire,
    updateGestionnaire,
    deleteGestionnaire,
} = require("../controllers/gestionnaireController");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const upload = require("../middleware/upload");

router.get("/branding/logo", authenticate, getBrandingLogo);
router.get("/", authenticate, authorizePermission("gestionnaires_view"), getAllGestionnaires);
router.get("/:id", authenticate, authorizePermission("gestionnaires_view"), getGestionnaireById);
router.post("/", authenticate, authorizePermission("gestionnaires_view"), upload.single("logo"), createGestionnaire);
router.put("/:id", authenticate, authorizePermission("gestionnaires_view"), upload.single("logo"), updateGestionnaire);
router.delete("/:id", authenticate, authorizePermission("gestionnaires_view"), deleteGestionnaire);


module.exports = router;
