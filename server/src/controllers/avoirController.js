const db = require("../config/db").promise();
const { logProductMovement } = require("../utils/productMovementLogger");
const { formatDocumentNumber } = require("../utils/documentFormatter");
const { getNextNumber } = require("../utils/numberingSettings");
const { canApprove, resolveCreationApprovalStatut } = require("../utils/approvalSettings");

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

async function resolveSousSocieteForAvoir(connection, factureId, commandeId) {
    const fId = Number(factureId);
    if (Number.isFinite(fId) && fId > 0) {
        const [fRows] = await connection.execute(
            `
            SELECT pdv.id_sous_gestionnaire, ss.NOM_SOUS_SOCIETE
            FROM factures f
            LEFT JOIN point_de_vente pdv ON pdv.id = f.point_de_vente_id
            LEFT JOIN sous_societe ss ON ss.ID = pdv.id_sous_gestionnaire
            WHERE f.id = ?
            LIMIT 1
            `,
            [fId]
        );
        if (Array.isArray(fRows) && fRows.length > 0) {
            const ssId = Number(fRows[0].id_sous_gestionnaire);
            if (Number.isFinite(ssId) && ssId > 0) {
                return { id: ssId, nom: fRows[0].NOM_SOUS_SOCIETE || null };
            }
        }
    }

    const cId = Number(commandeId);
    if (Number.isFinite(cId) && cId > 0) {
        const [cRows] = await connection.execute(
            `
            SELECT pdv.id_sous_gestionnaire, ss.NOM_SOUS_SOCIETE
            FROM commandes c
            LEFT JOIN point_de_vente pdv ON pdv.id = c.point_de_vente_id
            LEFT JOIN sous_societe ss ON ss.ID = pdv.id_sous_gestionnaire
            WHERE c.id = ?
            LIMIT 1
            `,
            [cId]
        );
        if (Array.isArray(cRows) && cRows.length > 0) {
            const ssId = Number(cRows[0].id_sous_gestionnaire);
            if (Number.isFinite(ssId) && ssId > 0) {
                return { id: ssId, nom: cRows[0].NOM_SOUS_SOCIETE || null };
            }
        }
    }
    return { id: null, nom: null };
}

/* ===============================
   CREATE AVOIR
 ================================= */
