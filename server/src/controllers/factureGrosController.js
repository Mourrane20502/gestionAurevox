const db = require("../config/db").promise();
const { formatDocumentNumber } = require("../utils/documentFormatter");
const { getNextNumber } = require("../utils/numberingSettings");
const { canApprove } = require("../utils/approvalSettings");
const { logProductMovement } = require("../utils/productMovementLogger");
const { isGrosProductRow } = require("../utils/grosProduct");

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

async function resolvePointDeVenteFromItems(connection, items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const productIds = Array.from(
        new Set(
            items
                .map((it) => Number(it?.produit_id))
                .filter((id) => Number.isFinite(id) && id > 0)
        )
    );
    if (!productIds.length) return null;
    const placeholders = productIds.map(() => "?").join(",");
    const [rows] = await connection.query(
        `
        SELECT DISTINCT p.id_point_de_vente AS pdv_id
        FROM products p
        WHERE p.id IN (${placeholders})
          AND p.id_point_de_vente IS NOT NULL
        `,
        productIds
    );
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const pdvId = Number(rows[0].pdv_id);
    return Number.isFinite(pdvId) && pdvId > 0 ? pdvId : null;
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

/** Somme les grammages vendus par produit (lignes avec produit_id uniquement). */
function aggregateGrosGrammageByProductId(items) {
    const map = new Map();
    if (!Array.isArray(items)) return map;
    for (const it of items) {
        const pid = Number(it.produit_id);
        const g = Number(it.grammage);
        if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(g) || g <= 0) continue;
        map.set(pid, (map.get(pid) || 0) + g);
    }
    return map;
}

/**
 * Agrège le grammage par produit en résolvant aussi les lignes sans produit_id
 * via une correspondance stricte sur la désignation (type produit « gros »).
 * La résolution n'est appliquée que si une seule correspondance est trouvée.
 */
