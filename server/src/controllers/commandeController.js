const db = require("../config/db").promise();
const { logProductMovement } = require("../utils/productMovementLogger");
const { formatDocumentNumber } = require("../utils/documentFormatter");
const { getNextNumber } = require("../utils/numberingSettings");
const { canApprove, shouldAutoApprove } = require("../utils/approvalSettings");

async function resolveSousSocieteFromPdv(connection, pointDeVenteId) {
    const pdvId = Number(pointDeVenteId);
    if (!Number.isFinite(pdvId) || pdvId <= 0) return { id: null, nom: null };
    const [rows] = await connection.execute(
        `
        SELECT pdv.id_sous_gestionnaire, ss.NOM_SOUS_SOCIETE
        FROM point_de_vente pdv
        LEFT JOIN sous_societe ss ON ss.ID = pdv.id_sous_gestionnaire
        WHERE pdv.id = ?
        LIMIT 1
        `,
        [pdvId]
    );
    if (!Array.isArray(rows) || rows.length === 0) return { id: null, nom: null };
    const ssId = Number(rows[0].id_sous_gestionnaire);
    return {
        id: Number.isFinite(ssId) && ssId > 0 ? ssId : null,
        nom: rows[0].NOM_SOUS_SOCIETE || null,
    };
}

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
        WHERE p.id IN (${placeholders}) AND pdv.id_sous_gestionnaire IS NOT NULL
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

