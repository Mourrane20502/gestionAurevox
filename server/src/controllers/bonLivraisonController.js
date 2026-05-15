const db = require("../config/db").promise();
const { shouldAutoApprove } = require("../utils/approvalSettings");
const {
    logBonLivraisonCreation,
    logBonLivraisonSortie,
} = require("../utils/documentStockMovementHelpers");

/** Valeurs ENUM / stockées : en_attente, livree, annulee */
const BL_STATUT = {
    EN_ATTENTE: "en_attente",
    LIVREE: "livree",
    ANNULEE: "annulee",
};

function normalizeBonLivraisonStatutForDb(statut) {
    const s = String(statut ?? "")
        .trim()
        .toLowerCase()
        .replace(/é|è|ê|ë/g, "e")
        .replace(/à/g, "a")
        .replace(/ù|û|ü/g, "u")
        .replace(/ô|ö/g, "o")
        .replace(/î|ï/g, "i")
        .replace(/ç/g, "c")
        .replace(/[\s_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (!s) return null;
    if (s === "en_attente" || s === "enattente" || s === "brouillon") return BL_STATUT.EN_ATTENTE;
    if (s === "livree" || s === "livre" || s === "validee") return BL_STATUT.LIVREE;
    if (s === "annulee" || s === "annule") return BL_STATUT.ANNULEE;
    return null;
}

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
            statut VARCHAR(50) DEFAULT 'en_attente',
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

    await ensureColumn("bon_de_livraison", "numero_bon_livraison", "numero_bon_livraison VARCHAR(100) NULL");
    await ensureColumn("bon_de_livraison", "date_bon_livraison", "date_bon_livraison DATE NULL");
    await ensureColumn("bon_de_livraison", "commande_id", "commande_id INT NULL");
    await ensureColumn("bon_de_livraison", "client_id", "client_id INT NULL");
    await ensureColumn("bon_de_livraison", "user_id", "user_id INT NULL");
    await ensureColumn("bon_de_livraison", "statut", "statut VARCHAR(50) DEFAULT 'en_attente'");
    try {
        const [statutCol] = await db.query(
            "SHOW COLUMNS FROM bon_de_livraison WHERE Field = 'statut'"
        );
        const colType = String(statutCol[0]?.Type || "").toLowerCase();
        if (colType.startsWith("enum")) {
            await db.query(
                "ALTER TABLE bon_de_livraison MODIFY COLUMN statut VARCHAR(50) DEFAULT 'en_attente'"
            );
        }
    } catch (e) {
        console.warn("[bonLivraison] statut column normalize:", e?.message || e);
    }
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
    await ensureColumn("bon_de_livraison", "point_de_vente_id", "point_de_vente_id INT NULL");
    await ensureColumn("bon_de_livraison", "devis_id", "devis_id INT NULL");

    // Statuts ENUM / VARCHAR : en_attente | livree | annulee (migration + anciens libellés)
    try {
        await db.query(`
            UPDATE bon_de_livraison
            SET statut = 'livree'
            WHERE LOWER(TRIM(statut)) IN ('livree', 'livre', 'livré', 'validee', 'validée')
        `);
        await db.query(`
            UPDATE bon_de_livraison
            SET statut = 'annulee'
            WHERE LOWER(TRIM(statut)) IN ('annulee', 'annule', 'annulé', 'annulée')
        `);
        await db.query(`
            UPDATE bon_de_livraison
            SET statut = 'en_attente'
            WHERE statut IS NULL
               OR TRIM(statut) = ''
               OR LOWER(REPLACE(TRIM(statut), ' ', '_')) IN ('brouillon', 'en_attente', 'enattente')
        `);
    } catch (e) {
        console.warn("[bonLivraison] statut migration:", e?.message || e);
    }

    // Permettre plusieurs BL par commande (ex. un annulé + un nouveau en attente)
    try {
        const [uindexes] = await db.query(
            "SHOW INDEX FROM bon_de_livraison WHERE Column_name = 'commande_id' AND Non_unique = 0"
        );
        if (Array.isArray(uindexes)) {
            for (const idx of uindexes) {
                const keyName = idx && idx.Key_name;
                if (!keyName || keyName === "PRIMARY") continue;
                const safe = String(keyName).replace(/[^a-zA-Z0-9_]/g, "");
                if (!safe) continue;
                await db.query(`ALTER TABLE bon_de_livraison DROP INDEX \`${safe}\``);
            }
        }
    } catch (e) {
        console.warn("[bonLivraison] drop commande_id unique index:", e?.message || e);
    }

    // Renseigner point_de_vente_id manquant depuis la commande / première ligne article
    try {
        await db.query(`
            UPDATE bon_de_livraison bl
            INNER JOIN commandes c ON c.id = bl.commande_id
            SET bl.point_de_vente_id = COALESCE(
                bl.point_de_vente_id,
                c.point_de_vente_id,
                (
                    SELECT p.id_point_de_vente
                    FROM commande_items ci
                    INNER JOIN products p ON p.id = ci.produit_id
                    WHERE ci.commande_id = c.id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY ci.id
                    LIMIT 1
                )
            )
            WHERE bl.point_de_vente_id IS NULL
        `);
    } catch (e) {
        console.warn("[bonLivraison] point_de_vente_id backfill:", e?.message || e);
    }

    try {
        await db.query(`
            UPDATE bon_de_livraison bl
            INNER JOIN commandes c ON c.id = bl.commande_id
            SET bl.devis_id = COALESCE(bl.devis_id, c.devis_id)
            WHERE bl.devis_id IS NULL
              AND c.devis_id IS NOT NULL
        `);
    } catch (e) {
        console.warn("[bonLivraison] devis_id backfill:", e?.message || e);
    }

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

const blListSelect = `
            SELECT bl.*,
                   COALESCE(bl.numero_bon_livraison, bl.numero_bl) AS numero_bon_livraison,
                   COALESCE(bl.date_bon_livraison, bl.date_livraison) AS date_bon_livraison,
                   c.numero_commande,
                   cl.nom_complet AS client_nom,
                   cl.email AS client_email,
                   CONCAT(u.prenom, ' ', u.nom) AS user_nom,
                   pv.nom AS point_de_vente_nom,
                   COALESCE(
                        (
                            SELECT ss_items.NOM_SOUS_SOCIETE
                            FROM commande_items ci
                            INNER JOIN products p ON p.id = ci.produit_id
                            INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                            LEFT JOIN sous_societe ss_items ON ss_items.ID = pv_items.id_sous_gestionnaire
                            WHERE ci.commande_id = c.id
                              AND p.id_point_de_vente IS NOT NULL
                            ORDER BY ci.id
                            LIMIT 1
                        ),
                        ss.NOM_SOUS_SOCIETE,
                        (
                            SELECT ssn.NOM_SOUS_SOCIETE
                            FROM sous_societe ssn
                            WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(c.numero_commande, '-', 2), '-', -1))
                            ORDER BY ssn.ID
                            LIMIT 1
                        )
                   ) AS sous_societe_nom,
                   (
                        SELECT f.id
                        FROM factures f
                        WHERE f.commande_id = c.id
                        ORDER BY f.id DESC
                        LIMIT 1
                   ) AS facture_id,
                   (SELECT d.numero_devis FROM devis d WHERE d.id = COALESCE(bl.devis_id, c.devis_id) LIMIT 1) AS numero_devis,
                   (SELECT f.numero_facture FROM factures f WHERE f.commande_id = c.id ORDER BY f.id DESC LIMIT 1) AS numero_facture,
                   (
                        SELECT COALESCE(SUM(ci.quantite), 0)
                        FROM commande_items ci
                        WHERE ci.commande_id = c.id
                   ) AS quantite_commandee,
                   (
                        SELECT COALESCE(SUM(bi.quantite), 0)
                        FROM bon_de_livraison_items bi
                        WHERE bi.bon_livraison_id = bl.id
                   ) AS quantite_livree
            FROM bon_de_livraison bl
            LEFT JOIN commandes c ON c.id = bl.commande_id
            LEFT JOIN clients cl ON cl.id = bl.client_id
            LEFT JOIN users u ON u.id = COALESCE(bl.user_id, c.user_id)
            LEFT JOIN point_de_vente pv ON pv.id = COALESCE(
                bl.point_de_vente_id,
                c.point_de_vente_id,
                (
                    SELECT p.id_point_de_vente
                    FROM commande_items ci
                    INNER JOIN products p ON p.id = ci.produit_id
                    WHERE ci.commande_id = c.id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY ci.id
                    LIMIT 1
                )
            )
            LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
`;

exports.getAllBonsLivraison = async (_req, res) => {
    try {
        await ensureBonLivraisonSchema();
        const [rows] = await db.query(`${blListSelect} ORDER BY bl.id DESC`);
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
        const [rows] = await db.query(`${blListSelect} WHERE bl.id = ? LIMIT 1`, [id]);
        const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

        if (!row) return res.status(404).json({ message: "Bon de livraison introuvable" });

        const [items] = await db.query(
            `SELECT bi.*, p.photo, p.reference
             FROM bon_de_livraison_items bi
             LEFT JOIN products p ON p.id = bi.produit_id
             WHERE bi.bon_livraison_id = ?
             ORDER BY bi.id ASC`,
            [id]
        );

        let reglement_lie = null;
        const commandeId = row.commande_id != null ? Number(row.commande_id) : null;
        const factureId = row.facture_id != null ? Number(row.facture_id) : null;
        if (Number.isFinite(commandeId) && commandeId > 0) {
            const [regRows] = await db.query(
                `SELECT rc.id, rc.date_reglement, rc.numero_recu
                 FROM reglements_clients rc
                 WHERE rc.commande_id = ?
                    OR (? IS NOT NULL AND rc.facture_id = ?)
                 ORDER BY rc.date_reglement DESC, rc.id DESC
                 LIMIT 1`,
                [commandeId, factureId, factureId]
            );
            if (Array.isArray(regRows) && regRows.length > 0) {
                reglement_lie = regRows[0];
            }
        }

        res.json({ ...row, items, reglement_lie });
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

        const [existingRows] = await connection.query(
            `SELECT id, numero_bon_livraison FROM bon_de_livraison
             WHERE commande_id = ?
               AND (statut IS NULL OR LOWER(TRIM(statut)) NOT IN ('annulé', 'annulée', 'annulee', 'annule'))
             ORDER BY id DESC
             LIMIT 1`,
            [commandeId]
        );
        const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
        if (existing) {
            await connection.rollback();
            return res.status(400).json({
                message: "Un bon de livraison existe déjà pour cette commande",
                id: existing.id,
            });
        }

        const [commandeRows] = await connection.query(
            `SELECT c.id, c.numero_commande, c.date_commande, c.client_id, c.user_id, c.montant_ht, c.montant_tva, c.montant_ttc,
                    c.devis_id,
                    c.point_de_vente_id,
                    (
                        SELECT p.id_point_de_vente
                        FROM commande_items ci
                        INNER JOIN products p ON p.id = ci.produit_id
                        WHERE ci.commande_id = c.id
                          AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ci.id
                        LIMIT 1
                    ) AS point_de_vente_from_items
             FROM commandes c
             WHERE c.id = ?
             LIMIT 1`,
            [commandeId]
        );
        const commande =
            Array.isArray(commandeRows) && commandeRows.length > 0 ? commandeRows[0] : null;
        if (!commande) {
            await connection.rollback();
            return res.status(404).json({ message: "Commande introuvable" });
        }

        const pdvFromCommande =
            commande.point_de_vente_id != null && Number(commande.point_de_vente_id) > 0
                ? Number(commande.point_de_vente_id)
                : null;
        const pdvFromItems =
            commande.point_de_vente_from_items != null && Number(commande.point_de_vente_from_items) > 0
                ? Number(commande.point_de_vente_from_items)
                : null;
        const pointDeVenteId = pdvFromCommande || pdvFromItems || null;
        const devisId =
            commande.devis_id != null && Number(commande.devis_id) > 0 ? Number(commande.devis_id) : null;

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
        const autoApproveBl = await shouldAutoApprove(req.user);
        const blStatutInitial = autoApproveBl ? BL_STATUT.LIVREE : BL_STATUT.EN_ATTENTE;
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
            blStatutInitial,
            Number(commande.montant_ht) || 0,
            Number(commande.montant_tva) || 0,
            Number(commande.montant_ttc) || 0,
        ];

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
        if (await hasColumn("bon_de_livraison", "point_de_vente_id")) {
            insertColumns.push("point_de_vente_id");
            insertValues.push(pointDeVenteId);
        }
        if (await hasColumn("bon_de_livraison", "devis_id")) {
            insertColumns.push("devis_id");
            insertValues.push(devisId);
        }

        const placeholders = insertColumns.map(() => "?").join(", ");
        const [insertBl] = await connection.query(
            `INSERT INTO bon_de_livraison (${insertColumns.join(", ")}) VALUES (${placeholders})`,
            insertValues
        );

        const blId = insertBl.insertId;
        const userId = req.user?.id || commande.user_id || null;
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
            await logBonLivraisonCreation(connection, {
                produitId: item.produit_id,
                bonLivraisonId: blId,
                numeroBl: numero,
                userId,
            });
            if (autoApproveBl && item.produit_id) {
                await logBonLivraisonSortie(connection, {
                    produitId: item.produit_id,
                    bonLivraisonId: blId,
                    numeroBl: numero,
                    userId,
                    description: "Bon de livraison livré (validation automatique)",
                });
            }
        }

        if (autoApproveBl) {
            await connection.query(
                `UPDATE bon_de_livraison SET statut = ? WHERE id = ?`,
                [BL_STATUT.LIVREE, blId]
            );
        }

        await connection.commit();
        return res.status(201).json({
            message: autoApproveBl
                ? "Bon de livraison créé et validé automatiquement"
                : "Bon de livraison créé",
            id: blId,
            numero_bon_livraison: numero,
            statut: blStatutInitial,
            auto_approved: autoApproveBl,
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
    const connection = await db.getConnection();
    try {
        await ensureBonLivraisonSchema();
        const blId = Number(req.params.id);
        if (!Number.isFinite(blId) || blId <= 0) {
            return res.status(400).json({ message: "ID invalide" });
        }

        await connection.beginTransaction();

        const [blRows] = await connection.query(
            `SELECT id, COALESCE(numero_bon_livraison, numero_bl) AS numero_bl
             FROM bon_de_livraison
             WHERE id = ?
               AND (
                    statut = ?
                    OR LOWER(REPLACE(TRIM(COALESCE(statut, '')), ' ', '_')) IN ('en_attente', 'enattente', 'brouillon')
               )
             LIMIT 1`,
            [blId, BL_STATUT.EN_ATTENTE]
        );
        if (!Array.isArray(blRows) || blRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Bon de livraison non trouvé ou déjà traité" });
        }

        const numeroBl = blRows[0].numero_bl;
        const [blItems] = await connection.query(
            "SELECT produit_id FROM bon_de_livraison_items WHERE bon_livraison_id = ?",
            [blId]
        );

        await connection.query(
            `UPDATE bon_de_livraison SET statut = ? WHERE id = ?`,
            [BL_STATUT.LIVREE, blId]
        );

        const userId = req.user?.id || null;
        for (const item of blItems || []) {
            await logBonLivraisonSortie(connection, {
                produitId: item.produit_id,
                bonLivraisonId: blId,
                numeroBl,
                userId,
                description: "Bon de livraison livré",
            });
        }

        await connection.commit();
        res.json({ message: "Bon de livraison validé (livré)" });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error("Error approving bon de livraison:", error);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
};

exports.rejectBonLivraison = async (req, res) => {
    try {
        await ensureBonLivraisonSchema();
        const { id } = req.params;
        const blId = Number(id);
        if (!Number.isFinite(blId) || blId <= 0) {
            return res.status(400).json({ message: "ID invalide" });
        }

        const [result] = await db.query(
            `UPDATE bon_de_livraison
             SET statut = ?
             WHERE id = ?
               AND (
                    statut = ?
                    OR LOWER(REPLACE(TRIM(COALESCE(statut, '')), ' ', '_')) IN ('en_attente', 'enattente', 'brouillon')
               )`,
            [BL_STATUT.ANNULEE, blId, BL_STATUT.EN_ATTENTE]
        );
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Bon de livraison non trouvé ou déjà traité" });
        }
        res.json({ message: "Bon de livraison refusé (annulé)" });
    } catch (error) {
        console.error("Error rejecting bon de livraison:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.updateBonLivraison = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await ensureBonLivraisonSchema();
        const { id } = req.params;
        const {
            numero_bon_livraison,
            date_bon_livraison,
            statut,
            montant_ht,
            montant_tva,
            montant_ttc,
            items,
        } = req.body || {};

        const blId = Number(id);
        if (!Number.isFinite(blId) || blId <= 0) {
            return res.status(400).json({ message: "ID BL invalide" });
        }

        await connection.beginTransaction();

        const [existing] = await connection.query(
            `SELECT id, statut, COALESCE(numero_bon_livraison, numero_bl) AS numero_bl
             FROM bon_de_livraison WHERE id = ? LIMIT 1`,
            [blId]
        );
        if (!Array.isArray(existing) || existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Bon de livraison introuvable" });
        }

        const previousStatut = normalizeBonLivraisonStatutForDb(existing[0].statut) || existing[0].statut;
        const numeroBl = existing[0].numero_bl;
        const userId = req.user?.id || null;
        let nextStatut = previousStatut;

        const fields = [];
        const values = [];

        if (numero_bon_livraison != null && String(numero_bon_livraison).trim()) {
            const numero = String(numero_bon_livraison).trim();
            fields.push("numero_bon_livraison = ?");
            values.push(numero);
            if (await hasColumn("bon_de_livraison", "numero_bl")) {
                fields.push("numero_bl = ?");
                values.push(numero);
            }
        }

        if (date_bon_livraison != null && String(date_bon_livraison).trim()) {
            const date = String(date_bon_livraison).slice(0, 10);
            fields.push("date_bon_livraison = ?");
            values.push(date);
            if (await hasColumn("bon_de_livraison", "date_livraison")) {
                fields.push("date_livraison = ?");
                values.push(date);
            }
            if (await hasColumn("bon_de_livraison", "date_bl")) {
                fields.push("date_bl = ?");
                values.push(date);
            }
        }

        if (statut != null && String(statut).trim()) {
            const canon = normalizeBonLivraisonStatutForDb(String(statut).trim());
            if (!canon) {
                await connection.rollback();
                return res.status(400).json({
                    message: "Statut invalide : en_attente, livree (livré) ou annulee (annulé) uniquement",
                });
            }
            fields.push("statut = ?");
            values.push(canon);
            nextStatut = canon;
        }

        if (montant_ht != null) {
            fields.push("montant_ht = ?");
            values.push(Number(montant_ht) || 0);
        }
        if (montant_tva != null) {
            fields.push("montant_tva = ?");
            values.push(Number(montant_tva) || 0);
        }
        if (montant_ttc != null) {
            fields.push("montant_ttc = ?");
            values.push(Number(montant_ttc) || 0);
        }

        if (Array.isArray(items)) {
            await connection.query("DELETE FROM bon_de_livraison_items WHERE bon_livraison_id = ?", [blId]);
            for (const item of items) {
                const designation = String(item?.designation || "").trim();
                if (!designation) continue;
                await connection.query(
                    `INSERT INTO bon_de_livraison_items
                        (bon_livraison_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        blId,
                        item?.produit_id ? Number(item.produit_id) : null,
                        designation,
                        Number(item?.quantite) || 0,
                        Number(item?.prix_unitaire) || 0,
                        Number(item?.tva) || 0,
                        Number(item?.reduction) || 0,
                        Number(item?.montant_ht) || 0,
                    ]
                );
                await logBonLivraisonCreation(connection, {
                    produitId: item?.produit_id ? Number(item.produit_id) : null,
                    bonLivraisonId: blId,
                    numeroBl,
                    userId,
                });
            }
        }

        if (nextStatut === BL_STATUT.LIVREE && previousStatut !== BL_STATUT.LIVREE) {
            const [blItems] = await connection.query(
                "SELECT produit_id FROM bon_de_livraison_items WHERE bon_livraison_id = ?",
                [blId]
            );
            for (const item of blItems || []) {
                await logBonLivraisonSortie(connection, {
                    produitId: item.produit_id,
                    bonLivraisonId: blId,
                    numeroBl,
                    userId,
                    description: "Bon de livraison livré",
                });
            }
        }

        if (fields.length > 0) {
            values.push(blId);
            await connection.query(`UPDATE bon_de_livraison SET ${fields.join(", ")} WHERE id = ?`, values);
        }

        await connection.commit();
        res.json({ message: "Bon de livraison mis à jour" });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error("Error updating bon de livraison:", error);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
};

exports.deleteBonLivraison = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await ensureBonLivraisonSchema();
        const { id } = req.params;
        await connection.beginTransaction();

        const [existing] = await connection.query(
            `SELECT id, COALESCE(numero_bon_livraison, numero_bl) AS numero_bl
             FROM bon_de_livraison WHERE id = ? LIMIT 1`,
            [id]
        );
        if (!Array.isArray(existing) || existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Bon de livraison introuvable" });
        }

        const numeroBl = existing[0].numero_bl;
        const [blItems] = await connection.query(
            "SELECT produit_id FROM bon_de_livraison_items WHERE bon_livraison_id = ?",
            [id]
        );
        const userId = req.user?.id || null;
        for (const item of blItems || []) {
            await logBonLivraisonSortie(connection, {
                produitId: item.produit_id,
                bonLivraisonId: Number(id),
                numeroBl,
                userId,
                description: "Bon de livraison supprimé",
            });
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

const blPdfConfig = {
    type: "BON_LIVRAISON",
    title: "BON DE LIVRAISON",
    infoTitle: "Bon de livraison",
    numberField: "numero_bon_livraison",
    dateField: "date_bon_livraison",
    statusField: "statut",
    defaultStatus: "En attente",
    footerLeft: "Merci pour votre confiance.",
};

const blPdfItemsQuery = `
    SELECT
        bi.id,
        bi.designation,
        bi.quantite AS quantite_livree,
        COALESCE(NULLIF(TRIM(p.reference), ''), NULLIF(TRIM(p.code_barre), ''), '—') AS reference,
        COALESCE(ci.quantite, bi.quantite) AS quantite_commandee
    FROM bon_de_livraison_items bi
    INNER JOIN bon_de_livraison bl ON bl.id = bi.bon_livraison_id
    LEFT JOIN products p ON p.id = bi.produit_id
    LEFT JOIN commande_items ci ON ci.commande_id = bl.commande_id
        AND (
            (bi.produit_id IS NOT NULL AND ci.produit_id = bi.produit_id)
            OR (bi.produit_id IS NULL AND TRIM(COALESCE(ci.designation, '')) = TRIM(COALESCE(bi.designation, '')))
        )
    WHERE bi.bon_livraison_id = ?
    ORDER BY bi.id ASC
`;

const blPdfSelect = `
            SELECT bl.*,
                   COALESCE(bl.numero_bon_livraison, bl.numero_bl) AS numero_bon_livraison,
                   COALESCE(bl.date_bon_livraison, bl.date_livraison) AS date_bon_livraison,
                   c.numero_commande,
                   COALESCE(
                        (
                            SELECT p.id_point_de_vente
                            FROM bon_de_livraison_items bi
                            INNER JOIN products p ON p.id = bi.produit_id
                            WHERE bi.bon_livraison_id = bl.id
                              AND p.id_point_de_vente IS NOT NULL
                            ORDER BY bi.id
                            LIMIT 1
                        ),
                        c.point_de_vente_id
                   ) AS point_de_vente_id,
                   COALESCE(
                        (
                            SELECT pv_items.logo
                            FROM bon_de_livraison_items bi
                            INNER JOIN products p ON p.id = bi.produit_id
                            INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                            WHERE bi.bon_livraison_id = bl.id
                              AND p.id_point_de_vente IS NOT NULL
                            ORDER BY bi.id
                            LIMIT 1
                        ),
                        pv.logo
                   ) AS point_de_vente_logo,
                   cl.nom_complet AS client_nom,
                   cl.email AS client_email,
                   cl.type AS client_type,
                   cl.ice AS client_ice,
                   cl.telephone AS client_telephone,
                   cl.email AS client_email,
                   cl.adresse AS client_adresse,
                   COALESCE(
                        (
                            SELECT ss_items.NOM_SOUS_SOCIETE
                            FROM bon_de_livraison_items bi
                            INNER JOIN products p ON p.id = bi.produit_id
                            INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                            LEFT JOIN sous_societe ss_items ON ss_items.ID = pv_items.id_sous_gestionnaire
                            WHERE bi.bon_livraison_id = bl.id
                              AND p.id_point_de_vente IS NOT NULL
                            ORDER BY bi.id
                            LIMIT 1
                        ),
                        ss.NOM_SOUS_SOCIETE,
                        (
                            SELECT ssn.NOM_SOUS_SOCIETE
                            FROM sous_societe ssn
                            WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(c.numero_commande, '-', 2), '-', -1))
                            ORDER BY ssn.ID
                            LIMIT 1
                        )
                   ) AS sous_societe_nom
            FROM bon_de_livraison bl
            LEFT JOIN commandes c ON c.id = bl.commande_id
            LEFT JOIN clients cl ON cl.id = bl.client_id
            LEFT JOIN point_de_vente pv ON pv.id = c.point_de_vente_id
            LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
`;

exports.sendBonLivraisonEmail = async (req, res) => {
    const { id } = req.params;
    const { to, subject, message } = req.body || {};

    if (!to) {
        return res.status(400).json({ message: "Le destinataire est requis" });
    }

    try {
        await ensureBonLivraisonSchema();
        const [rows] = await db.query(`${blPdfSelect} WHERE bl.id = ? LIMIT 1`, [id]);

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({ message: "Bon de livraison introuvable" });
        }

        const [items] = await db.query(blPdfItemsQuery, [id]);

        const docData = rows[0];
        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(docData, items || [], blPdfConfig);

        const emailSubject = subject || `[BL] ${docData.numero_bon_livraison}`;
        const emailText = message || `Veuillez trouver ci-joint le bon de livraison ${docData.numero_bon_livraison}.`;

        const { sendMail } = require("../services/emailService");
        await sendMail(to, emailSubject, emailText, [
            { filename: `Bon_Livraison_${docData.numero_bon_livraison}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
        ]);

        res.status(200).json({ message: "Email envoyé avec succès" });
    } catch (error) {
        console.error("Error sending bon livraison email:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
    }
};

exports.downloadBonLivraisonPdf = async (req, res) => {
    const { id } = req.params;
    try {
        await ensureBonLivraisonSchema();
        const [rows] = await db.query(`${blPdfSelect} WHERE bl.id = ? LIMIT 1`, [id]);

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({ message: "Bon de livraison introuvable" });
        }

        const [items] = await db.query(blPdfItemsQuery, [id]);

        const docData = rows[0];
        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(docData, items || [], blPdfConfig);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=Bon_Livraison_${docData.numero_bon_livraison}.pdf`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating bon livraison PDF for download:", error);
        res.status(500).json({ message: "Erreur serveur lors de la génération du PDF" });
    }
};
