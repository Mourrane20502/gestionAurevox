const express = require("express");
const router = express.Router();
const {
    createConge,
    getAllConges,
    getCongeById,
    updateConge,
    approveConge,
    refuseConge,
    deleteConge
} = require("../controllers/congeController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.post("/", authenticate, authorizePermission("conges_view"), createConge);
router.get("/", authenticate, authorizePermission("conges_view"), getAllConges);
router.get("/:id", authenticate, authorizePermission("conges_view"), getCongeById);
router.put("/:id", authenticate, authorizePermission("conges_view"), updateConge);
router.patch("/:id/approve", authenticate, authorizePermission("conges_view"), approveConge);
router.patch("/:id/refuse", authenticate, authorizePermission("conges_view"), refuseConge);
router.delete("/:id", authenticate, authorizePermission("conges_view"), deleteConge);

module.exports = router;
