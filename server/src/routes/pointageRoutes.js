const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const {
    getAllPointages,
    createPointage,
    updatePointage,
    deletePointage,
} = require("../controllers/pointageController");

router.get("/", authenticate, authorizePermission("paie_view"), getAllPointages);
router.post("/", authenticate, authorizePermission("paie_view"), createPointage);
router.put("/:id", authenticate, authorizePermission("paie_view"), updatePointage);
router.delete("/:id", authenticate, authorizePermission("paie_view"), deletePointage);

module.exports = router;
