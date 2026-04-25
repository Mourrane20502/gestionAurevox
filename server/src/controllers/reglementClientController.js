const db = require("../config/db").promise();
const { getNextNumber } = require("../utils/numberingSettings");
const { logProductMovement } = require("../utils/productMovementLogger");

const getNow = () => new Date().toISOString().slice(0, 19).replace("T", " ");

async function ensureNumeroRecuColumn(connection) {
    const conn = connection || await db.getConnection();
    const shouldRelease = !connection;
    try {
        const [cols] = await conn.query("SHOW COLUMNS FROM reglements_clients LIKE 'numero_recu'");
        if (!Array.isArray(cols) || cols.length === 0) {
            await conn.query("ALTER TABLE reglements_clients ADD COLUMN numero_recu INT NULL AFTER id");
            await conn.query("CREATE UNIQUE INDEX idx_reglements_clients_numero_recu ON reglements_clients (numero_recu)");
        }
    } finally {
        if (shouldRelease) conn.release();
    }
}

async function resolveSousSocieteForReglement(connection, factureId, commandeId) {
    const fId = Number(factureId);
    if (Number.isFinite(fId) && fId > 0) {
        const [fRows] = await connection.query(
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
            if (Number.isFinite(ssId) && ssId > 0) return { id: ssId, nom: fRows[0].NOM_SOUS_SOCIETE || null };
        }
    }
    const cId = Number(commandeId);
    if (Number.isFinite(cId) && cId > 0) {
        const [cRows] = await connection.query(
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
            if (Number.isFinite(ssId) && ssId > 0) return { id: ssId, nom: cRows[0].NOM_SOUS_SOCIETE || null };
        }
    }
    return { id: null, nom: null };
}

async function ensureClientFromDocument({ client_id, facture_id, commande_id }) {
    if (client_id) return client_id;

    if (facture_id) {
        const [rows] = await db.execute(
            "SELECT client_id FROM factures WHERE id = ? LIMIT 1",
            [facture_id]
        );
        if (rows.length > 0) return rows[0].client_id;
    }

    if (commande_id) {
        const [rows] = await db.execute(
            "SELECT client_id FROM commandes WHERE id = ? LIMIT 1",
            [commande_id]
        );
        if (rows.length > 0) return rows[0].client_id;
    }

    throw new Error("Impossible de déterminer le client pour ce règlement");
}

async function computeFactureReglementTotals(factureId) {
    const [[facture]] = await db.execute(
        "SELECT id, montant_ttc, statut FROM factures WHERE id = ?",
        [factureId]
    );
    if (!facture) return null;

    const [[row]] = await db.execute(
        `
        SELECT COALESCE(SUM(montant), 0) AS total_regle
        FROM reglements_clients
        WHERE facture_id = ? AND statut = 'approuve'
        `,
        [factureId]
    );

    const montantTtc = Number(facture.montant_ttc || 0);
    const totalRegle = Number(row.total_regle || 0);
    const reste = Math.max(montantTtc - totalRegle, 0);

    return {
        facture_id: factureId,
        montant_ttc: montantTtc,
        total_regle: totalRegle,
        reste_a_payer: reste,
        statut_facture: facture.statut,
    };
}

async function updateFacturePaymentStatus(factureId) {
    const totals = await computeFactureReglementTotals(factureId);
    if (!totals) return;

    // La validation du document facture (Approvals) est indépendante du règlement :
    // tant que la facture est en_attente, on ne modifie pas son statut via les paiements.
    const docStatut = String(totals.statut_facture || "").trim();
    if (docStatut === "en_attente") {
        return;
    }

    const { montant_ttc, total_regle } = totals;
    let newStatus = "non_payee";

    if (total_regle >= montant_ttc && montant_ttc > 0) {
        newStatus = "payee";
    }

    await db.execute(
        "UPDATE factures SET statut = ? WHERE id = ?",
        [newStatus, factureId]
    );
}

/**
 * Propagation métier: quand un règlement est approuvé, on peut auto-valider
 * les documents liés encore en attente (devis -> commande -> facture).
 */
