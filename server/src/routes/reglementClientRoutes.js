const express = require("express");
const router = express.Router();

const {
    createReglementClient,
    getAllReglementsClients,
    getReglementClientById,
    approveReglementClient,
    rejectReglementClient,
    updateReglementClient,
    deleteReglementClient,
    getSituationReglement,
    markReglementImpaye,
    sendReglementEmail,
    downloadReglementClientPdf,
    uploadReglementClientPdf,
} = require("../controllers/reglementClientController");

const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const upload = require("../middleware/upload");

router.post(
    "/",
    authenticate,
    authorizePermission("reglements_view"),
    createReglementClient
);

router.get(
    "/",
    authenticate,
    authorizePermission("reglements_view"),
    getAllReglementsClients
);

router.get(
    "/situation",
    authenticate,
    authorizePermission("reglements_view"),
    getSituationReglement
);

router.get(
    "/:id",
    authenticate,
    authorizePermission("reglements_view"),
    getReglementClientById
);

router.put(
    "/:id/approve",
    authenticate,
    authorizePermission("reglements_approve"),
    approveReglementClient
);

router.put(
    "/:id/reject",
    authenticate,
    authorizePermission("reglements_approve"),
    rejectReglementClient
);

router.put(
    "/:id",
    authenticate,
    authorizePermission("reglements_approve"),
    updateReglementClient
);

router.delete(
    "/:id",
    authenticate,
    authorizePermission("reglements_approve"),
    deleteReglementClient
);

router.put(
    "/:id/impaye",
    authenticate,
    authorizePermission("reglements_approve"),
    markReglementImpaye
);

router.post(
    "/:id/send-email",
    authenticate,
    authorizePermission("reglements_view"),
    sendReglementEmail
);

router.get(
    "/:id/pdf/download",
    downloadReglementClientPdf
);

router.post(
    "/:id/pdf/upload",
    authenticate,
    authorizePermission("reglements_view"),
    upload.single("pdf"),
    uploadReglementClientPdf
);

module.exports = router;

