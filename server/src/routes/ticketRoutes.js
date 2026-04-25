const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticketController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

// All routes are protected
router.use(authenticate);

// Client & Admin: Get all tickets (filtered by user_id for clients)
router.get("/", authorizePermission("tickets_view"), ticketController.getAllTickets);

// Admin: List users that can be assigned tickets
router.get("/assignees", authorizePermission("tickets_view"), ticketController.getAssignableUsers);

// Client & Admin: Get specific ticket
router.get("/:id", authorizePermission("tickets_view"), ticketController.getTicketById);

// Client: Create new ticket
router.post("/", authorizePermission("tickets_view"), ticketController.createTicket);

// Admin: Respond to ticket
router.put("/:id/respond", authorizePermission("tickets_view"), ticketController.respondToTicket);

// Ticket conversation responses
router.get("/:id/responses", authorizePermission("tickets_view"), ticketController.getTicketResponses);
router.post("/:id/responses", authorizePermission("tickets_view"), ticketController.addTicketResponse);

// Client & Admin: Update ticket details (sujet, description, status, priority)
router.put("/:id", authorizePermission("tickets_view"), ticketController.updateTicket);

// Client & Admin: Update status
router.patch("/:id/status", authorizePermission("tickets_view"), ticketController.updateTicketStatus);

module.exports = router;
