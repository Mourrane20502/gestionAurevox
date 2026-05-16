const db = require("../config/db").promise();
const { resolveCreationApprovalStatut } = require("../utils/approvalSettings");
const { logProductMovement } = require("../utils/productMovementLogger");

async function applyAchatStockOnApproval(connection, achat, userId, achatId) {
    const productId = achat.product_id;
    const qty = Number(achat.quantite) || 0;
    if (!productId || qty <= 0) return;

    const [prodRows] = await connection.execute(
        "SELECT stock, nom FROM products WHERE id = ?",
        [productId]
    );
    if (prodRows.length === 0) return;

    const currentStock = prodRows[0].stock || 0;
    await connection.execute(
        "UPDATE products SET stock = stock + ? WHERE id = ?",
        [qty, productId]
    );

    try {
        await logProductMovement(
            {
                productId,
                type: "achat_entree",
                quantityBefore: currentStock,
                quantityAfter: currentStock + qty,
                description: "Entrée stock (validation achat fournisseur)",
                userId,
                referenceType: "achat_fournisseur",
                referenceId: Number(achatId),
                referenceNumero: null,
            },
            connection
        );
    } catch (e) {
        console.error("Erreur log mouvement stock achat fournisseur:", e.message);
    }
}

let achatFactureColumnReady = false;
const ensureAchatFactureColumn = async () => {
    if (achatFactureColumnReady) return;
    const [cols] = await db.query("SHOW COLUMNS FROM achats_fournisseurs LIKE 'facture_fournisseur'");
    if (!Array.isArray(cols) || cols.length === 0) {
        await db.query("ALTER TABLE achats_fournisseurs ADD COLUMN facture_fournisseur VARCHAR(255) NULL AFTER numero");
    }
    achatFactureColumnReady = true;
};

