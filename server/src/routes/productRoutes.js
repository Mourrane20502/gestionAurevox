const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorize = require("../middleware/authorizeMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const {
	createProduct,
	getAllProducts,
	getProductById,
	updateProduct,
	deleteProduct,
	getProductsImportTemplateColumns,
	importProducts,
} = require("../controllers/productsController");
const upload = require("../middleware/upload");

router.post("/", authenticate, authorizePermission("products_view"), upload.single("photo"), createProduct);
router.get("/", authenticate, authorizePermission("products_view"), getAllProducts);
router.get("/import-template-columns", authenticate, authorizePermission("products_view"), getProductsImportTemplateColumns);
router.post("/import", authenticate, authorizePermission("products_view"), importProducts);
router.get("/:id", authenticate, authorizePermission("products_view"), getProductById);
router.put("/:id", authenticate, authorizePermission("products_view"), upload.single("photo"), updateProduct);
router.delete("/:id", authenticate, authorizePermission("products_view"), deleteProduct);

module.exports = router;
