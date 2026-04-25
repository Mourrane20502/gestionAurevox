const db = require("../config/db").promise();
const { formatDocumentNumber } = require("../utils/documentFormatter");
const { getNextNumber } = require("../utils/numberingSettings");
const { canApprove } = require("../utils/approvalSettings");

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

const sumGrammage = (items) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((acc, it) => acc + (Number(it.grammage) || 0), 0);
};

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const clampPct = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
};

function computeFinance(items) {
    const normalizedItems = items.map((it) => {
        const grammage = Number(it.grammage) || 0;
        const prix_unitaire = Number(it.prix_unitaire) || 0;
        const reduction = clampPct(it.reduction);
        const taux_tva = Number.isFinite(Number(it.taux_tva)) ? Number(it.taux_tva) : 0;
        const prix_brut = grammage * prix_unitaire;
        const montant_ht = prix_brut * (1 - reduction / 100);
        const montant_tva = montant_ht * (taux_tva / 100);
        const montant_ttc = montant_ht + montant_tva;
        return {
            ...it,
            grammage: round4(grammage),
            prix_unitaire: round4(prix_unitaire),
            reduction: round4(reduction),
            taux_tva: round4(taux_tva),
            montant_ht: round4(montant_ht),
            montant_tva: round4(montant_tva),
            montant_ttc: round4(montant_ttc),
            _prix_brut: round4(prix_brut),
        };
    });

    const prix_total = round4(normalizedItems.reduce((acc, it) => acc + it._prix_brut, 0));
    const montant_ht = round4(normalizedItems.reduce((acc, it) => acc + it.montant_ht, 0));
    const montant_tva = round4(normalizedItems.reduce((acc, it) => acc + it.montant_tva, 0));
    const montant_ttc = round4(normalizedItems.reduce((acc, it) => acc + it.montant_ttc, 0));
    const reduction = prix_total > 0 ? round4(((prix_total - montant_ht) / prix_total) * 100) : 0;
    const taux_tva = montant_ht > 0 ? round4((montant_tva / montant_ht) * 100) : 0;

    return { normalizedItems, totals: { prix_total, reduction, montant_ht, taux_tva, montant_tva, montant_ttc } };
}

