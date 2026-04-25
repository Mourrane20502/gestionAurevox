const db = require("../config/db").promise();

/**
 * Créer une demande de vérification inventaire (quand l'utilisateur enregistre un écart)
 */
exports.create = async (req, res) => {
    try {
        const { product_id, product_nom, stock_systeme, stock_reel, justification } = req.body;
        const userId = req.user?.id ?? null;

        if (product_id == null || product_nom == null || stock_systeme == null || stock_reel == null) {
            return res.status(400).json({ message: "product_id, product_nom, stock_systeme et stock_reel sont requis." });
        }

        const ecart = Number(stock_reel) - Number(stock_systeme);

        const [result] = await db.execute(
            `INSERT INTO inventory_verifications (product_id, product_nom, stock_systeme, stock_reel, ecart, justification, user_id, statut)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente')`,
            [product_id, product_nom, Number(stock_systeme), Number(stock_reel), ecart, justification || null, userId]
        );

        res.status(201).json({
            id: result.insertId,
            message: "Demande de vérification inventaire créée. Un administrateur pourra la traiter dans les approbations.",
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur lors de la création de la vérification inventaire." });
    }
};

/**
 * Liste des vérifications (admin/responsable : en_attente par défaut, ou toutes)
 */
exports.getAll = async (req, res) => {
    try {
        const statut = req.query.statut; // optionnel : en_attente | verifie | a_revoir
        let query = `
            SELECT iv.id, iv.product_id, iv.product_nom, iv.stock_systeme, iv.stock_reel, iv.ecart, iv.justification, iv.user_id, iv.statut, iv.admin_message, iv.created_at, iv.updated_at,
                   u.nom AS user_nom, u.prenom AS user_prenom
            FROM inventory_verifications iv
            LEFT JOIN users u ON iv.user_id = u.id
        `;
        const params = [];

        if (statut) {
            query += " WHERE iv.statut = ?";
            params.push(statut);
        } else {
            query += " WHERE iv.statut = 'en_attente'";
        }
        query += " ORDER BY iv.created_at DESC";

        const [rows] = await db.execute(query, params);
        res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des vérifications inventaire." });
    }
};

/**
 * Dernière décision admin par produit (verifie / a_revoir) pour affichage sur la page Inventaire
 */
exports.getResolved = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT iv.id, iv.product_id, iv.statut, iv.admin_message, iv.updated_at, iv.user_id,
                   u.nom AS user_nom, u.prenom AS user_prenom
            FROM inventory_verifications iv
            LEFT JOIN users u ON iv.user_id = u.id
            INNER JOIN (
                SELECT product_id, MAX(updated_at) AS max_updated
                FROM inventory_verifications
                WHERE statut IN ('verifie', 'a_revoir', 'en_attente')
                GROUP BY product_id
            ) t ON iv.product_id = t.product_id AND iv.updated_at = t.max_updated
            WHERE iv.statut IN ('verifie', 'a_revoir', 'en_attente')
        `);
        res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des retours admin." });
    }
};

/**
 * Mettre à jour une vérification (message admin, statut)
 */
exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_message, statut } = req.body;

        const updates = [];
        const params = [];

        if (admin_message !== undefined) {
            updates.push(" admin_message = ? ");
            params.push(admin_message);
        }
        if (statut !== undefined && ["en_attente", "verifie", "a_revoir"].includes(statut)) {
            updates.push(" statut = ? ");
            params.push(statut);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: "Fournir admin_message et/ou statut." });
        }

        params.push(id);
        const [result] = await db.execute(
            `UPDATE inventory_verifications SET ${updates.join(", ")} WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Vérification introuvable." });
        }

        res.status(200).json({ message: "Vérification mise à jour." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur lors de la mise à jour." });
    }
};

/**
 * Supprimer une vérification (ex: erreur de saisie ou suppression de l'historique de session)
 */
exports.delete = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute("DELETE FROM inventory_verifications WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Vérification introuvable." });
        }

        res.status(200).json({ message: "Vérification supprimée." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur lors de la suppression." });
    }
};
