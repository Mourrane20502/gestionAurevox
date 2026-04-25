const express = require("express");
const router = express.Router();
const controller = require("../controllers/productTypesController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.get("/", authenticate, controller.getAllProductTypes);
router.post("/", authenticate, authorizePermission("all_settings"), controller.createProductType);
router.put("/:id", authenticate, authorizePermission("all_settings"), controller.updateProductType);
router.delete("/:id", authenticate, authorizePermission("all_settings"), controller.deleteProductType);

module.exports = router;
