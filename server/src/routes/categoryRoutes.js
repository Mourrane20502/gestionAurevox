const express = require("express");
const router = express.Router();
const { createCategory, getAllCategories, updateCategory, getCategoryById, deleteCategory } = require("../controllers/categoryController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.post("/", authenticate, authorizePermission("categories_view"), createCategory);
router.get("/", authenticate, authorizePermission("categories_view"), getAllCategories);
router.get("/:id", authenticate, authorizePermission("categories_view"), getCategoryById);
router.put("/:id", authenticate, authorizePermission("categories_view"), updateCategory);
router.delete("/:id", authenticate, authorizePermission("categories_view"), deleteCategory);

module.exports = router;
