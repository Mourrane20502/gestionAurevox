const express = require("express");
const { getRoles, getPermissions, getRolePermissions, updateRolePermissions } = require("../controllers/rolePermissionController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const router = express.Router();

router.get("/roles", authenticate, authorizePermission("settings_view"), getRoles);
router.get("/permissions", authenticate, authorizePermission("settings_view"), getPermissions);
router.get("/role-permissions/:roleId", authenticate, authorizePermission("settings_view"), getRolePermissions);
router.post("/update-role-permissions", authenticate, authorizePermission("settings_view"), updateRolePermissions);

module.exports = router;
