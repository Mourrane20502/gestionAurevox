const db = require("../config/db").promise();
const { getNextNumber } = require("../utils/numberingSettings");
const { logProductMovement } = require("../utils/productMovementLogger");
const fs = require("fs");
const path = require("path");

const uploadsDir = path.join(__dirname, "../../uploads");
const resolveUploadPath = (filename) =>
    path.join(uploadsDir, path.basename(String(filename || "")));
const safeUnlink = async (filename) => {
    const clean = String(filename || "").trim();
    if (!clean) return;
    try {
        await fs.promises.unlink(resolveUploadPath(clean));
    } catch {
        // Ignore if file doesn't exist.
    }
};

const getNow = () => new Date().toISOString().slice(0, 19).replace("T", " ");

function isGrosNature(val) {
    const s = String(val || "").trim().toLowerCase();
    return s === "gros" || s === "gro";
}

async function aggregateFactureGrosItemsByProduct(connection, factureId) {
    const [items] = await connection.execute(
        "SELECT produit_id, designation, grammage FROM factures_gros_items WHERE facture_gros_id = ?",
        [factureId]
    );

    const map = new Map();
    const unresolvedByDesignation = new Map();

    for (const it of items) {
        const pid = Number(it?.produit_id);
        const g = Number(it?.grammage);
        if (!Number.isFinite(g) || g <= 0) continue;

        if (Number.isFinite(pid) && pid > 0) {
            map.set(pid, (map.get(pid) || 0) + g);
            continue;
        }

        const designation = String(it?.designation || "").trim();
        if (!designation) continue;
        unresolvedByDesignation.set(
            designation,
            (unresolvedByDesignation.get(designation) || 0) + g
        );
    }

    for (const [designation, grammage] of unresolvedByDesignation.entries()) {
        const [rows] = await connection.execute(
            `SELECT id
             FROM products
             WHERE nature_produit = 'Gros'
               AND LOWER(TRIM(nom)) = LOWER(TRIM(?))
             LIMIT 2`,
            [designation]
        );
        if (Array.isArray(rows) && rows.length === 1) {
            const resolvedPid = Number(rows[0].id);
            if (Number.isFinite(resolvedPid) && resolvedPid > 0) {
                map.set(resolvedPid, (map.get(resolvedPid) || 0) + Number(grammage || 0));
            }
        }
    }

    return map;
}

async function subtractGrosStockForFactureApproval(connection, factureId, referenceNumero, approverId) {
    const soldByProduct = await aggregateFactureGrosItemsByProduct(connection, factureId);
    for (const [pid, totalG] of soldByProduct.entries()) {
        const [rows] = await connection.execute(
            "SELECT grammage, nature_produit FROM products WHERE id = ? FOR UPDATE",
            [pid]
        );
        if (!Array.isArray(rows) || rows.length === 0) continue;
        if (!isGrosNature(rows[0].nature_produit)) continue;

        const current = Number(rows[0].grammage) || 0;
        const toSubtract = Number(totalG || 0);
        if (current + 1e-8 < toSubtract) {
            throw new Error(
                `Grammage insuffisant pour le produit (id ${pid}) : disponible ${current} g, demandé ${toSubtract} g`
            );
        }

        await connection.execute(
            "UPDATE products SET grammage = grammage - ? WHERE id = ?",
            [toSubtract, pid]
        );

        await logProductMovement(
            {
                productId: pid,
                type: "facture_gros_sortie",
                quantityBefore: current,
                quantityAfter: current - toSubtract,
                description: "Sortie grammage (validation via règlement gros)",
                userId: approverId ?? null,
                referenceType: "facture_gros",
                referenceId: Number(factureId),
                referenceNumero: referenceNumero || null,
            },
            connection
        );
    }
}

async function ensureNumeroRecuColumn(connection) {
    const conn = connection || await db.getConnection();
    const shouldRelease = !connection;
    try {
        const [cols] = await conn.query("SHOW COLUMNS FROM reglements_clients_gros LIKE 'numero_recu'");
        if (!Array.isArray(cols) || cols.length === 0) {
            await conn.query("ALTER TABLE reglements_clients_gros ADD COLUMN numero_recu INT NULL AFTER id");
            await conn.query("CREATE UNIQUE INDEX idx_reglements_clients_gros_numero_recu ON reglements_clients_gros (numero_recu)");
        }
    } finally {
        if (shouldRelease) conn.release();
    }
}


