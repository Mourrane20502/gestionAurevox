const db = require("../config/db").promise();
const { logProductMovement } = require("../utils/productMovementLogger");
const { formatDocumentNumber } = require("../utils/documentFormatter");
const { getOffset, getNextNumber } = require("../utils/numberingSettings");
const { canApprove, shouldAutoApprove } = require("../utils/approvalSettings");

const parseDateOnlySafe = (value) => {
    const raw = String(value || "").trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
        if (!Number.isNaN(dt.getTime())) return dt;
    }
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
};
const { sendDevisCreated } = require("../services/emailService");
const { sendDevisValidatedPdf } = require("../services/emailService");
const { buildDevisPdf } = require("../services/devisPdfService");

async function resolveSousSocieteFromItems(connection, items) {
    if (!Array.isArray(items) || items.length === 0) return { id: null, nom: null };
    const productIds = items
        .map((it) => Number(it?.produit_id))
        .filter((id) => Number.isFinite(id) && id > 0);
    if (!productIds.length) return { id: null, nom: null };
    const placeholders = productIds.map(() => "?").join(",");
    const [rows] = await connection.query(
        `
        SELECT pdv.id_sous_gestionnaire, ss.NOM_SOUS_SOCIETE
        FROM products p
        INNER JOIN point_de_vente pdv ON pdv.id = p.id_point_de_vente
        LEFT JOIN sous_societe ss ON ss.ID = pdv.id_sous_gestionnaire
        WHERE p.id IN (${placeholders})
          AND pdv.id_sous_gestionnaire IS NOT NULL
        LIMIT 1
        `,
        productIds
    );
    if (!Array.isArray(rows) || rows.length === 0) return { id: null, nom: null };
    const ssId = Number(rows[0].id_sous_gestionnaire);
    return {
        id: Number.isFinite(ssId) && ssId > 0 ? ssId : null,
        nom: rows[0].NOM_SOUS_SOCIETE || null,
    };
}

