const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const controller = require("../controllers/avoirGrosController");

router.post("/", authenticate, authorizePermission("avoirs_gros_view"), controller.createAvoirGros);
router.get("/", authenticate, authorizePermission("avoirs_gros_view"), controller.getAllAvoirsGros);
router.get("/:id", authenticate, authorizePermission("avoirs_gros_view"), controller.getAvoirGrosById);
router.put("/:id", authenticate, authorizePermission("avoirs_gros_view"), controller.updateAvoirGros);
router.put("/:id/approve", authenticate, authorizePermission("avoirs_gros_view"), controller.approveAvoirGros);
router.put("/:id/reject", authenticate, authorizePermission("avoirs_gros_view"), controller.rejectAvoirGros);
router.put("/:id/reopen", authenticate, authorizePermission("avoirs_gros_view"), controller.reopenAvoirGros);
router.delete("/:id", authenticate, authorizePermission("avoirs_gros_view"), controller.deleteAvoirGros);

module.exports = router;