async function ensureClientFromDocument({ client_id, facture_id, commande_id }) {
    if (client_id) return client_id;
    if (facture_id) {
        const [rows] = await db.execute("SELECT client_id FROM factures_gros WHERE id = ? LIMIT 1", [facture_id]);
        if (rows.length > 0) return rows[0].client_id;
    }
    if (commande_id) {
        const [rows] = await db.execute("SELECT client_id FROM commandes_gros WHERE id = ? LIMIT 1", [commande_id]);
        if (rows.length > 0) return rows[0].client_id;
    }
    throw new Error("Impossible de déterminer le client pour ce règlement gros");
}

async function resolveSousSocieteForReglement(connection, factureId, commandeId) {
    const fId = Number(factureId);
    if (Number.isFinite(fId) && fId > 0) {
        const [rows] = await connection.query(
            `SELECT pdv.id_sous_gestionnaire
             FROM factures_gros f
             LEFT JOIN point_de_vente pdv ON pdv.id = f.point_de_vente_id
             WHERE f.id = ?
             LIMIT 1`,
            [fId]
        );
        const ssId = Number(rows?.[0]?.id_sous_gestionnaire);
        if (Number.isFinite(ssId) && ssId > 0) return { id: ssId };
    }

    const cId = Number(commandeId);
    if (Number.isFinite(cId) && cId > 0) {
        const [rows] = await connection.query(
            `SELECT pdv.id_sous_gestionnaire
             FROM commandes_gros c
             LEFT JOIN point_de_vente pdv ON pdv.id = c.point_de_vente_id
             WHERE c.id = ?
             LIMIT 1`,
            [cId]
        );
        const ssId = Number(rows?.[0]?.id_sous_gestionnaire);
        if (Number.isFinite(ssId) && ssId > 0) return { id: ssId };
    }
    return { id: null };
}

async function computeFactureReglementTotals(factureId) {
    const [[facture]] = await db.execute(
        "SELECT id, montant_ttc, statut FROM factures_gros WHERE id = ?",
        [factureId]
    );
    if (!facture) return null;

    const [[row]] = await db.execute(
        `SELECT COALESCE(SUM(montant), 0) AS total_regle
         FROM reglements_clients_gros
         WHERE facture_gros_id = ? AND statut = 'approuve'`,
        [factureId]
    );

    const montantTtc = Number(facture.montant_ttc || 0);
    const totalRegle = Number(row.total_regle || 0);
    return {
        facture_id: Number(factureId),
        montant_ttc: montantTtc,
        total_regle: totalRegle,
        reste_a_payer: Math.max(montantTtc - totalRegle, 0),
        statut_facture: facture.statut,
    };
}

async function updateFacturePaymentStatus(factureId) {
    const totals = await computeFactureReglementTotals(factureId);
    if (!totals) return;
    if (String(totals.statut_facture || "").trim() === "en_attente") return;
    const newStatus = totals.total_regle >= totals.montant_ttc && totals.montant_ttc > 0 ? "payee" : "non_payee";
    await db.execute("UPDATE factures_gros SET statut = ? WHERE id = ?", [newStatus, factureId]);
}