exports.createDevis = async (req, res) => {
    const {
        numero_devis,
        date_devis,
        statuts_devis,
        client_id,
        items,
        reduction
    } = req.body;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        let effectiveClientId = client_id;
        // For non-admins, only fallback to self-client when no explicit client was selected.
        if (req.user.role !== 'admin' && !effectiveClientId) {
            const nomComplet = `${req.user.nom} ${req.user.prenom}`.trim();
            const [existingClient] = await connection.execute(
                "SELECT id FROM clients WHERE nom_complet = ?",
                [nomComplet]
            );
            if (existingClient.length > 0) {
                effectiveClientId = existingClient[0].id;
            } else {
                const [newClient] = await connection.execute(
                    "INSERT INTO clients (nom_complet) VALUES (?)",
                    [nomComplet]
                );
                effectiveClientId = newClient.insertId;
            }
        }

        if (!effectiveClientId) {
            await connection.rollback();
            return res.status(400).json({
                message: "client_id is required"
            });
        }

        let totalHT = 0;
        let totalTVA = 0;
        let totalItemsRed = 0;
        let sumRedPct = 0;

        if (items && items.length > 0) {
            items.forEach(item => {
                const qte = Number(item.quantite) || 0;
                const pu = Number(item.prix_unitaire) || 0;
                const tvaTaux = Number(item.tva) || 0;
                const reductionItem = Number(item.reduction) || 0;

                const bruteHT = qte * pu;
                const itemRedAmount = bruteHT * (reductionItem / 100);
                const montantHT = bruteHT - itemRedAmount;
                const montantTVA = (montantHT * tvaTaux) / 100;

                totalHT += montantHT;
                totalTVA += montantTVA;
                totalItemsRed += itemRedAmount;
                sumRedPct += reductionItem; // sum of percentages
            });
        } else {
            totalHT = Number(req.body.montant_ht) || 0;
            const tauxTVA = Number(req.body.taux_tva) || 0;
            totalTVA = (totalHT * tauxTVA) / 100;
        }

        // Global reduction = sum of item reduction percentages
        const totalTTC = totalHT + totalTVA;

        const [client] = await connection.execute(
            "SELECT id FROM clients WHERE id = ?",
            [effectiveClientId]
        );

        if (client.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: "Client not found"
            });
        }

        const queryDevis = `
            INSERT INTO devis
            (numero_devis, date_devis, montant_ht, taux_tva, montant_tva, user_id, statuts_devis, client_id, reduction, total_reduction, montant_ttc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // For non-admin users, force status to "en attente"
        // Non-admin/non-responsable users must go through approval unless auto-approval conditions are met
        const allowedToApprove = await canApprove(req.user.role, 'devis');
        const autoApprove = await shouldAutoApprove(req.user);
        const defaultStatus = (req.user.role === 'user' && !autoApprove) ? "en attente" : "accepté";
        
        // Force 'accepté' if autoApprove is true
        const finalStatus = autoApprove ? "accepté" : (allowedToApprove ? (statuts_devis || defaultStatus) : "en attente");

        const [result] = await connection.query(queryDevis, [
            `TEMP-${Date.now()}`,
            date_devis || new Date().toISOString().split('T')[0],
            totalHT,
            req.body.taux_tva ?? items?.[0]?.tva ?? 0,
            totalTVA,
            req.user.id,
            finalStatus,
            effectiveClientId,
            parseFloat(sumRedPct.toFixed(4)),
            totalItemsRed,
            totalTTC
        ]);

        const devisId = result.insertId;

        // Auto-generate final numero_devis avec séquence configurable
        const sousSociete = await resolveSousSocieteFromItems(connection, items);
        const seqNumber = await getNextNumber("DE", devisId, connection, { sousSocieteId: sousSociete.id });
        const numeroDate = parseDateOnlySafe(date_devis || new Date().toISOString().split("T")[0]);
        const final_numero = formatDocumentNumber('DE', seqNumber, numeroDate, { sousSocieteNom: sousSociete.nom });
        await connection.execute("UPDATE devis SET numero_devis = ? WHERE id = ?", [final_numero, devisId]);

        if (items && items.length > 0) {
            const queryItems = `
                INSERT INTO devis_items
                (devis_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                VALUES ?
            `;
            const itemsData = items.map(item => [
                devisId,
                item.produit_id || null,
                item.designation,
                item.quantite || 1,
                item.prix_unitaire || 0,
                item.tva || 0,
                item.reduction || 0,
                (Number(item.quantite) || 0) * (Number(item.prix_unitaire) || 0) * (1 - (Number(item.reduction) || 0) / 100)
            ]);
            await connection.query(queryItems, [itemsData]);
        }

        await connection.commit();
        res.status(201).json({
            message: "Devis created successfully",
            id: devisId
        });

        // Notify via Socket.io
        const io = req.app.get("io");
        if (io) {
            io.emit("notification", {
                type: "devis",
                numero: final_numero,
                user: `${req.user.prenom} ${req.user.nom}`,
                date: new Date().toISOString()
            });
        }

        sendDevisCreated(final_numero, devisId).catch((err) =>
            console.error("[Devis] Email on create failed:", err.message)
        );

    } catch (error) {
        await connection.rollback();
        console.error("[Devis][createDevis] failed", {
            message: error?.message,
            code: error?.code,
            errno: error?.errno,
            sqlState: error?.sqlState,
            sqlMessage: error?.sqlMessage,
            sql: error?.sql,
            userId: req?.user?.id,
            role: req?.user?.role,
            client_id,
            hasItems: Array.isArray(items) ? items.length > 0 : false,
            itemCount: Array.isArray(items) ? items.length : 0,
        });
        if (error?.stack) {
            console.error("[Devis][createDevis] stack:", error.stack);
        }
        res.status(500).json({
            message: "Internal server error"
        });
    } finally {
        connection.release();
    }
};

exports.getAllDevis = async (req, res) => {
    try {
        let sql = `
            SELECT 
                d.*,
                c.nom_complet as client_nom,
                c.\`type\` as client_type,
                c.ice as client_ice,
                c.telephone as client_telephone,
                c.email as client_email,
                c.adresse as client_adresse,
                CONCAT(u.prenom, ' ', u.nom) as user_nom,
                (
                    SELECT nom
                    FROM point_de_vente pv
                    WHERE pv.id = COALESCE(
                        (SELECT p.id_point_de_vente
                         FROM devis_items di
                         INNER JOIN products p ON di.produit_id = p.id
                         WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL
                         ORDER BY di.id
                         LIMIT 1),
                        (SELECT point_de_vente_id FROM commandes WHERE devis_id = d.id LIMIT 1)
                    )
                    LIMIT 1
                ) AS point_de_vente_nom,
                (
                    SELECT COUNT(DISTINCT p.id_point_de_vente)
                    FROM devis_items di
                    INNER JOIN products p ON di.produit_id = p.id
                    WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL
                ) AS pdv_count_from_items,
                (
                    SELECT pv.nom
                    FROM devis_items di
                    INNER JOIN products p ON di.produit_id = p.id
                    INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                    WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL
                    ORDER BY di.id
                    LIMIT 1
                ) AS point_de_vente_nom_from_items,
                (
                    SELECT ss.NOM_SOUS_SOCIETE
                    FROM point_de_vente pv
                    LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
                    WHERE pv.id = COALESCE(
                        (SELECT p.id_point_de_vente
                         FROM devis_items di
                         INNER JOIN products p ON di.produit_id = p.id
                         WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL
                         ORDER BY di.id
                         LIMIT 1),
                        (SELECT point_de_vente_id FROM commandes WHERE devis_id = d.id LIMIT 1)
                    )
                    LIMIT 1
                ) AS sous_societe_nom,
                (
                    SELECT ss_items.NOM_SOUS_SOCIETE
                    FROM devis_items di
                    INNER JOIN products p ON di.produit_id = p.id
                    INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                    LEFT JOIN sous_societe ss_items ON ss_items.ID = pv_items.id_sous_gestionnaire
                    WHERE di.devis_id = d.id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY di.id
                    LIMIT 1
                ) AS sous_societe_nom_from_items,
                (
                    SELECT ssn.NOM_SOUS_SOCIETE
                    FROM sous_societe ssn
                    WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(d.numero_devis, '-', 2), '-', -1))
                    ORDER BY ssn.ID
                    LIMIT 1
                ) AS sous_societe_nom_from_numero,
                EXISTS(SELECT 1 FROM commandes co WHERE co.devis_id = d.id) AS has_commande,
                EXISTS(SELECT 1 FROM factures f WHERE f.devis_id = d.id) AS has_facture,
                EXISTS(
                    SELECT 1 FROM bon_de_livraison bl
                    INNER JOIN commandes co ON co.id = bl.commande_id
                    WHERE co.devis_id = d.id
                      AND (bl.statut IS NULL OR LOWER(TRIM(bl.statut)) NOT IN ('annulé', 'annulée', 'annulee', 'annule'))
                    LIMIT 1
                ) AS has_bon_livraison,
                (
                    SELECT bl.id
                    FROM bon_de_livraison bl
                    INNER JOIN commandes co ON co.id = bl.commande_id
                    WHERE co.devis_id = d.id
                      AND (bl.statut IS NULL OR LOWER(TRIM(bl.statut)) NOT IN ('annulé', 'annulée', 'annulee', 'annule'))
                    ORDER BY bl.id DESC
                    LIMIT 1
                ) AS bon_livraison_id,
                COALESCE(d.reduction, 0) AS reduction,
                (
                    SELECT COALESCE(SUM(
                        CASE
                            WHEN p.prix_de_vente IS NOT NULL AND CAST(p.prix_de_vente AS DECIMAL(14,4)) > 0 THEN
                                COALESCE(di.quantite, 0) * (CAST(p.prix_de_vente AS DECIMAL(14,4)) - COALESCE(CAST(p.prix AS DECIMAL(14,4)), 0))
                            ELSE
                                COALESCE(di.montant_ht, 0) - (COALESCE(di.quantite, 0) * COALESCE(CAST(p.prix AS DECIMAL(14,4)), 0))
                        END
                    ), 0)
                    FROM devis_items di
                    INNER JOIN products p ON di.produit_id = p.id
                    WHERE di.devis_id = d.id
                ) AS marge_ht
            FROM devis d
            LEFT JOIN clients c ON d.client_id = c.id
            LEFT JOIN users u ON d.user_id = u.id
        `;
        const params = [];

        // Admin et Directeur voient tous les devis.
        // Les autres voient les leurs, SAUF s'ils ont des droits d'approbation (auquel cas ils voient aussi les "en attente")
        const allowedToApprove = await canApprove(req.user.role, 'devis');
        if (req.user.role !== 'admin' && req.user.role !== 'directeur') {
            if (allowedToApprove) {
                sql += " WHERE (d.user_id = ? OR d.statuts_devis = 'en attente')";
                params.push(req.user.id);
            } else {
                sql += " WHERE d.user_id = ?";
                params.push(req.user.id);
            }
        }

        sql += " ORDER BY d.id DESC";

        const [rows] = await db.execute(sql, params);
        const devis = rows.map((row) => {
            const red = row.reduction;
            const totalRed = row.total_reduction;
            const pdvCount = Number(row.pdv_count_from_items) || 0;
            const resolvedPdvName =
                pdvCount > 1
                    ? "Plusieurs points de vente"
                    : (row.point_de_vente_nom_from_items || row.point_de_vente_nom || null);
            const { pdv_count_from_items, point_de_vente_nom_from_items, ...rest } = row;
            return {
                ...rest,
                point_de_vente_nom: resolvedPdvName,
                sous_societe_nom: row.sous_societe_nom_from_items || row.sous_societe_nom || row.sous_societe_nom_from_numero || null,
                reduction: (red !== undefined && red !== null && red !== '') ? Number(red) : 0,
                total_reduction: (totalRed !== undefined && totalRed !== null && totalRed !== '') ? Number(totalRed) : 0
            };
        });
        res.json(devis);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
}
exports.updateDevis = async (req, res) => {
    const { id } = req.params;
    const {
        numero_devis,
        date_devis,
        statuts_devis,
        client_id,
        items,
        reduction
    } = req.body;

    if (!numero_devis || !client_id) {
        return res.status(400).json({
            message: "numero_devis and client_id are required"
        });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // Récupérer l'ancien statut et numéro pour savoir si le devis était déjà accepté
        const [existingRows] = await connection.execute(
            "SELECT statuts_devis, numero_devis FROM devis WHERE id = ?",
            [id]
        );

        if (existingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Devis not found" });
        }

        const previousStatus = existingRows[0].statuts_devis;
        const numeroDevis = existingRows[0].numero_devis;
        // Pour les non-admins, on ne touche PAS au statut: ils ne peuvent pas le modifier.
        // Seuls admin / responsable / superadmin peuvent changer statuts_devis.
        const isPrivileged = req.user.role === 'admin' || req.user.role === 'responsable' || req.user.role === 'superadmin';
        const newStatus = isPrivileged
            ? (statuts_devis || "en attente")
            : previousStatus;

        let totalHT = 0;
        let totalTVA = 0;
        let totalItemsRed = 0;
        let sumRedPct = 0;

        if (items && items.length > 0) {
            items.forEach(item => {
                const qte = Number(item.quantite) || 0;
                const pu = Number(item.prix_unitaire) || 0;
                const tvaTaux = Number(item.tva) || 0;
                const redTaux = Number(item.reduction) || 0;

                const bruteHT = qte * pu;
                const itemRedAmount = bruteHT * (redTaux / 100);
                const montantHT = bruteHT - itemRedAmount;
                const montantTVA = (montantHT * tvaTaux) / 100;

                totalHT += montantHT;
                totalTVA += montantTVA;
                totalItemsRed += itemRedAmount;
                sumRedPct += redTaux;
            });
        } else {
            totalHT = Number(req.body.montant_ht) || 0;
            const tauxTVA = Number(req.body.taux_tva) || 0;
            totalTVA = (totalHT * tauxTVA) / 100;
        }

        // Global reduction = sum of item reduction percentages
        const totalTTC = totalHT + totalTVA;

        const [client] = await connection.execute(
            "SELECT id FROM clients WHERE id = ?",
            [client_id]
        );

        if (client.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: "Client not found"
            });
        }

        const queryDevis = `
            UPDATE devis
            SET numero_devis = ?, date_devis = ?, montant_ht = ?, taux_tva = ?, montant_tva = ?, statuts_devis = ?, client_id = ?, reduction = ?, total_reduction = ?, montant_ttc = ?
            WHERE id = ? ${(
                req.user.role !== 'admin' &&
                req.user.role !== 'directeur' &&
                req.user.role !== 'responsable'
            ) ? 'AND user_id = ?' : ''}
        `;

        const updateParams = [
            numero_devis,
            date_devis || new Date().toISOString().split('T')[0],
            totalHT,
            req.body.taux_tva ?? items?.[0]?.tva ?? 0,
            totalTVA,
            newStatus,
            client_id,
            parseFloat(sumRedPct.toFixed(4)),
            totalItemsRed,
            totalTTC,
            id
        ];

        if (
            req.user.role !== 'admin' &&
            req.user.role !== 'directeur' &&
            req.user.role !== 'responsable'
        ) {
            updateParams.push(req.user.id);
        }

        const [result] = await connection.query(queryDevis, updateParams);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Devis not found" });
        }

        // Handle items: Remove existing and re-insert
        await connection.execute("DELETE FROM devis_items WHERE devis_id = ?", [id]);

        if (items && items.length > 0) {
            const queryItems = `
                INSERT INTO devis_items
                (devis_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                VALUES ?
            `;
            const itemsData = items.map(item => [
                id,
                item.produit_id || null,
                item.designation,
                item.quantite || 1,
                item.prix_unitaire || 0,
                item.tva || 0,
                item.reduction || 0,
                (Number(item.quantite) || 0) * (Number(item.prix_unitaire) || 0) * (1 - (Number(item.reduction) || 0) / 100)
            ]);
            await connection.query(queryItems, [itemsData]);
        }

        await connection.commit();
        res.json({
            message: "Devis updated successfully"
        });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({
            message: "Internal server error"
        });
    } finally {
        connection.release();
    }
};