exports.getCommandeById = async (req, res) => {
    const { id } = req.params;
    try {
        let query = `
            SELECT c.*,
                   cl.nom_complet AS client_nom,
                   cl.\`type\` as client_type,
                   cl.ice as client_ice,
                   cl.telephone as client_telephone,
                   cl.email as client_email,
                   cl.adresse as client_adresse,
                   (SELECT p.id_point_de_vente
                    FROM commande_items ci
                    INNER JOIN products p ON ci.produit_id = p.id
                    WHERE ci.commande_id = c.id AND p.id_point_de_vente IS NOT NULL
                    ORDER BY ci.id
                    LIMIT 1) AS point_de_vente_id_from_items,
                   c.point_de_vente_id AS point_de_vente_id_from_commande,
                   COALESCE(
                       (SELECT p.id_point_de_vente
                        FROM commande_items ci
                        INNER JOIN products p ON ci.produit_id = p.id
                        WHERE ci.commande_id = c.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ci.id
                        LIMIT 1),
                       c.point_de_vente_id
                   ) AS point_de_vente_id,
                   (
                       SELECT pv.logo
                       FROM point_de_vente pv
                       WHERE pv.id = COALESCE(
                           (SELECT p.id_point_de_vente
                            FROM commande_items ci
                            INNER JOIN products p ON ci.produit_id = p.id
                            WHERE ci.commande_id = c.id AND p.id_point_de_vente IS NOT NULL
                            ORDER BY ci.id
                            LIMIT 1),
                           c.point_de_vente_id
                       )
                       LIMIT 1
                   ) AS point_de_vente_logo,
                   (
                       SELECT ssn.NOM_SOUS_SOCIETE
                       FROM sous_societe ssn
                       WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(c.numero_commande, '-', 2), '-', -1))
                       ORDER BY ssn.ID
                       LIMIT 1
                   ) AS sous_societe_nom_from_numero,
                   (SELECT numero_facture FROM factures WHERE commande_id = c.id LIMIT 1) as facture_numero,
                   (SELECT id FROM factures WHERE commande_id = c.id LIMIT 1) as facture_id,
                   (SELECT id FROM bon_de_livraison WHERE commande_id = c.id LIMIT 1) as bon_livraison_id,
                   (SELECT 1 FROM avoirs WHERE commande_id = c.id LIMIT 1) as has_avoir,
                   (SELECT 1 FROM avoirs WHERE facture_id = (SELECT id FROM factures WHERE commande_id = c.id LIMIT 1) LIMIT 1) as has_avoir_facture
            FROM commandes c
            LEFT JOIN clients cl ON c.client_id = cl.id
            WHERE c.id = ?
        `;
        const params = [id];

        if (req.user.role !== 'admin') {
            query += " AND c.user_id = ?";
            params.push(req.user.id);
        }

        const [rows] = await db.execute(query, params);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Commande not found" });
        }

        const row = {
            ...rows[0],
            sous_societe_nom: rows[0].sous_societe_nom_from_numero || null,
        };
        const factureId = row.facture_id != null ? row.facture_id : null;

        let totalRegle = 0;
        let montantRef = Number(row.montant_ttc) || 0;

        if (factureId) {
            const [[factureRow]] = await db.execute(
                `SELECT montant_ttc FROM factures WHERE id = ? LIMIT 1`,
                [factureId]
            );
            if (factureRow && factureRow.montant_ttc != null) {
                montantRef = Number(factureRow.montant_ttc);
                const [[regCombinedRow]] = await db.execute(
                    `SELECT COALESCE(SUM(montant), 0) AS total_regle
                     FROM reglements_clients
                     WHERE statut = 'approuve'
                       AND (facture_id = ? OR commande_id = ?)`,
                    [factureId, id]
                );
                totalRegle = Number(regCombinedRow?.total_regle) || 0;
            }
        }
        if (!factureId) {
            const [[regRow]] = await db.execute(
                `SELECT COALESCE(SUM(montant), 0) AS total_regle FROM reglements_clients WHERE commande_id = ? AND statut = 'approuve'`,
                [id]
            );
            totalRegle = Number(regRow?.total_regle) || 0;
        }

        const resteAPayer = Math.max(montantRef - totalRegle, 0);

        const [items] = await db.execute(`
            SELECT ci.*, p.photo, p.poids AS grammage, p.reference, COALESCE(p.nom, ci.designation) as designation,
                   pt.name AS product_type_name
            FROM commande_items ci
            LEFT JOIN products p ON ci.produit_id = p.id
            LEFT JOIN product_types pt ON p.product_type_id = pt.id
            WHERE ci.commande_id = ?
        `, [id]);

        res.status(200).json({ ...row, items, total_regle: totalRegle, reste_a_payer: resteAPayer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};
/* ===============================
   CREATE COMMANDE
================================= */
exports.createCommande = async (req, res) => {
    const {
        numero_commande,
        date_commande,
        client_id,
        point_de_vente_id,
        items,
        devis_id,
        banque_id,
        reduction,
        montant_ttc,
        statut,
        status
    } = req.body;

    const user_id = req.user.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

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
            return res.status(400).json({ message: "client_id is required" });
        }

        // 1. Handle point_de_vente_id (NOT NULL in DB)
        let pdv_id = point_de_vente_id;
        if (!pdv_id || pdv_id === "" || pdv_id === "none") {
            const [pdvs] = await connection.query("SELECT id FROM point_de_vente LIMIT 1");
            if (pdvs.length > 0) {
                pdv_id = pdvs[0].id;
            } else {
                pdv_id = 1; // Fallback to 1 if no PDV exists
            }
        }

        // 2. Handle statut (Column is 'statut' in DB)
        const allowedToApprove = await canApprove(req.user.role, 'commande');
        const autoApprove = await shouldAutoApprove(req.user);
        
        // If role is 'user' (Commercial), default to 'en_attente' unless it's after hours
        const defaultStatut = (req.user.role === 'user' && !autoApprove) ? 'en_attente' : 'validee';
        
        // CRITICAL: If autoApprove is true, we FORCE 'validee' even if the frontend sends 'en_attente'
        const final_statut = autoApprove ? 'validee' : (allowedToApprove ? (statut || status || defaultStatut) : 'en_attente');
        let final_devis_id = devis_id || null;
        let final_banque_id = (banque_id === "" || banque_id === "none" || !banque_id) ? null : banque_id;

        const insertCommandeQuery = `
            INSERT INTO commandes 
            (numero_commande, date_commande, client_id, user_id, point_de_vente_id, devis_id, banque_id, statut, reduction, montant_ttc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await connection.execute(insertCommandeQuery, [
            `TEMP-${Date.now()}`,
            date_commande,
            effectiveClientId,
            user_id,
            pdv_id,
            null,
            final_banque_id,
            final_statut,
            reduction || 0,
            montant_ttc || 0
        ]);

        const commandeId = result.insertId;
        const fromItems = await resolveSousSocieteFromItems(connection, items);
        const fromPdv = await resolveSousSocieteFromPdv(connection, pdv_id);
        const sousSociete = fromItems.id ? fromItems : fromPdv;
        const coNumber = await getNextNumber("CO", commandeId, connection, {
            sousSocieteId: sousSociete.id,
        });
        const final_commande_numero = formatDocumentNumber('CO', coNumber, new Date(), { sousSocieteNom: sousSociete.nom });

        // Traceability: Create Devis if not provided (totals with item reduction)
        if (!final_devis_id) {
            try {
                let devis_ht = 0;
                let devis_tva = 0;
                let devis_total_items_reduction = 0;
                let devis_sumRedPct = 0;
                items.forEach(it => {
                    const brutHT = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
                    const redItem = Number(it.reduction) || 0;
                    const itemReductionAmount = brutHT * (redItem / 100);
                    const ht_after_red = brutHT - itemReductionAmount;
                    devis_ht += ht_after_red;
                    devis_tva += ht_after_red * ((Number(it.tva) || 0) / 100);
                    devis_total_items_reduction += itemReductionAmount;
                    devis_sumRedPct += redItem;
                });
                const devis_ttc = devis_ht + devis_tva;

                const [devisResult] = await connection.execute(`
                    INSERT INTO devis (numero_devis, date_devis, montant_ht, taux_tva, montant_tva, user_id, statuts_devis, client_id, reduction, total_reduction, montant_ttc)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    `TEMP-${Date.now()}`,
                    date_commande,
                    devis_ht,
                    items[0]?.tva ?? 20,
                    devis_tva,
                    user_id,
                    'en attente',
                    effectiveClientId,
                    parseFloat(devis_sumRedPct.toFixed(4)),
                    devis_total_items_reduction,
                    devis_ttc
                ]);

                final_devis_id = devisResult.insertId;

                const devisItemsData = items.map(it => [
                    final_devis_id,
                    it.produit_id || null,
                    it.designation,
                    it.quantite || 1,
                    it.prix_unitaire || 0,
                    it.tva ?? 20,
                    it.reduction || 0,
                    (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0) * (1 - (Number(it.reduction) || 0) / 100)
                ]);

                await connection.query(`
                    INSERT INTO devis_items (devis_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                    VALUES ?
                `, [devisItemsData]);

                // Update auto-created devis avec séquence configurable
                const deNumber = await getNextNumber("DE", final_devis_id, connection, {
                    sousSocieteId: sousSociete.id,
                });
                const final_devis_numero = formatDocumentNumber('DE', deNumber, new Date(), { sousSocieteNom: sousSociete.nom });
                await connection.execute(
                    "UPDATE devis SET numero_devis = ? WHERE id = ?",
                    [final_devis_numero, final_devis_id]
                );
            } catch (devisErr) {
                console.error("Traceability Devis creation Error:", devisErr.message);
            }
        }

        // Update Commande with final number and devis_id
        await connection.execute("UPDATE commandes SET numero_commande = ?, devis_id = ? WHERE id = ?", [final_commande_numero, final_devis_id, commandeId]);

        let montant_ht_total = 0;
        let montant_tva_total = 0;
        let total_items_reduction = 0;
        let sumRedPct = 0;

        for (const item of items) {
            const bruteHT = Number(item.quantite) * Number(item.prix_unitaire);
            const redTaux = Number(item.reduction) || 0;
            const itemReductionAmount = bruteHT * (redTaux / 100);
            const montant_ht = bruteHT - itemReductionAmount;
            const montant_tva = montant_ht * (Number(item.tva ?? 20) / 100);

            montant_ht_total += montant_ht;
            montant_tva_total += montant_tva;
            total_items_reduction += itemReductionAmount;
            sumRedPct += redTaux;

            // produit_id is now NULLABLE. We check for designation instead.
            if (!item.produit_id && !item.designation) {
                throw new Error("Désignation ou produit manquant");
            }

            await connection.execute(`
                INSERT INTO commande_items
                (commande_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                commandeId,
                item.produit_id || null,
                item.designation,
                item.quantite,
                item.prix_unitaire,
                item.tva,
                item.reduction || 0,
                montant_ht
            ]);

            // Always trace line creation for product-linked items (even if status is still en_attente).
            if (item.produit_id) {
                const [prodNow] = await connection.execute(
                    "SELECT stock FROM products WHERE id = ?",
                    [item.produit_id]
                );
                const stockNow = prodNow.length > 0 ? Number(prodNow[0].stock) : null;
                await logProductMovement(
                    {
                        productId: item.produit_id,
                        type: "commande_creation",
                        quantityBefore: stockNow,
                        quantityAfter: stockNow,
                        description: "Ligne ajoutée dans une commande (pas de déstockage avant validation)",
                        userId: req.user.id,
                        referenceType: "commande",
                        referenceId: commandeId,
                        referenceNumero: final_commande_numero
                    },
                    connection
                );
            }

            // Handle stock decrement if the command is auto-validated at creation
            if (final_statut === 'validee' && item.produit_id) {
                const [prod] = await connection.execute(
                    "SELECT stock, nom FROM products WHERE id = ?",
                    [item.produit_id]
                );
                if (prod.length > 0) {
                    const currentStock = prod[0].stock;
                    const requestedQty = Number(item.quantite) || 0;
                    // Note: if stock is insufficient, we still let it pass for now as it's an auto-approval 
                    // or we could throw an error. Given the existing approveCommande logic throws, let's keep it safe.
                    if (currentStock >= requestedQty) {
                        await connection.execute(
                            "UPDATE products SET stock = stock - ? WHERE id = ?",
                            [requestedQty, item.produit_id]
                        );
                        await logProductMovement({
                            productId: item.produit_id,
                            type: "commande_sortie",
                            quantityBefore: currentStock,
                            quantityAfter: currentStock - requestedQty,
                            description: "Sortie stock (auto-validation commande créée)",
                            userId: req.user.id,
                            referenceType: "commande",
                            referenceId: commandeId,
                            referenceNumero: final_commande_numero
                        }, connection);
                    }
                }
            }
        }

        const totalTTC = montant_ht_total + montant_tva_total;

        await connection.execute(`
            UPDATE commandes
            SET montant_ht = ?, montant_tva = ?, montant_ttc = ?, reduction = ?, total_reduction = ?
            WHERE id = ?
        `, [
            montant_ht_total,
            montant_tva_total,
            totalTTC,
            parseFloat(sumRedPct.toFixed(4)),
            total_items_reduction,
            commandeId
        ]);

        await connection.commit();
        res.status(201).json({ message: "Commande créée", id: commandeId });

        // Notify via Socket.io
        const io = req.app.get("io");
        if (io) {
            io.emit("notification", {
                type: "commande",
                numero: final_commande_numero,
                user: `${req.user.prenom} ${req.user.nom}`,
                date: new Date().toISOString()
            });
        }

    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error creating commande:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    } finally {
        connection.release();
    }
};


/* ===============================
   GET ALL COMMANDES
   - total_regle / reste_a_payer : si la commande a une facture liée, on prend les règlements
     sur la facture (sinon règlements directs sur la commande). Ainsi "Règlement commencé"
     et le reste à payer reflètent bien les paiements faits sur la facture.
   - Valider = approuvé par l'admin ; Réglé = totalité payée ; Règlement commencé = avance.
================================= */
exports.getAllCommandes = async (req, res) => {
    try {
        let query = `
            SELECT 
                c.*, 
                cl.nom_complet AS client_nom, 
                cl.\`type\` as client_type,
                CONCAT(u.prenom, ' ', u.nom) as user_nom,
                pv.nom AS point_de_vente_nom,
                (
                    SELECT COUNT(DISTINCT p.id_point_de_vente)
                    FROM commande_items ci
                    INNER JOIN products p ON ci.produit_id = p.id
                    WHERE ci.commande_id = c.id AND p.id_point_de_vente IS NOT NULL
                ) AS pdv_count_from_items,
                (
                    SELECT pv2.nom
                    FROM commande_items ci
                    INNER JOIN products p ON ci.produit_id = p.id
                    INNER JOIN point_de_vente pv2 ON pv2.id = p.id_point_de_vente
                    WHERE ci.commande_id = c.id AND p.id_point_de_vente IS NOT NULL
                    ORDER BY ci.id
                    LIMIT 1
                ) AS point_de_vente_nom_from_items,
                ss.NOM_SOUS_SOCIETE AS sous_societe_nom,
                (
                    SELECT ss_items.NOM_SOUS_SOCIETE
                    FROM commande_items ci
                    INNER JOIN products p ON ci.produit_id = p.id
                    INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                    LEFT JOIN sous_societe ss_items ON ss_items.ID = pv_items.id_sous_gestionnaire
                    WHERE ci.commande_id = c.id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY ci.id
                    LIMIT 1
                ) AS sous_societe_nom_from_items,
                (
                    SELECT ssn.NOM_SOUS_SOCIETE
                    FROM sous_societe ssn
                    WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(c.numero_commande, '-', 2), '-', -1))
                    ORDER BY ssn.ID
                    LIMIT 1
                ) AS sous_societe_nom_from_numero,
                COALESCE(SUM(rc.montant), 0) AS total_regle_direct,
                COALESCE(c.reduction, 0) AS reduction,
                (SELECT id FROM factures WHERE commande_id = c.id LIMIT 1) AS facture_id,
                (SELECT id FROM bon_de_livraison WHERE commande_id = c.id LIMIT 1) AS bon_livraison_id,
                (SELECT 1 FROM avoirs WHERE commande_id = c.id LIMIT 1) AS has_avoir,
                (SELECT 1 FROM avoirs WHERE facture_id = (SELECT id FROM factures WHERE commande_id = c.id LIMIT 1) LIMIT 1) AS has_avoir_facture,
                (SELECT COALESCE(SUM(rc2.montant), 0) FROM reglements_clients rc2
                 INNER JOIN factures f2 ON f2.id = rc2.facture_id AND f2.commande_id = c.id
                 WHERE rc2.statut = 'approuve') AS total_regle_facture,
                (SELECT f3.montant_ttc FROM factures f3 WHERE f3.commande_id = c.id LIMIT 1) AS facture_montant_ttc
            FROM commandes c
            LEFT JOIN clients cl ON c.client_id = cl.id
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN point_de_vente pv ON c.point_de_vente_id = pv.id
            LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
            LEFT JOIN reglements_clients rc ON rc.commande_id = c.id AND rc.statut = 'approuve'
        `;
        const params = [];

        // Admin et Directeur voient toutes les commandes.
        // Les autres voient les leurs, SAUF s'ils ont des droits d'approbation (auquel cas ils voient aussi les "en_attente")
        const allowedToApprove = await canApprove(req.user.role, 'commande');
        if (req.user.role !== 'admin' && req.user.role !== 'directeur' && req.user.role !== 'responsable') {
            if (allowedToApprove) {
                query += " WHERE (c.user_id = ? OR c.statut = 'en_attente')";
                params.push(req.user.id);
            } else {
                query += " WHERE c.user_id = ?";
                params.push(req.user.id);
            }
        }

        query += " GROUP BY c.id ORDER BY c.created_at DESC";

        const [rawRows] = await db.execute(query, params);
        const rows = rawRows.map((row) => {
            const red = row.reduction;
            const hasFacture = row.facture_id != null;
            const totalRegleDirect = Number(row.total_regle_direct) || 0;
            const totalRegleFacture = Number(row.total_regle_facture) || 0;
            const factureMontant = row.facture_montant_ttc != null ? Number(row.facture_montant_ttc) : null;
            const montantTtcCommande = Number(row.montant_ttc) || 0;
            const pdvCount = Number(row.pdv_count_from_items) || 0;
            const resolvedPdvName =
                pdvCount > 1
                    ? "Plusieurs points de vente"
                    : (row.point_de_vente_nom_from_items || row.point_de_vente_nom || null);
            // Si la commande a une facture liée : on affiche le règlement au niveau facture (reste à payer = facture - réglé sur facture)
            const total_regle = hasFacture && factureMontant != null
                ? (totalRegleDirect + totalRegleFacture)
                : totalRegleDirect;
            const montantRef = hasFacture && factureMontant != null ? factureMontant : montantTtcCommande;
            const reste_a_payer = Math.max(montantRef - total_regle, 0);
            const {
                total_regle_direct,
                total_regle_facture,
                facture_montant_ttc,
                pdv_count_from_items,
                point_de_vente_nom_from_items,
                ...rest
            } = row;
            return {
                ...rest,
                point_de_vente_nom: resolvedPdvName,
                sous_societe_nom: row.sous_societe_nom_from_items || row.sous_societe_nom || row.sous_societe_nom_from_numero || null,
                reduction: (red !== undefined && red !== null && red !== '') ? Number(red) : 0,
                total_regle,
                reste_a_payer
            };
        });
        res.status(200).json(rows);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateCommande = async (req, res) => {
    const { id } = req.params;
    const {
        numero_commande,
        date_commande,
        client_id,
        point_de_vente_id,
        items,
        statut,
        status,
        devis_id,
        banque_id,
        reduction,
        montant_ttc: prop_montant_ttc
    } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check ownership
        let checkSql = "SELECT user_id FROM commandes WHERE id = ?";
        const [rows] = await connection.execute(checkSql, [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Commande not found" });
        }
        if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
            await connection.rollback();
            return res.status(403).json({ message: "Unauthorized" });
        }

        const final_statut = statut || status || 'en_attente';

        // Calculate totals
        let totalHT = 0;
        let totalTVA = 0;
        let totalItemsRed = 0;
        let sumRedPct = 0;

        if (items && Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                const bruteHT = Number(item.quantite) * Number(item.prix_unitaire);
                const redTaux = Number(item.reduction) || 0;
                const itemReductionAmount = bruteHT * (redTaux / 100);
                const ht = bruteHT - itemReductionAmount;
                const tva = ht * (Number(item.tva ?? 20) / 100);
                totalHT += ht;
                totalTVA += tva;
                totalItemsRed += itemReductionAmount;
                sumRedPct += redTaux;
            }
        }

        const final_montant_ttc = totalHT + totalTVA;

        await connection.execute(`
            UPDATE commandes
            SET numero_commande = ?, date_commande = ?, client_id = ?, devis_id = ?, banque_id = ?, statut = ?, 
                montant_ht = ?, montant_tva = ?, montant_ttc = ?, reduction = ?, total_reduction = ?
            WHERE id = ?
        `, [
            numero_commande,
            date_commande,
            client_id,
            devis_id || null,
            (banque_id === "" || banque_id === "none" || !banque_id) ? null : banque_id,
            final_statut,
            totalHT,
            totalTVA,
            final_montant_ttc,
            parseFloat(sumRedPct.toFixed(4)),
            totalItemsRed,
            id
        ]);

        // 2. Update Items: Delete and Insert
        if (items && Array.isArray(items)) {
            await connection.execute("DELETE FROM commande_items WHERE commande_id = ?", [id]);
            for (const item of items) {
                if (!item.produit_id && !item.designation) continue;
                await connection.execute(`
                    INSERT INTO commande_items
                    (commande_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    id,
                    item.produit_id || null,
                    item.designation,
                    item.quantite,
                    item.prix_unitaire,
                    item.tva,
                    item.reduction || 0,
                    (Number(item.quantite) * Number(item.prix_unitaire)) * (1 - (Number(item.reduction) || 0) / 100)
                ]);
            }
        }

        await connection.commit();
        res.status(200).json({ message: "Commande mise à jour" });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    } finally {
        connection.release();
    }
};


/* ===============================
   DELETE COMMANDE
================================= */
exports.deleteCommande = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Check ownership/existence
        let checkSql = `
            SELECT c.user_id, c.statut, c.numero_commande, c.devis_id, c.montant_ttc,
                   (SELECT id FROM factures WHERE commande_id = c.id LIMIT 1) AS facture_id,
                   (SELECT statut FROM factures WHERE commande_id = c.id LIMIT 1) AS facture_statut
            FROM commandes c
            WHERE c.id = ?
        `;
        const [rows] = await connection.execute(checkSql, [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Commande not found" });
        }
        if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
            await connection.rollback();
            return res.status(403).json({ message: "Unauthorized" });
        }

        const commande = rows[0];
        const factureId = commande.facture_id ? Number(commande.facture_id) : null;
        const montantTtc = Number(commande.montant_ttc) || 0;
        const statutCommande = String(commande.statut || "").toLowerCase();
        const statutFacture = String(commande.facture_statut || "").toLowerCase();
        const [[reglementRow]] = await connection.execute(
            `
                SELECT COALESCE(SUM(montant), 0) AS total_regle
                FROM reglements_clients
                WHERE statut = 'approuve'
                  AND (commande_id = ? OR (? IS NOT NULL AND facture_id = ?))
            `,
            [id, factureId, factureId]
        );
        const totalRegle = Number(reglementRow?.total_regle) || 0;
        const commandeReglee =
            statutCommande === "paye" ||
            statutCommande === "payee" ||
            statutCommande === "reglee" ||
            statutFacture === "paye" ||
            statutFacture === "payee" ||
            (montantTtc > 0 && totalRegle >= montantTtc - 0.01);

        if (commandeReglee) {
            await connection.rollback();
            return res.status(400).json({
                message: "Suppression impossible : cette commande est déjà réglée."
            });
        }

        // 1. Delete items first (suppression logique seulement : le stock reste inchangé)
        await connection.execute("DELETE FROM commande_items WHERE commande_id = ?", [id]);

        // 2. Delete the command
        await connection.execute("DELETE FROM commandes WHERE id = ?", [id]);

        // 3. Supprimer le devis lié à la commande (avec ses lignes)
        if (commande.devis_id) {
            await connection.execute("DELETE FROM devis_items WHERE devis_id = ?", [commande.devis_id]);
            await connection.execute("DELETE FROM devis WHERE id = ?", [commande.devis_id]);
        }

        await connection.commit();
        res.status(200).json({ message: "Commande supprimée" });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error deleting command:", err);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

/* ===============================
   APPROVE COMMANDE
================================= */
exports.approveCommande = async (req, res) => {
    const { id } = req.params;
    // Dynamic approval check
    const allowed = await canApprove(req.user.role, 'commande');
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour valider une commande" });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Charger la commande pour vérifier le statut actuel
        const [rows] = await connection.execute(
            "SELECT id, numero_commande, statut FROM commandes WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Commande non trouvée" });
        }

        const commande = rows[0];

        if (commande.statut !== 'en_attente') {
            await connection.rollback();
            return res.status(400).json({ message: "Cette commande est déjà traitée" });
        }

        // 2. Charger les lignes de commande
        const [items] = await connection.execute(
            "SELECT produit_id, quantite FROM commande_items WHERE commande_id = ?",
            [id]
        );

        // 3. Déstockage pour chaque produit
        for (const item of items) {
            if (!item.produit_id) continue;

            const [prod] = await connection.execute(
                "SELECT stock, nom FROM products WHERE id = ?",
                [item.produit_id]
            );

            if (prod.length === 0) continue;

            const currentStock = prod[0].stock;
            const requestedQty = Number(item.quantite) || 0;

            if (currentStock < requestedQty) {
                await connection.rollback();
                return res.status(400).json({
                    message: `Stock insuffisant pour ${prod[0].nom}. Restant: ${currentStock}`
                });
            }

            await connection.execute(
                "UPDATE products SET stock = stock - ? WHERE id = ?",
                [requestedQty, item.produit_id]
            );

            await logProductMovement(
                {
                    productId: item.produit_id,
                    type: "commande_sortie",
                    quantityBefore: currentStock,
                    quantityAfter: currentStock - requestedQty,
                    description: "Sortie stock (validation commande)",
                    userId: req.user.id,
                    referenceType: "commande",
                    referenceId: Number(id),
                    referenceNumero: commande.numero_commande
                },
                connection
            );
        }

        // 4. Mettre à jour le statut de la commande
        await connection.execute(
            "UPDATE commandes SET statut = 'validee' WHERE id = ?",
            [id]
        );

        await connection.commit();
        res.status(200).json({ message: "Commande validée avec succès" });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Erreur lors de la validation de la commande:", err);
        res.status(500).json({ message: "Erreur serveur" });
    } finally {
        connection.release();
    }
};

/* ===============================
   REJECT COMMANDE
================================= */
exports.rejectCommande = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, 'commande');
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour rejeter une commande" });
    }

    try {
        const [result] = await db.execute(
            "UPDATE commandes SET statut = 'annulee' WHERE id = ? AND statut = 'en_attente'",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Commande non trouvée" });
        }

        res.status(200).json({ message: "Commande rejetée" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

/* ===============================
   REOPEN COMMANDE (reset to en_attente)
================================= */
exports.reopenCommande = async (req, res) => {
    const { id } = req.params;
    // Admin, responsable et directeur peuvent rouvrir les commandes
    if (req.user.role !== 'admin' && req.user.role !== 'responsable' && req.user.role !== 'directeur') {
        return res.status(403).json({ message: "Seuls les administrateurs, responsables ou directeurs peuvent rouvrir les commandes" });
    }

    try {
        const [rows] = await db.execute("SELECT statut FROM commandes WHERE id = ?", [id]);
        if (!rows.length) {
            return res.status(404).json({ message: "Commande non trouvée" });
        }

        if (rows[0].statut !== 'annulee') {
            return res.status(400).json({ message: "Seules les commandes annulées peuvent être rouvertes" });
        }

        await db.execute(
            "UPDATE commandes SET statut = 'en_attente' WHERE id = ?",
            [id]
        );

        res.status(200).json({ message: "Commande rouverte et remise en attente de validation" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

const pdfConfig = {
    type: 'COMMANDE',
    title: 'BON DE COMMANDE',
    infoTitle: 'Commande',
    numberField: 'numero_commande',
    dateField: 'date_commande',
    statusField: 'statut',
    defaultStatus: 'En attente',
    footerLeft: 'Merci pour votre confiance.'
};

exports.sendCommandeEmail = async (req, res) => {
    const { id } = req.params;
    const { to, subject, message } = req.body;

    if (!to) {
        return res.status(400).json({ message: "Le destinataire est requis" });
    }

    try {
        const [rows] = await db.execute(`
            SELECT c.*,
                   cl.nom_complet AS client_nom,
                   cl.\`type\` as client_type,
                   cl.ice as client_ice,
                   cl.telephone as client_telephone,
                   cl.email as client_email,
                   cl.adresse as client_adresse
            FROM commandes c
            LEFT JOIN clients cl ON c.client_id = cl.id
            WHERE c.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Commande introuvable" });
        }

        const [items] = await db.execute(`
            SELECT ci.*, p.photo, p.poids AS grammage, COALESCE(p.nom, ci.designation) as designation,
                   pt.name AS product_type_name
            FROM commande_items ci
            LEFT JOIN products p ON ci.produit_id = p.id
            LEFT JOIN product_types pt ON p.product_type_id = pt.id
            WHERE ci.commande_id = ?
        `, [id]);

        const docData = rows[0];

        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(docData, items, pdfConfig);

        const emailSubject = subject || `[Commande] ${docData.numero_commande}`;
        const emailText = message || `Veuillez trouver ci-joint le bon de commande ${docData.numero_commande}.`;

        const { sendMail } = require("../services/emailService");
        await sendMail(to, emailSubject, emailText, [
            { filename: `Commande_${docData.numero_commande}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
        ]);

        res.status(200).json({ message: "Email envoyé avec succès" });
    } catch (error) {
        console.error("Error sending commande email:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
    }
};

exports.downloadCommandePdf = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.execute(`
            SELECT c.*,
                   cl.nom_complet AS client_nom,
                   cl.\`type\` as client_type,
                   cl.ice as client_ice,
                   cl.telephone as client_telephone,
                   cl.email as client_email,
                   cl.adresse as client_adresse
            FROM commandes c
            LEFT JOIN clients cl ON c.client_id = cl.id
            WHERE c.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Commande introuvable" });
        }

        const [items] = await db.execute(`
            SELECT ci.*, p.photo, p.poids AS grammage, COALESCE(p.nom, ci.designation) as designation,
                   pt.name AS product_type_name
            FROM commande_items ci
            LEFT JOIN products p ON ci.produit_id = p.id
            LEFT JOIN product_types pt ON p.product_type_id = pt.id
            WHERE ci.commande_id = ?
        `, [id]);

        const docData = rows[0];

        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(docData, items, pdfConfig);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=Commande_${docData.numero_commande}.pdf`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating commande PDF for download:", error);
        res.status(500).json({ message: "Erreur serveur lors de la génération du PDF" });
    }
};
