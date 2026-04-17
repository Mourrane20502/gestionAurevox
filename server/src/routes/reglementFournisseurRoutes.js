const express = require("express");
const router = express.Router();

const {
    createReglementFournisseur,
    getAllReglementsFournisseurs,
    getReglementFournisseurById,
    approveReglementFournisseur,
    rejectReglementFournisseur,
    getSituationReglementFournisseur,
    sendReglementEmail,
} = require("../controllers/reglementFournisseurController");

const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.post(
    "/",
    authenticate,
    authorizePermission("fournisseurs_view"),
    createReglementFournisseur
);

router.get(
    "/",
    authenticate,
    authorizePermission("fournisseurs_view"),
    getAllReglementsFournisseurs
);

router.get(
    "/situation",
    authenticate,
    authorizePermission("fournisseurs_view"),
    getSituationReglementFournisseur
);

router.get(
    "/:id",
    authenticate,
    authorizePermission("fournisseurs_view"),
    getReglementFournisseurById
);

router.put(
    "/:id/approve",
    authenticate,
    authorizePermission("fournisseurs_view"),
    approveReglementFournisseur
);

router.put(
    "/:id/reject",
    authenticate,
    authorizePermission("fournisseurs_view"),
    rejectReglementFournisseur
);

router.post(
    "/:id/send-email",
    authenticate,
    authorizePermission("fournisseurs_view"),
    sendReglementEmail
);

module.exports = router;