async function propagateApprovalFromReglementGros(connection, reglement) {
    const propagation = {
        devis_gros_id: null,
        commande_gros_id: null,
        facture_gros_id: null,
        devis_updated: false,
        commande_updated: false,
        facture_updated: false,
        facture_new_status: null,
    };

    const regFactureId = reglement?.facture_gros_id ? Number(reglement.facture_gros_id) : null;
    const regCommandeId = reglement?.commande_gros_id ? Number(reglement.commande_gros_id) : null;

    let facture = null;
    let commande = null;

    if (regFactureId) {
        const [fRows] = await connection.execute(
            "SELECT id, commande_gros_id, devis_gros_id, statut, montant_ttc FROM factures_gros WHERE id = ? LIMIT 1",
            [regFactureId]
        );
        if (fRows.length > 0) facture = fRows[0];
    }

    if (regCommandeId) {
        const [cRows] = await connection.execute(
            "SELECT id, devis_gros_id, statut FROM commandes_gros WHERE id = ? LIMIT 1",
            [regCommandeId]
        );
        if (cRows.length > 0) commande = cRows[0];
    }

    if (facture && commande && Number(facture.commande_gros_id || 0) !== Number(commande.id)) {
        throw new Error("Relation incohérente: la facture gros liée ne correspond pas à la commande gros du règlement.");
    }

    if (!commande && facture?.commande_gros_id) {
        const [cRows] = await connection.execute(
            "SELECT id, devis_gros_id, statut FROM commandes_gros WHERE id = ? LIMIT 1",
            [facture.commande_gros_id]
        );
        if (cRows.length > 0) commande = cRows[0];
    }

    const devisId = (commande?.devis_gros_id ? Number(commande.devis_gros_id) : null) || (facture?.devis_gros_id ? Number(facture.devis_gros_id) : null) || null;

    propagation.facture_gros_id = facture?.id ? Number(facture.id) : null;
    propagation.commande_gros_id = commande?.id ? Number(commande.id) : null;
    propagation.devis_gros_id = devisId;

    if (devisId) {
        const [result] = await connection.execute(
            "UPDATE devis_gros SET statuts_devis = 'accepté' WHERE id = ? AND statuts_devis = 'en attente'",
            [devisId]
        );
        propagation.devis_updated = result.affectedRows > 0;
    }

    if (propagation.commande_gros_id) {
        const [result] = await connection.execute(
            "UPDATE commandes_gros SET statut = 'validee' WHERE id = ? AND statut = 'en_attente'",
            [propagation.commande_gros_id]
        );
        propagation.commande_updated = result.affectedRows > 0;
    }

    if (propagation.facture_gros_id) {
        const [rows] = await connection.execute(
            `SELECT f.id, f.numero_facture, f.montant_ttc,
                (
                    COALESCE((
                        SELECT SUM(rc1.montant)
                        FROM reglements_clients_gros rc1
                        WHERE rc1.facture_gros_id = f.id AND rc1.statut = 'approuve'
                    ), 0)
                    +
                    COALESCE((
                        SELECT SUM(rc2.montant)
                        FROM reglements_clients_gros rc2
                        WHERE f.commande_gros_id IS NOT NULL
                          AND rc2.commande_gros_id = f.commande_gros_id
                          AND rc2.statut = 'approuve'
                    ), 0)
                ) AS total_regle
             FROM factures_gros f
             WHERE f.id = ? AND f.statut = 'en_attente'`,
            [propagation.facture_gros_id]
        );

        if (rows.length > 0) {
            const f = rows[0];
            const montantTtc = Number(f.montant_ttc) || 0;
            const totalRegle = Number(f.total_regle) || 0;
            const nextStatut = montantTtc > 0 && totalRegle >= montantTtc - 0.01 ? "payee" : "non_payee";

            // IMPORTANT: si la facture était encore en_attente, la sortie stock n'a pas encore été faite.
            // On décrémente ici avant de passer la facture en non_payee/payee.
            await subtractGrosStockForFactureApproval(
                connection,
                propagation.facture_gros_id,
                f.numero_facture,
                reglement?.approved_by || reglement?.created_by || null
            );

            const [result] = await connection.execute(
                "UPDATE factures_gros SET statut = ? WHERE id = ? AND statut = 'en_attente'",
                [nextStatut, propagation.facture_gros_id]
            );
            propagation.facture_updated = result.affectedRows > 0;
            if (propagation.facture_updated) propagation.facture_new_status = nextStatut;
        }
    }

    return propagation;
}