async function propagateApprovalFromReglement(connection, reglement, approverId = null) {
    const propagation = {
        devis_id: null,
        commande_id: null,
        facture_id: null,
        devis_updated: false,
        commande_updated: false,
        facture_updated: false,
        facture_new_status: null,
    };

    const regFactureId = reglement?.facture_id ? Number(reglement.facture_id) : null;
    const regCommandeId = reglement?.commande_id ? Number(reglement.commande_id) : null;

    let facture = null;
    let commande = null;

    if (regFactureId) {
        const [fRows] = await connection.execute(
            "SELECT id, commande_id, devis_id, statut FROM factures WHERE id = ? LIMIT 1",
            [regFactureId]
        );
        if (fRows.length > 0) facture = fRows[0];
    }

    if (regCommandeId) {
        const [cRows] = await connection.execute(
            "SELECT id, devis_id, statut FROM commandes WHERE id = ? LIMIT 1",
            [regCommandeId]
        );
        if (cRows.length > 0) commande = cRows[0];
    }

    // Vérification de cohérence si les deux ids sont fournis
    if (facture && commande && Number(facture.commande_id || 0) !== Number(commande.id)) {
        throw new Error("Relation incohérente: la facture liée ne correspond pas à la commande du règlement.");
    }

    if (!commande && facture?.commande_id) {
        const [cRows] = await connection.execute(
            "SELECT id, devis_id, statut FROM commandes WHERE id = ? LIMIT 1",
            [facture.commande_id]
        );
        if (cRows.length > 0) commande = cRows[0];
    }

    const devisIdFromCommande = commande?.devis_id ? Number(commande.devis_id) : null;
    const devisIdFromFacture = facture?.devis_id ? Number(facture.devis_id) : null;
    const devisId = devisIdFromCommande || devisIdFromFacture || null;

    propagation.facture_id = facture?.id ? Number(facture.id) : null;
    propagation.commande_id = commande?.id ? Number(commande.id) : null;
    propagation.devis_id = devisId;

    if (devisId) {
        const [result] = await connection.execute(
            "UPDATE devis SET statuts_devis = 'accepté' WHERE id = ? AND statuts_devis = 'en attente'",
            [devisId]
        );
        propagation.devis_updated = result.affectedRows > 0;
    }

    if (propagation.commande_id) {
        const [cmdRows] = await connection.execute(
            "SELECT id, numero_commande, statut FROM commandes WHERE id = ? LIMIT 1",
            [propagation.commande_id]
        );
        if (cmdRows.length > 0 && String(cmdRows[0].statut || "").trim() === "en_attente") {
            const commande = cmdRows[0];
            const [items] = await connection.execute(
                "SELECT produit_id, quantite FROM commande_items WHERE commande_id = ?",
                [propagation.commande_id]
            );

            for (const item of items) {
                if (!item.produit_id) continue;
                const [prodRows] = await connection.execute(
                    "SELECT stock, nom FROM products WHERE id = ?",
                    [item.produit_id]
                );
                if (!Array.isArray(prodRows) || prodRows.length === 0) continue;

                const currentStock = Number(prodRows[0].stock) || 0;
                const requestedQty = Number(item.quantite) || 0;
                if (requestedQty <= 0) continue;

                if (currentStock < requestedQty) {
                    throw new Error(`Stock insuffisant pour ${prodRows[0].nom}. Restant: ${currentStock}`);
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
                        description: "Sortie stock (validation commande via approbation règlement)",
                        userId: approverId,
                        referenceType: "commande",
                        referenceId: Number(commande.id),
                        referenceNumero: commande.numero_commande || null,
                    },
                    connection
                );
            }

            const [result] = await connection.execute(
                "UPDATE commandes SET statut = 'validee' WHERE id = ? AND statut = 'en_attente'",
                [propagation.commande_id]
            );
            propagation.commande_updated = result.affectedRows > 0;
        }
    }

    if (propagation.facture_id) {
        // Même logique que approveFacture: bascule vers payee/non_payee selon total réglé.
        const [rows] = await connection.execute(
            `SELECT f.id, f.montant_ttc, f.commande_id, c.statut AS commande_statut,
                (
                    COALESCE((
                        SELECT SUM(rc1.montant)
                        FROM reglements_clients rc1
                        WHERE rc1.facture_id = f.id AND rc1.statut = 'approuve'
                    ), 0)
                    +
                    COALESCE((
                        SELECT SUM(rc2.montant)
                        FROM reglements_clients rc2
                        WHERE f.commande_id IS NOT NULL
                          AND rc2.commande_id = f.commande_id
                          AND rc2.statut = 'approuve'
                    ), 0)
                ) AS total_regle
             FROM factures f
             LEFT JOIN commandes c ON c.id = f.commande_id
             WHERE f.id = ? AND f.statut = 'en_attente'`,
            [propagation.facture_id]
        );

        if (rows.length > 0) {
            const f = rows[0];
            const montantTtc = Number(f.montant_ttc) || 0;
            const totalRegle = Number(f.total_regle) || 0;
            const st = String(f.commande_statut || "").toLowerCase();
            const cmdRegleeParStatut = st === "paye" || st === "payee" || st === "reglee";
            const regleeParMontants = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
            const nextStatut = regleeParMontants || cmdRegleeParStatut ? "payee" : "non_payee";

            const [result] = await connection.execute(
                "UPDATE factures SET statut = ? WHERE id = ? AND statut = 'en_attente'",
                [nextStatut, propagation.facture_id]
            );
            propagation.facture_updated = result.affectedRows > 0;
            if (propagation.facture_updated) propagation.facture_new_status = nextStatut;
        }
    }

    return propagation;
}