exports.getAllAchats = async (req, res) => {
    try {
        await ensureAchatFactureColumn();
        let sql = `
            SELECT af.*,
                   g.nom AS gestionnaire_nom,
                   f.nom AS fournisseur_nom,
                   COALESCE(af.designation_libre, p.nom) AS produit_nom,
                   CONCAT(u.prenom, ' ', u.nom) AS created_by_nom
            FROM achats_fournisseurs af
            JOIN gestionnaire g ON af.gestionnaire_id = g.id
            JOIN fournisseur f ON af.fournisseur_id = f.id
            LEFT JOIN products p ON af.product_id = p.id
            LEFT JOIN users u ON af.created_by = u.id
        `;
        const params = [];
        const role = (req.user.role || "").toLowerCase();
        if (role !== 'admin' && role !== 'responsable' && role !== 'directeur' && role !== 'superadmin') {
            sql += " WHERE af.created_by = ?";
            params.push(req.user.id);
        }
        sql += " ORDER BY af.id DESC";

        const [rows] = await db.query(sql, params);

        res.json(rows);

    } catch (error) {
        console.error("Error fetching achats fournisseurs:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Get achat fournisseur by ID
 */
exports.getAchatById = async (req, res) => {
    try {
        await ensureAchatFactureColumn();
        const { id } = req.params;

        const [rows] = await db.query(`
            SELECT af.*,
                   g.nom AS gestionnaire_nom,
                   f.nom AS fournisseur_nom,
                   COALESCE(af.designation_libre, p.nom) AS produit_nom
            FROM achats_fournisseurs af
            JOIN gestionnaire g ON af.gestionnaire_id = g.id
            JOIN fournisseur f ON af.fournisseur_id = f.id
            LEFT JOIN products p ON af.product_id = p.id
            WHERE af.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Achat not found" });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error("Error fetching achat fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Get all items for a specific order number (numero)
 */
exports.getAchatByNumero = async (req, res) => {
    try {
        await ensureAchatFactureColumn();
        const { numero } = req.params;

        const [rows] = await db.query(`
            SELECT af.*,
                   g.nom AS gestionnaire_nom,
                   f.nom AS fournisseur_nom,
                   COALESCE(af.designation_libre, p.nom) AS produit_nom,
                   (SELECT COALESCE(SUM(rf.montant), 0) FROM reglements_fournisseurs rf WHERE rf.achat_id IN (SELECT id FROM achats_fournisseurs WHERE numero = af.numero) AND rf.statut = 'approuve') as montant_paye
            FROM achats_fournisseurs af
            JOIN gestionnaire g ON af.gestionnaire_id = g.id
            JOIN fournisseur f ON af.fournisseur_id = f.id
            LEFT JOIN products p ON af.product_id = p.id
            WHERE af.numero = ?
        `, [numero]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Commande fournisseur non trouvée" });
        }

        res.json(rows);

    } catch (error) {
        console.error("Error fetching achat by numero:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Create achat fournisseur
 */
exports.createAchat = async (req, res) => {
    try {
        await ensureAchatFactureColumn();
        const {
            gestionnaire_id,
            fournisseur_id,
            product_id,
            quantite,
            prix_unitaire,
            statut,
            tva,
            designation_libre,
            numero,
        } = req.body;

        if (!gestionnaire_id || !fournisseur_id || !quantite) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        if (!product_id && (!designation_libre || !String(designation_libre).trim())) {
            return res.status(400).json({
                message: "Choisir un produit BDD ou saisir un produit manuellement",
            });
        }

        let effectiveNumero = numero;
        if (!effectiveNumero) {
            const now = new Date();
            const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
            const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
            effectiveNumero = `BCF-${datePart}-${randomPart}`;
        }

        const created_by = req.user && req.user.id ? req.user.id : null;
        const finalStatut = await resolveCreationApprovalStatut(req.user, "achats_fournisseurs", {
            pending: "en_attente",
            approved: "accepte",
            requested: statut,
        });
        const [result] = await db.query(`
            INSERT INTO achats_fournisseurs
            (numero, gestionnaire_id, fournisseur_id, product_id, quantite, prix_unitaire, statut, tva, designation_libre, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            effectiveNumero,
            gestionnaire_id,
            fournisseur_id,
            product_id || null,
            quantite,
            prix_unitaire || null,
            finalStatut,
            tva || null,
            designation_libre || null,
            created_by,
        ]);

        if (finalStatut === "accepte") {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                const [rows] = await connection.execute(
                    "SELECT * FROM achats_fournisseurs WHERE id = ?",
                    [result.insertId]
                );
                if (rows.length > 0) {
                    await applyAchatStockOnApproval(connection, rows[0], created_by, result.insertId);
                }
                await connection.commit();
            } catch (e) {
                await connection.rollback();
                console.error("Auto-approval stock achat:", e);
            } finally {
                connection.release();
            }
        }

        res.status(201).json({
            message: "Achat fournisseur created successfully",
            id: result.insertId,
            numero: effectiveNumero
        });

    } catch (error) {
        console.error("Error creating achat fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Create a BCF with multiple product lines in one transaction
 * Body: { numero?, gestionnaire_id, fournisseur_id, lignes: [ { product_id?, quantite, prix_unitaire?, tva?, designation_libre? }, ... ] }
 */
exports.createAchatBatch = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await ensureAchatFactureColumn();
        const { gestionnaire_id, fournisseur_id, numero: bodyNumero, lignes } = req.body;

        if (!gestionnaire_id || !fournisseur_id || !Array.isArray(lignes) || lignes.length === 0) {
            return res.status(400).json({ message: "gestionnaire_id, fournisseur_id et lignes (tableau non vide) requis" });
        }

        const created_by = req.user && req.user.id ? req.user.id : null;
        let effectiveNumero = bodyNumero;
        if (!effectiveNumero || typeof effectiveNumero !== "string" || !effectiveNumero.trim()) {
            const now = new Date();
            const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
            const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
            effectiveNumero = `BCF-${datePart}-${randomPart}`;
        }

        await connection.beginTransaction();

        const batchStatut = await resolveCreationApprovalStatut(req.user, "achats_fournisseurs", {
            pending: "en_attente",
            approved: "accepte",
        });

        const insertedIds = [];
        for (const line of lignes) {
            const { product_id, quantite, prix_unitaire, tva, designation_libre } = line;
            if (!quantite || Number(quantite) <= 0) continue;
            if (!product_id && (!designation_libre || !String(designation_libre).trim())) continue;

            const [result] = await connection.query(`
                INSERT INTO achats_fournisseurs
                (numero, gestionnaire_id, fournisseur_id, product_id, quantite, prix_unitaire, statut, tva, designation_libre, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                effectiveNumero,
                gestionnaire_id,
                fournisseur_id,
                product_id || null,
                Number(quantite),
                prix_unitaire != null ? Number(prix_unitaire) : null,
                batchStatut,
                tva != null ? Number(tva) : null,
                designation_libre && String(designation_libre).trim() ? String(designation_libre).trim() : null,
                created_by,
            ]);
            insertedIds.push(result.insertId);
            if (batchStatut === "accepte") {
                const [rows] = await connection.execute(
                    "SELECT * FROM achats_fournisseurs WHERE id = ?",
                    [result.insertId]
                );
                if (rows.length > 0) {
                    await applyAchatStockOnApproval(connection, rows[0], created_by, result.insertId);
                }
            }
        }

        if (insertedIds.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                message: "Aucune ligne valide (quantite > 0 et produit ou désignation requise)",
            });
        }

        await connection.commit();
        res.status(201).json({
            message: "Achat fournisseur créé avec succès",
            ids: insertedIds,
            numero: effectiveNumero,
            count: insertedIds.length,
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error("Error creating achat fournisseur (batch):", error);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
};


/**
 * Update achat fournisseur
 */
exports.updateAchat = async (req, res) => {
    try {
        await ensureAchatFactureColumn();
        const { id } = req.params;
        const {
            gestionnaire_id,
            fournisseur_id,
            product_id,
            quantite,
            prix_unitaire,
            statut,
            tva,
            designation_libre,
            numero,
        } = req.body;

        const [existing] = await db.query(
            "SELECT id FROM achats_fournisseurs WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Achat not found" });
        }

        await db.query(`
            UPDATE achats_fournisseurs
            SET gestionnaire_id = ?,
                fournisseur_id = ?,
                product_id = ?,
                quantite = ?,
                prix_unitaire = ?,
                statut = ?,
                tva = ?,
                designation_libre = ?,
                numero = ?
            WHERE id = ?
        `, [
            gestionnaire_id,
            fournisseur_id,
            product_id || null,
            quantite,
            prix_unitaire,
            statut,
            tva,
            designation_libre || null,
            numero || null,
            id
        ]);

        res.json({ message: "Achat updated successfully" });

    } catch (error) {
        console.error("Error updating achat fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Delete achat fournisseur
 */
exports.deleteAchat = async (req, res) => {
    try {
        await ensureAchatFactureColumn();
        const { id } = req.params;

        const [existing] = await db.query(
            "SELECT id FROM achats_fournisseurs WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Achat not found" });
        }

        await db.query(
            "DELETE FROM achats_fournisseurs WHERE id = ?",
            [id]
        );

        res.json({ message: "Achat deleted successfully" });

    } catch (error) {
        console.error("Error deleting achat fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.uploadAchatFacture = async (req, res) => {
    try {
        await ensureAchatFactureColumn();
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: "Aucun fichier fourni" });
        }

        const ext = String(file.originalname || "").toLowerCase();
        const isPdf = file.mimetype === "application/pdf" || ext.endsWith(".pdf");
        if (!isPdf) {
            return res.status(400).json({ message: "Seul le format PDF est autorisé" });
        }

        const [existing] = await db.query("SELECT id FROM achats_fournisseurs WHERE id = ?", [id]);
        if (!Array.isArray(existing) || existing.length === 0) {
            return res.status(404).json({ message: "Achat not found" });
        }

        await db.query(
            "UPDATE achats_fournisseurs SET facture_fournisseur = ? WHERE id = ?",
            [file.filename, id]
        );

        return res.json({
            message: "Facture fournisseur téléversée avec succès",
            facture_fournisseur: file.filename,
        });
    } catch (error) {
        console.error("Error uploading achat fournisseur facture:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

exports.deleteAchatFacture = async (req, res) => {
    try {
        await ensureAchatFactureColumn();
        const { id } = req.params;
        const [existing] = await db.query(
            "SELECT id, facture_fournisseur FROM achats_fournisseurs WHERE id = ?",
            [id]
        );
        if (!Array.isArray(existing) || existing.length === 0) {
            return res.status(404).json({ message: "Achat not found" });
        }

        await db.query(
            "UPDATE achats_fournisseurs SET facture_fournisseur = NULL WHERE id = ?",
            [id]
        );

        return res.json({
            message: "Facture fournisseur supprimée avec succès",
            facture_fournisseur: null,
        });
    } catch (error) {
        console.error("Error deleting achat fournisseur facture:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

/**
 * Approve achat fournisseur: set statut to 'accepte' and increase product stock.
 */
exports.approveAchat = async (req, res) => {
    const { id } = req.params;

    if (req.user.role !== "admin" && req.user.role !== "responsable") {
        return res.status(403).json({ message: "Seuls les administrateurs peuvent valider les achats fournisseurs" });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            "SELECT * FROM achats_fournisseurs WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Achat fournisseur non trouvé" });
        }

        const achat = rows[0];

        if (achat.statut && achat.statut !== "en_attente") {
            await connection.rollback();
            return res.status(400).json({ message: "Cet achat fournisseur est déjà traité" });
        }

        const qty = Number(achat.quantite) || 0;

        if (achat.product_id && qty > 0) {
            const [prodRows] = await connection.execute(
                "SELECT stock, nom FROM products WHERE id = ?",
                [achat.product_id]
            );
            if (prodRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "Produit associé non trouvé" });
            }
            await applyAchatStockOnApproval(connection, achat, req.user.id, id);
        } else if (qty <= 0) {
            await connection.rollback();
            return res.status(400).json({ message: "Quantité invalide pour cet achat fournisseur" });
        }

        await connection.execute(
            "UPDATE achats_fournisseurs SET statut = 'accepte' WHERE id = ?",
            [id]
        );

        await connection.commit();
        res.status(200).json({ message: "Achat fournisseur validé avec succès" });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error approving achat fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
};

/**
 * Reject achat fournisseur: set statut to 'rejete' (only if pending).
 */
exports.rejectAchat = async (req, res) => {
    const { id } = req.params;

    if (req.user.role !== "admin" && req.user.role !== "responsable") {
        return res.status(403).json({ message: "Seuls les administrateurs peuvent rejeter les achats fournisseurs" });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            "SELECT * FROM achats_fournisseurs WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Achat fournisseur non trouvé" });
        }

        const achat = rows[0];
        if (achat.statut && achat.statut !== "en_attente") {
            await connection.rollback();
            return res.status(400).json({ message: "Cet achat fournisseur est déjà traité" });
        }

        await connection.execute(
            "UPDATE achats_fournisseurs SET statut = 'rejete' WHERE id = ?",
            [id]
        );

        await connection.commit();
        res.status(200).json({ message: "Achat fournisseur rejeté avec succès" });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error rejecting achat fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
};
