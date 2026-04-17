const express = require("express");
const {
    createDevisGros,
    getAllDevisGros,
    getDevisGrosById,
    updateDevisGros,
    deleteDevisGros,
    approveDevisGros,
    rejectDevisGros,
} = require("../controllers/devisGrosController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

const router = express.Router();

router.get("/", authenticate, authorizePermission("devis_gros_view"), getAllDevisGros);
router.get("/:id", authenticate, authorizePermission("devis_gros_view"), getDevisGrosById);
router.post("/", authenticate, authorizePermission("devis_gros_view"), createDevisGros);
router.put("/:id", authenticate, authorizePermission("devis_gros_view"), updateDevisGros);
router.delete("/:id", authenticate, authorizePermission("devis_gros_view"), deleteDevisGros);
router.put("/:id/approve", authenticate, authorizePermission("devis_gros_view"), approveDevisGros);
router.put("/:id/reject", authenticate, authorizePermission("devis_gros_view"), rejectDevisGros);

module.exports = router;
