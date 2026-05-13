const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const upload = require("../middleware/upload");
const {
    createReglementClientGros,
    getAllReglementsClientsGros,
    getReglementClientGrosById,
    approveReglementClientGros,
    rejectReglementClientGros,
    markReglementClientGrosImpaye,
    getSituationReglementClientGros,
    uploadReglementClientGrosPdf,
} = require("../controllers/reglementClientGrosController");

router.post("/", authenticate, authorizePermission("reglements_view"), createReglementClientGros);
router.get("/", authenticate, authorizePermission("reglements_view"), getAllReglementsClientsGros);
router.get("/situation", authenticate, authorizePermission("reglements_view"), getSituationReglementClientGros);
router.get("/:id", authenticate, authorizePermission("reglements_view"), getReglementClientGrosById);
router.put("/:id/approve", authenticate, authorizePermission("reglements_approve"), approveReglementClientGros);
router.put("/:id/reject", authenticate, authorizePermission("reglements_approve"), rejectReglementClientGros);
router.put("/:id/impaye", authenticate, authorizePermission("reglements_approve"), markReglementClientGrosImpaye);
router.post("/:id/pdf/upload", authenticate, authorizePermission("reglements_view"), upload.single("pdf"), uploadReglementClientGrosPdf);

module.exports = router;
