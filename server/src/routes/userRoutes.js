const express = require("express");
const { createUser, getAllUsers, getUserById, updateUser, deleteUser, getCurrentUser, updateCurrentUser, changePassword } = require("../controllers/userController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const router = express.Router();

// Profil de l'utilisateur courant (sans permission spéciale)
router.get("/me", authenticate, getCurrentUser);
router.put("/me", authenticate, updateCurrentUser);
router.post("/me/change-password", authenticate, changePassword);

// Routes d'administration des utilisateurs
router.post("/create-user", authenticate, authorizePermission("users_view"), createUser);
router.get("/all-users", authenticate, authorizePermission("users_view"), getAllUsers);
router.get("/:id", authenticate, authorizePermission("users_view"), getUserById);
router.put("/:id", authenticate, authorizePermission("users_view"), updateUser);
router.delete("/:id", authenticate, authorizePermission("users_view"), deleteUser);

module.exports = router;
