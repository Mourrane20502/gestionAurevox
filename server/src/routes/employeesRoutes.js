const express = require("express");
const router = express.Router();
const { createEmployee, getAllEmployees, getEmployeeById, updateEmployee, deleteEmployee } = require("../controllers/employeesController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.post("/", authenticate, authorizePermission("employees_view"), createEmployee);
router.get("/", authenticate, authorizePermission("employees_view"), getAllEmployees);
router.get("/:id", authenticate, authorizePermission("employees_view"), getEmployeeById);
router.put("/:id", authenticate, authorizePermission("employees_view"), updateEmployee);
router.delete("/:id", authenticate, authorizePermission("employees_view"), deleteEmployee);

module.exports = router;