/* ===============================
   APPROVE DEVIS (Admin/Responsable)
================================= */
exports.approveDevis = async (req, res) => {
    const { id } = req.params;

    // Dynamic approval check
    const allowed = await canApprove(req.user.role, 'devis');
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour valider un devis" });
    }

    try {
        const [rows] = await db.execute("SELECT id, statuts_devis FROM devis WHERE id = ?", [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Devis introuvable" });
        }

        if (rows[0].statuts_devis === "accepté") {
            return res.status(400).json({ message: "Ce devis est déjà accepté" });
        }

        await db.execute(
            "UPDATE devis SET statuts_devis = 'accepté' WHERE id = ?",
            [id]
        );

        // Background PDF/email processes (slow) to make response instant
        (async () => {
            try {
                const [devisRows] = await db.execute(
                    `SELECT d.*, c.nom_complet AS client_nom FROM devis d
                     LEFT JOIN clients c ON d.client_id = c.id WHERE d.id = ?`,
                    [id]
                );
                const [itemsRows] = await db.execute(
                    `SELECT di.*, COALESCE(p.nom, di.designation) AS designation
                     FROM devis_items di LEFT JOIN products p ON di.produit_id = p.id WHERE di.devis_id = ?`,
                    [id]
                );
                const devisData = devisRows[0];
                const items = itemsRows || [];
                const pdfBuffer = await buildDevisPdf(devisData, items);
                await sendDevisValidatedPdf(devisData.numero_devis || `DE-${id}`, pdfBuffer);
            } catch (emailErr) {
                console.error("[Devis] PDF/email on validation failed (devis still accepted):", emailErr.message);
            }
        })();

        res.status(200).json({ message: "Devis accepté avec succès" });
    } catch (error) {
        console.error("Error approving devis:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/* ===============================
   REJECT DEVIS (Admin/Responsable)
================================= */
exports.rejectDevis = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, 'devis');
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour rejeter un devis" });
    }
    try {
        const [rows] = await db.execute("SELECT id, statuts_devis FROM devis WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Devis introuvable" });
        }
        if (rows[0].statuts_devis !== "en attente") {
            return res.status(400).json({ message: "Ce devis n'est plus en attente" });
        }
        await db.execute("UPDATE devis SET statuts_devis = 'refusé' WHERE id = ?", [id]);
        res.status(200).json({ message: "Devis rejeté" });
    } catch (error) {
        console.error("Error rejecting devis:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getDevisById = async (req, res) => {
    const { id } = req.params;
    try {
        let sql = `
            SELECT d.*,
                   c.nom_complet as client_nom,
                   c.\`type\` as client_type,
                   c.ice as client_ice,
                   c.telephone as client_telephone,
                   c.email as client_email,
                   c.adresse as client_adresse,
                   (
                       SELECT ssn.NOM_SOUS_SOCIETE
                       FROM sous_societe ssn
                       WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(d.numero_devis, '-', 2), '-', -1))
                       ORDER BY ssn.ID
                       LIMIT 1
                   ) AS sous_societe_nom_from_numero,
                   (
                       SELECT pv.logo
                       FROM point_de_vente pv
                       WHERE pv.id = COALESCE(
                           (SELECT p.id_point_de_vente FROM devis_items di INNER JOIN products p ON di.produit_id = p.id WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL ORDER BY di.id LIMIT 1),
                           (SELECT point_de_vente_id FROM commandes WHERE devis_id = d.id LIMIT 1)
                       )
                       LIMIT 1
                   ) AS point_de_vente_logo,
                   (SELECT point_de_vente_id FROM commandes WHERE devis_id = d.id LIMIT 1) AS point_de_vente_id_from_commande,
                   (SELECT p.id_point_de_vente FROM devis_items di INNER JOIN products p ON di.produit_id = p.id WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL ORDER BY di.id LIMIT 1) AS point_de_vente_id_from_items,
                   COALESCE(
                       (SELECT p.id_point_de_vente FROM devis_items di INNER JOIN products p ON di.produit_id = p.id WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL ORDER BY di.id LIMIT 1),
                       (SELECT point_de_vente_id FROM commandes WHERE devis_id = d.id LIMIT 1)
                   ) AS point_de_vente_id,
                   (
                       SELECT bl.id
                       FROM bon_de_livraison bl
                       INNER JOIN commandes co ON co.id = bl.commande_id
                       WHERE co.devis_id = d.id
                         AND (bl.statut IS NULL OR LOWER(TRIM(bl.statut)) NOT IN ('annulé', 'annulée', 'annulee', 'annule'))
                       ORDER BY bl.id DESC
                       LIMIT 1
                   ) AS bon_livraison_id,
                   (
                       SELECT bl.numero_bon_livraison
                       FROM bon_de_livraison bl
                       INNER JOIN commandes co ON co.id = bl.commande_id
                       WHERE co.devis_id = d.id
                         AND (bl.statut IS NULL OR LOWER(TRIM(bl.statut)) NOT IN ('annulé', 'annulée', 'annulee', 'annule'))
                       ORDER BY bl.id DESC
                       LIMIT 1
                   ) AS numero_bon_livraison_linked
            FROM devis d
            LEFT JOIN clients c ON d.client_id = c.id
            WHERE d.id = ?
        `;
        const params = [id];

        if (req.user.role !== 'admin' && req.user.role !== 'directeur' && req.user.role !== 'responsable') {
            sql += " AND d.user_id = ?";
            params.push(req.user.id);
        }

        const [devis] = await db.execute(sql, params);

        if (devis.length === 0) {
            return res.status(404).json({ message: "Devis not found" });
        }

        const [items] = await db.execute(`
            SELECT di.*, p.photo, p.grammage, p.reference, COALESCE(p.nom, di.designation) as designation 
            FROM devis_items di
            LEFT JOIN products p ON di.produit_id = p.id
            WHERE di.devis_id = ?
        `, [id]);

        console.log("[Devis][getById][pdf_logo_debug]", {
            id: devis[0].id,
            numero_devis: devis[0].numero_devis,
            point_de_vente_id: devis[0].point_de_vente_id ?? null,
            point_de_vente_id_from_commande: devis[0].point_de_vente_id_from_commande ?? null,
            point_de_vente_id_from_items: devis[0].point_de_vente_id_from_items ?? null,
            point_de_vente_logo: devis[0].point_de_vente_logo ?? null,
            sous_societe_nom_from_numero: devis[0].sous_societe_nom_from_numero ?? null,
        });

        res.json({
            ...devis[0],
            sous_societe_nom: devis[0].sous_societe_nom_from_numero || null,
            items
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.deleteDevis = async (req, res) => {
    const { id } = req.params;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const devisId = Number(id);
        if (!Number.isFinite(devisId) || devisId <= 0) {
            await connection.rollback();
            return res.status(400).json({ message: "Identifiant devis invalide." });
        }

        // Interdire la suppression si déjà lié à une commande
        const [linkedCommandes] = await connection.execute(
            "SELECT id FROM commandes WHERE devis_id = ? LIMIT 1",
            [devisId]
        );
        if (linkedCommandes.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                message: "Impossible de supprimer ce devis car il est déjà lié à une commande."
            });
        }

        // Check if devis is already linked to a facture: in that case, forbid deletion
        const [linkedFactures] = await connection.execute(
            "SELECT id FROM factures WHERE devis_id = ? LIMIT 1",
            [devisId]
        );

        if (linkedFactures.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                message: "Impossible de supprimer ce devis car il est déjà lié à une facture."
            });
        }

        // Nettoyer d'abord les lignes enfants pour éviter les erreurs FK
        await connection.execute("DELETE FROM devis_items WHERE devis_id = ?", [devisId]);

        let sql = "DELETE FROM devis WHERE id = ?";
        const params = [devisId];

        if (req.user.role !== 'admin') {
            sql += " AND user_id = ?";
            params.push(req.user.id);
        }

        const [result] = await connection.execute(sql, params);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Devis not found" });
        }

        await connection.commit();
        res.json({ message: "Devis deleted successfully" });
    } catch (error) {
        await connection.rollback();
        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(400).json({
                message: "Impossible de supprimer ce devis car il est déjà lié à un document."
            });
        }
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.getNextDevisNumber = async (req, res) => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `DE-${year}/${month}/`;

        const [lastDevis] = await db.execute(
            "SELECT numero_devis FROM devis WHERE numero_devis LIKE ? ORDER BY id DESC LIMIT 1",
            [`${prefix}%`]
        );

        const deOffset = await getOffset("DE");

        let nextNumber;
        if (deOffset > 0) {
            // S'il y a une séquence personnalisée, on la propose telle quelle (sans l'incrémenter)
            nextNumber = deOffset;
        } else if (lastDevis.length > 0) {
            const lastNumero = lastDevis[0].numero_devis;
            const parts = lastNumero.split('/');
            const lastIncrement = parseInt(parts[parts.length - 1]);
            nextNumber = !isNaN(lastIncrement) ? lastIncrement + 1 : 1;
        } else {
            nextNumber = 1;
        }

        const formattedNumber = formatDocumentNumber('DE', nextNumber);
        res.json({ nextNumber: formattedNumber });
    } catch (error) {
        console.error("Error generating next devis number:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.sendDevisEmail = async (req, res) => {
    const { id } = req.params;
    const { to, subject, message } = req.body;

    if (!to) {
        return res.status(400).json({ message: "Le destinataire est requis" });
    }

    try {
        const [devisRows] = await db.execute(
            `SELECT d.*, 
                    c.nom_complet AS client_nom,
                    c.\`type\` AS client_type,
                    c.email AS client_email,
                    c.telephone AS client_telephone,
                    c.ice AS client_ice,
                    c.adresse AS client_adresse,
                    COALESCE(
                        (SELECT p.id_point_de_vente FROM devis_items di INNER JOIN products p ON di.produit_id = p.id WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL ORDER BY di.id LIMIT 1),
                        (SELECT point_de_vente_id FROM commandes WHERE devis_id = d.id LIMIT 1)
                    ) AS point_de_vente_id
             FROM devis d 
             LEFT JOIN clients c ON d.client_id = c.id WHERE d.id = ?`,
            [id]
        );

        if (devisRows.length === 0) {
            return res.status(404).json({ message: "Devis introuvable" });
        }

        const [itemsRows] = await db.execute(
            `SELECT di.*, COALESCE(p.nom, di.designation) AS designation 
             FROM devis_items di LEFT JOIN products p ON di.produit_id = p.id WHERE di.devis_id = ?`,
            [id]
        );

        const devisData = devisRows[0];
        const items = itemsRows || [];

        const pdfBuffer = await buildDevisPdf(devisData, items);

        const emailSubject = subject || `[Devis] ${devisData.numero_devis}`;
        const emailText = message || `Veuillez trouver ci-joint le devis ${devisData.numero_devis}.`;

        const { sendMail } = require("../services/emailService");
        await sendMail(to, emailSubject, emailText, [
            { filename: `Devis_${devisData.numero_devis}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
        ]);

        res.status(200).json({ message: "Email envoyé avec succès" });
    } catch (error) {
        console.error("Error sending devis email:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
    }
};

exports.downloadDevisPdf = async (req, res) => {
    const { id } = req.params;

    try {
        const [devisRows] = await db.execute(
            `SELECT d.*, 
                    c.nom_complet AS client_nom,
                    c.\`type\` AS client_type,
                    c.email AS client_email,
                    c.telephone AS client_telephone,
                    c.ice AS client_ice,
                    c.adresse AS client_adresse,
                    COALESCE(
                        (SELECT p.id_point_de_vente FROM devis_items di INNER JOIN products p ON di.produit_id = p.id WHERE di.devis_id = d.id AND p.id_point_de_vente IS NOT NULL ORDER BY di.id LIMIT 1),
                        (SELECT point_de_vente_id FROM commandes WHERE devis_id = d.id LIMIT 1)
                    ) AS point_de_vente_id
             FROM devis d 
             LEFT JOIN clients c ON d.client_id = c.id WHERE d.id = ?`,
            [id]
        );

        if (devisRows.length === 0) {
            return res.status(404).json({ message: "Devis introuvable" });
        }

        const [itemsRows] = await db.execute(
            `SELECT di.*, COALESCE(p.nom, di.designation) AS designation 
             FROM devis_items di LEFT JOIN products p ON di.produit_id = p.id WHERE di.devis_id = ?`,
            [id]
        );

        const devisData = devisRows[0];
        const items = itemsRows || [];

        const { buildDevisPdf } = require("../services/devisPdfService");
        const pdfBuffer = await buildDevisPdf(devisData, items);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=Devis_${devisData.numero_devis}.pdf`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating devis PDF for download:", error);
        res.status(500).json({ message: "Erreur serveur lors de la génération du PDF" });
    }
};