exports.createReglementClient = async (req, res) => {
    const {
        client_id,
        facture_id,
        commande_id,
        date_reglement,
        montant,
        mode_paiement,
        banque_id,
        commentaire,
        lignes,
        statut, // Ignored: création toujours en attente
    } = req.body;

    const userId = req.user.id;

    if (!facture_id && !commande_id) {
        return res
            .status(400)
            .json({ message: "facture_id ou commande_id est requis" });
    }

    const lignesToInsert =
        Array.isArray(lignes) && lignes.length > 0
            ? lignes
            : [
                  {
                      date_reglement,
                      montant,
                      mode_paiement,
                      banque_id,
                      commentaire,
                  },
              ];

    try {
        const effectiveClientId = await ensureClientFromDocument({
            client_id,
            facture_id,
            commande_id,
        });

        // IMPORTANT: Un règlement créé via "Payer" ne doit JAMAIS être approuvé automatiquement.
        // Il doit rester en attente et suivre le workflow normal d'approbation.
        const final_statut = "en_attente";

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await ensureNumeroRecuColumn(connection);

            let pendingRows = [];
            if (facture_id) {
                const [rowsPending] = await connection.execute(
                    `
                    SELECT id
                    FROM reglements_clients
                    WHERE facture_id = ? AND statut = 'en_attente'
                    LIMIT 1
                    FOR UPDATE
                `,
                    [facture_id]
                );
                pendingRows = rowsPending;
            } else if (commande_id) {
                const [[linkedFacture]] = await connection.execute(
                    "SELECT id FROM factures WHERE commande_id = ? LIMIT 1",
                    [commande_id]
                );
                const linkedFactureId = linkedFacture?.id ?? null;

                if (linkedFactureId) {
                    const [rowsPending] = await connection.execute(
                        `
                        SELECT id
                        FROM reglements_clients
                        WHERE statut = 'en_attente'
                          AND (commande_id = ? OR facture_id = ?)
                        LIMIT 1
                        FOR UPDATE
                    `,
                        [commande_id, linkedFactureId]
                    );
                    pendingRows = rowsPending;
                } else {
                    const [rowsPending] = await connection.execute(
                        `
                        SELECT id
                        FROM reglements_clients
                        WHERE commande_id = ? AND statut = 'en_attente'
                        LIMIT 1
                        FOR UPDATE
                    `,
                        [commande_id]
                    );
                    pendingRows = rowsPending;
                }
            }

            if (pendingRows.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    message:
                        "Un règlement en attente existe déjà pour ce document. Veuillez l'approuver ou le traiter avant d'en saisir un nouveau.",
                });
            }

            const insertedIds = [];

            for (const ligne of lignesToInsert) {
                const {
                    date_reglement: lDate,
                    montant: lMontant,
                    mode_paiement: lMode,
                    banque_id: lBanqueId,
                    commentaire: lComment,
                } = ligne;

                if (!lMontant || !lMode) continue;

                const [result] = await connection.execute(
                    `
                    INSERT INTO reglements_clients
                    (client_id, facture_id, commande_id, date_reglement, montant, mode_paiement, banque_id, statut, commentaire, created_by, approved_by, approved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                    [
                        effectiveClientId,
                        facture_id || null,
                        commande_id || null,
                        lDate || getNow(),
                        lMontant,
                        lMode,
                        !lBanqueId || lBanqueId === "none" ? null : lBanqueId,
                        final_statut, // Use the determined final_statut
                        lComment || null,
                        userId,
                        null,
                        null,
                    ]
                );

                const sousSociete = await resolveSousSocieteForReglement(connection, facture_id, commande_id);
                const nextNumeroRecu = await getNextNumber("RC", result.insertId, connection, { sousSocieteId: sousSociete.id });
                await connection.execute(
                    "UPDATE reglements_clients SET numero_recu = ? WHERE id = ?",
                    [nextNumeroRecu, result.insertId]
                );

                insertedIds.push(result.insertId);
            }

            await connection.commit();

            res.status(201).json({
                message: "Règlement créé",
                ids: insertedIds,
                statut: final_statut,
            });
        } catch (err) {
            await connection.rollback();
            console.error("Error creating reglement client:", err);
            return res.status(500).json({
                message: "Erreur interne lors de la création du règlement",
                error: err.message,
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Error resolving client for reglement:", err);
        res.status(400).json({ message: err.message });
    }
};

exports.getAllReglementsClients = async (req, res) => {
    try {
        await ensureNumeroRecuColumn();
        let sql = `
            SELECT 
                r.*,
                c.nom_complet AS client_nom,
                f.numero_facture,
                f.montant_ttc AS facture_montant_ttc,
                cmd.numero_commande,
                cmd.montant_ttc AS commande_montant_ttc,
                COALESCE(
                    (
                        SELECT p.id_point_de_vente
                        FROM facture_items fi
                        INNER JOIN products p ON p.id = fi.produit_id
                        WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY fi.id
                        LIMIT 1
                    ),
                    (
                        SELECT p.id_point_de_vente
                        FROM commande_items ci
                        INNER JOIN products p ON p.id = ci.produit_id
                        WHERE ci.commande_id = COALESCE(cmd.id, cmdf.id) AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ci.id
                        LIMIT 1
                    ),
                    pdvc.id,
                    pdvfc.id,
                    pdvf.id
                ) AS point_de_vente_id,
                COALESCE(
                    (
                        SELECT pv.nom
                        FROM facture_items fi
                        INNER JOIN products p ON p.id = fi.produit_id
                        INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                        WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY fi.id
                        LIMIT 1
                    ),
                    (
                        SELECT pv.nom
                        FROM commande_items ci
                        INNER JOIN products p ON p.id = ci.produit_id
                        INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                        WHERE ci.commande_id = COALESCE(cmd.id, cmdf.id) AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ci.id
                        LIMIT 1
                    ),
                    pdvc.nom,
                    pdvfc.nom,
                    pdvf.nom
                ) AS point_de_vente_nom,
                COALESCE(
                    (
                        SELECT ss.NOM_SOUS_SOCIETE
                        FROM facture_items fi
                        INNER JOIN products p ON p.id = fi.produit_id
                        INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                        LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
                        WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY fi.id
                        LIMIT 1
                    ),
                    (
                        SELECT ss.NOM_SOUS_SOCIETE
                        FROM commande_items ci
                        INNER JOIN products p ON p.id = ci.produit_id
                        INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                        LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
                        WHERE ci.commande_id = COALESCE(cmd.id, cmdf.id) AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ci.id
                        LIMIT 1
                    ),
                    ssc.NOM_SOUS_SOCIETE,
                    ssfc.NOM_SOUS_SOCIETE,
                    ssf.NOM_SOUS_SOCIETE
                ) AS sous_societe_nom,
                b.nom_banque AS banque_nom,
                CONCAT(u.prenom, ' ', u.nom) AS created_by_nom,
                CONCAT(u2.prenom, ' ', u2.nom) AS approved_by_nom
            FROM reglements_clients r
            LEFT JOIN clients c ON r.client_id = c.id
            LEFT JOIN factures f ON r.facture_id = f.id
            LEFT JOIN commandes cmd ON r.commande_id = cmd.id
            LEFT JOIN commandes cmdf ON f.commande_id = cmdf.id
            LEFT JOIN point_de_vente pdvf ON pdvf.id = f.point_de_vente_id
            LEFT JOIN point_de_vente pdvc ON pdvc.id = cmd.point_de_vente_id
            LEFT JOIN point_de_vente pdvfc ON pdvfc.id = cmdf.point_de_vente_id
            LEFT JOIN sous_societe ssf ON ssf.ID = pdvf.id_sous_gestionnaire
            LEFT JOIN sous_societe ssc ON ssc.ID = pdvc.id_sous_gestionnaire
            LEFT JOIN sous_societe ssfc ON ssfc.ID = pdvfc.id_sous_gestionnaire
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
        if (req.query.factureId) {
            where.push("r.facture_id = ?");
            params.push(req.query.factureId);
        }
        if (req.query.commandeId) {
            where.push("(r.commande_id = ? OR r.facture_id IN (SELECT id FROM factures WHERE commande_id = ?))");
            params.push(req.query.commandeId, req.query.commandeId);
        }
        if (req.query.statut) {
            where.push("r.statut = ?");
            params.push(req.query.statut);
        }

        // Filter by user occupancy if not admin/responsable/directeur
        const role = (req.user.role || "").toLowerCase();
        if (role !== 'admin' && role !== 'responsable' && role !== 'directeur' && role !== 'superadmin') {
            where.push("r.created_by = ?");
            params.push(req.user.id);
        }

        if (where.length > 0) {
            sql += " WHERE " + where.join(" AND ");
        }

        sql += " ORDER BY r.created_at DESC";

        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching reglements clients:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getReglementClientById = async (req, res) => {
    const { id } = req.params;

    try {
        await ensureNumeroRecuColumn();
        const [rows] = await db.execute(
            `
            SELECT 
                r.*,
                c.nom_complet AS client_nom,
                f.numero_facture,
                f.montant_ttc AS facture_montant_ttc,
                cmd.numero_commande,
                cmd.montant_ttc AS commande_montant_ttc,
                COALESCE(
                    (
                        SELECT p.id_point_de_vente
                        FROM facture_items fi
                        INNER JOIN products p ON p.id = fi.produit_id
                        WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY fi.id
                        LIMIT 1
                    ),
                    (
                        SELECT p.id_point_de_vente
                        FROM commande_items ci
                        INNER JOIN products p ON p.id = ci.produit_id
                        WHERE ci.commande_id = COALESCE(cmd.id, cmdf.id) AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ci.id
                        LIMIT 1
                    ),
                    pdvc.id,
                    pdvfc.id,
                    pdvf.id
                ) AS point_de_vente_id,
                COALESCE(
                    (
                        SELECT pv.nom
                        FROM facture_items fi
                        INNER JOIN products p ON p.id = fi.produit_id
                        INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                        WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY fi.id
                        LIMIT 1
                    ),
                    (
                        SELECT pv.nom
                        FROM commande_items ci
                        INNER JOIN products p ON p.id = ci.produit_id
                        INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                        WHERE ci.commande_id = COALESCE(cmd.id, cmdf.id) AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ci.id
                        LIMIT 1
                    ),
                    pdvc.nom,
                    pdvfc.nom,
                    pdvf.nom
                ) AS point_de_vente_nom,
                COALESCE(
                    (
                        SELECT ss.NOM_SOUS_SOCIETE
                        FROM facture_items fi
                        INNER JOIN products p ON p.id = fi.produit_id
                        INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                        LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
                        WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY fi.id
                        LIMIT 1
                    ),
                    (
                        SELECT ss.NOM_SOUS_SOCIETE
                        FROM commande_items ci
                        INNER JOIN products p ON p.id = ci.produit_id
                        INNER JOIN point_de_vente pv ON pv.id = p.id_point_de_vente
                        LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
                        WHERE ci.commande_id = COALESCE(cmd.id, cmdf.id) AND p.id_point_de_vente IS NOT NULL
                        ORDER BY ci.id
                        LIMIT 1
                    ),
                    ssc.NOM_SOUS_SOCIETE,
                    ssfc.NOM_SOUS_SOCIETE,
                    ssf.NOM_SOUS_SOCIETE
                ) AS sous_societe_nom,
                b.nom_banque AS banque_nom,
                CONCAT(u.prenom, ' ', u.nom) AS created_by_nom,
                CONCAT(u2.prenom, ' ', u2.nom) AS approved_by_nom
            FROM reglements_clients r
            LEFT JOIN clients c ON r.client_id = c.id
            LEFT JOIN factures f ON r.facture_id = f.id
            LEFT JOIN commandes cmd ON r.commande_id = cmd.id
            LEFT JOIN commandes cmdf ON f.commande_id = cmdf.id
            LEFT JOIN point_de_vente pdvf ON pdvf.id = f.point_de_vente_id
            LEFT JOIN point_de_vente pdvc ON pdvc.id = cmd.point_de_vente_id
            LEFT JOIN point_de_vente pdvfc ON pdvfc.id = cmdf.point_de_vente_id
            LEFT JOIN sous_societe ssf ON ssf.ID = pdvf.id_sous_gestionnaire
            LEFT JOIN sous_societe ssc ON ssc.ID = pdvc.id_sous_gestionnaire
            LEFT JOIN sous_societe ssfc ON ssfc.ID = pdvfc.id_sous_gestionnaire
            LEFT JOIN banques b ON r.banque_id = b.id
            LEFT JOIN users u ON r.created_by = u.id
            LEFT JOIN users u2 ON r.approved_by = u2.id
            WHERE r.id = ?
        `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Règlement introuvable" });
        }

        res.status(200).json(rows[0]);
    } catch (err) {
        console.error("Error fetching reglement client by id:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.approveReglementClient = async (req, res) => {
    const { id } = req.params;
    const approverId = req.user.id;
    const { commentaire } = req.body || {};

    try {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                "SELECT * FROM reglements_clients WHERE id = ? FOR UPDATE",
                [id]
            );

            if (rows.length === 0) {
                await connection.rollback();
                return res
                    .status(404)
                    .json({ message: "Règlement introuvable" });
            }

            const reglement = rows[0];

            if (reglement.statut === "approuve") {
                await connection.rollback();
                return res
                    .status(400)
                    .json({ message: "Règlement déjà approuvé" });
            }

            const now = getNow();

            // Ajoute une trace dans le champ commentaire (symétrique du tag [IMPAYÉ]).
            // - commentaire vide => on ajoute quand même `[PAYÉ]` pour tracer l'action.
            // Format tag:
            // [PAYÉ] <motif> @ YYYY-MM-DD HH:mm:ss
            const newComment =
                (reglement.commentaire || "") +
                `\n[PAYÉ]${
                    commentaire ? ` ${String(commentaire).trim()}` : ""
                } @ ${now}`;

            await connection.execute(
                `
                UPDATE reglements_clients
                SET statut = 'approuve',
                    approved_by = ?,
                    approved_at = ?,
                    commentaire = ?
                WHERE id = ?
            `,
                [approverId, now, newComment.trim(), id]
            );

            const propagation = await propagateApprovalFromReglement(connection, reglement, approverId);

            await connection.commit();

            if (reglement.facture_id) {
                // Workflow indépendant :
                // tant que la facture est en_attente, on ne touche pas à son statut via le règlement.
                const [[factureRow]] = await connection.execute(
                    "SELECT statut FROM factures WHERE id = ? LIMIT 1",
                    [reglement.facture_id]
                );
                if (factureRow && String(factureRow.statut || "").trim() !== "en_attente") {
                    await updateFacturePaymentStatus(reglement.facture_id);
                }
            }

            res.status(200).json({
                message: "Règlement approuvé",
                propagation,
            });
        } catch (err) {
            await connection.rollback();
            console.error("Error approving reglement client:", err);
            res.status(500).json({
                message:
                    "Erreur interne lors de l'approbation du règlement",
                error: err.message,
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Error approving reglement client (conn):", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.rejectReglementClient = async (req, res) => {
    const { id } = req.params;
    const approverId = req.user.id;

    try {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                "SELECT * FROM reglements_clients WHERE id = ? FOR UPDATE",
                [id]
            );

            if (rows.length === 0) {
                await connection.rollback();
                return res
                    .status(404)
                    .json({ message: "Règlement introuvable" });
            }

            const reglement = rows[0];

            if (reglement.statut !== "en_attente") {
                await connection.rollback();
                return res.status(400).json({
                    message:
                        "Seul un règlement en attente peut être refusé",
                });
            }

            const rejectedComment =
                (reglement.commentaire || "") +
                `\n[REFUSÉ] Rejeté le ${getNow()} par utilisateur #${approverId}`;

            await connection.execute(
                `
                UPDATE reglements_clients
                SET statut = 'rejete',
                    commentaire = ?
                WHERE id = ?
            `,
                [rejectedComment.trim(), id]
            );

            await connection.commit();

            res.status(200).json({ message: "Règlement client refusé" });
        } catch (err) {
            await connection.rollback();
            console.error("Error rejecting reglement client:", err);
            res.status(500).json({
                message:
                    "Erreur interne lors du refus du règlement",
                error: err.message,
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Error rejecting reglement client (conn):", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.markReglementImpaye = async (req, res) => {
    const { id } = req.params;
    const { commentaire } = req.body || {};

    try {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
                const now = getNow();

            const [rows] = await connection.execute(
                "SELECT * FROM reglements_clients WHERE id = ? FOR UPDATE",
                [id]
            );

            if (rows.length === 0) {
                await connection.rollback();
                return res
                    .status(404)
                    .json({ message: "Règlement introuvable" });
            }

            const reglement = rows[0];

            // Mettre le statut à "impaye" et ajouter une note
            const newComment =
                (reglement.commentaire || "") +
                (commentaire
                    ? `\n[IMPAYÉ] ${String(commentaire).trim()} @ ${now}`
                    : `\n[IMPAYÉ] @ ${now}`);

            await connection.execute(
                `
                UPDATE reglements_clients
                SET statut = 'impaye',
                    commentaire = ?
                WHERE id = ?
            `,
                [newComment.trim(), id]
            );

            await connection.commit();

            // Recalculer le statut de la facture liée (si présent)
            if (reglement.facture_id) {
                const [[factureRow]] = await connection.execute(
                    "SELECT statut FROM factures WHERE id = ? LIMIT 1",
                    [reglement.facture_id]
                );
                if (factureRow && String(factureRow.statut || "").trim() !== "en_attente") {
                    await updateFacturePaymentStatus(reglement.facture_id);
                }
            }

            res.status(200).json({ message: "Règlement marqué comme impayé" });
        } catch (err) {
            await connection.rollback();
            console.error("Error marking reglement client as impaye:", err);
            res.status(500).json({
                message:
                    "Erreur interne lors du marquage du règlement en impayé",
                error: err.message,
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Error marking reglement client as impaye (conn):", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getSituationReglement = async (req, res) => {
    const { factureId, commandeId } = req.query;

    if (!factureId && !commandeId) {
        return res.status(400).json({
            message: "factureId ou commandeId est requis pour la situation",
        });
    }

    try {
        // 1) Situation directement sur une facture
        if (factureId) {
            const totals = await computeFactureReglementTotals(factureId);
            if (!totals) {
                return res
                    .status(404)
                    .json({ message: "Facture introuvable" });
            }
            return res.status(200).json({
                type: "facture",
                ...totals,
            });
        }

        // Situation pour commande : si la commande a une facture liée, on utilise la situation facture (règlements sur la facture)
        const [[commande]] = await db.execute(
            "SELECT id, montant_ttc, (SELECT id FROM factures WHERE commande_id = c.id LIMIT 1) AS facture_id FROM commandes c WHERE c.id = ?",
            [commandeId]
        );
        if (!commande) {
            return res
                .status(404)
                .json({ message: "Commande introuvable" });
        }

        const linkedFactureId = commande.facture_id != null ? commande.facture_id : null;
        let montantTtc = Number(commande.montant_ttc || 0);
        let totalRegle = 0;

        if (linkedFactureId) {
            const totals = await computeFactureReglementTotals(linkedFactureId);
            if (totals) {
                montantTtc = Number(totals.montant_ttc) || montantTtc;
                totalRegle = Number(totals.total_regle) || 0;
            }
        } else {
            const [[row]] = await db.execute(
                `
                SELECT COALESCE(SUM(montant), 0) AS total_regle
                FROM reglements_clients
                WHERE commande_id = ? AND statut = 'approuve'
            `,
                [commandeId]
            );
            totalRegle = Number(row.total_regle || 0);
        }

        const reste = Math.max(montantTtc - totalRegle, 0);

        return res.status(200).json({
            type: "commande",
            commande_id: commandeId,
            montant_ttc: montantTtc,
            total_regle: totalRegle,
            reste_a_payer: reste,
        });
    } catch (err) {
        console.error("Error computing situation reglement:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/* ===============================
   SEND PAYMENT RECEIPT BY EMAIL
   (email simple, sans pièce jointe PDF côté serveur)
================================= */
exports.sendReglementEmail = async (req, res) => {
    const { id } = req.params;
    const { to, subject, message, pdfBase64, filename } = req.body;

    if (!to) {
        return res.status(400).json({ message: "Le destinataire est requis" });
    }

    try {
        // Charger le règlement avec infos client et document lié
        const [rows] = await db.execute(
            `
            SELECT r.*,
                   c.nom_complet AS client_nom,
                   c.email AS client_email,
                   c.telephone AS client_telephone,
                   c.ice AS client_ice,
                   c.adresse AS client_adresse,
                   f.numero_facture,
                   f.montant_ttc AS facture_montant_ttc,
                   f.point_de_vente_id AS f_pdv_id,
                   cmd.numero_commande,
                   cmd.montant_ttc AS commande_montant_ttc,
                   cmd.point_de_vente_id AS cmd_pdv_id,
                   b.nom_banque AS banque_nom
            FROM reglements_clients r
            LEFT JOIN clients c ON r.client_id = c.id
            LEFT JOIN factures f ON r.facture_id = f.id
            LEFT JOIN commandes cmd ON r.commande_id = cmd.id
            LEFT JOIN banques b ON r.banque_id = b.id
            WHERE r.id = ?
        `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Règlement introuvable" });
        }

        const reg = rows[0];
        reg.document_numero = reg.numero_facture || reg.numero_commande;
        reg.document_type = reg.numero_facture ? 'facture' : (reg.numero_commande ? 'commande' : null);
        reg.point_de_vente_id = reg.f_pdv_id || reg.cmd_pdv_id;

        const emailSubject =
            subject ||
            `[Reçu de paiement] ${reg.document_numero || "#" + reg.id}`;
        
        const emailText =
            message ||
            `Bonjour ${reg.client_nom || ""},\n\nNous vous confirmons la réception de votre paiement de ${(Number(
                reg.montant
            ) || 0).toFixed(2)} MAD le ${new Date(reg.date_reglement).toLocaleDateString(
                "fr-FR"
            )} pour ${
                reg.numero_facture ? `la facture ${reg.numero_facture}` : `la commande ${reg.numero_commande}`
            }.\n\nVous trouverez votre reçu de paiement en pièce jointe.\n\nMerci pour votre confiance.\n`;

        // Générer le PDF (ou utiliser un PDF fourni côté client)
        let pdfBuffer;
        if (pdfBase64) {
            // Accept both raw base64 and data URL format.
            const cleaned = String(pdfBase64).includes(",") ? String(pdfBase64).split(",")[1] : String(pdfBase64);
            pdfBuffer = Buffer.from(cleaned, "base64");
        } else {
            const { buildReglementPdf } = require("../services/pdfGeneratorService");
            pdfBuffer = await buildReglementPdf(reg);
        }

        const { sendMail } = require("../services/emailService");
        await sendMail(to, emailSubject, emailText, [
            {
                filename: filename || `Recu_Paiement_${reg.document_numero || reg.id}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf"
            }
        ]);

        res.status(200).json({ message: "Email envoyé avec succès" });
    } catch (error) {
        console.error("Error sending reglement email:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
    }
};

/* ===============================
   DOWNLOAD PAYMENT RECEIPT (PDF)
================================= */
exports.downloadReglementClientPdf = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.execute(
            `
            SELECT r.*,
                   c.nom_complet AS client_nom,
                   c.email AS client_email,
                   c.telephone AS client_telephone,
                   c.ice AS client_ice,
                   c.adresse AS client_adresse,
                   f.numero_facture,
                   f.montant_ttc AS facture_montant_ttc,
                   f.point_de_vente_id AS f_pdv_id,
                   cmd.numero_commande,
                   cmd.montant_ttc AS commande_montant_ttc,
                   cmd.point_de_vente_id AS cmd_pdv_id,
                   b.nom_banque AS banque_nom
            FROM reglements_clients r
            LEFT JOIN clients c ON r.client_id = c.id
            LEFT JOIN factures f ON r.facture_id = f.id
            LEFT JOIN commandes cmd ON r.commande_id = cmd.id
            LEFT JOIN banques b ON r.banque_id = b.id
            WHERE r.id = ?
        `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Règlement introuvable" });
        }

        const reg = rows[0];

        reg.document_numero = reg.numero_facture || reg.numero_commande;
        reg.document_type = reg.numero_facture ? "facture" : reg.numero_commande ? "commande" : null;
        reg.point_de_vente_id = reg.f_pdv_id || reg.cmd_pdv_id;

        const { buildReglementPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildReglementPdf(reg);

        const filename = `Recu_Paiement_${reg.document_numero || reg.id}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating reglement PDF download:", error);
        res.status(500).json({ message: "Erreur serveur lors de la génération du PDF" });
    }
};