exports.createReglementClientGros = async (req, res) => {
    const { client_id, facture_gros_id, commande_gros_id, lignes, date_reglement, montant, mode_paiement, banque_id, commentaire } = req.body;
    const userId = req.user.id;
    if (!facture_gros_id && !commande_gros_id) {
        return res.status(400).json({ message: "facture_gros_id ou commande_gros_id est requis" });
    }

    const lignesToInsert = Array.isArray(lignes) && lignes.length > 0 ? lignes : [{
        date_reglement, montant, mode_paiement, banque_id, commentaire,
    }];

    try {
        const effectiveClientId = await ensureClientFromDocument({ client_id, facture_id: facture_gros_id, commande_id: commande_gros_id });
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await ensureNumeroRecuColumn(connection);

            const [pendingRows] = await connection.execute(
                `SELECT id FROM reglements_clients_gros
                 WHERE statut = 'en_attente'
                 AND (
                    (facture_gros_id IS NOT NULL AND facture_gros_id = ?)
                    OR (commande_gros_id IS NOT NULL AND commande_gros_id = ?)
                 )
                 LIMIT 1 FOR UPDATE`,
                [facture_gros_id || null, commande_gros_id || null]
            );
            if (pendingRows.length > 0) {
                await connection.rollback();
                return res.status(409).json({ message: "Un règlement gros en attente existe déjà pour ce document." });
            }

            const insertedIds = [];
            for (const l of lignesToInsert) {
                const lMontant = Number(l?.montant || 0);
                if (lMontant <= 0 || !l?.mode_paiement) continue;
                const [result] = await connection.execute(
                    `INSERT INTO reglements_clients_gros
                    (client_id, facture_gros_id, commande_gros_id, date_reglement, montant, mode_paiement, banque_id, statut, commentaire, created_by, approved_by, approved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, NULL, NULL)`,
                    [
                        effectiveClientId,
                        facture_gros_id || null,
                        commande_gros_id || null,
                        l.date_reglement || getNow(),
                        lMontant,
                        l.mode_paiement,
                        !l.banque_id || l.banque_id === "none" ? null : l.banque_id,
                        l.commentaire || null,
                        userId,
                    ]
                );
                const sousSociete = await resolveSousSocieteForReglement(connection, facture_gros_id, commande_gros_id);
                const nextNumeroRecu = await getNextNumber("RCG", result.insertId, connection, { sousSocieteId: sousSociete.id });
                await connection.execute("UPDATE reglements_clients_gros SET numero_recu = ? WHERE id = ?", [nextNumeroRecu, result.insertId]);
                insertedIds.push(result.insertId);
            }

            await connection.commit();
            res.status(201).json({ message: "Règlement gros créé", ids: insertedIds, statut: "en_attente" });
        } catch (err) {
            await connection.rollback();
            res.status(500).json({ message: "Erreur création règlement gros", error: err.message });
        } finally {
            connection.release();
        }
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.getAllReglementsClientsGros = async (req, res) => {
    try {
        await ensureNumeroRecuColumn();
        const factureFilter = req.query.factureId || req.query.factureGrosId;
        const commandeFilter = req.query.commandeId || req.query.commandeGrosId;
        let sql = `SELECT r.*,
                    c.nom_complet AS client_nom,
                    f.numero_facture,
                    f.montant_ttc AS facture_montant_ttc,
                    COALESCE(cmd.numero_commande, cmdf.numero_commande) AS numero_commande,
                    COALESCE(cmd.montant_ttc, cmdf.montant_ttc) AS commande_montant_ttc,
                    COALESCE(cmd.statut, cmdf.statut) AS commande_statut,
                    COALESCE(cmd.numero_commande, cmdf.numero_commande) AS commande_gros_numero,
                    COALESCE(pdvf.id, pdvc.id) AS point_de_vente_id,
                    COALESCE(pdvf.nom, pdvc.nom) AS point_de_vente_nom,
                    COALESCE(ssf.NOM_SOUS_SOCIETE, ssc.NOM_SOUS_SOCIETE) AS sous_societe_nom,
                    b.nom_banque AS banque_nom,
                    CONCAT(u.prenom, ' ', u.nom) AS created_by_nom,
                    CONCAT(u2.prenom, ' ', u2.nom) AS approved_by_nom
             FROM reglements_clients_gros r
             LEFT JOIN clients c ON r.client_id = c.id
             LEFT JOIN factures_gros f ON r.facture_gros_id = f.id
             LEFT JOIN commandes_gros cmd ON r.commande_gros_id = cmd.id
             LEFT JOIN commandes_gros cmdf ON f.commande_gros_id = cmdf.id
             LEFT JOIN point_de_vente pdvf ON pdvf.id = f.point_de_vente_id
             LEFT JOIN point_de_vente pdvc ON pdvc.id = cmd.point_de_vente_id
             LEFT JOIN sous_societe ssf ON ssf.ID = pdvf.id_sous_gestionnaire
             LEFT JOIN sous_societe ssc ON ssc.ID = pdvc.id_sous_gestionnaire
             LEFT JOIN banques b ON r.banque_id = b.id
             LEFT JOIN users u ON r.created_by = u.id
             LEFT JOIN users u2 ON r.approved_by = u2.id
        `;
        const params = [];
        const where = [];
        if (req.query.clientId) {
            where.push("r.client_id = ?");
            params.push(req.query.clientId);
        }
        if (factureFilter) {
            where.push("r.facture_gros_id = ?");
            params.push(factureFilter);
        }
        if (commandeFilter) {
            where.push("r.commande_gros_id = ?");
            params.push(commandeFilter);
        }
        if (req.query.statut) {
            where.push("r.statut = ?");
            params.push(req.query.statut);
        }
        const role = (req.user.role || "").toLowerCase();
        if (role !== "admin" && role !== "responsable" && role !== "directeur" && role !== "superadmin") {
            where.push("r.created_by = ?");
            params.push(req.user.id);
        }
        if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
        sql += " ORDER BY r.created_at DESC";
        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ message: "Erreur chargement règlements gros", error: err.message });
    }
};

