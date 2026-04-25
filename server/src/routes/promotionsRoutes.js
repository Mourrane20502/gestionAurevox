const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const { 
    getAllPromotions, 
    createPromotion, 
    updatePromotion, 
    deletePromotion, 
    sendNotification 
} = require("../controllers/promotionsController");

router.get("/", authenticate, getAllPromotions);
router.post("/", authenticate, authorizePermission("settings_view"), createPromotion);
router.put("/:id", authenticate, authorizePermission("settings_view"), updatePromotion);
router.delete("/:id", authenticate, authorizePermission("settings_view"), deletePromotion);
router.post("/notify", authenticate, authorizePermission("settings_view"), sendNotification);

module.exports = router;