async function aggregateGrosGrammageResolvedByProduct(connection, items) {
    const map = new Map();
    if (!Array.isArray(items)) return map;

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
             WHERE pricing_metal IN ('or','silver')
               AND LOWER(TRIM(nom)) = LOWER(TRIM(?))
             LIMIT 2`,
            [designation]
        );

        if (Array.isArray(rows) && rows.length === 1) {
            const resolvedPid = Number(rows[0].id);
            if (Number.isFinite(resolvedPid) && resolvedPid > 0) {
                map.set(resolvedPid, (map.get(resolvedPid) || 0) + Number(grammage || 0));
            }
        } else {
            console.log("[factureGros][aggregateResolved] designation non resolue ou ambigue", {
                designation,
                grammage,
                matches: Array.isArray(rows) ? rows.length : 0,
            });
        }
    }

    console.log("[factureGros][aggregateResolved] map finale", Array.from(map.entries()));
    return map;
}

function isFactureGrosStockDeductedStatus(status) {
    const s = String(status || "")
        .trim()
        .toLowerCase();
    return s === "non_payee" || s === "payee";
}

/** Réintègre le grammage sur les produits Gros (suppression facture ou avant remplacement des lignes). */
async function addGrammageToGrosProducts(connection, itemsByProductMap, movementMeta = {}) {
    for (const [pid, totalG] of itemsByProductMap) {
        const [rows] = await connection.execute(
            `SELECT grammage, pricing_metal FROM products WHERE id = ? FOR UPDATE`,
            [pid]
        );
        if (rows.length === 0 || !isGrosProductRow(rows[0])) continue;
        const current = Number(rows[0].grammage) || 0;
        const after = current + Number(totalG || 0);
        await connection.execute(
            `UPDATE products SET grammage = grammage + ? WHERE id = ?`,
            [Number(totalG || 0), pid]
        );
        await logProductMovement(
            {
                productId: pid,
                type: "facture_gros_retour",
                quantityBefore: current,
                quantityAfter: after,
                description: movementMeta.description || "Réintégration grammage (facture gros)",
                userId: movementMeta.userId ?? null,
                referenceType: movementMeta.referenceType || "facture_gros",
                referenceId: movementMeta.referenceId ?? null,
                referenceNumero: movementMeta.referenceNumero || null,
            },
            connection
        );
    }
}

/** Retire le grammage vendu des produits Gros (création / mise à jour facture). */
async function subtractGrammageFromGrosProducts(connection, itemsByProductMap, movementMeta = {}) {
    if (!itemsByProductMap || itemsByProductMap.size === 0) {
        console.log("[factureGros][subtract] map vide: aucune ligne resolue pour decrement", {
            ref: movementMeta.referenceNumero || movementMeta.referenceId || null,
        });
        return;
    }
    for (const [pid, totalG] of itemsByProductMap) {
        const [rows] = await connection.execute(
            `SELECT grammage, pricing_metal FROM products WHERE id = ? FOR UPDATE`,
            [pid]
        );
        if (rows.length === 0) {
            const err = new Error(`Produit #${pid} introuvable`);
            err.statusCode = 400;
            throw err;
        }
        if (!isGrosProductRow(rows[0])) {
            console.log("[factureGros][subtract] skip: produit non gros (type)", {
                pid,
                pricing_metal: rows[0].pricing_metal,
                ref: movementMeta.referenceNumero || movementMeta.referenceId || null,
            });
            continue;
        }
        const current = Number(rows[0].grammage) || 0;
        console.log("[factureGros][subtract] before", {
            pid,
            product_type_name: rows[0].product_type_name,
            current,
            toSubtract: Number(totalG || 0),
            ref: movementMeta.referenceNumero || movementMeta.referenceId || null,
        });
        if (current + 1e-8 < totalG) {
            const err = new Error(
                `Grammage insuffisant pour le produit (id ${pid}) : disponible ${current} g, demandé ${totalG} g`
            );
            err.statusCode = 400;
            throw err;
        }
        const [updateRes] = await connection.execute(
            `UPDATE products SET grammage = grammage - ? WHERE id = ?`,
            [Number(totalG || 0), pid]
        );
        const [afterRows] = await connection.execute(
            `SELECT grammage FROM products WHERE id = ?`,
            [pid]
        );
        console.log("[factureGros][subtract] after", {
            pid,
            affectedRows: updateRes?.affectedRows ?? 0,
            expectedAfter: current - Number(totalG || 0),
            dbAfter: Number(afterRows?.[0]?.grammage ?? 0),
        });
        await logProductMovement(
            {
                productId: pid,
                type: "facture_gros_sortie",
                quantityBefore: current,
                quantityAfter: current - totalG,
                description: movementMeta.description || "Sortie grammage (facture gros)",
                userId: movementMeta.userId ?? null,
                referenceType: movementMeta.referenceType || "facture_gros",
                referenceId: movementMeta.referenceId ?? null,
                referenceNumero: movementMeta.referenceNumero || null,
            },
            connection
        );
    }
}

