const express = require("express");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const upload = require("../middleware/upload");
const {
    getContrats,
    getContratById,
    createContrat,
    updateContrat,
    deleteContrat,
} = require("../controllers/contratController");

const router = express.Router();

router.get("/", authenticate, authorizePermission("contrat_view"), getContrats);
router.get("/:id", authenticate, authorizePermission("contrat_view"), getContratById);
router.post("/", authenticate, authorizePermission("contrat_view"), upload.single("pdf"), createContrat);
router.put("/:id", authenticate, authorizePermission("contrat_view"), upload.single("pdf"), updateContrat);
router.delete("/:id", authenticate, authorizePermission("contrat_view"), deleteContrat);

module.exports = router;
