const db = require("../config/db").promise();

const ADMIN_ROLES = new Set(["admin", "responsable", "superadmin"]);
const getRole = (req) => (req.user?.role || "").toLowerCase();
const isAdminRole = (req) => ADMIN_ROLES.has(getRole(req));
const getFullNameFromUser = (user) => `${user?.nom || ""} ${user?.prenom || ""}`.trim();
let ticketResponsesTableEnsured = false;
let ticketResponsesSchemaCache = null;
let ticketsCreatedByEnsured = false;

const findClientIdByFullName = async (fullName) => {
    if (!fullName) return null;
    const [clients] = await db.execute(
        "SELECT id FROM clients WHERE nom_complet = ? LIMIT 1",
        [fullName]
    );
    return clients?.length ? clients[0].id : null;
};

const ensureClientIdByFullName = async (fullName) => {
    const existingId = await findClientIdByFullName(fullName);
    if (existingId) return existingId;

    const [insertRes] = await db.execute(
        "INSERT INTO clients (nom_complet, `type`) VALUES (?, ?)",
        [fullName, "particulier"]
    );
    return insertRes.insertId;
};

const ensureTicketResponsesTable = async () => {
    if (ticketResponsesTableEnsured) return;
    await db.execute(`
        CREATE TABLE IF NOT EXISTS ticket_responses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ticket_id INT NOT NULL,
            user_id INT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ticket_responses_ticket_id (ticket_id),
            INDEX idx_ticket_responses_user_id (user_id),
            CONSTRAINT fk_ticket_responses_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            CONSTRAINT fk_ticket_responses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    ticketResponsesTableEnsured = true;
};

const ensureTicketsCreatedByColumn = async () => {
    if (ticketsCreatedByEnsured) return;
    const [cols] = await db.execute("SHOW COLUMNS FROM tickets LIKE 'created_by'");
    if (!Array.isArray(cols) || cols.length === 0) {
        await db.execute("ALTER TABLE tickets ADD COLUMN created_by INT NULL AFTER client_id");
    }
    ticketsCreatedByEnsured = true;
};

const getTicketResponsesSchema = async () => {
    if (ticketResponsesSchemaCache) return ticketResponsesSchemaCache;
    const [columns] = await db.execute("SHOW COLUMNS FROM ticket_responses");
    const names = new Set((Array.isArray(columns) ? columns : []).map((c) => String(c?.Field || "").toLowerCase()));
    const pick = (candidates) => candidates.find((c) => names.has(c.toLowerCase())) || null;

    ticketResponsesSchemaCache = {
        messageColumn: pick(["message", "reponse", "response", "contenu", "content"]),
        timestampColumn: pick(["created_at", "date_creation", "date_reponse", "date_response", "response_date"]),
    };
    return ticketResponsesSchemaCache;
};

const getAccessibleTicket = async (req, ticketId) => {
    await ensureTicketsCreatedByColumn();
    let query = "SELECT id, client_id, created_by FROM tickets WHERE id = ?";
    const params = [ticketId];

    if (!isAdminRole(req)) {
        query += " AND created_by = ?";
        params.push(Number(req.user?.id || 0));
    }

    const [rows] = await db.execute(query, params);
    return rows?.length ? rows[0] : null;
};

/* =========================
   GET ALL TICKETS
========================= */
exports.getAllTickets = async (req, res) => {
    try {
        await ensureTicketsCreatedByColumn();
        let query = `
            SELECT t.*, c.nom_complet AS nom, '' AS prenom
            FROM tickets t
            LEFT JOIN clients c ON t.client_id = c.id
        `;
        const params = [];

        if (!isAdminRole(req)) {
            const currentUserId = Number(req.user?.id || 0);
            if (!currentUserId) {
                return res.status(200).json([]);
            }
            query += " WHERE t.created_by = ?";
            params.push(currentUserId);
        }

        query += " ORDER BY t.date_creation DESC";

        const [rows] = await db.execute(query, params);
        res.status(200).json(rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des tickets" });
    }
};

/* =========================
   GET TICKET BY ID
========================= */
exports.getTicketById = async (req, res) => {
    const { id } = req.params;

    try {
        await ensureTicketsCreatedByColumn();
        let query = `
            SELECT t.*, c.nom_complet AS nom, '' AS prenom
            FROM tickets t
            LEFT JOIN clients c ON t.client_id = c.id
            WHERE t.id = ?
        `;
        const params = [id];

        if (!isAdminRole(req)) {
            const currentUserId = Number(req.user?.id || 0);
            if (!currentUserId) {
                return res.status(404).json({ message: "Ticket non trouvé" });
            }
            query += " AND t.created_by = ?";
            params.push(currentUserId);
        }

        const [rows] = await db.execute(query, params);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Ticket non trouvé" });
        }

        res.status(200).json(rows[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

/* =========================
   CREATE TICKET
========================= */
exports.createTicket = async (req, res) => {
    const { sujet, description, priorite, statut, client_id, user_id } = req.body;
    if (!sujet || !description) {
        return res.status(400).json({ message: "Sujet et description sont requis" });
    }

    try {
        await ensureTicketsCreatedByColumn();
        let clientId = null;
        if (client_id) {
            clientId = Number(client_id);
            const [existingClient] = await db.execute(
                "SELECT id FROM clients WHERE id = ? LIMIT 1",
                [clientId]
            );
            if (!existingClient?.length) {
                return res.status(400).json({ message: "Client invalide" });
            }
        } else if (user_id) {
            const [users] = await db.execute(
                "SELECT nom, prenom FROM users WHERE id = ? LIMIT 1",
                [Number(user_id)]
            );
            if (!users?.length) {
                return res.status(400).json({ message: "Utilisateur invalide" });
            }

            const fullName = getFullNameFromUser(users[0]);
            if (!fullName) {
                return res.status(400).json({ message: "Utilisateur invalide" });
            }

            clientId = await ensureClientIdByFullName(fullName);
        } else {
            // fallback: associer au créateur du ticket
            const fullName = getFullNameFromUser(req.user);
            if (!fullName) {
                return res.status(400).json({ message: "Impossible de déterminer le client pour ce ticket." });
            }
            clientId = await ensureClientIdByFullName(fullName);
        }

        const [result] = await db.execute(
            `INSERT INTO tickets 
             (client_id, created_by, sujet, description, priorite, statut) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                clientId,
                Number(req.user?.id || 0) || null,
                sujet,
                description,
                priorite || "moyenne",
                statut || "ouvert"
            ]
        );

        res.status(201).json({
            message: "Ticket créé avec succès",
            id: result.insertId
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur lors de la création du ticket" });
    }
};