exports.createAvoir = async (req, res) => {
    const {
        date_avoir,
        client_id,
        facture_id,
        commande_id,
        devis_id,
        items,
        status,
        statut
    } = req.body;

    const user_id = req.user.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        let effectiveClientId = client_id;
        if (req.user.role !== 'admin') {
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
            throw new Error("client_id is required");
        }

        const final_statut = await resolveCreationApprovalStatut(req.user, "avoir", {
            pending: "en_attente",
            approved: "valide",
            requested: statut || status,
        });
        const canAutoApprove = (final_statut === 'valide');
        const final_facture_id = (facture_id === "" || facture_id === "none" || !facture_id) ? null : facture_id;
        const final_commande_id = (commande_id === "" || commande_id === "none" || !commande_id) ? null : commande_id;
        const final_devis_id = (devis_id === "" || devis_id === "none" || !devis_id) ? null : devis_id;

        // Maximum 1 avoir par facture
        if (final_facture_id) {
            const [existingAvoir] = await connection.execute(
                "SELECT id FROM avoirs WHERE facture_id = ? LIMIT 1",
                [final_facture_id]
            );
            if (existingAvoir.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    message: "Un avoir existe déjà pour cette facture. Maximum 1 avoir par facture."
                });
            }
        }

        const insertAvoirQuery = `
            INSERT INTO avoirs
            (numero_avoir, date_avoir, client_id, user_id, facture_id, commande_id, devis_id, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await connection.execute(insertAvoirQuery, [
            `TEMP-${Date.now()}`,
            date_avoir || new Date().toISOString().split('T')[0],
            effectiveClientId,
            user_id,
            final_facture_id,
            final_commande_id,
            final_devis_id,
            final_statut
        ]);

        const avoirId = result.insertId;
        const sousSociete = await resolveSousSocieteForAvoir(connection, final_facture_id, final_commande_id);
        const avNumber = await getNextNumber("AV", avoirId, connection, { sousSocieteId: sousSociete.id });
        const numeroDate = parseDateOnlySafe(date_avoir || new Date().toISOString().split("T")[0]);
        const final_avoir_numero = formatDocumentNumber('AV', avNumber, numeroDate, { sousSocieteNom: sousSociete.nom });

        await connection.execute(`
            UPDATE avoirs 
            SET numero_avoir = ?
            WHERE id = ?
        `, [final_avoir_numero, avoirId]);

        let montant_ht_total = 0;
        let montant_tva_total = 0;
        let total_items_reduction = 0;
        let sumRedPct = 0;

        if (items && Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                const bruteHT = Number(item.quantite) * Number(item.prix_unitaire);
                const redTaux = Number(item.reduction) || 0;
                const itemReductionAmount = bruteHT * (redTaux / 100);
                const montant_ht = bruteHT - itemReductionAmount;
                const montant_tva = montant_ht * (Number(item.tva) / 100);

                montant_ht_total += montant_ht;
                montant_tva_total += montant_tva;
                total_items_reduction += itemReductionAmount;
                sumRedPct += redTaux;

                if (!item.produit_id && !item.designation) {
                    throw new Error(`Désignation ou produit manquant`);
                }

                await connection.execute(`
                    INSERT INTO avoir_items
                    (avoir_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    avoirId,
                    item.produit_id || null,
                    item.designation,
                    item.quantite,
                    item.prix_unitaire,
                    item.tva,
                    redTaux,
                    montant_ht
                ]);

                // Restore stock for returned items ONLY if auto-approved
                if (item.produit_id && canAutoApprove) {
                    const [p] = await connection.execute("SELECT stock FROM products WHERE id = ?", [item.produit_id]);
                    const before = p.length ? p[0].stock : 0;
                    await connection.execute(
                        "UPDATE products SET stock = stock + ? WHERE id = ?",
                        [item.quantite, item.produit_id]
                    );
                    await logProductMovement(
                        {
                            productId: item.produit_id,
                            type: "avoir_retour",
                            quantityBefore: before,
                            quantityAfter: before + Number(item.quantite),
                            description: "Retour stock (création avoir)",
                            userId: req.user.id,
                            referenceType: "avoir",
                            referenceId: avoirId,
                            referenceNumero: final_avoir_numero
                        },
                        connection
                    );
                }
            }
        }

        const montant_ttc = montant_ht_total + montant_tva_total;

        await connection.execute(`
            UPDATE avoirs
            SET montant_ht = ?, montant_tva = ?, montant_ttc = ?, reduction = ?, total_reduction = ?
            WHERE id = ?
        `, [
            montant_ht_total,
            montant_tva_total,
            montant_ttc,
            parseFloat(sumRedPct.toFixed(4)),
            total_items_reduction,
            avoirId
        ]);

        await connection.commit();
        res.status(201).json({ message: "Avoir créé", id: avoirId });

        // Notify via Socket.io (ne doit pas faire échouer la réponse)
        try {
            const io = req.app && req.app.get ? req.app.get("io") : null;
            if (io) {
                io.emit("notification", {
                    type: "avoir",
                    numero: final_avoir_numero,
                    user: `${req.user.prenom} ${req.user.nom}`,
                    date: new Date().toISOString()
                });
            }
        } catch (notifyErr) {
            console.error("Avoir created but notification failed:", notifyErr);
        }

    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error creating avoir:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    } finally {
        connection.release();
    }
};

/* ===============================
   GET ALL AVOIRS
 ================================= */
