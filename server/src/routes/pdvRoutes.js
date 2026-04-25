const express = require("express");
const router = express.Router();
const { createPdv, getAllPdv, getPdvById, updatePdv, deletePdv, getProductsByPdv } = require("../controllers/pdvController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const authorize = require("../middleware/authorizeMiddleware");
const upload = require("../middleware/upload");

router.post("/", authenticate, authorize("superadmin", "admin"), upload.single("logo"), createPdv);
router.get("/", authenticate, authorizePermission("pdv_view"), getAllPdv);
router.get("/:id", authenticate, authorizePermission("pdv_view"), getPdvById);
router.get("/:id/products", authenticate, authorizePermission("pdv_view"), getProductsByPdv);
router.put("/:id", authenticate, authorize("superadmin", "admin"), upload.single("logo"), updatePdv);
router.delete("/:id", authenticate, authorize("superadmin", "admin"), deletePdv);

module.exports = router;
