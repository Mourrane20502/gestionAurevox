const db = require("../config/db").promise();
const { canApprove } = require("../utils/approvalSettings");

/**
 * List remboursements with commande and user info
 * - Admin / direction: voient tout
 * - Autres utilisateurs: voient uniquement les remboursements qu'ils ont créés
 */
exports.getAllRemboursements = async (req, res) => {
    try {
        const role = (req.user.role || "").toString().toLowerCase();
        const isManager =
            role === "admin" || role === "directeur" || role === "responsable" || role === "superadmin";

        let sql = `
            SELECT r.*,
                   c.numero_commande,
                   ss.NOM_SOUS_SOCIETE AS sous_societe_nom,
                   c.statut AS commande_statut,
                   c.montant_ttc AS commande_montant_ttc,
                   (
                       SELECT COALESCE(SUM(rc.montant), 0)
                       FROM reglements_clients rc
                       WHERE rc.commande_id = c.id AND rc.statut = 'approuve'
                   ) AS commande_total_regle,
                   GREATEST(
                       c.montant_ttc - (
                           SELECT COALESCE(SUM(rc2.montant), 0)
                           FROM reglements_clients rc2
                           WHERE rc2.commande_id = c.id AND rc2.statut = 'approuve'
                       ),
                       0
                   ) AS commande_reste_a_payer,
                   cl.nom_complet AS client_nom,
                   u_created.prenom AS created_by_prenom,
                   u_created.nom AS created_by_nom,
                   u_valide.prenom AS valide_par_prenom,
                   u_valide.nom AS valide_par_nom
            FROM remboursements r
            JOIN commandes c ON c.id = r.commande_id
            LEFT JOIN point_de_vente pdv ON pdv.id = c.point_de_vente_id
            LEFT JOIN sous_societe ss ON ss.ID = pdv.id_sous_gestionnaire
            LEFT JOIN clients cl ON c.client_id = cl.id
            LEFT JOIN users u_created ON r.created_by = u_created.id
            LEFT JOIN users u_valide ON r.valide_par = u_valide.id
        `;

        const allowedToApprove = await canApprove(req.user.role, 'remboursements');
        const params = [];
        if (!isManager) {
            if (allowedToApprove) {
                // Un approvateur voit ses propres demandes + celles en attente
                sql += " WHERE (r.created_by = ? OR r.statut = 'en_attente')";
                params.push(req.user.id);
            } else {
                // Un utilisateur "normal" ne voit que ses propres demandes
                sql += " WHERE r.created_by = ?";
                params.push(req.user.id);
            }
        }

        sql += " ORDER BY r.created_at DESC";

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching remboursements:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get one remboursement by id
 */
exports.getRemboursementById = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT r.*,
                   c.numero_commande,
                   ss.NOM_SOUS_SOCIETE AS sous_societe_nom,
                   c.statut AS commande_statut,
                   c.montant_ttc AS commande_montant_ttc,
                   (
                       SELECT COALESCE(SUM(rc.montant), 0)
                       FROM reglements_clients rc
                       WHERE rc.commande_id = c.id AND rc.statut = 'approuve'
                   ) AS commande_total_regle,
                   GREATEST(
                       c.montant_ttc - (
                           SELECT COALESCE(SUM(rc2.montant), 0)
                           FROM reglements_clients rc2
                           WHERE rc2.commande_id = c.id AND rc2.statut = 'approuve'
                       ),
                       0
                   ) AS commande_reste_a_payer,
                   cl.nom_complet AS client_nom,
                   u_created.prenom AS created_by_prenom,
                   u_created.nom AS created_by_nom,
                   u_valide.prenom AS valide_par_prenom,
                   u_valide.nom AS valide_par_nom
            FROM remboursements r
            JOIN commandes c ON c.id = r.commande_id
            LEFT JOIN point_de_vente pdv ON pdv.id = c.point_de_vente_id
            LEFT JOIN sous_societe ss ON ss.ID = pdv.id_sous_gestionnaire
            LEFT JOIN clients cl ON c.client_id = cl.id
            LEFT JOIN users u_created ON r.created_by = u_created.id
            LEFT JOIN users u_valide ON r.valide_par = u_valide.id
            WHERE r.id = ?
        `, [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Remboursement non trouvé" });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("Error fetching remboursement:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * List commandes that are paid (have approved reglements) and not invoiced (no facture)
 * Used for dropdown when creating a refund request
 */
exports.getCommandesPayeesNonFacturees = async (req, res) => {
    try {
        const role = (req.user.role || "").toString().toLowerCase();
        const isManager =
            role === "admin" || role === "directeur" || role === "responsable" || role === "superadmin";

        let sql = `
            SELECT c.id,
                   c.numero_commande,
                   c.montant_ttc,
                   cl.nom_complet AS client_nom,
                   COALESCE(SUM(rc.montant), 0) AS total_regle
            FROM commandes c
            LEFT JOIN clients cl ON c.client_id = cl.id
            LEFT JOIN reglements_clients rc ON rc.commande_id = c.id AND rc.statut = 'approuve'
            WHERE NOT EXISTS (SELECT 1 FROM factures f WHERE f.commande_id = c.id)
              AND NOT EXISTS (SELECT 1 FROM remboursements r WHERE r.commande_id = c.id)
        `;

        const params = [];
        // Pour un utilisateur "simple", ne proposer que ses propres commandes
        if (!isManager) {
            sql += " AND c.user_id = ?";
            params.push(req.user.id);
        }

        sql += `
            GROUP BY c.id, c.numero_commande, c.montant_ttc, cl.nom_complet
            HAVING total_regle > 0
            ORDER BY c.created_at DESC
        `;

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching commandes payées non facturées:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Create a refund request (statut: en_attente)
 */
exports.store = async (req, res) => {
    const { commande_id, montant, motif } = req.body;
    const created_by = req.user.id;

    if (!commande_id || montant == null || !motif || !String(motif).trim()) {
        return res.status(400).json({
            message: "commande_id, montant et motif sont requis",
        });
    }

    const montantNum = Number(montant);
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
        return res.status(400).json({ message: "Montant invalide" });
    }

    try {
        const [cmdRows] = await db.query(
            "SELECT id, montant_ttc FROM commandes WHERE id = ?",
            [commande_id]
        );
        if (cmdRows.length === 0) {
            return res.status(404).json({ message: "Commande non trouvée" });
        }
        const commandeTtc = Number(cmdRows[0].montant_ttc) || 0;

        const [factureRows] = await db.query(
            "SELECT id FROM factures WHERE commande_id = ? LIMIT 1",
            [commande_id]
        );
        if (factureRows.length > 0) {
            return res.status(400).json({
                message: "Cette commande est déjà facturée. Remboursement possible uniquement pour commandes non facturées.",
            });
        }

        const [[regRow]] = await db.query(
            `SELECT COALESCE(SUM(montant), 0) AS total_regle FROM reglements_clients WHERE commande_id = ? AND statut = 'approuve'`,
            [commande_id]
        );
        const totalRegle = Number(regRow?.total_regle) || 0;
        if (totalRegle <= 0) {
            return res.status(400).json({
                message: "Cette commande n'a pas de règlement approuvé. Seules les commandes payées (non facturées) sont éligibles.",
            });
        }

        const montantMaxRemboursable = Math.max(Math.min(commandeTtc, totalRegle), 0);
        if (montantNum > montantMaxRemboursable) {
            return res.status(400).json({
                message: `Le montant du remboursement ne peut pas dépasser le montant déjà réglé (${montantMaxRemboursable.toFixed(2)} DH).`,
            });
        }

        // Toujours créer un remboursement en attente pour validation explicite dans Approvals.
        const final_statut = "en_attente";

        await db.execute(
            `INSERT INTO remboursements (commande_id, montant, motif, statut, created_by, valide_par)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [commande_id, montantNum, String(motif).trim(), final_statut, created_by, null]
        );
        const [inserted] = await db.query("SELECT * FROM remboursements ORDER BY id DESC LIMIT 1");
        res.status(201).json(inserted[0]);
    } catch (err) {
        console.error("Error creating remboursement:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Update a remboursement (only en_attente; montant and motif only)
 */
exports.update = async (req, res) => {
    const { id } = req.params;
    const { montant, motif } = req.body;

    if (montant == null || !motif || !String(motif).trim()) {
        return res.status(400).json({
            message: "montant et motif sont requis",
        });
    }

    const montantNum = Number(montant);
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
        return res.status(400).json({ message: "Montant invalide" });
    }

    try {
        const [rows] = await db.query("SELECT * FROM remboursements WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Remboursement non trouvé" });
        }
        if (rows[0].statut !== "en_attente") {
            return res.status(400).json({
                message: "Seule une demande en attente peut être modifiée",
            });
        }

        const commande_id = rows[0].commande_id;
        const [cmdRows] = await db.query(
            "SELECT montant_ttc FROM commandes WHERE id = ?",
            [commande_id]
        );
        const commandeTtc = Number(cmdRows[0]?.montant_ttc) || 0;

        const [[regRow]] = await db.query(
            `SELECT COALESCE(SUM(montant), 0) AS total_regle FROM reglements_clients WHERE commande_id = ? AND statut = 'approuve'`,
            [commande_id]
        );
        const totalRegle = Number(regRow?.total_regle) || 0;
        if (totalRegle <= 0) {
            return res.status(400).json({
                message: "Cette commande n'a pas de règlement approuvé.",
            });
        }

        const montantMaxRemboursable = Math.max(Math.min(commandeTtc, totalRegle), 0);
        if (montantNum > montantMaxRemboursable) {
            return res.status(400).json({
                message: `Le montant du remboursement ne peut pas dépasser le montant déjà réglé (${montantMaxRemboursable.toFixed(2)} DH).`,
            });
        }

        await db.execute(
            "UPDATE remboursements SET montant = ?, motif = ? WHERE id = ?",
            [montantNum, String(motif).trim(), id]
        );
        const [updated] = await db.query(
            `SELECT r.*, c.numero_commande, cl.nom_complet AS client_nom
             FROM remboursements r
             JOIN commandes c ON c.id = r.commande_id
             LEFT JOIN clients cl ON c.client_id = cl.id
             WHERE r.id = ?`,
            [id]
        );
        res.json(updated[0]);
    } catch (err) {
        console.error("Error updating remboursement:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Validate a refund request (admin/directeur)
 */
exports.valider = async (req, res) => {
    const role = (req.user.role || "").toString().toLowerCase();
    if (role !== "admin" && role !== "directeur" && role !== "responsable") {
        return res.status(403).json({
            message: "Seuls les administrateurs, directeurs ou responsables peuvent valider un remboursement",
        });
    }

    const { id } = req.params;
    try {
        const [rows] = await db.query("SELECT * FROM remboursements WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Remboursement non trouvé" });
        }
        if (rows[0].statut !== "en_attente") {
            return res.status(400).json({
                message: "Seul un remboursement en attente peut être validé",
            });
        }

        await db.execute(
            "UPDATE remboursements SET statut = 'valide', valide_par = ? WHERE id = ?",
            [req.user.id, id]
        );
        const [updated] = await db.query("SELECT * FROM remboursements WHERE id = ?", [id]);
        res.json(updated[0]);
    } catch (err) {
        console.error("Error validating remboursement:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Reject a refund request (admin/directeur)
 */
exports.rejeter = async (req, res) => {
    const role = (req.user.role || "").toString().toLowerCase();
    if (role !== "admin" && role !== "directeur" && role !== "responsable") {
        return res.status(403).json({
            message: "Seuls les administrateurs, directeurs ou responsables peuvent rejeter un remboursement",
        });
    }

    const { id } = req.params;
    try {
        const [rows] = await db.query("SELECT * FROM remboursements WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Remboursement non trouvé" });
        }
        if (rows[0].statut !== "en_attente") {
            return res.status(400).json({
                message: "Seul un remboursement en attente peut être rejeté",
            });
        }

        await db.execute(
            "UPDATE remboursements SET statut = 'rejete', valide_par = ? WHERE id = ?",
            [req.user.id, id]
        );
        const [updated] = await db.query("SELECT * FROM remboursements WHERE id = ?", [id]);
        res.json(updated[0]);
    } catch (err) {
        console.error("Error rejecting remboursement:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Delete a remboursement (admin only, only en_attente)
 */
exports.destroy = async (req, res) => {
    const role = (req.user.role || "").toString().toLowerCase();
    if (role !== "admin" && role !== "superadmin") {
        return res.status(403).json({
            message: "Seuls les administrateurs peuvent supprimer une demande de remboursement",
        });
    }

    const { id } = req.params;
    try {
        const [rows] = await db.query("SELECT * FROM remboursements WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Remboursement non trouvé" });
        }
        if (rows[0].statut !== "en_attente") {
            return res.status(400).json({
                message: "Seule une demande en attente peut être supprimée",
            });
        }

        await db.execute("DELETE FROM remboursements WHERE id = ?", [id]);
        res.status(200).json({ message: "Remboursement supprimé" });
    } catch (err) {
        console.error("Error deleting remboursement:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};
