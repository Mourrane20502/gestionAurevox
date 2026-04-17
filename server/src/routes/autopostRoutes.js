const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const {
    getPlatformConfigStatus,
    listAutoposts,
    getAutopostById,
    createAutopost,
    cancelAutopost,
    deleteAutopost,
    uploadAutopostMedia,
    aiAssistAutopost,
} = require("../controllers/autopostController");

router.get("/config-status", authenticate, getPlatformConfigStatus);
router.post("/upload-media", authenticate, upload.single("media"), uploadAutopostMedia);
router.post("/ai-assist", authenticate, aiAssistAutopost);
router.get("/", authenticate, listAutoposts);
router.get("/:id", authenticate, getAutopostById);
router.post("/", authenticate, createAutopost);
router.post("/:id/cancel", authenticate, cancelAutopost);
router.delete("/:id", authenticate, deleteAutopost);

module.exports = router;