exports.createDevisGros = async (req, res) => {
    const { date_devis, client_id, items, statuts_devis } = req.body;
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        let effectiveClientId = client_id;
        if (req.user.role !== "admin") {
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
            return res.status(400).json({ message: "client_id is required" });
        }

        const [client] = await connection.execute("SELECT id FROM clients WHERE id = ?", [effectiveClientId]);
        if (client.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Client not found" });
        }

        if (!Array.isArray(items) || items.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: "Au moins une ligne (grammage) est requise" });
        }

        for (const it of items) {
            const des = String(it.designation || "").trim();
            const g = Number(it.grammage);
            if (!des) {
                await connection.rollback();
                return res.status(400).json({ message: "Chaque ligne doit avoir une désignation" });
            }
            if (!Number.isFinite(g) || g <= 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Le grammage doit être > 0 pour chaque ligne" });
            }
        }

        const totalGrammage = sumGrammage(items);
        const { normalizedItems, totals } = computeFinance(items);

        const finalStatus = "en attente";

        const [result] = await connection.execute(
            `
            INSERT INTO devis_gros
            (numero_devis, date_devis, grammage, prix_total, reduction, montant_ht, taux_tva, montant_tva, montant_ttc, user_id, client_id, statuts_devis)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                `TEMP-${Date.now()}`,
                date_devis || new Date().toISOString().split("T")[0],
                totalGrammage,
                totals.prix_total,
                totals.reduction,
                totals.montant_ht,
                totals.taux_tva,
                totals.montant_tva,
                totals.montant_ttc,
                req.user.id,
                effectiveClientId,
                finalStatus,
            ]
        );

        const devisGrosId = result.insertId;

        const sousSociete = await resolveSousSocieteFromItems(connection, items);
        const seqNumber = await getNextNumber("DG", devisGrosId, connection, { sousSocieteId: sousSociete.id });
        const final_numero = formatDocumentNumber("DG", seqNumber, new Date(), { sousSocieteNom: sousSociete.nom });
        await connection.execute("UPDATE devis_gros SET numero_devis = ? WHERE id = ?", [final_numero, devisGrosId]);

        const rowsItems = normalizedItems.map((item) => [
            devisGrosId,
            item.produit_id || null,
            String(item.designation).trim(),
            Number(item.grammage) || 0,
            Number(item.prix_unitaire) || 0,
            Number(item.reduction) || 0,
            Number(item.montant_ht) || 0,
            Number(item.taux_tva) || 0,
            Number(item.montant_tva) || 0,
            Number(item.montant_ttc) || 0,
        ]);
        await connection.query(
            "INSERT INTO devis_gros_items (devis_gros_id, produit_id, designation, grammage, prix_unitaire, reduction, montant_ht, taux_tva, montant_tva, montant_ttc) VALUES ?",
            [rowsItems]
        );

        await connection.commit();
        res.status(201).json({ message: "Devis gros créé", id: devisGrosId, numero_devis: final_numero });
    } catch (error) {
        await connection.rollback();
        console.error("[devisGros][create]", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.getAllDevisGros = async (req, res) => {
    try {
        let sql = `
            SELECT
                d.*,
                c.nom_complet AS client_nom,
                CONCAT(u.prenom, ' ', u.nom) AS user_nom,
                (
                    SELECT COUNT(DISTINCT p.id_point_de_vente)
                    FROM devis_gros_items dgi
                    INNER JOIN products p ON dgi.produit_id = p.id
                    WHERE dgi.devis_gros_id = d.id AND p.id_point_de_vente IS NOT NULL
                ) AS pdv_count_from_items,
                (
                    SELECT pv.nom
                    FROM devis_gros_items dgi
                    INNER JOIN products p ON dgi.produit_id = p.id
                    INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                    WHERE dgi.devis_gros_id = d.id AND p.id_point_de_vente IS NOT NULL
                    ORDER BY dgi.id
                    LIMIT 1
                ) AS point_de_vente_nom_from_items,
                (
                    SELECT ss_items.NOM_SOUS_SOCIETE
                    FROM devis_gros_items dgi
                    INNER JOIN products p ON dgi.produit_id = p.id
                    INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                    LEFT JOIN sous_societe ss_items ON ss_items.ID = pv_items.id_sous_gestionnaire
                    WHERE dgi.devis_gros_id = d.id AND p.id_point_de_vente IS NOT NULL
                    ORDER BY dgi.id
                    LIMIT 1
                ) AS sous_societe_nom_from_items,
                (
                    SELECT pv.nom
                    FROM commandes_gros cg
                    INNER JOIN point_de_vente pv ON pv.id = cg.point_de_vente_id
                    WHERE cg.devis_gros_id = d.id
                    ORDER BY cg.id DESC
                    LIMIT 1
                ) AS point_de_vente_nom_from_commande,
                (
                    SELECT ss.NOM_SOUS_SOCIETE
                    FROM commandes_gros cg
                    INNER JOIN point_de_vente pv ON pv.id = cg.point_de_vente_id
                    LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
                    WHERE cg.devis_gros_id = d.id
                    ORDER BY cg.id DESC
                    LIMIT 1
                ) AS sous_societe_nom_from_commande,
                EXISTS(SELECT 1 FROM commandes_gros cg WHERE cg.devis_gros_id = d.id LIMIT 1) AS has_commande_gros_link,
                (
                    SELECT cg.id
                    FROM commandes_gros cg
                    WHERE cg.devis_gros_id = d.id
                    ORDER BY cg.id DESC
                    LIMIT 1
                ) AS linked_commande_gros_id,
                EXISTS(
                    SELECT 1
                    FROM factures_gros fg
                    LEFT JOIN commandes_gros cg2 ON cg2.id = fg.commande_gros_id
                    WHERE fg.devis_gros_id = d.id OR cg2.devis_gros_id = d.id
                    LIMIT 1
                ) AS has_facture_gros_link,
                (
                    SELECT fg.id
                    FROM factures_gros fg
                    LEFT JOIN commandes_gros cg2 ON cg2.id = fg.commande_gros_id
                    WHERE fg.devis_gros_id = d.id OR cg2.devis_gros_id = d.id
                    ORDER BY fg.id DESC
                    LIMIT 1
                ) AS linked_facture_gros_id
            FROM devis_gros d
            LEFT JOIN clients c ON d.client_id = c.id
            LEFT JOIN users u ON d.user_id = u.id
        `;
        const params = [];
        const allowedToApprove = await canApprove(req.user.role, "devis");
        if (req.user.role !== "admin" && req.user.role !== "directeur") {
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
        const mapped = rows.map((row) => {
            const pdvCount = Number(row.pdv_count_from_items) || 0;
            const resolvedPdv =
                pdvCount > 1
                    ? "Plusieurs points de vente"
                    : row.point_de_vente_nom_from_items || row.point_de_vente_nom_from_commande || null;
            const resolvedSociete = row.sous_societe_nom_from_items || row.sous_societe_nom_from_commande || null;
            const {
                pdv_count_from_items,
                point_de_vente_nom_from_items,
                sous_societe_nom_from_items,
                point_de_vente_nom_from_commande,
                sous_societe_nom_from_commande,
                ...rest
            } = row;
            return {
                ...rest,
                point_de_vente_nom: resolvedPdv,
                sous_societe_nom: resolvedSociete,
            };
        });
        res.status(200).json(mapped);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getDevisGrosById = async (req, res) => {
    const { id } = req.params;
    try {
        const [devisRows] = await db.execute(
            `
            SELECT d.*, c.nom_complet AS client_nom,
                   CONCAT(u.prenom, ' ', u.nom) AS user_nom
            FROM devis_gros d
            LEFT JOIN clients c ON d.client_id = c.id
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.id = ?
            `,
            [id]
        );
        if (devisRows.length === 0) {
            return res.status(404).json({ message: "Devis gros introuvable" });
        }
        const [itemRows] = await db.execute(
            `
            SELECT di.*, p.nom AS produit_nom, p.reference
            FROM devis_gros_items di
            LEFT JOIN products p ON di.produit_id = p.id
            WHERE di.devis_gros_id = ?
            ORDER BY di.id
            `,
            [id]
        );
        res.status(200).json({ ...devisRows[0], items: itemRows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateDevisGros = async (req, res) => {
    const { id } = req.params;
    const { date_devis, client_id, items } = req.body;
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [existing] = await connection.execute("SELECT id, user_id FROM devis_gros WHERE id = ?", [id]);
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Devis gros introuvable" });
        }
        if (req.user.role !== "admin" && existing[0].user_id !== req.user.id) {
            await connection.rollback();
            return res.status(403).json({ message: "Non autorisé" });
        }

        if (!Array.isArray(items) || items.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: "Au moins une ligne est requise" });
        }
        for (const it of items) {
            const des = String(it.designation || "").trim();
            const g = Number(it.grammage);
            if (!des || !Number.isFinite(g) || g <= 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Désignation et grammage valides requis sur chaque ligne" });
            }
        }

        const totalGrammage = sumGrammage(items);
        const { normalizedItems, totals } = computeFinance(items);

        await connection.execute(
            `
            UPDATE devis_gros
            SET date_devis = ?, grammage = ?, prix_total = ?, reduction = ?, montant_ht = ?, taux_tva = ?, montant_tva = ?, montant_ttc = ?, client_id = ?
            WHERE id = ?
            `,
            [
                date_devis || new Date().toISOString().split("T")[0],
                totalGrammage,
                totals.prix_total,
                totals.reduction,
                totals.montant_ht,
                totals.taux_tva,
                totals.montant_tva,
                totals.montant_ttc,
                client_id,
                id,
            ]
        );

        await connection.execute("DELETE FROM devis_gros_items WHERE devis_gros_id = ?", [id]);
        const rowsItems = normalizedItems.map((item) => [
            Number(id),
            item.produit_id || null,
            String(item.designation).trim(),
            Number(item.grammage) || 0,
            Number(item.prix_unitaire) || 0,
            Number(item.reduction) || 0,
            Number(item.montant_ht) || 0,
            Number(item.taux_tva) || 0,
            Number(item.montant_tva) || 0,
            Number(item.montant_ttc) || 0,
        ]);
        await connection.query(
            "INSERT INTO devis_gros_items (devis_gros_id, produit_id, designation, grammage, prix_unitaire, reduction, montant_ht, taux_tva, montant_tva, montant_ttc) VALUES ?",
            [rowsItems]
        );

        await connection.commit();
        res.status(200).json({ message: "Devis gros mis à jour" });
    } catch (error) {
        await connection.rollback();
        console.error("[devisGros][update]", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.deleteDevisGros = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute("SELECT user_id FROM devis_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Devis gros introuvable" });
        }
        if (req.user.role !== "admin" && rows[0].user_id !== req.user.id) {
            return res.status(403).json({ message: "Non autorisé" });
        }
        await db.execute("DELETE FROM devis_gros WHERE id = ?", [id]);
        res.status(200).json({ message: "Supprimé" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.approveDevisGros = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, "devis");
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour valider un devis gros" });
    }
    try {
        const [rows] = await db.execute("SELECT id, statuts_devis FROM devis_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Devis gros introuvable" });
        }
        if (rows[0].statuts_devis !== "en attente") {
            return res.status(400).json({ message: "Ce devis gros n'est plus en attente" });
        }
        await db.execute("UPDATE devis_gros SET statuts_devis = 'accepté' WHERE id = ?", [id]);
        res.status(200).json({ message: "Devis gros accepté" });
    } catch (error) {
        console.error("[devisGros][approve]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.rejectDevisGros = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, "devis");
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour rejeter un devis gros" });
    }
    try {
        const [rows] = await db.execute("SELECT id, statuts_devis FROM devis_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Devis gros introuvable" });
        }
        if (rows[0].statuts_devis !== "en attente") {
            return res.status(400).json({ message: "Ce devis gros n'est plus en attente" });
        }
        await db.execute("UPDATE devis_gros SET statuts_devis = 'refusé' WHERE id = ?", [id]);
        res.status(200).json({ message: "Devis gros rejeté" });
    } catch (error) {
        console.error("[devisGros][reject]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
