const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const {
    createPointage,
    getAllPointages,
    getPointageLookups,
    getPointageById,
    updatePointage,
    deletePointage,
} = require("../controllers/pointageController");

router.get("/lookup", authenticate, authorizePermission("pointage_view"), getPointageLookups);
router.post("/", authenticate, authorizePermission("pointage_view"), createPointage);
router.get("/", authenticate, authorizePermission("pointage_view"), getAllPointages);
router.get("/:id", authenticate, authorizePermission("pointage_view"), getPointageById);
router.put("/:id", authenticate, authorizePermission("pointage_view"), updatePointage);
router.delete("/:id", authenticate, authorizePermission("pointage_view"), deletePointage);

module.exports = router;
