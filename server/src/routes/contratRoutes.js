const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const upload = require("../middleware/upload");
const {
    createContrat,
    getAllContrats,
    getContratById,
    updateContrat,
    deleteContrat,
    uploadContratPdf,
} = require("../controllers/contratController");

router.post("/pdf/upload", authenticate, authorizePermission("clients_view"), upload.single("pdf"), uploadContratPdf);
router.post("/", authenticate, authorizePermission("clients_view"), createContrat);
router.get("/", authenticate, authorizePermission("clients_view"), getAllContrats);
router.get("/:id", authenticate, authorizePermission("clients_view"), getContratById);
router.put("/:id", authenticate, authorizePermission("clients_view"), updateContrat);
router.delete("/:id", authenticate, authorizePermission("clients_view"), deleteContrat);

module.exports = router;