/* =========================
   UPDATE TICKET (Generic)
========================= */
exports.updateTicket = async (req, res) => {
    const { id } = req.params;
    const { sujet, description, statut, priorite } = req.body;

    try {
        let query = "UPDATE tickets SET date_mise_a_jour = CURRENT_TIMESTAMP";
        const params = [];

        if (sujet) {
            query += ", sujet = ?";
            params.push(sujet);
        }
        if (description) {
            query += ", description = ?";
            params.push(description);
        }
        if (statut) {
            query += ", statut = ?";
            params.push(statut);
        }
        if (priorite) {
            query += ", priorite = ?";
            params.push(priorite);
        }

        query += " WHERE id = ?";
        params.push(id);

        if (!isAdminRole(req)) {
            const fullName = getFullNameFromUser(req.user);
            const clientId = await findClientIdByFullName(fullName);
            if (!clientId) {
                return res.status(404).json({ message: "Ticket non trouvé ou non autorisé" });
            }
            query += " AND client_id = ?";
            params.push(clientId);
        }

        const [result] = await db.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Ticket non trouvé ou non autorisé" });
        }

        res.status(200).json({ message: "Ticket mis à jour avec succès" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur lors de la mise à jour du ticket" });
    }
};

/* =========================
   ADMIN RESPOND (change statut)
========================= */
exports.respondToTicket = async (req, res) => {
    const { id } = req.params;
    const { statut } = req.body;

    if (!isAdminRole(req)) {
        return res.status(403).json({
            message: "Seul l'administrateur peut modifier ce ticket"
        });
    }

    try {
        const [result] = await db.execute(
            `UPDATE tickets 
             SET statut = ?, date_mise_a_jour = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [statut || "en_cours", id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Ticket non trouvé" });
        }

        res.status(200).json({ message: "Statut mis à jour" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

/* =========================
   UPDATE TICKET STATUS
========================= */
exports.updateTicketStatus = async (req, res) => {
    const { id } = req.params;
    const { statut } = req.body;

    try {
        let query = `
            UPDATE tickets 
            SET statut = ?, date_mise_a_jour = CURRENT_TIMESTAMP 
            WHERE id = ?
        `;
        const params = [statut, id];

        if (!isAdminRole(req)) {
            const fullName = getFullNameFromUser(req.user);
            const clientId = await findClientIdByFullName(fullName);
            if (!clientId) {
                return res.status(404).json({ message: "Ticket non trouvé" });
            }
            query += " AND client_id = ?";
            params.push(clientId);
        }

        const [result] = await db.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Ticket non trouvé" });
        }

        res.status(200).json({ message: "Statut mis à jour" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

/* =========================
   LIST ASSIGNEES
========================= */
exports.getAssignableUsers = async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT id, nom, prenom, email, role FROM users ORDER BY nom ASC, prenom ASC"
        );
        return res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Erreur serveur" });
    }
};

/* =========================
   TICKET RESPONSES
========================= */
exports.getTicketResponses = async (req, res) => {
    const ticketId = Number(req.params.id);
    if (!ticketId) {
        return res.status(400).json({ message: "ID ticket invalide" });
    }

    try {
        await ensureTicketResponsesTable();
        const schema = await getTicketResponsesSchema();
        const ticket = await getAccessibleTicket(req, ticketId);
        if (!ticket) {
            return res.status(404).json({ message: "Ticket non trouvé ou non autorisé" });
        }
        if (!schema.messageColumn) {
            return res.status(500).json({ message: "Structure ticket_responses invalide: colonne message absente" });
        }

        const tsSelect = schema.timestampColumn
            ? `tr.${schema.timestampColumn} AS created_at`
            : "NULL AS created_at";
        const orderBy = schema.timestampColumn
            ? `tr.${schema.timestampColumn} ASC, tr.id ASC`
            : "tr.id ASC";

        const [rows] = await db.execute(
            `SELECT tr.id, tr.ticket_id, tr.user_id, tr.${schema.messageColumn} AS message, ${tsSelect},
                    u.nom, u.prenom, u.role
             FROM ticket_responses tr
             LEFT JOIN users u ON u.id = tr.user_id
             WHERE tr.ticket_id = ?
             ORDER BY ${orderBy}`,
            [ticketId]
        );
        return res.status(200).json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Erreur serveur lors du chargement des réponses" });
    }
};

exports.addTicketResponse = async (req, res) => {
    const ticketId = Number(req.params.id);
    const message = String(req.body?.message || "").trim();
    if (!ticketId) {
        return res.status(400).json({ message: "ID ticket invalide" });
    }
    if (!message) {
        return res.status(400).json({ message: "Message requis" });
    }

    try {
        await ensureTicketResponsesTable();
        const schema = await getTicketResponsesSchema();
        const ticket = await getAccessibleTicket(req, ticketId);
        if (!ticket) {
            return res.status(404).json({ message: "Ticket non trouvé ou non autorisé" });
        }
        if (!schema.messageColumn) {
            return res.status(500).json({ message: "Structure ticket_responses invalide: colonne message absente" });
        }

        const [insertRes] = await db.execute(
            `INSERT INTO ticket_responses (ticket_id, user_id, ${schema.messageColumn}) VALUES (?, ?, ?)`,
            [ticketId, req.user.id, message]
        );

        // Keep ticket active when a new message arrives.
        await db.execute(
            "UPDATE tickets SET statut = IF(statut = 'resolu', 'en_cours', statut), date_mise_a_jour = CURRENT_TIMESTAMP WHERE id = ?",
            [ticketId]
        );

        return res.status(201).json({
            message: "Réponse ajoutée",
            id: insertRes.insertId,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Erreur serveur lors de l'ajout de la réponse" });
    }
};