exports.getAllAvoirs = async (req, res) => {
    try {
        let sql = `
            SELECT 
                a.*, 
                cl.nom_complet AS client_nom, 
                cl.\`type\` as client_type, 
            f.numero_facture,
            NULL as facture_mode_paiement,
            NULL as banque_nom,
            CONCAT(u.prenom, ' ', u.nom) as user_nom,
            COALESCE(pvf.nom, pvc.nom) AS point_de_vente_nom,
            (
                SELECT COUNT(DISTINCT p.id_point_de_vente)
                FROM avoir_items ai
                INNER JOIN products p ON ai.produit_id = p.id
                WHERE ai.avoir_id = a.id AND p.id_point_de_vente IS NOT NULL
            ) AS pdv_count_from_items,
            (
                SELECT pvx.nom
                FROM avoir_items ai
                INNER JOIN products p ON ai.produit_id = p.id
                INNER JOIN point_de_vente pvx ON pvx.id = p.id_point_de_vente
                WHERE ai.avoir_id = a.id AND p.id_point_de_vente IS NOT NULL
                ORDER BY ai.id
                LIMIT 1
            ) AS point_de_vente_nom_from_items
            FROM avoirs a
            LEFT JOIN clients cl ON a.client_id = cl.id
            LEFT JOIN factures f ON a.facture_id = f.id
            LEFT JOIN commandes co ON a.commande_id = co.id
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN point_de_vente pvf ON f.point_de_vente_id = pvf.id
            LEFT JOIN point_de_vente pvc ON co.point_de_vente_id = pvc.id
        `;
        const params = [];

        // Admin et Directeur voient tous les avoirs.
        // Les autres voient les leurs, SAUF s'ils ont des droits d'approbation (auquel cas ils voient aussi les "en_attente")
        const allowedToApprove = await canApprove(req.user.role, 'avoir');
        if (req.user.role !== 'admin' && req.user.role !== 'directeur' && req.user.role !== 'responsable') {
            if (allowedToApprove) {
                sql += " WHERE (a.user_id = ? OR a.statut = 'en_attente')";
                params.push(req.user.id);
            } else {
                sql += " WHERE a.user_id = ?";
                params.push(req.user.id);
            }
        }

        sql += " ORDER BY a.created_at DESC";

        const [rows] = await db.execute(sql, params);
        res.status(200).json(
            rows.map((row) => {
                const pdvCount = Number(row.pdv_count_from_items) || 0;
                const resolvedPdvName =
                    pdvCount > 1
                        ? "Plusieurs points de vente"
                        : (row.point_de_vente_nom_from_items || row.point_de_vente_nom || null);
                const { pdv_count_from_items, point_de_vente_nom_from_items, ...rest } = row;
                return {
                    ...rest,
                    point_de_vente_nom: resolvedPdvName,
                };
            })
        );
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getAvoirById = async (req, res) => {
    const { id } = req.params;

    try {
        let sql = `
            SELECT a.*,
                   cl.nom_complet AS client_nom,
                   cl.\`type\` as client_type,
                   cl.ice as client_ice,
                   cl.telephone as client_telephone,
                   cl.email as client_email,
                   cl.adresse as client_adresse,
                   f.numero_facture AS numero_facture,
                   (SELECT p.id_point_de_vente
                    FROM avoir_items ai
                    INNER JOIN products p ON ai.produit_id = p.id
                    WHERE ai.avoir_id = a.id AND p.id_point_de_vente IS NOT NULL
                    ORDER BY ai.id
                    LIMIT 1) AS point_de_vente_id_from_items,
                   f.point_de_vente_id AS point_de_vente_id_from_facture,
                   co.point_de_vente_id AS point_de_vente_id_from_commande,
                   COALESCE(
                       (SELECT p.id_point_de_vente
                        FROM avoir_items ai
                        INNER JOIN products p ON ai.produit_id = p.id
                        WHERE ai.avoir_id = a.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ai.id
                        LIMIT 1),
                       f.point_de_vente_id,
                       co.point_de_vente_id
                   ) AS point_de_vente_id,
                   (
                       SELECT pv.logo
                       FROM point_de_vente pv
                       WHERE pv.id = COALESCE(
                           (SELECT p.id_point_de_vente
                            FROM avoir_items ai
                            INNER JOIN products p ON ai.produit_id = p.id
                            WHERE ai.avoir_id = a.id AND p.id_point_de_vente IS NOT NULL
                            ORDER BY ai.id
                            LIMIT 1),
                           f.point_de_vente_id,
                           co.point_de_vente_id
                       )
                       LIMIT 1
                   ) AS point_de_vente_logo,
                   (
                       SELECT ssn.NOM_SOUS_SOCIETE
                       FROM sous_societe ssn
                       WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(a.numero_avoir, '-', 2), '-', -1))
                       ORDER BY ssn.ID
                       LIMIT 1
                   ) AS sous_societe_nom_from_numero
            FROM avoirs a
            LEFT JOIN clients cl ON a.client_id = cl.id
            LEFT JOIN factures f ON a.facture_id = f.id
            LEFT JOIN commandes co ON a.commande_id = co.id
            WHERE a.id = ?
        `;
        const params = [id];

        // Admin et Directeur peuvent consulter tous les avoirs, les autres seulement les leurs
        if (req.user.role !== 'admin' && req.user.role !== 'directeur') {
            sql += " AND a.user_id = ?";
            params.push(req.user.id);
        }

        const [rows] = await db.execute(sql, params);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Avoir not found or unauthorized" });
        }

        const [items] = await db.execute(`
            SELECT ai.*, p.photo, p.grammage, p.reference, COALESCE(p.nom, ai.designation) as designation 
            FROM avoir_items ai
            LEFT JOIN products p ON ai.produit_id = p.id
            WHERE ai.avoir_id = ?
        `, [id]);

        res.status(200).json({
            ...rows[0],
            sous_societe_nom: rows[0].sous_societe_nom_from_numero || null,
            items,
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateAvoir = async (req, res) => {
    const { id } = req.params;
    const {
        date_avoir,
        client_id,
        facture_id,
        items,
        statut,
        status
    } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute("SELECT user_id, numero_avoir FROM avoirs WHERE id = ?", [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Avoir non trouvé" });
        }
        if (
            req.user.role !== 'admin' &&
            req.user.role !== 'directeur' &&
            req.user.role !== 'responsable' &&
            rows[0].user_id !== req.user.id
        ) {
            await connection.rollback();
            return res.status(403).json({ message: "Non autorisé" });
        }
        const numeroAvoir = rows[0].numero_avoir;

        const [oldItems] = await connection.execute("SELECT produit_id, quantite FROM avoir_items WHERE avoir_id = ?", [id]);
        for (const item of oldItems) {
            if (item.produit_id) {
                const [p] = await connection.execute("SELECT stock FROM products WHERE id = ?", [item.produit_id]);
                const before = p.length ? p[0].stock : 0;
                await connection.execute("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantite, item.produit_id]);
                await logProductMovement(
                    {
                        productId: item.produit_id,
                        type: "avoir_sortie",
                        quantityBefore: before,
                        quantityAfter: before - Number(item.quantite),
                        description: "Annulation retour (mise à jour avoir)",
                        userId: req.user.id,
                        referenceType: "avoir",
                        referenceId: Number(id),
                        referenceNumero: numeroAvoir
                    },
                    connection
                );
            }
        }

        const final_statut = statut || status || 'valide';
        const final_facture_id = (facture_id === "" || facture_id === "none" || !facture_id) ? null : facture_id;

        // Maximum 1 avoir par facture (when linking to a facture)
        if (final_facture_id) {
            const [existingAvoir] = await connection.execute(
                "SELECT id FROM avoirs WHERE facture_id = ? AND id != ? LIMIT 1",
                [final_facture_id, id]
            );
            if (existingAvoir.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    message: "Un avoir existe déjà pour cette facture. Maximum 1 avoir par facture."
                });
            }
        }

        await connection.execute(`
            UPDATE avoirs 
            SET date_avoir = ?, client_id = ?, facture_id = ?, statut = ?
            WHERE id = ?
        `, [date_avoir, client_id, final_facture_id, final_statut, id]);

        // 4. Delete old items and insert new ones
        await connection.execute("DELETE FROM avoir_items WHERE avoir_id = ?", [id]);

        let montant_ht_total = 0;
        let montant_tva_total = 0;
        let total_items_reduction = 0;
        let sumRedPct = 0;

        for (const item of items) {
            const bruteHT = Number(item.quantite) * Number(item.prix_unitaire);
            const redTaux = Number(item.reduction) || 0;
            const itemReductionAmount = bruteHT * (redTaux / 100);
            const montant_ht = bruteHT - itemReductionAmount;
            const montant_tva = montant_ht * (Number(item.tva) / 100);
            montant_ht_total += montant_ht;
            montant_tva_total += montant_tva;
            total_items_reduction += itemReductionAmount;
            sumRedPct += redTaux;

            await connection.execute(`
                INSERT INTO avoir_items
                (avoir_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, item.produit_id || null, item.designation, item.quantite, item.prix_unitaire, item.tva, redTaux, montant_ht]);

            // Apply new stock changes
            if (item.produit_id) {
                const [p] = await connection.execute("SELECT stock FROM products WHERE id = ?", [item.produit_id]);
                const before = p.length ? p[0].stock : 0;
                await connection.execute("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantite, item.produit_id]);
                await logProductMovement(
                    {
                        productId: item.produit_id,
                        type: "avoir_retour",
                        quantityBefore: before,
                        quantityAfter: before + Number(item.quantite),
                        description: "Retour stock (mise à jour avoir)",
                        userId: req.user.id,
                        referenceType: "avoir",
                        referenceId: Number(id),
                        referenceNumero: numeroAvoir
                    },
                    connection
                );
            }
        }

        // 5. Update totals
        await connection.execute(`
            UPDATE avoirs 
            SET montant_ht = ?, montant_tva = ?, montant_ttc = ?, reduction = ?, total_reduction = ?
            WHERE id = ?
        `, [montant_ht_total, montant_tva_total, montant_ht_total + montant_tva_total, parseFloat(sumRedPct.toFixed(4)), total_items_reduction, id]);

        await connection.commit();
        res.status(200).json({ message: "Avoir mis à jour" });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    } finally {
        connection.release();
    }
};

exports.deleteAvoir = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Check ownership/existence
        let checkSql = "SELECT user_id, numero_avoir FROM avoirs WHERE id = ?";
        const [rows] = await connection.execute(checkSql, [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Avoir not found" });
        }
        if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
            await connection.rollback();
            return res.status(403).json({ message: "Unauthorized" });
        }
        const numeroAvoir = rows[0].numero_avoir;

        // Creating an avoir increases stock; deleting it decreases it back.
        const [items] = await connection.execute("SELECT produit_id, quantite FROM avoir_items WHERE avoir_id = ?", [id]);
        for (const item of items) {
            if (item.produit_id) {
                const [p] = await connection.execute("SELECT stock FROM products WHERE id = ?", [item.produit_id]);
                const before = p.length ? p[0].stock : 0;
                await connection.execute(
                    "UPDATE products SET stock = stock - ? WHERE id = ?",
                    [item.quantite, item.produit_id]
                );
                await logProductMovement(
                    {
                        productId: item.produit_id,
                        type: "avoir_sortie",
                        quantityBefore: before,
                        quantityAfter: before - Number(item.quantite),
                        description: "Annulation retour (suppression avoir)",
                        userId: req.user.id,
                        referenceType: "avoir",
                        referenceId: Number(id),
                        referenceNumero: numeroAvoir
                    },
                    connection
                );
            }
        }

        await connection.execute("DELETE FROM avoir_items WHERE avoir_id = ?", [id]);
        await connection.execute("DELETE FROM avoirs WHERE id = ?", [id]);

        await connection.commit();
        res.status(200).json({ message: "Avoir supprimé" });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error deleting avoir:", err);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

/* ===============================
   APPROVE AVOIR (Admin/Responsable only)
 ================================= */
exports.approveAvoir = async (req, res) => {
    const { id } = req.params;
    const userRole = req.user.role;

    // Dynamic approval check
    const allowed = await canApprove(req.user.role, 'avoir');
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour valider un avoir" });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute("SELECT * FROM avoirs WHERE id = ?", [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Avoir non trouvé" });
        }

        if (rows[0].statut !== 'en_attente') {
            await connection.rollback();
            return res.status(400).json({ message: "Cet avoir n'est pas en attente de validation" });
        }

        const numeroAvoir = rows[0].numero_avoir;

        // Update status to 'valide'
        await connection.execute(
            "UPDATE avoirs SET statut = 'valide' WHERE id = ?",
            [id]
        );

        // Now apply stock changes
        const [items] = await connection.execute(
            "SELECT produit_id, quantite FROM avoir_items WHERE avoir_id = ?",
            [id]
        );
        for (const item of items) {
            if (item.produit_id) {
                const [p] = await connection.execute("SELECT stock FROM products WHERE id = ?", [item.produit_id]);
                const before = p.length ? p[0].stock : 0;
                await connection.execute(
                    "UPDATE products SET stock = stock + ? WHERE id = ?",
                    [item.quantite, item.produit_id]
                );
                await logProductMovement(
                    {
                        productId: item.produit_id,
                        type: "avoir_retour",
                        quantityBefore: before,
                        quantityAfter: before + Number(item.quantite),
                        description: "Retour stock (approbation avoir)",
                        userId: req.user.id,
                        referenceType: "avoir",
                        referenceId: Number(id),
                        referenceNumero: numeroAvoir
                    },
                    connection
                );
            }
        }

        await connection.commit();
        res.status(200).json({ message: "Avoir validé avec succès" });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error approving avoir:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    } finally {
        connection.release();
    }
};

/* ===============================
   REJECT AVOIR (Admin/Responsable only)
 ================================= */
exports.rejectAvoir = async (req, res) => {
    const { id } = req.params;
    const userRole = req.user.role;

    const allowed = await canApprove(req.user.role, 'avoir');
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour rejeter un avoir" });
    }

    try {
        const [rows] = await db.execute("SELECT * FROM avoirs WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Avoir non trouvé" });
        }

        if (rows[0].statut !== 'en_attente') {
            return res.status(400).json({ message: "Cet avoir n'est pas en attente de validation" });
        }

        await db.execute(
            "UPDATE avoirs SET statut = 'rejete' WHERE id = ?",
            [id]
        );

        res.status(200).json({ message: "Avoir rejeté" });
    } catch (err) {
        console.error("Error rejecting avoir:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
};

/* ===============================
   REOPEN AVOIR (reset to en_attente)
   ================================= */
exports.reopenAvoir = async (req, res) => {
    const { id } = req.params;
    const userRole = req.user.role;

    if (userRole !== 'admin' && userRole !== 'responsable') {
        return res.status(403).json({ message: "Seul un admin ou responsable peut rouvrir un avoir" });
    }

    try {
        const [rows] = await db.execute("SELECT * FROM avoirs WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Avoir non trouvé" });
        }

        if (rows[0].statut !== 'rejete') {
            return res.status(400).json({ message: "Seuls les avoirs rejetés peuvent être rouverts" });
        }

        await db.execute(
            "UPDATE avoirs SET statut = 'en_attente' WHERE id = ?",
            [id]
        );

        // Si l'avoir est lié à une facture, repasser cette facture en "non payée"
        const factureId = rows[0].facture_id;
        if (factureId) {
            await db.execute(
                "UPDATE factures SET statut = 'non_payee' WHERE id = ?",
                [factureId]
            );
        }

        res.status(200).json({ message: "Avoir rouvert et remis en attente de validation" });
    } catch (err) {
        console.error("Error reopening avoir:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
};

const pdfConfig = {
    type: 'AVOIR',
    title: 'AVOIR',
    infoTitle: 'Avoir',
    numberField: 'numero_avoir',
    dateField: 'date_avoir',
    statusField: 'statut',
    defaultStatus: 'Valide',
    footerLeft: "Cet avoir est valable sur vos prochains achats."
};

exports.sendAvoirEmail = async (req, res) => {
    const { id } = req.params;
    const { to, subject, message } = req.body;

    if (!to) {
        return res.status(400).json({ message: "Le destinataire est requis" });
    }

    try {
        let sql = `
            SELECT a.*,
                   cl.nom_complet AS client_nom,
                   cl.\`type\` as client_type,
                   cl.ice as client_ice,
                   cl.telephone as client_telephone,
                   cl.email as client_email,
                   cl.adresse as client_adresse,
                   f.numero_facture AS numero_facture
            FROM avoirs a
            LEFT JOIN clients cl ON a.client_id = cl.id
            LEFT JOIN factures f ON a.facture_id = f.id
            WHERE a.id = ?
        `;
        const [rows] = await db.execute(sql, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Avoir introuvable" });
        }

        const [items] = await db.execute(`
            SELECT ai.*, COALESCE(p.nom, ai.designation) as designation 
            FROM avoir_items ai
            LEFT JOIN products p ON ai.produit_id = p.id
            WHERE ai.avoir_id = ?
        `, [id]);

        const docData = rows[0];

        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(docData, items, pdfConfig);

        const emailSubject = subject || `[Avoir] ${docData.numero_avoir}`;
        const emailText = message || `Veuillez trouver ci-joint l'avoir ${docData.numero_avoir}.`;

        const { sendMail } = require("../services/emailService");
        await sendMail(to, emailSubject, emailText, [
            { filename: `Avoir_${docData.numero_avoir}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
        ]);

        res.status(200).json({ message: "Email envoyé avec succès" });
    } catch (error) {
        console.error("Error sending avoir email:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
    }
};

exports.downloadAvoirPdf = async (req, res) => {
    const { id } = req.params;

    try {
        let sql = `
            SELECT a.*,
                   cl.nom_complet AS client_nom,
                   cl.\`type\` as client_type,
                   cl.ice as client_ice,
                   cl.telephone as client_telephone,
                   cl.email as client_email,
                   cl.adresse as client_adresse,
                   f.numero_facture AS numero_facture
            FROM avoirs a
            LEFT JOIN clients cl ON a.client_id = cl.id
            LEFT JOIN factures f ON a.facture_id = f.id
            WHERE a.id = ?
        `;
        const [rows] = await db.execute(sql, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Avoir introuvable" });
        }

        const [items] = await db.execute(`
            SELECT ai.*, COALESCE(p.nom, ai.designation) as designation 
            FROM avoir_items ai
            LEFT JOIN products p ON ai.produit_id = p.id
            WHERE ai.avoir_id = ?
        `, [id]);

        const docData = rows[0];

        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(docData, items, pdfConfig);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=Avoir_${docData.numero_avoir}.pdf`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating avoir PDF for download:", error);
        res.status(500).json({ message: "Erreur serveur lors de la génération du PDF" });
    }
};