exports.createFactureGros = async (req, res) => {
    const {
        date_facture,
        date_echeance,
        client_id,
        point_de_vente_id,
        items,
        commande_gros_id,
        devis_gros_id,
        mode_paiement,
        banque_id,
        statut,
    } = req.body;
    const finalModePaiement = mode_paiement || "virement";
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        let finalCommandeGrosId =
            commande_gros_id && commande_gros_id !== "" && commande_gros_id !== "none"
                ? Number(commande_gros_id)
                : null;

        let finalDevisGrosId =
            devis_gros_id && devis_gros_id !== "" && devis_gros_id !== "none"
                ? Number(devis_gros_id)
                : null;

        let effectiveClientId = client_id;
        let pdv_id = point_de_vente_id;

        let finalBanqueId =
            banque_id === "" || banque_id === "none" || !banque_id ? null : Number(banque_id);

        if (finalCommandeGrosId) {
            const [cmd] = await connection.execute(
                "SELECT client_id, point_de_vente_id FROM commandes_gros WHERE id = ?",
                [finalCommandeGrosId]
            );
            if (cmd.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Commande gros introuvable" });
            }
            effectiveClientId = cmd[0].client_id;
            pdv_id = cmd[0].point_de_vente_id;
            if (!effectiveClientId) {
                await connection.rollback();
                return res.status(400).json({ message: "La commande gros n'a pas de client associé" });
            }
        } else {
            if (req.user.role !== "admin" && !effectiveClientId) {
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

        }

        const [clientRow] = await connection.execute("SELECT id FROM clients WHERE id = ?", [effectiveClientId]);
        if (clientRow.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Client not found" });
        }

        if (finalDevisGrosId) {
            const [dg] = await connection.execute("SELECT client_id FROM devis_gros WHERE id = ?", [
                finalDevisGrosId,
            ]);
            if (dg.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Devis gros introuvable" });
            }
            if (Number(dg[0].client_id) !== Number(effectiveClientId)) {
                await connection.rollback();
                return res.status(400).json({ message: "Le devis gros doit être pour le même client" });
            }
        }

        finalBanqueId =
            banque_id === "" || banque_id === "none" || !banque_id ? null : Number(banque_id);

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
        const bodyPdvId = Number(point_de_vente_id);
        const pdvFromItems = await resolvePointDeVenteFromItems(connection, items);
        if (pdvFromItems) {
            pdv_id = pdvFromItems;
        } else if (Number.isFinite(bodyPdvId) && bodyPdvId > 0 && !finalCommandeGrosId) {
            pdv_id = bodyPdvId;
        }
        if (!pdv_id || pdv_id === "" || pdv_id === "none") {
            const [pdvs] = await connection.query("SELECT id FROM point_de_vente LIMIT 1");
            if (pdvs.length > 0) pdv_id = pdvs[0].id;
            else pdv_id = 1;
        }

        const totalGrammage = sumGrammage(items);
        const { normalizedItems, totals } = computeFinance(items);

        const finalStatut = "en_attente";

        // Si commande fournie mais pas devis : reprendre le devis lié à la commande (comme factures classiques)
        if (finalCommandeGrosId && !finalDevisGrosId) {
            const [cmdDevisRows] = await connection.execute(
                "SELECT devis_gros_id FROM commandes_gros WHERE id = ?",
                [finalCommandeGrosId]
            );
            if (cmdDevisRows.length > 0 && cmdDevisRows[0].devis_gros_id) {
                finalDevisGrosId = Number(cmdDevisRows[0].devis_gros_id);
            }
        }

        const [result] = await connection.execute(
            `
            INSERT INTO factures_gros
            (numero_facture, date_facture, date_echeance, grammage, prix_total, reduction, montant_ht, taux_tva, montant_tva, montant_ttc, client_id, user_id, point_de_vente_id,
             commande_gros_id, devis_gros_id, mode_paiement, banque_id, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                `TEMP-${Date.now()}`,
                date_facture || new Date().toISOString().split("T")[0],
                date_echeance || null,
                totalGrammage,
                totals.prix_total,
                totals.reduction,
                totals.montant_ht,
                totals.taux_tva,
                totals.montant_tva,
                totals.montant_ttc,
                effectiveClientId,
                req.user.id,
                pdv_id,
                null,
                null,
                finalModePaiement,
                finalBanqueId,
                finalStatut,
            ]
        );

        const factureGrosId = result.insertId;

        const fromItems = await resolveSousSocieteFromItems(connection, items);
        const fromPdv = await resolveSousSocieteFromPdv(connection, pdv_id);
        const sousSociete = fromItems.id ? fromItems : fromPdv;
        // FG partage la même séquence que FA (paramètres Settings)
        const fgNumber = await getNextNumber("FA", factureGrosId, connection, {
            sousSocieteId: sousSociete.id,
        });
        const final_numero = formatDocumentNumber("FG", fgNumber, new Date(), { sousSocieteNom: sousSociete.nom });

        let traceDevisGrosId = finalDevisGrosId;
        let traceCommandeGrosId = finalCommandeGrosId;

        // Traçabilité (comme factures classiques) : créer devis gros et/ou commande gros en arrière-plan si manquants
        if (!traceDevisGrosId || !traceCommandeGrosId) {
            try {
                const dateDoc = date_facture || new Date().toISOString().split("T")[0];

                if (!traceDevisGrosId) {
                    const [devisIns] = await connection.execute(
                        `
                        INSERT INTO devis_gros
                        (numero_devis, date_devis, grammage, prix_total, reduction, montant_ht, taux_tva, montant_tva, montant_ttc, user_id, client_id, statuts_devis)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `,
                        [
                            `TEMP-${Date.now()}`,
                            dateDoc,
                            totalGrammage,
                            totals.prix_total,
                            totals.reduction,
                            totals.montant_ht,
                            totals.taux_tva,
                            totals.montant_tva,
                            totals.montant_ttc,
                            req.user.id,
                            effectiveClientId,
                            "en attente",
                        ]
                    );
                    traceDevisGrosId = devisIns.insertId;
                    const sousSocieteDevis = await resolveSousSocieteFromItems(connection, items);
                    // DG partage la même séquence que DE (paramètres Settings)
                    const dgNumber = await getNextNumber("DE", traceDevisGrosId, connection, {
                        sousSocieteId: sousSociete.id,
                    });
                    const numDg = formatDocumentNumber("DG", dgNumber, new Date(), {
                        sousSocieteNom: sousSocieteDevis.nom,
                    });
                    await connection.execute("UPDATE devis_gros SET numero_devis = ? WHERE id = ?", [
                        numDg,
                        traceDevisGrosId,
                    ]);
                    const rowsDevisItems = normalizedItems.map((item) => [
                        traceDevisGrosId,
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
                        [rowsDevisItems]
                    );
                }

                if (!traceCommandeGrosId) {
                    const [cmdIns] = await connection.execute(
                        `
                        INSERT INTO commandes_gros
                        (numero_commande, date_commande, grammage, prix_total, reduction, montant_ht, taux_tva, montant_tva, montant_ttc, client_id, user_id, point_de_vente_id, devis_gros_id, banque_id, mode_paiement, statut)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `,
                        [
                            `TEMP-${Date.now()}`,
                            dateDoc,
                            totalGrammage,
                            totals.prix_total,
                            totals.reduction,
                            totals.montant_ht,
                            totals.taux_tva,
                            totals.montant_tva,
                            totals.montant_ttc,
                            effectiveClientId,
                            req.user.id,
                            pdv_id,
                            traceDevisGrosId,
                            finalBanqueId,
                            finalModePaiement,
                            "en_attente",
                        ]
                    );
                    traceCommandeGrosId = cmdIns.insertId;
                    const sousSocieteCmd = fromItems.id ? fromItems : fromPdv;
                    // CG partage la même séquence que CO (paramètres Settings)
                    const cgNumber = await getNextNumber("CO", traceCommandeGrosId, connection, {
                        sousSocieteId: sousSociete.id,
                    });
                    const numCg = formatDocumentNumber("CG", cgNumber, new Date(), {
                        sousSocieteNom: sousSocieteCmd.nom,
                    });
                    await connection.execute("UPDATE commandes_gros SET numero_commande = ? WHERE id = ?", [
                        numCg,
                        traceCommandeGrosId,
                    ]);
                    const rowsCmdItems = normalizedItems.map((item) => [
                        traceCommandeGrosId,
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
                        "INSERT INTO commandes_gros_items (commande_gros_id, produit_id, designation, grammage, prix_unitaire, reduction, montant_ht, taux_tva, montant_tva, montant_ttc) VALUES ?",
                        [rowsCmdItems]
                    );
                }

                finalDevisGrosId = traceDevisGrosId;
                finalCommandeGrosId = traceCommandeGrosId;
            } catch (traceErr) {
                console.error("[factureGros][traceability]", traceErr.message);
            }
        }

        await connection.execute(
            `UPDATE factures_gros SET numero_facture = ?, commande_gros_id = ?, devis_gros_id = ? WHERE id = ?`,
            [final_numero, finalCommandeGrosId, finalDevisGrosId, factureGrosId]
        );

        const rowsItems = normalizedItems.map((item) => [
            factureGrosId,
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
            "INSERT INTO factures_gros_items (facture_gros_id, produit_id, designation, grammage, prix_unitaire, reduction, montant_ht, taux_tva, montant_tva, montant_ttc) VALUES ?",
            [rowsItems]
        );

        // Si des règlements ont été saisis au niveau commande gros avant la création de la facture,
        // on les rattache à cette facture pour garder une traçabilité cohérente.
        if (finalCommandeGrosId) {
            await connection.execute(
                `UPDATE reglements_clients_gros
                 SET facture_gros_id = ?
                 WHERE commande_gros_id = ?
                   AND (facture_gros_id IS NULL OR facture_gros_id = 0)`,
                [factureGrosId, finalCommandeGrosId]
            );
        }

        await connection.commit();
        res.status(201).json({
            message: "Facture gros créée",
            id: factureGrosId,
            numero_facture: final_numero,
        });
    } catch (error) {
        await connection.rollback();
        console.error("[factureGros][create]", error);
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.getAllFactureGros = async (req, res) => {
    try {
        let sql = `
            SELECT
                fg.*,
                c.nom_complet AS client_nom,
                CONCAT(u.prenom, ' ', u.nom) AS user_nom,
                pv.nom AS point_de_vente_nom,
                ss.NOM_SOUS_SOCIETE AS sous_societe_nom,
                cg.numero_commande AS commande_gros_numero,
                dg.numero_devis AS devis_gros_numero,
                (
                    SELECT COALESCE(SUM(rc.montant), 0)
                    FROM reglements_clients_gros rc
                    WHERE rc.statut = 'approuve'
                      AND (
                        rc.facture_gros_id = fg.id
                        OR (
                            fg.commande_gros_id IS NOT NULL
                            AND rc.commande_gros_id = fg.commande_gros_id
                        )
                      )
                ) AS total_regle,
                GREATEST(
                    COALESCE(fg.montant_ttc, 0) - (
                        SELECT COALESCE(SUM(rc.montant), 0)
                        FROM reglements_clients_gros rc
                        WHERE rc.statut = 'approuve'
                          AND (
                            rc.facture_gros_id = fg.id
                            OR (
                                fg.commande_gros_id IS NOT NULL
                                AND rc.commande_gros_id = fg.commande_gros_id
                            )
                          )
                    ),
                    0
                ) AS reste_a_payer
            FROM factures_gros fg
            LEFT JOIN clients c ON fg.client_id = c.id
            LEFT JOIN users u ON fg.user_id = u.id
            LEFT JOIN point_de_vente pv ON fg.point_de_vente_id = pv.id
            LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
            LEFT JOIN commandes_gros cg ON fg.commande_gros_id = cg.id
            LEFT JOIN devis_gros dg ON fg.devis_gros_id = dg.id
        `;
        const params = [];
        const allowedToApprove = await canApprove(req.user.role, "facture");
        if (req.user.role !== "admin" && req.user.role !== "directeur" && req.user.role !== "responsable") {
            if (allowedToApprove) {
                sql += " WHERE (fg.user_id = ? OR fg.statut = 'en_attente')";
                params.push(req.user.id);
            } else {
                sql += " WHERE fg.user_id = ?";
                params.push(req.user.id);
            }
        }
        sql += " ORDER BY fg.id DESC";
        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getFactureGrosById = async (req, res) => {
    const { id } = req.params;
    try {
        const [facRows] = await db.execute(
            `
            SELECT fg.*, c.nom_complet AS client_nom, pv.nom AS point_de_vente_nom,
                   cg.numero_commande AS commande_gros_numero, dg.numero_devis AS devis_gros_numero,
                   b.nom_banque AS banque_nom,
                   CONCAT(u.prenom, ' ', u.nom) AS user_nom
            FROM factures_gros fg
            LEFT JOIN clients c ON fg.client_id = c.id
            LEFT JOIN point_de_vente pv ON fg.point_de_vente_id = pv.id
            LEFT JOIN commandes_gros cg ON fg.commande_gros_id = cg.id
            LEFT JOIN devis_gros dg ON fg.devis_gros_id = dg.id
            LEFT JOIN banques b ON fg.banque_id = b.id
            LEFT JOIN users u ON fg.user_id = u.id
            WHERE fg.id = ?
            `,
            [id]
        );
        if (facRows.length === 0) {
            return res.status(404).json({ message: "Facture gros introuvable" });
        }
        const [itemRows] = await db.execute(
            `
            SELECT fi.*, p.nom AS produit_nom, p.reference
            FROM factures_gros_items fi
            LEFT JOIN products p ON fi.produit_id = p.id
            WHERE fi.facture_gros_id = ?
            ORDER BY fi.id
            `,
            [id]
        );
        res.status(200).json({ ...facRows[0], items: itemRows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateFactureGros = async (req, res) => {
    const { id } = req.params;
    const {
        date_facture,
        date_echeance,
        client_id,
        point_de_vente_id,
        items,
        commande_gros_id,
        devis_gros_id,
        mode_paiement,
        banque_id,
        statut,
    } = req.body;
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [existing] = await connection.execute(
            "SELECT id, user_id, numero_facture, statut FROM factures_gros WHERE id = ?",
            [id]
        );
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Facture gros introuvable" });
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

        let pdv_id = point_de_vente_id;

        let finalCommandeGrosId =
            commande_gros_id && commande_gros_id !== "" && commande_gros_id !== "none"
                ? Number(commande_gros_id)
                : null;

        let finalDevisGrosId =
            devis_gros_id && devis_gros_id !== "" && devis_gros_id !== "none"
                ? Number(devis_gros_id)
                : null;

        let effectiveClientId = client_id;

        if (finalCommandeGrosId) {
            const [cmd] = await connection.execute(
                "SELECT client_id, point_de_vente_id FROM commandes_gros WHERE id = ?",
                [finalCommandeGrosId]
            );
            if (cmd.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Commande gros introuvable" });
            }
            effectiveClientId = cmd[0].client_id;
            pdv_id = cmd[0].point_de_vente_id;
        }
        const bodyPdvId = Number(point_de_vente_id);
        const pdvFromItems = await resolvePointDeVenteFromItems(connection, items);
        if (pdvFromItems) {
            pdv_id = pdvFromItems;
        } else if (Number.isFinite(bodyPdvId) && bodyPdvId > 0 && !finalCommandeGrosId) {
            pdv_id = bodyPdvId;
        }
        if (!pdv_id || pdv_id === "" || pdv_id === "none") {
            const [pdvs] = await connection.query("SELECT id FROM point_de_vente LIMIT 1");
            pdv_id = pdvs.length > 0 ? pdvs[0].id : 1;
        }

        if (finalDevisGrosId) {
            const [dg] = await connection.execute("SELECT client_id FROM devis_gros WHERE id = ?", [
                finalDevisGrosId,
            ]);
            if (dg.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Devis gros introuvable" });
            }
            if (Number(dg[0].client_id) !== Number(effectiveClientId)) {
                await connection.rollback();
                return res.status(400).json({ message: "Le devis gros doit être pour le même client" });
            }
        }

        const finalBanqueId =
            banque_id === "" || banque_id === "none" || !banque_id ? null : Number(banque_id);

        const totalGrammage = sumGrammage(items);
        const { normalizedItems, totals } = computeFinance(items);

        const allowedToApprove = await canApprove(req.user.role, "facture");
        let statutParam = null;
        if (req.user.role === "admin" || allowedToApprove) {
            if (statut != null && statut !== "") statutParam = statut;
        }

        const [previousItems] = await connection.execute(
            "SELECT produit_id, designation, grammage FROM factures_gros_items WHERE facture_gros_id = ?",
            [id]
        );
        const currentStatut = String(existing[0].statut || "").trim();
        const effectiveNextStatut = statutParam || currentStatut;
        if (isFactureGrosStockDeductedStatus(currentStatut)) {
            const restoredByProduct = await aggregateGrosGrammageResolvedByProduct(connection, previousItems);
            await addGrammageToGrosProducts(connection, restoredByProduct, {
                userId: req.user?.id || null,
                referenceType: "facture_gros",
                referenceId: Number(id),
                referenceNumero: existing[0].numero_facture || null,
                description: "Réintégration grammage (pré-mise à jour facture gros)",
            });
        }

        await connection.execute(
            `
            UPDATE factures_gros
            SET date_facture = ?, date_echeance = ?, grammage = ?, prix_total = ?, reduction = ?, montant_ht = ?, taux_tva = ?, montant_tva = ?, montant_ttc = ?, client_id = ?, point_de_vente_id = ?,
                commande_gros_id = ?, devis_gros_id = ?, mode_paiement = ?, banque_id = ?,
                statut = COALESCE(?, statut)
            WHERE id = ?
            `,
            [
                date_facture || new Date().toISOString().split("T")[0],
                date_echeance || null,
                totalGrammage,
                totals.prix_total,
                totals.reduction,
                totals.montant_ht,
                totals.taux_tva,
                totals.montant_tva,
                totals.montant_ttc,
                effectiveClientId,
                pdv_id,
                finalCommandeGrosId,
                finalDevisGrosId,
                mode_paiement || null,
                finalBanqueId,
                statutParam,
                id,
            ]
        );

        await connection.execute("DELETE FROM factures_gros_items WHERE facture_gros_id = ?", [id]);
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
            "INSERT INTO factures_gros_items (facture_gros_id, produit_id, designation, grammage, prix_unitaire, reduction, montant_ht, taux_tva, montant_tva, montant_ttc) VALUES ?",
            [rowsItems]
        );

        if (isFactureGrosStockDeductedStatus(effectiveNextStatut)) {
            const newSoldByProduct = await aggregateGrosGrammageResolvedByProduct(connection, items);
            await subtractGrammageFromGrosProducts(connection, newSoldByProduct, {
                userId: req.user?.id || null,
                referenceType: "facture_gros",
                referenceId: Number(id),
                referenceNumero: existing[0].numero_facture || null,
                description: "Sortie grammage (mise à jour facture gros)",
            });
        }

        await connection.commit();
        res.status(200).json({ message: "Facture gros mise à jour" });
    } catch (error) {
        await connection.rollback();
        console.error("[factureGros][update]", error);
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.deleteFactureGros = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        const [rows] = await connection.execute(
            "SELECT user_id, numero_facture, statut FROM factures_gros WHERE id = ?",
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: "Facture gros introuvable" });
        }
        if (req.user.role !== "admin" && rows[0].user_id !== req.user.id) {
            return res.status(403).json({ message: "Non autorisé" });
        }

        await connection.beginTransaction();
        const [itemRows] = await connection.execute(
            "SELECT produit_id, designation, grammage FROM factures_gros_items WHERE facture_gros_id = ?",
            [id]
        );
        if (isFactureGrosStockDeductedStatus(rows[0]?.statut)) {
            const restoredByProduct = await aggregateGrosGrammageResolvedByProduct(connection, itemRows);
            await addGrammageToGrosProducts(connection, restoredByProduct, {
                userId: req.user?.id || null,
                referenceType: "facture_gros",
                referenceId: Number(id),
                referenceNumero: rows[0]?.numero_facture || null,
                description: "Réintégration grammage (suppression facture gros)",
            });
        }
        await connection.execute("DELETE FROM factures_gros WHERE id = ?", [id]);
        await connection.commit();
        res.status(200).json({ message: "Supprimé" });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.approveFactureGros = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, "facture");
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour valider une facture gros" });
    }
    let connection = null;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.execute(
            "SELECT id, statut, numero_facture FROM factures_gros WHERE id = ?",
            [id]
        );
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Facture gros introuvable" });
        }
        if (rows[0].statut !== "en_attente") {
            await connection.rollback();
            return res.status(400).json({ message: "Cette facture gros n'est plus en attente" });
        }
        const [items] = await connection.execute(
            "SELECT produit_id, designation, grammage FROM factures_gros_items WHERE facture_gros_id = ?",
            [id]
        );
        console.log("[factureGros][approve] facture + items", {
            factureId: Number(id),
            statut: rows[0].statut,
            numero: rows[0].numero_facture,
            itemsCount: Array.isArray(items) ? items.length : 0,
            rawItems: items,
        });
        const soldByProduct = await aggregateGrosGrammageResolvedByProduct(connection, items);
        console.log("[factureGros][approve] soldByProduct", {
            factureId: Number(id),
            soldByProduct: Array.from(soldByProduct.entries()),
        });
        if (!soldByProduct || soldByProduct.size === 0) {
            console.log("[factureGros][approve] WARNING: aucune ligne resolue, aucun decrement possible", {
                factureId: Number(id),
                rawItems: items,
            });
        }
        await subtractGrammageFromGrosProducts(connection, soldByProduct, {
            userId: req.user?.id || null,
            referenceType: "facture_gros",
            referenceId: Number(id),
            referenceNumero: rows[0].numero_facture || null,
            description: "Sortie grammage (validation facture gros)",
        });
        // La validation documentaire ne doit pas marquer la facture comme payée.
        // Le passage à "payee" est géré uniquement par les règlements approuvés.
        await connection.execute("UPDATE factures_gros SET statut = 'non_payee' WHERE id = ?", [id]);
        await connection.commit();
        res.status(200).json({ message: "Facture gros validée (non payée)" });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch {}
        }
        console.error("[factureGros][approve]", error);
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Internal server error" });
    } finally {
        if (connection) connection.release();
    }
};

exports.rejectFactureGros = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, "facture");
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour rejeter une facture gros" });
    }
    try {
        const [rows] = await db.execute("SELECT id, statut FROM factures_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Facture gros introuvable" });
        }
        if (rows[0].statut !== "en_attente") {
            return res.status(400).json({ message: "Cette facture gros n'est plus en attente" });
        }
        await db.execute("UPDATE factures_gros SET statut = 'non_payee' WHERE id = ?", [id]);
        res.status(200).json({ message: "Facture gros rejetée (non payée)" });
    } catch (error) {
        console.error("[factureGros][reject]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
