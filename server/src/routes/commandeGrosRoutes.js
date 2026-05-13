const express = require("express");
const {
    createCommandeGros,
    getAllCommandeGros,
    getCommandeGrosById,
    updateCommandeGros,
    deleteCommandeGros,
    approveCommandeGros,
    rejectCommandeGros,
} = require("../controllers/commandeGrosController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const authorizeCommandesGrosOrApprovals = authorizePermission.authorizeAnyPermission([
    "commandes_gros_view",
    "approvals_view",
]);

const router = express.Router();

router.get("/", authenticate, authorizeCommandesGrosOrApprovals, getAllCommandeGros);
router.get("/:id", authenticate, authorizeCommandesGrosOrApprovals, getCommandeGrosById);
router.post("/", authenticate, authorizePermission("commandes_gros_view"), createCommandeGros);
router.put("/:id", authenticate, authorizePermission("commandes_gros_view"), updateCommandeGros);
router.delete("/:id", authenticate, authorizePermission("commandes_gros_view"), deleteCommandeGros);
router.put("/:id/approve", authenticate, authorizeCommandesGrosOrApprovals, approveCommandeGros);
router.put("/:id/reject", authenticate, authorizeCommandesGrosOrApprovals, rejectCommandeGros);

module.exports = router;