exports.getReglementClientGrosById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute(
            `SELECT r.*,
                    c.nom_complet AS client_nom,
                    f.numero_facture,
                    f.montant_ttc AS facture_montant_ttc,
                    COALESCE(cmd.numero_commande, cmdf.numero_commande) AS numero_commande,
                    COALESCE(cmd.montant_ttc, cmdf.montant_ttc) AS commande_montant_ttc,
                    COALESCE(cmd.statut, cmdf.statut) AS commande_statut,
                    COALESCE(cmd.numero_commande, cmdf.numero_commande) AS commande_gros_numero,
                    COALESCE(pdvf.id, pdvc.id) AS point_de_vente_id,
                    COALESCE(pdvf.nom, pdvc.nom) AS point_de_vente_nom,
                    COALESCE(ssf.NOM_SOUS_SOCIETE, ssc.NOM_SOUS_SOCIETE) AS sous_societe_nom,
                    b.nom_banque AS banque_nom,
                    CONCAT(u.prenom, ' ', u.nom) AS created_by_nom,
                    CONCAT(u2.prenom, ' ', u2.nom) AS approved_by_nom
             FROM reglements_clients_gros r
             LEFT JOIN clients c ON r.client_id = c.id
             LEFT JOIN factures_gros f ON r.facture_gros_id = f.id
             LEFT JOIN commandes_gros cmd ON r.commande_gros_id = cmd.id
             LEFT JOIN commandes_gros cmdf ON f.commande_gros_id = cmdf.id
             LEFT JOIN point_de_vente pdvf ON pdvf.id = f.point_de_vente_id
             LEFT JOIN point_de_vente pdvc ON pdvc.id = cmd.point_de_vente_id
             LEFT JOIN sous_societe ssf ON ssf.ID = pdvf.id_sous_gestionnaire
             LEFT JOIN sous_societe ssc ON ssc.ID = pdvc.id_sous_gestionnaire
             LEFT JOIN banques b ON r.banque_id = b.id
             LEFT JOIN users u ON r.created_by = u.id
             LEFT JOIN users u2 ON r.approved_by = u2.id
             WHERE r.id = ?
             LIMIT 1`,
            [id]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Règlement gros introuvable" });
        res.status(200).json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Erreur chargement règlement gros", error: err.message });
    }
};

exports.approveReglementClientGros = async (req, res) => {
    const { id } = req.params;
    const approverId = req.user.id;
    const { commentaire } = req.body || {};
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute("SELECT * FROM reglements_clients_gros WHERE id = ? FOR UPDATE", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Règlement gros introuvable" });
        const reglement = rows[0];
        const now = getNow();
        const newComment = `${reglement.commentaire || ""}\n[PAYÉ]${commentaire ? ` ${String(commentaire).trim()}` : ""} @ ${now}`.trim();
        await conn.execute(
            `UPDATE reglements_clients_gros
             SET statut = 'approuve', approved_by = ?, approved_at = ?, commentaire = ?
             WHERE id = ?`,
            [approverId, now, newComment, id]
        );
        const propagation = await propagateApprovalFromReglementGros(conn, reglement);
        await conn.commit();
        if (reglement.facture_gros_id) await updateFacturePaymentStatus(reglement.facture_gros_id);
        res.status(200).json({ message: "Règlement gros approuvé", propagation });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ message: "Erreur approbation règlement gros", error: err.message });
    } finally {
        conn.release();
    }
};

exports.rejectReglementClientGros = async (req, res) => {
    const { id } = req.params;
    const approverId = req.user.id;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute("SELECT * FROM reglements_clients_gros WHERE id = ? FOR UPDATE", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Règlement gros introuvable" });
        const reglement = rows[0];
        if (reglement.statut !== "en_attente") return res.status(400).json({ message: "Seul un règlement en attente peut être refusé" });
        const rejectedComment = `${reglement.commentaire || ""}\n[REFUSÉ] Rejeté le ${getNow()} par utilisateur #${approverId}`.trim();
        await conn.execute("UPDATE reglements_clients_gros SET statut = 'rejete', commentaire = ? WHERE id = ?", [rejectedComment, id]);
        await conn.commit();
        res.status(200).json({ message: "Règlement gros refusé" });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ message: "Erreur rejet règlement gros", error: err.message });
    } finally {
        conn.release();
    }
};

