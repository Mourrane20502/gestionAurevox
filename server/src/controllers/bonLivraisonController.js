const db = require("../config/db").promise();

let blSchemaReady = false;
const ensureBonLivraisonSchema = async () => {
    if (blSchemaReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS bon_de_livraison (
            id INT AUTO_INCREMENT PRIMARY KEY,
            numero_bon_livraison VARCHAR(100) NOT NULL UNIQUE,
            date_bon_livraison DATE NOT NULL,
            commande_id INT NOT NULL UNIQUE,
            client_id INT NOT NULL,
            user_id INT NULL,
            statut VARCHAR(50) DEFAULT 'brouillon',
            montant_ht DECIMAL(12,2) DEFAULT 0,
            montant_tva DECIMAL(12,2) DEFAULT 0,
            montant_ttc DECIMAL(12,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS bon_de_livraison_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            bon_livraison_id INT NOT NULL,
            produit_id INT NULL,
            designation VARCHAR(255) NULL,
            quantite DECIMAL(12,2) DEFAULT 0,
            prix_unitaire DECIMAL(12,2) DEFAULT 0,
            tva DECIMAL(8,2) DEFAULT 20,
            reduction DECIMAL(8,2) DEFAULT 0,
            montant_ht DECIMAL(12,2) DEFAULT 0
        )
    `);

    const ensureColumn = async (table, column, ddl) => {
        const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
        if (!Array.isArray(rows) || rows.length === 0) {
            await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
        }
    };

    // Compatibilite avec les tables deja creees manuellement.
    await ensureColumn("bon_de_livraison", "numero_bon_livraison", "numero_bon_livraison VARCHAR(100) NULL");
    await ensureColumn("bon_de_livraison", "date_bon_livraison", "date_bon_livraison DATE NULL");
    await ensureColumn("bon_de_livraison", "commande_id", "commande_id INT NULL");
    await ensureColumn("bon_de_livraison", "client_id", "client_id INT NULL");
    await ensureColumn("bon_de_livraison", "user_id", "user_id INT NULL");
    await ensureColumn("bon_de_livraison", "statut", "statut VARCHAR(50) DEFAULT 'en_attente'");
    await ensureColumn("bon_de_livraison", "montant_ht", "montant_ht DECIMAL(12,2) DEFAULT 0");
    await ensureColumn("bon_de_livraison", "montant_tva", "montant_tva DECIMAL(12,2) DEFAULT 0");
    await ensureColumn("bon_de_livraison", "montant_ttc", "montant_ttc DECIMAL(12,2) DEFAULT 0");
    await ensureColumn("bon_de_livraison", "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

    await ensureColumn("bon_de_livraison_items", "bon_livraison_id", "bon_livraison_id INT NULL");
    await ensureColumn("bon_de_livraison_items", "produit_id", "produit_id INT NULL");
    await ensureColumn("bon_de_livraison_items", "designation", "designation VARCHAR(255) NULL");
    await ensureColumn("bon_de_livraison_items", "quantite", "quantite DECIMAL(12,2) DEFAULT 0");
    await ensureColumn("bon_de_livraison_items", "prix_unitaire", "prix_unitaire DECIMAL(12,2) DEFAULT 0");
    await ensureColumn("bon_de_livraison_items", "tva", "tva DECIMAL(8,2) DEFAULT 20");
    await ensureColumn("bon_de_livraison_items", "reduction", "reduction DECIMAL(8,2) DEFAULT 0");
    await ensureColumn("bon_de_livraison_items", "montant_ht", "montant_ht DECIMAL(12,2) DEFAULT 0");

    blSchemaReady = true;
};

const buildBlNumber = () => {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    return `BL-${datePart}-${randomPart}`;
};

const hasColumn = async (table, column) => {
    const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
    return Array.isArray(rows) && rows.length > 0;
};

exports.getAllBonsLivraison = async (_req, res) => {
    try {
        await ensureBonLivraisonSchema();
        const [rows] = await db.query(`
            SELECT bl.*,
                   COALESCE(bl.numero_bon_livraison, bl.numero_bl) AS numero_bon_livraison,
                   COALESCE(bl.date_bon_livraison, bl.date_livraison) AS date_bon_livraison,
                   c.numero_commande,
                   c.devis_id,
                   cl.nom_complet AS client_nom,
                   CONCAT(u.prenom, ' ', u.nom) AS user_nom,
                   pv.nom AS point_de_vente_nom,
                   ss.NOM_SOUS_SOCIETE AS sous_societe_nom,
                   (
                        SELECT f.id
                        FROM factures f
                        WHERE f.commande_id = c.id
                        ORDER BY f.id DESC
                        LIMIT 1
                   ) AS facture_id
            FROM bon_de_livraison bl
            LEFT JOIN commandes c ON c.id = bl.commande_id
            LEFT JOIN clients cl ON cl.id = bl.client_id
            LEFT JOIN users u ON u.id = COALESCE(bl.user_id, c.user_id)
            LEFT JOIN point_de_vente pv ON pv.id = c.point_de_vente_id
            LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
            ORDER BY bl.id DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching bons de livraison:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.getBonLivraisonById = async (req, res) => {
    try {
        await ensureBonLivraisonSchema();
        const { id } = req.params;
        const [[row]] = await db.query(`
            SELECT bl.*,
                   COALESCE(bl.numero_bon_livraison, bl.numero_bl) AS numero_bon_livraison,
                   COALESCE(bl.date_bon_livraison, bl.date_livraison) AS date_bon_livraison,
                   c.numero_commande,
                   c.devis_id,
                   cl.nom_complet AS client_nom,
                   CONCAT(u.prenom, ' ', u.nom) AS user_nom,
                   pv.nom AS point_de_vente_nom,
                   ss.NOM_SOUS_SOCIETE AS sous_societe_nom,
                   (
                        SELECT f.id
                        FROM factures f
                        WHERE f.commande_id = c.id
                        ORDER BY f.id DESC
                        LIMIT 1
                   ) AS facture_id
            FROM bon_de_livraison bl
            LEFT JOIN commandes c ON c.id = bl.commande_id
            LEFT JOIN clients cl ON cl.id = bl.client_id
            LEFT JOIN users u ON u.id = COALESCE(bl.user_id, c.user_id)
            LEFT JOIN point_de_vente pv ON pv.id = c.point_de_vente_id
            LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
            WHERE bl.id = ?
            LIMIT 1
        `, [id]);

        if (!row) return res.status(404).json({ message: "Bon de livraison introuvable" });

        const [items] = await db.query(
            `SELECT * FROM bon_de_livraison_items WHERE bon_livraison_id = ? ORDER BY id ASC`,
            [id]
        );

        res.json({ ...row, items });
    } catch (error) {
        console.error("Error fetching bon de livraison by id:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.createBonLivraisonFromCommande = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await ensureBonLivraisonSchema();
        const commandeId = Number(req.params.commandeId);
        if (!Number.isFinite(commandeId) || commandeId <= 0) {
            return res.status(400).json({ message: "Commande invalide" });
        }

        await connection.beginTransaction();

        const [[existing]] = await connection.query(
            "SELECT id, numero_bon_livraison FROM bon_de_livraison WHERE commande_id = ? LIMIT 1",
            [commandeId]
        );
        if (existing) {
            await connection.rollback();
            return res.status(400).json({
                message: "Un bon de livraison existe déjà pour cette commande",
                id: existing.id,
            });
        }

        const [[commande]] = await connection.query(
            `SELECT id, numero_commande, date_commande, client_id, user_id, montant_ht, montant_tva, montant_ttc
             FROM commandes
             WHERE id = ?
             LIMIT 1`,
            [commandeId]
        );
        if (!commande) {
            await connection.rollback();
            return res.status(404).json({ message: "Commande introuvable" });
        }

        const [commandeItems] = await connection.query(
            `SELECT produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht
             FROM commande_items
             WHERE commande_id = ?
             ORDER BY id ASC`,
            [commandeId]
        );

        if (!Array.isArray(commandeItems) || commandeItems.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: "La commande ne contient aucun élément" });
        }

        const numero = buildBlNumber();
        const dateBl = new Date().toISOString().slice(0, 10);
        const insertColumns = [
            "numero_bon_livraison",
            "date_bon_livraison",
            "commande_id",
            "client_id",
            "user_id",
            "statut",
            "montant_ht",
            "montant_tva",
            "montant_ttc",
        ];
        const insertValues = [
            numero,
            dateBl,
            commande.id,
            commande.client_id,
            req.user?.id || commande.user_id || null,
            "en_attente",
            Number(commande.montant_ht) || 0,
            Number(commande.montant_tva) || 0,
            Number(commande.montant_ttc) || 0,
        ];

        // Compatibilite schema legacy: certains environnements utilisent numero_bl/date_bl.
        if (await hasColumn("bon_de_livraison", "numero_bl")) {
            insertColumns.push("numero_bl");
            insertValues.push(numero);
        }
        if (await hasColumn("bon_de_livraison", "date_bl")) {
            insertColumns.push("date_bl");
            insertValues.push(dateBl);
        }
        if (await hasColumn("bon_de_livraison", "date_livraison")) {
            insertColumns.push("date_livraison");
            insertValues.push(dateBl);
        }

        const placeholders = insertColumns.map(() => "?").join(", ");
        const [insertBl] = await connection.query(
            `INSERT INTO bon_de_livraison (${insertColumns.join(", ")}) VALUES (${placeholders})`,
            insertValues
        );

        const blId = insertBl.insertId;
        for (const item of commandeItems) {
            await connection.query(
                `INSERT INTO bon_de_livraison_items
                    (bon_livraison_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    blId,
                    item.produit_id || null,
                    item.designation || null,
                    Number(item.quantite) || 0,
                    Number(item.prix_unitaire) || 0,
                    Number(item.tva) || 20,
                    Number(item.reduction) || 0,
                    Number(item.montant_ht) || 0,
                ]
            );
        }

        await connection.commit();
        return res.status(201).json({
            message: "Bon de livraison créé",
            id: blId,
            numero_bon_livraison: numero,
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error("Error creating bon de livraison from commande:", error);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
};

exports.approveBonLivraison = async (req, res) => {
    try {
        await ensureBonLivraisonSchema();
        const { id } = req.params;
        const [result] = await db.query(
            `UPDATE bon_de_livraison
             SET statut = 'livré'
             WHERE id = ?
               AND (
                    statut = 'en_attente'
                    OR statut = 'en attente'
                    OR statut = 'brouillon'
               )`,
            [id]
        );
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Bon de livraison non trouvé ou déjà traité" });
        }
        res.json({ message: "Bon de livraison validé" });
    } catch (error) {
        console.error("Error approving bon de livraison:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.rejectBonLivraison = async (req, res) => {
    try {
        await ensureBonLivraisonSchema();
        const { id } = req.params;
        // Schema utilisateur: enum('en_attente','livré') -> on garde en_attente pour un "rejet".
        const [result] = await db.query(
            `UPDATE bon_de_livraison
             SET statut = 'en_attente'
             WHERE id = ?`,
            [id]
        );
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Bon de livraison non trouvé ou déjà traité" });
        }
        res.json({ message: "Bon de livraison rejeté" });
    } catch (error) {
        console.error("Error rejecting bon de livraison:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.updateBonLivraison = async (req, res) => {
    try {
        await ensureBonLivraisonSchema();
        const { id } = req.params;
        const { numero_bon_livraison, date_bon_livraison, statut } = req.body || {};

        const fields = [];
        const values = [];

        if (numero_bon_livraison) {
            fields.push("numero_bon_livraison = ?");
            values.push(String(numero_bon_livraison).trim());
            if (await hasColumn("bon_de_livraison", "numero_bl")) {
                fields.push("numero_bl = ?");
                values.push(String(numero_bon_livraison).trim());
            }
        }

        if (date_bon_livraison) {
            fields.push("date_bon_livraison = ?");
            values.push(String(date_bon_livraison).slice(0, 10));
            if (await hasColumn("bon_de_livraison", "date_livraison")) {
                fields.push("date_livraison = ?");
                values.push(String(date_bon_livraison).slice(0, 10));
            }
            if (await hasColumn("bon_de_livraison", "date_bl")) {
                fields.push("date_bl = ?");
                values.push(String(date_bon_livraison).slice(0, 10));
            }
        }

        if (statut) {
            fields.push("statut = ?");
            values.push(statut);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: "Aucun champ à mettre à jour" });
        }

        values.push(id);
        const [result] = await db.query(
            `UPDATE bon_de_livraison SET ${fields.join(", ")} WHERE id = ?`,
            values
        );

        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Bon de livraison introuvable" });
        }
        res.json({ message: "Bon de livraison mis à jour" });
    } catch (error) {
        console.error("Error updating bon de livraison:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.deleteBonLivraison = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await ensureBonLivraisonSchema();
        const { id } = req.params;
        await connection.beginTransaction();

        const [existing] = await connection.query(
            "SELECT id FROM bon_de_livraison WHERE id = ? LIMIT 1",
            [id]
        );
        if (!Array.isArray(existing) || existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Bon de livraison introuvable" });
        }

        await connection.query("DELETE FROM bon_de_livraison_items WHERE bon_livraison_id = ?", [id]);
        await connection.query("DELETE FROM bon_de_livraison WHERE id = ?", [id]);
        await connection.commit();
        res.json({ message: "Bon de livraison supprimé" });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error("Error deleting bon de livraison:", error);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
};
