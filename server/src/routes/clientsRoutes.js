const express = require("express");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");
const {
	getAllClients,
	createClient,
	deleteClient,
	updateClient,
	getClientProducts,
	getClientsImportTemplateColumns,
	importClients,
	sendNewsletterCampaign,
} = require("../controllers/clientsController");
const router = express.Router();

router.get("/", authenticate, authorizePermission("clients_view"), getAllClients);
router.get("/import-template-columns", authenticate, authorizePermission("clients_view"), getClientsImportTemplateColumns);
router.post("/import", authenticate, authorizePermission("clients_view"), importClients);
router.post("/newsletter/send", authenticate, authorizePermission("clients_view"), sendNewsletterCampaign);
router.get("/:id/products", authenticate, authorizePermission("clients_view"), getClientProducts);
router.post("/", authenticate, authorizePermission("clients_view"), createClient);
router.put("/:id", authenticate, authorizePermission("clients_view"), updateClient);
router.delete("/:id", authenticate, authorizePermission("clients_view"), deleteClient);

module.exports = router;