exports.markReglementClientGrosImpaye = async (req, res) => {
    const { id } = req.params;
    const { commentaire } = req.body || {};
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute("SELECT * FROM reglements_clients_gros WHERE id = ? FOR UPDATE", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Règlement gros introuvable" });
        const reglement = rows[0];
        const now = getNow();
        const newComment = `${reglement.commentaire || ""}\n[IMPAYÉ]${commentaire ? ` ${String(commentaire).trim()}` : ""} @ ${now}`.trim();
        await conn.execute("UPDATE reglements_clients_gros SET statut = 'impaye', commentaire = ? WHERE id = ?", [newComment, id]);
        await conn.commit();
        if (reglement.facture_gros_id) await updateFacturePaymentStatus(reglement.facture_gros_id);
        res.status(200).json({ message: "Règlement gros marqué impayé" });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ message: "Erreur marquage impayé", error: err.message });
    } finally {
        conn.release();
    }
};

exports.getSituationReglementClientGros = async (req, res) => {
    const { factureId, commandeId } = req.query;
    if (!factureId && !commandeId) return res.status(400).json({ message: "factureId ou commandeId est requis" });
    try {
        if (factureId) {
            const totals = await computeFactureReglementTotals(factureId);
            if (!totals) return res.status(404).json({ message: "Facture gros introuvable" });
            return res.status(200).json({ type: "facture", ...totals });
        }
        const [[commande]] = await db.execute(
            "SELECT id, montant_ttc, (SELECT id FROM factures_gros WHERE commande_gros_id = c.id LIMIT 1) AS facture_id FROM commandes_gros c WHERE c.id = ?",
            [commandeId]
        );
        if (!commande) return res.status(404).json({ message: "Commande gros introuvable" });
        if (commande.facture_id) {
            const totals = await computeFactureReglementTotals(commande.facture_id);
            if (totals) return res.status(200).json({ type: "commande", commande_id: Number(commandeId), montant_ttc: totals.montant_ttc, total_regle: totals.total_regle, reste_a_payer: totals.reste_a_payer });
        }
        const [[row]] = await db.execute(
            `SELECT COALESCE(SUM(montant), 0) AS total_regle
             FROM reglements_clients_gros
             WHERE commande_gros_id = ? AND statut = 'approuve'`,
            [commandeId]
        );
        const montantTtc = Number(commande.montant_ttc || 0);
        const totalRegle = Number(row.total_regle || 0);
        return res.status(200).json({
            type: "commande",
            commande_id: Number(commandeId),
            montant_ttc: montantTtc,
            total_regle: totalRegle,
            reste_a_payer: Math.max(montantTtc - totalRegle, 0),
        });
    } catch (err) {
        res.status(500).json({ message: "Erreur situation règlement gros", error: err.message });
    }
};

exports.uploadReglementClientGrosPdf = async (req, res) => {
    const { id } = req.params;
    const file = req.file;
    if (!file) {
        return res.status(400).json({ message: "Aucun fichier fourni" });
    }

    const ext = String(file.originalname || "").toLowerCase();
    const isPdf = file.mimetype === "application/pdf" || ext.endsWith(".pdf");
    if (!isPdf) {
        await safeUnlink(file.filename);
        return res.status(400).json({ message: "Seul le format PDF est autorisé" });
    }

    try {
        const [rows] = await db.execute(
            "SELECT id, pdf_path FROM reglements_clients_gros WHERE id = ? LIMIT 1",
            [id]
        );
        if (!Array.isArray(rows) || rows.length === 0) {
            await safeUnlink(file.filename);
            return res.status(404).json({ message: "Règlement gros introuvable" });
        }

        const previousPdf = rows[0].pdf_path;
        await db.execute(
            "UPDATE reglements_clients_gros SET pdf_path = ? WHERE id = ?",
            [file.filename, id]
        );

        if (previousPdf && previousPdf !== file.filename) {
            await safeUnlink(previousPdf);
        }

        return res.status(200).json({
            message: "PDF téléversé avec succès",
            pdf_path: file.filename,
            pdf_url: `/uploads/${encodeURIComponent(file.filename)}`,
        });
    } catch (error) {
        await safeUnlink(file.filename);
        console.error("Error uploading reglement client gros PDF:", error);
        return res.status(500).json({ message: "Erreur lors du téléversement du PDF" });
    }
};
