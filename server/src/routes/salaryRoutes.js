const express = require("express");
const router = express.Router();
const { createSalary, getAllSalaries, getSalaryById, updateSalary, deleteSalary } = require("../controllers/salaryController");

const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.post("/", authenticate, authorizePermission("salaries_view"), createSalary);
router.get("/", authenticate, authorizePermission("salaries_view"), getAllSalaries);
router.get("/:id", authenticate, authorizePermission("salaries_view"), getSalaryById);
router.put("/:id", authenticate, authorizePermission("salaries_view"), updateSalary);
router.delete("/:id", authenticate, authorizePermission("salaries_view"), deleteSalary);

module.exports = router;
