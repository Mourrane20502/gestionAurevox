const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorizeMiddleware");

const { 
    getNumberingSettings, 
    updateNumberingSettings,
    getPaymentModes,
    addPaymentMode,
    deletePaymentMode,
    getApprovalConfigs,
    updateApprovalConfigs,
    getMyApprovalRights,
    getAutoApprovalSetting,
    updateAutoApprovalSetting,
    getDashboardVisibility,
    updateDashboardVisibility,
    getFacebookSettings,
    updateFacebookSettings,
    getMetalPricing,
    updateMetalPricing,
    getProductActions,
    updateProductActions,
    getSousSocietes,
    addSousSociete,
    updateSousSociete,
    deleteSousSociete,
} = require("../controllers/settingsController");

// Numbering settings
router.get("/numbering", authorize("admin", "responsable", "directeur"), getNumberingSettings);
router.put("/numbering", authorize("admin", "responsable", "directeur"), updateNumberingSettings);

// Payment modes
router.get("/payment-modes", authorize("admin", "responsable", "directeur"), getPaymentModes);
router.post("/payment-modes", authorize("admin", "responsable", "directeur"), addPaymentMode);
router.delete("/payment-modes/:id", authorize("admin", "responsable", "directeur"), deletePaymentMode);

// Approval configurations
router.get("/approval", authorize("admin", "responsable", "directeur"), getApprovalConfigs);
router.put("/approval", authorize("admin", "responsable", "directeur"), updateApprovalConfigs);

// Current user's rights - Accessible to all roles including Commercial (user)
router.get("/my-approval-rights", getMyApprovalRights);

// Time-based auto-approval settings
router.get("/auto-approval", authorize("admin", "responsable", "directeur"), getAutoApprovalSetting);
router.put("/auto-approval", authorize("admin", "responsable", "directeur"), updateAutoApprovalSetting);

// Dashboard visibility settings
router.get("/dashboard-visibility", getDashboardVisibility);
router.put("/dashboard-visibility", authorize("admin", "responsable", "directeur"), updateDashboardVisibility);

// Facebook autopost settings
router.get("/facebook", authorize("admin", "responsable", "directeur"), getFacebookSettings);
router.put("/facebook", authorize("admin", "responsable", "directeur"), updateFacebookSettings);

// Tarifs or / silver (DH/g) — lecture pour tous les utilisateurs connectés, écriture admin
router.get("/metal-pricing", getMetalPricing);
router.put("/metal-pricing", authorize("admin"), updateMetalPricing);

// Actions produits (modifier/supprimer) par rôle
router.get("/product-actions", getProductActions);
router.put("/product-actions", authorize("admin"), updateProductActions);

// Sous-sociétés
router.get("/sous-societes", authorize("admin", "responsable", "directeur"), getSousSocietes);
router.post("/sous-societes", authorize("admin", "responsable", "directeur"), addSousSociete);
router.put("/sous-societes/:id", authorize("admin", "responsable", "directeur"), updateSousSociete);
router.delete("/sous-societes/:id", authorize("admin", "responsable", "directeur"), deleteSousSociete);

module.exports = router;


