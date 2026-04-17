const express = require("express");
const router = express.Router();
const avoirController = require("../controllers/avoirController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.post("/", authenticate, authorizePermission("avoirs_view"), avoirController.createAvoir);
router.get("/", authenticate, authorizePermission("avoirs_view"), avoirController.getAllAvoirs);
router.get("/:id", authenticate, authorizePermission("avoirs_view"), avoirController.getAvoirById);
router.put("/:id", authenticate, authorizePermission("avoirs_view"), avoirController.updateAvoir);
router.put("/:id/approve", authenticate, authorizePermission("avoirs_view"), avoirController.approveAvoir);
router.put("/:id/reject", authenticate, authorizePermission("avoirs_view"), avoirController.rejectAvoir);
router.put("/:id/reopen", authenticate, authorizePermission("avoirs_view"), avoirController.reopenAvoir);
router.delete("/:id", authenticate, authorizePermission("avoirs_view"), avoirController.deleteAvoir);

router.post("/:id/send-email", authenticate, authorizePermission("avoirs_view"), avoirController.sendAvoirEmail);
router.get("/:id/pdf/download", avoirController.downloadAvoirPdf);

module.exports = router;
