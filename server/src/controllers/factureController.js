const db = require("../config/db").promise();
const { formatDocumentNumber } = require("../utils/documentFormatter");
const { getNextNumber } = require("../utils/numberingSettings");
const { canApprove } = require("../utils/approvalSettings");
const { logProductMovement } = require("../utils/productMovementLogger");
const fs = require("fs");
const path = require("path");
const MAX_ESPECE_FACTURE_TTC = 20000;
const EPSILON = 1e-6;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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

const getUploadedSupplierInvoicePath = (filename) => {
    const safe = String(filename || "").trim();
    if (!safe) return null;
    return path.join(__dirname, "../../uploads", safe);
};

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

/**
 * Lier une facture à une commande uniquement si : pas déjà liée à une autre facture,
 * pas de remboursement, pas d'avoir (sur la commande ou sur une facture de cette commande).
 * @param {import("mysql2/promise").PoolConnection} connection
 * @param {number} commandeId
 * @param {number|null} excludeFactureId — facture en cours d'édition (même liaison autorisée)
 */
function normalizeModePaiement(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
}

function isEspeceMode(value) {
    const normalized = normalizeModePaiement(value);
    return normalized === "espece" || normalized === "especes" || normalized === "cash";
}

function computeItemAmounts(item, qtyOverride = null) {
    const qty = qtyOverride == null ? Number(item?.quantite) || 0 : Number(qtyOverride) || 0;
    const pu = Number(item?.prix_unitaire) || 0;
    const red = (Number(item?.reduction) || 0) / 100;
    const tva = (Number(item?.tva) || 0) / 100;
    const ht = qty * pu * (1 - red);
    const tvaAmount = ht * tva;
    return { ht, tva: tvaAmount, ttc: ht + tvaAmount };
}

function splitFactureItemsByCap(items, capTtc) {
    const cap = Number(capTtc) || 0;
    if (!Array.isArray(items) || items.length === 0 || cap <= 0) return [];

    const buckets = [{ items: [], ttc: 0 }];
    const QTY_PRECISION = 8;
    const MIN_BATCH_TTC = 0.01;
    const DUST_BATCH_TTC = 0.1;

    for (const sourceItem of items) {
        let remainingQty = Number(sourceItem?.quantite) || 0;
        if (remainingQty <= EPSILON) continue;

        const unit = computeItemAmounts(sourceItem, 1);
        if (unit.ttc <= EPSILON) {
            const current = buckets[buckets.length - 1];
            current.items.push({ ...sourceItem, quantite: remainingQty });
            continue;
        }

        while (remainingQty > EPSILON) {
            let current = buckets[buckets.length - 1];
            let remainingCap = cap - current.ttc;

            if (remainingCap <= EPSILON) {
                buckets.push({ items: [], ttc: 0 });
                current = buckets[buckets.length - 1];
                remainingCap = cap;
            }

            let qtySlice = Math.min(remainingQty, remainingCap / unit.ttc);
            qtySlice = Number(qtySlice.toFixed(QTY_PRECISION));
            if (remainingQty - qtySlice <= Math.pow(10, -QTY_PRECISION)) {
                // Snap to the exact remainder to avoid creating a tiny trailing slice (e.g. 0.06 DH).
                qtySlice = Number(remainingQty.toFixed(QTY_PRECISION));
            }

            if (qtySlice <= EPSILON) {
                buckets.push({ items: [], ttc: 0 });
                continue;
            }

            let sliceAmounts = computeItemAmounts(sourceItem, qtySlice);
            // Guard against floating-point overshoot (e.g. 20000.01 after split/rounding)
            while (sliceAmounts.ttc - remainingCap > EPSILON && qtySlice > EPSILON) {
                qtySlice = Number((qtySlice - 0.000001).toFixed(6));
                if (qtySlice <= EPSILON) break;
                sliceAmounts = computeItemAmounts(sourceItem, qtySlice);
            }
            if (qtySlice <= EPSILON) {
                buckets.push({ items: [], ttc: 0 });
                continue;
            }

            current.items.push({ ...sourceItem, quantite: qtySlice });
            current.ttc += sliceAmounts.ttc;
            remainingQty = Number((remainingQty - qtySlice).toFixed(QTY_PRECISION));
        }
    }

    const normalizedBuckets = buckets
        .map((b) => ({ items: Array.isArray(b.items) ? [...b.items] : [] }))
        .filter((b) => b.items.length > 0);

    // Merge tiny trailing buckets (floating split dust) into previous bucket.
    for (let i = normalizedBuckets.length - 1; i > 0; i--) {
        const batchTtc = round2(
            normalizedBuckets[i].items.reduce(
                (sum, it) => sum + (computeItemAmounts(it, Number(it?.quantite) || 0).ttc || 0),
                0
            )
        );
        if (batchTtc > 0 && batchTtc <= DUST_BATCH_TTC) {
            normalizedBuckets[i - 1].items.push(...normalizedBuckets[i].items);
            normalizedBuckets[i].items = [];
        }
    }

    const filtered = normalizedBuckets
        .filter((b) => {
            if (!Array.isArray(b.items) || b.items.length === 0) return false;
            const batchTtc = b.items.reduce(
                (sum, it) => sum + (computeItemAmounts(it, Number(it?.quantite) || 0).ttc || 0),
                0
            );
            // Ignore dust batches caused by floating residuals after quantity slicing.
            return round2(batchTtc) >= MIN_BATCH_TTC;
        })
        .map((b) => b.items);

    try {
        const batchTtcs = filtered.map((batch, idx) => ({
            index: idx,
            ttc: round2(
                batch.reduce(
                    (sum, it) => sum + (computeItemAmounts(it, Number(it?.quantite) || 0).ttc || 0),
                    0
                )
            ),
            lines: batch.length,
        }));
        console.log("[SPLIT_DEBUG] splitFactureItemsByCap", {
            cap,
            sourceLines: Array.isArray(items) ? items.length : 0,
            sourceTotalTtc: round2(
                (Array.isArray(items) ? items : []).reduce(
                    (sum, it) => sum + (computeItemAmounts(it, Number(it?.quantite) || 0).ttc || 0),
                    0
                )
            ),
            bucketCount: filtered.length,
            batchTtcs,
        });
    } catch (e) {
        console.log("[SPLIT_DEBUG] failed to print split summary", e?.message || e);
    }

    return filtered;
}

function splitFactureItemsByTargets(items, targetTotals) {
    const targets = (Array.isArray(targetTotals) ? targetTotals : [])
        .map((v) => round2(Number(v) || 0))
        .filter((v) => v > 0.009);
    if (!Array.isArray(items) || items.length === 0 || targets.length === 0) return [];

    const buckets = targets.map((target) => ({ target, ttc: 0, items: [] }));
    const QTY_PRECISION = 8;
    let bucketIndex = 0;

    for (const sourceItem of items) {
        let remainingQty = Number(sourceItem?.quantite) || 0;
        if (remainingQty <= EPSILON) continue;

        const unit = computeItemAmounts(sourceItem, 1);
        if (unit.ttc <= EPSILON) {
            if (bucketIndex >= buckets.length) return [];
            buckets[bucketIndex].items.push({ ...sourceItem, quantite: remainingQty });
            continue;
        }

        while (remainingQty > EPSILON) {
            if (bucketIndex >= buckets.length) return [];
            let current = buckets[bucketIndex];
            let remainingCap = current.target - current.ttc;

            if (remainingCap <= EPSILON) {
                bucketIndex += 1;
                continue;
            }

            let qtySlice = Math.min(remainingQty, remainingCap / unit.ttc);
            qtySlice = Number(qtySlice.toFixed(QTY_PRECISION));
            if (remainingQty - qtySlice <= Math.pow(10, -QTY_PRECISION)) {
                qtySlice = Number(remainingQty.toFixed(QTY_PRECISION));
            }
            if (qtySlice <= EPSILON) {
                bucketIndex += 1;
                continue;
            }

            let sliceAmounts = computeItemAmounts(sourceItem, qtySlice);
            while (sliceAmounts.ttc - remainingCap > EPSILON && qtySlice > EPSILON) {
                qtySlice = Number((qtySlice - 0.00000001).toFixed(QTY_PRECISION));
                if (qtySlice <= EPSILON) break;
                sliceAmounts = computeItemAmounts(sourceItem, qtySlice);
            }
            if (qtySlice <= EPSILON) {
                bucketIndex += 1;
                continue;
            }

            current.items.push({ ...sourceItem, quantite: qtySlice });
            current.ttc += sliceAmounts.ttc;
            remainingQty = Number((remainingQty - qtySlice).toFixed(QTY_PRECISION));
        }
    }

    const result = buckets
        .filter((b) => Array.isArray(b.items) && b.items.length > 0)
        .map((b) => b.items);

    return result;
}

async function assertCommandeEligibleForFactureLink(connection, commandeId, excludeFactureId, options = {}) {
    const allowExistingFactures = options?.allowExistingFactures === true;
    const cid = Number(commandeId);
    if (!Number.isFinite(cid)) {
        const err = new Error("Identifiant de commande invalide.");
        err.statusCode = 400;
        throw err;
    }

    if (!allowExistingFactures) {
        const [dupFac] = await connection.execute(
            excludeFactureId != null
                ? "SELECT id FROM factures WHERE commande_id = ? AND id <> ? LIMIT 1"
                : "SELECT id FROM factures WHERE commande_id = ? LIMIT 1",
            excludeFactureId != null ? [cid, excludeFactureId] : [cid]
        );
        if (dupFac.length > 0) {
            const err = new Error("Cette commande est déjà liée à une facture.");
            err.statusCode = 400;
            throw err;
        }
    }

    const [rem] = await connection.execute(
        "SELECT id FROM remboursements WHERE commande_id = ? LIMIT 1",
        [cid]
    );
    if (rem.length > 0) {
        const err = new Error(
            "Impossible d'associer cette commande : elle fait l'objet d'un remboursement."
        );
        err.statusCode = 400;
        throw err;
    }

    const [avCmd] = await connection.execute(
        "SELECT id FROM avoirs WHERE commande_id = ? LIMIT 1",
        [cid]
    );
    if (avCmd.length > 0) {
        const err = new Error("Impossible d'associer cette commande : un avoir existe sur la commande.");
        err.statusCode = 400;
        throw err;
    }

    const [avOnFacture] = await connection.execute(
        `SELECT a.id FROM avoirs a
         INNER JOIN factures f ON f.id = a.facture_id AND f.commande_id = ?
         LIMIT 1`,
        [cid]
    );
    if (avOnFacture.length > 0) {
        const err = new Error(
            "Impossible d'associer cette commande : un avoir existe sur sa facture."
        );
        err.statusCode = 400;
        throw err;
    }

    const [[cmdRow]] = await connection.execute(
        `SELECT c.montant_ttc, c.montant_ht, c.montant_tva, c.statut,
                (SELECT id FROM factures WHERE commande_id = c.id LIMIT 1) AS facture_id
         FROM commandes c WHERE c.id = ?`,
        [cid]
    );
    if (!cmdRow) {
        const err = new Error("Commande introuvable.");
        err.statusCode = 404;
        throw err;
    }

    const fid = cmdRow.facture_id != null ? Number(cmdRow.facture_id) : null;
    if (fid != null && excludeFactureId != null && fid === Number(excludeFactureId)) {
        return;
    }
}


/* ===============================
   CREATE FACTURE
 ================================= */
exports.createFacture = async (req, res) => {
    const {
        numero_facture,
        date_facture,
        date_echeance,
        client_id,
        point_de_vente_id,
        commande_id,
        devis_id,
        items,
        mode_paiement,
        status,
        statut,
        reduction,
        montant_ttc: prop_montant_ttc
    } = req.body;

    const userProvidedCommandeId =
        commande_id && commande_id !== "" && commande_id !== "none" && !Number.isNaN(Number(commande_id))
            ? Number(commande_id)
            : null;

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
            throw new Error("client_id is required");
        }

        // 1. Handle point_de_vente_id (NOT NULL in DB)
        let pdv_id = point_de_vente_id;
        if (!pdv_id || pdv_id === "" || pdv_id === "none") {
            const [pdvs] = await connection.query("SELECT id FROM point_de_vente LIMIT 1");
            if (pdvs.length > 0) {
                pdv_id = pdvs[0].id;
            } else {
                pdv_id = 1;
            }
        }

        // 2. Toute facture créée doit passer par validation Approvals.
        const final_statut = "en_attente";

        // Clean other nullable fields
        let final_commande_id = (commande_id === "" || commande_id === "none" || !commande_id) ? null : commande_id;
        let final_devis_id = (devis_id === "" || devis_id === "none" || !devis_id) ? null : devis_id;
        const numeroDate = parseDateOnlySafe(date_facture || new Date().toISOString().split("T")[0]);

        // If commande is provided but devis is not, try to find the devis associated with that commande
        let commandeMontantTtc = 0;
        if (final_commande_id && !final_devis_id) {
            const [cmdRows] = await connection.execute("SELECT devis_id, montant_ttc FROM commandes WHERE id = ?", [final_commande_id]);
            if (cmdRows.length > 0 && cmdRows[0].devis_id) {
                final_devis_id = cmdRows[0].devis_id;
            }
            if (cmdRows.length > 0) {
                commandeMontantTtc = Number(cmdRows[0].montant_ttc) || 0;
            }
        } else if (final_commande_id) {
            const [cmdRows] = await connection.execute("SELECT montant_ttc FROM commandes WHERE id = ?", [final_commande_id]);
            if (cmdRows.length > 0) {
                commandeMontantTtc = Number(cmdRows[0].montant_ttc) || 0;
            }
        }

        const requestedMode = normalizeModePaiement(mode_paiement);
        const isEspeceRequested = isEspeceMode(requestedMode);
        let hasEspeceReglementOnCommande = false;
        let hasAnyReglementOnCommande = false;
        let reglementRowsForCommande = [];
        if (final_commande_id) {
            const [reglementRows] = await connection.execute(
                `SELECT mode_paiement, montant
                 FROM reglements_clients
                 WHERE commande_id = ?`,
                [final_commande_id]
            );
            reglementRowsForCommande = Array.isArray(reglementRows) ? reglementRows : [];
            console.log("[SPLIT_DEBUG] reglements for commande", {
                commandeId: Number(final_commande_id),
                count: reglementRowsForCommande.length,
                rows: reglementRowsForCommande.map((r) => ({
                    mode: String(r?.mode_paiement || ""),
                    montant: round2(Number(r?.montant) || 0),
                })),
            });
            hasAnyReglementOnCommande = Array.isArray(reglementRows)
                ? reglementRows.some((r) => (Number(r?.montant) || 0) > 0)
                : false;
            hasEspeceReglementOnCommande = Array.isArray(reglementRows)
                ? reglementRows.some((r) => {
                      const mode = normalizeModePaiement(r?.mode_paiement);
                      const montant = Number(r?.montant) || 0;
                      return isEspeceMode(mode) && montant > 0;
                  })
                : false;
        }
        // Règle métier:
        // - S'il existe déjà des règlements saisis pour la commande, on se base UNIQUEMENT
        //   sur ces règlements pour décider le split espèces.
        // - Sinon, fallback sur le mode demandé côté facture.
        const shouldSplitForEspece = hasAnyReglementOnCommande
            ? hasEspeceReglementOnCommande
            : isEspeceRequested;
        const totalFromItems = Array.isArray(items)
            ? items.reduce((sum, it) => sum + computeItemAmounts(it).ttc, 0)
            : 0;
        const totalReference = Math.max(totalFromItems, commandeMontantTtc, Number(prop_montant_ttc) || 0);

        if (
            !final_commande_id &&
            totalReference > MAX_ESPECE_FACTURE_TTC + 0.01
        ) {
            const err = new Error(
                "Facture > 20000 DH sans commande liée: liez d'abord une commande puis saisissez le règlement (modes/montants)."
            );
            err.statusCode = 400;
            throw err;
        }

        if (
            final_commande_id &&
            totalReference > MAX_ESPECE_FACTURE_TTC + 0.01 &&
            !isEspeceRequested &&
            !hasAnyReglementOnCommande
        ) {
            const err = new Error(
                "Commande > 20000 DH: saisissez d'abord le règlement (modes/montants), puis créez la facture."
            );
            err.statusCode = 400;
            throw err;
        }

        if (
            final_commande_id &&
            shouldSplitForEspece &&
            totalReference > MAX_ESPECE_FACTURE_TTC + 0.01 &&
            Array.isArray(items) &&
            items.length > 0
        ) {
            await assertCommandeEligibleForFactureLink(
                connection,
                Number(final_commande_id),
                null,
                { allowExistingFactures: true }
            );

            const reglementTargetEntries = reglementRowsForCommande
                .map((r) => ({
                    montant: round2(Number(r?.montant) || 0),
                    mode: normalizeModePaiement(r?.mode_paiement),
                }))
                .filter((x) => x.montant > 0.009);
            const reglementTargets = reglementTargetEntries.map((x) => x.montant);
            const reglementTargetsTotal = round2(
                reglementTargets.reduce((sum, m) => sum + m, 0)
            );
            const canSplitByReglements =
                reglementTargets.length >= 2 &&
                Math.abs(reglementTargetsTotal - round2(totalReference)) <= 0.05;

            const splitBatches = canSplitByReglements
                ? splitFactureItemsByTargets(items, reglementTargets)
                : splitFactureItemsByCap(items, MAX_ESPECE_FACTURE_TTC);
            if (!splitBatches.length) {
                const err = new Error("Impossible de répartir les lignes de la commande en factures.");
                err.statusCode = 400;
                throw err;
            }
            console.log("[SPLIT_DEBUG] createFacture split trigger", {
                commandeId: Number(final_commande_id),
                totalFromItems: round2(totalFromItems),
                commandeMontantTtc: round2(commandeMontantTtc),
                propMontantTtc: round2(Number(prop_montant_ttc) || 0),
                totalReference: round2(totalReference),
                shouldSplitForEspece,
                hasAnyReglementOnCommande,
                hasEspeceReglementOnCommande,
                splitBatchesCount: splitBatches.length,
                canSplitByReglements,
                reglementTargets,
                reglementTargetModes: reglementTargetEntries.map((x) => x.mode),
            });
            const expectedBatchTotals = canSplitByReglements
                ? reglementTargets
                : (() => {
                      const totals = [];
                      let remainingTtc = round2(totalReference);
                      while (remainingTtc > 0.009) {
                          const chunk = Math.min(MAX_ESPECE_FACTURE_TTC, remainingTtc);
                          totals.push(round2(chunk));
                          remainingTtc = round2(remainingTtc - chunk);
                      }
                      return totals;
                  })();
            console.log("[SPLIT_DEBUG] batch alignment", {
                splitBatchesCount: splitBatches.length,
                expectedBatchTotals,
                expectedCount: expectedBatchTotals.length,
                computedBatchTotals: splitBatches.map((batch) =>
                    round2(
                        batch.reduce(
                            (sum, it) => sum + (computeItemAmounts(it, Number(it?.quantite) || 0).ttc || 0),
                            0
                        )
                    )
                ),
            });
            console.log("[SPLIT_DEBUG] expectedBatchTotals", {
                expectedBatchTotals,
                expectedCount: expectedBatchTotals.length,
            });

            const createdFactureIds = [];
            for (let batchIndex = 0; batchIndex < splitBatches.length; batchIndex++) {
                const batchItems = splitBatches[batchIndex];
                const batchComputedTtc = round2(
                    batchItems.reduce(
                        (sum, it) => sum + (computeItemAmounts(it, Number(it?.quantite) || 0).ttc || 0),
                        0
                    )
                );
                console.log("[SPLIT_DEBUG] creating split facture", {
                    batchIndex,
                    batchLines: batchItems.length,
                    batchComputedTtc,
                    expectedTtc: round2(Number(expectedBatchTotals[batchIndex]) || 0),
                });
                const insertFactureQuery = `
                    INSERT INTO factures
                    (numero_facture, date_facture, date_echeance,
                    client_id, user_id, point_de_vente_id,
                    commande_id, devis_id, statut, reduction, montant_ttc)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const [factureRes] = await connection.execute(insertFactureQuery, [
                    `TEMP-${Date.now()}`,
                    date_facture,
                    date_echeance,
                    effectiveClientId,
                    user_id,
                    pdv_id,
                    null,
                    null,
                    final_statut,
                    0,
                    0,
                ]);

                const factureId = factureRes.insertId;
                const fromItems = await resolveSousSocieteFromItems(connection, batchItems);
                const fromPdv = await resolveSousSocieteFromPdv(connection, pdv_id);
                const sousSociete = fromItems.id ? fromItems : fromPdv;
                const faNumber = await getNextNumber("FA", factureId, connection, { sousSocieteId: sousSociete.id });
                const finalFactureNumero = formatDocumentNumber("FA", faNumber, numeroDate, { sousSocieteNom: sousSociete.nom });

                await connection.execute(
                    `UPDATE factures SET numero_facture = ?, commande_id = ?, devis_id = ? WHERE id = ?`,
                    [finalFactureNumero, final_commande_id, final_devis_id, factureId]
                );

                let montantHtTotal = 0;
                let montantTvaTotal = 0;
                let totalItemsReduction = 0;
                let sumRedPct = 0;

                for (const item of batchItems) {
                    const brutHT = Number(item.quantite) * Number(item.prix_unitaire);
                    const redItem = Number(item.reduction) || 0;
                    const itemReductionAmount = brutHT * (redItem / 100);
                    const montant_ht = brutHT - itemReductionAmount;
                    const montant_tva = montant_ht * (Number(item.tva) / 100);

                    montantHtTotal += montant_ht;
                    montantTvaTotal += montant_tva;
                    totalItemsReduction += itemReductionAmount;
                    sumRedPct += redItem;

                    if (!item.produit_id && !item.designation) {
                        throw new Error("Désignation ou produit manquant");
                    }

                    await connection.execute(
                        `INSERT INTO facture_items
                         (facture_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            factureId,
                            item.produit_id || null,
                            item.designation,
                            item.quantite,
                            item.prix_unitaire,
                            item.tva,
                            item.reduction || 0,
                            montant_ht,
                        ]
                    );
                }

                const finalMontantTtcRaw = montantHtTotal + montantTvaTotal;
                const expectedTtc = expectedBatchTotals[batchIndex];
                const finalMontantTtc =
                    typeof expectedTtc === "number" ? round2(expectedTtc) : round2(finalMontantTtcRaw);
                const deltaTtc = round2(finalMontantTtc - round2(finalMontantTtcRaw));
                console.log("[SPLIT_DEBUG] montant final batch", {
                    batchIndex,
                    finalMontantTtcRaw: round2(finalMontantTtcRaw),
                    expectedTtc:
                        typeof expectedTtc === "number" ? round2(expectedTtc) : null,
                    finalMontantTtc,
                    deltaTtc,
                });
                if (Math.abs(deltaTtc) > 0.0001) {
                    // Keep HT untouched, adjust TVA by the rounding delta so HT+TVA stays exact TTC.
                    montantTvaTotal = round2(montantTvaTotal + deltaTtc);
                }
                const currentBatchMode = canSplitByReglements
                    ? String(reglementTargetEntries[batchIndex]?.mode || "")
                    : requestedMode;
                const shouldEnforceEspeceCap = isEspeceMode(currentBatchMode);
                if (shouldEnforceEspeceCap && finalMontantTtc > MAX_ESPECE_FACTURE_TTC + 0.05) {
                    const err = new Error(`Une facture dépasse la limite espèces (${MAX_ESPECE_FACTURE_TTC} DH).`);
                    err.statusCode = 400;
                    throw err;
                }

                await connection.execute(
                    `UPDATE factures
                     SET montant_ht = ?, montant_tva = ?, montant_ttc = ?, reduction = ?, total_reduction = ?
                     WHERE id = ?`,
                    [
                        round2(montantHtTotal),
                        montantTvaTotal,
                        finalMontantTtc,
                        parseFloat(sumRedPct.toFixed(4)),
                        totalItemsReduction,
                        factureId,
                    ]
                );

                createdFactureIds.push(factureId);
            }

            // Si des règlements existent déjà sur la commande (avant split),
            // répartir les lignes non liées (facture_id NULL) sur les factures créées.
            if (final_commande_id && createdFactureIds.length > 0) {
                const [unlinkedReglements] = await connection.execute(
                    `SELECT id, montant
                     FROM reglements_clients
                     WHERE commande_id = ?
                       AND (facture_id IS NULL OR facture_id = 0)
                     ORDER BY date_reglement ASC, id ASC
                     FOR UPDATE`,
                    [final_commande_id]
                );

                if (Array.isArray(unlinkedReglements) && unlinkedReglements.length > 0) {
                    const remainingByFacture = createdFactureIds.map((factureId, idx) => ({
                        factureId,
                        remaining: round2(expectedBatchTotals[idx] || 0),
                    }));

                    for (const reg of unlinkedReglements) {
                        const regAmount = round2(Number(reg.montant) || 0);
                        if (regAmount <= 0) continue;

                        // Priorité à la première facture ayant un reste suffisant.
                        let target = remainingByFacture.find((f) => f.remaining + 0.01 >= regAmount);

                        // Fallback: s'il n'y en a pas, prendre celle avec le plus grand reste.
                        if (!target) {
                            target = remainingByFacture.reduce((best, current) =>
                                current.remaining > best.remaining ? current : best
                            );
                        }

                        if (!target) continue;

                        await connection.execute(
                            "UPDATE reglements_clients SET facture_id = ? WHERE id = ?",
                            [target.factureId, reg.id]
                        );

                        target.remaining = round2(target.remaining - regAmount);
                    }
                }
            }

            await connection.commit();
            return res.status(201).json({
                message: `Factures créées (${createdFactureIds.length})`,
                ids: createdFactureIds,
                split: true,
                maxPerFacture: MAX_ESPECE_FACTURE_TTC,
            });
        }

        const insertFactureQuery = `
            INSERT INTO factures
            (numero_facture, date_facture, date_echeance,
            client_id, user_id, point_de_vente_id,
            commande_id, devis_id, statut, reduction, montant_ttc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await connection.execute(insertFactureQuery, [
            `TEMP-${Date.now()}`,
            date_facture,
            date_echeance,
            effectiveClientId,
            user_id,
            pdv_id,
            null,
            null,
            final_statut,
            reduction || 0,
            prop_montant_ttc || 0
        ]);

        const factureId = result.insertId;
        // Utiliser soit la séquence personnalisée (si définie), soit l'id de la facture
        const fromItems = await resolveSousSocieteFromItems(connection, items);
        const fromPdv = await resolveSousSocieteFromPdv(connection, pdv_id);
        const sousSociete = fromItems.id ? fromItems : fromPdv;
        const faNumber = await getNextNumber("FA", factureId, connection, { sousSocieteId: sousSociete.id });
        const final_facture_numero = formatDocumentNumber('FA', faNumber, numeroDate, { sousSocieteNom: sousSociete.nom });

        // Traceability: Create Devis and Commande if not provided
        if (!final_devis_id || !final_commande_id) {
            try {
                let current_devis_id = final_devis_id;
                let current_commande_id = final_commande_id;

                // 1. Create Devis if missing (totals with item reduction)
                if (!current_devis_id) {
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
                        date_facture,
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
                    current_devis_id = devisResult.insertId;

                    const devisItemsData = items.map(it => [
                        current_devis_id, it.produit_id || null, it.designation, it.quantite || 1, it.prix_unitaire || 0, it.tva || 0, it.reduction || 0, (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0) * (1 - (Number(it.reduction) || 0) / 100)
                    ]);
                    await connection.query(`INSERT INTO devis_items (devis_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht) VALUES ?`, [devisItemsData]);

                    // Update devis with correct number (totals and reduction already set)
                    const deNumber = await getNextNumber("DE", current_devis_id, connection, {
                        sousSocieteId: sousSociete.id,
                    });
                    const final_devis_numero = formatDocumentNumber('DE', deNumber, numeroDate, {
                        sousSocieteNom: sousSociete.nom,
                    });
                    await connection.execute(
                        "UPDATE devis SET numero_devis = ? WHERE id = ?",
                        [final_devis_numero, current_devis_id]
                    );
                    final_devis_id = current_devis_id;
                }

                // 2. Create Commande if missing (totals with item reduction)
                if (!current_commande_id) {
                    let cmd_ht = 0;
                    let cmd_tva = 0;
                    let cmd_total_items_reduction = 0;
                    let cmd_sumRedPct = 0;
                    items.forEach(it => {
                        const brutHT = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
                        const redItem = Number(it.reduction) || 0;
                        const itemReductionAmount = brutHT * (redItem / 100);
                        const ht_after_red = brutHT - itemReductionAmount;
                        cmd_ht += ht_after_red;
                        cmd_tva += ht_after_red * ((Number(it.tva) || 0) / 100);
                        cmd_total_items_reduction += itemReductionAmount;
                        cmd_sumRedPct += redItem;
                    });

                    const [cmdResult] = await connection.execute(`
                        INSERT INTO commandes (numero_commande, date_commande, client_id, user_id, point_de_vente_id, devis_id, statut, montant_ht, montant_tva, montant_ttc, reduction, total_reduction)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        `TEMP-${Date.now()}`,
                        date_facture,
                        effectiveClientId,
                        user_id,
                        pdv_id,
                        current_devis_id,
                        'en_attente',
                        cmd_ht,
                        cmd_tva,
                        cmd_ht + cmd_tva,
                        parseFloat(cmd_sumRedPct.toFixed(4)),
                        cmd_total_items_reduction
                    ]);
                    current_commande_id = cmdResult.insertId;

                    for (const it of items) {
                        const brutHT = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
                        const redItem = Number(it.reduction) || 0;
                        const ht_final = brutHT * (1 - redItem / 100);
                        await connection.execute(`
                            INSERT INTO commande_items (commande_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `, [current_commande_id, it.produit_id || null, it.designation, it.quantite, it.prix_unitaire, it.tva, it.reduction || 0, ht_final]);
                    }

                    // Update commande with correct number
                    const coNumber = await getNextNumber("CO", current_commande_id, connection, {
                        sousSocieteId: sousSociete.id,
                    });
                    const final_cmd_numero = formatDocumentNumber('CO', coNumber, numeroDate, {
                        sousSocieteNom: sousSociete.nom,
                    });
                    await connection.execute("UPDATE commandes SET numero_commande = ? WHERE id = ?", [final_cmd_numero, current_commande_id]);
                    final_commande_id = current_commande_id;
                }
            } catch (traceErr) {
                console.error("Facture Traceability Error:", traceErr.message);
            }
        }

        // Update Facture with final number and traceability IDs
        await connection.execute(`
            UPDATE factures 
            SET numero_facture = ?, commande_id = ?, devis_id = ? 
            WHERE id = ?
        `, [final_facture_numero, final_commande_id, final_devis_id, factureId]);

        let montant_ht_total = 0;
        let montant_tva_total = 0;
        let total_items_reduction = 0;
        let sumRedPct = 0;

        for (const item of items) {
            const brutHT = Number(item.quantite) * Number(item.prix_unitaire);
            const redItem = Number(item.reduction) || 0;
            const itemReductionAmount = brutHT * (redItem / 100);
            const montant_ht = brutHT - itemReductionAmount;
            const montant_tva = montant_ht * (Number(item.tva) / 100);

            montant_ht_total += montant_ht;
            montant_tva_total += montant_tva;
            total_items_reduction += itemReductionAmount;
            sumRedPct += redItem;



            // produit_id is now NULLABLE. We check for designation instead.
            if (!item.produit_id && !item.designation) {
                throw new Error(`Désignation ou produit manquant`);
            }

            await connection.execute(`
                INSERT INTO facture_items
                (facture_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                factureId,
                item.produit_id || null,
                item.designation,
                item.quantite,
                item.prix_unitaire,
                item.tva,
                item.reduction || 0,
                montant_ht
            ]);
        }

        const finalHT = montant_ht_total;
        const finalTVA = montant_tva_total;
        const final_montant_ttc = finalHT + finalTVA;

        await connection.execute(`
            UPDATE factures
            SET montant_ht = ?, montant_tva = ?, montant_ttc = ?, reduction = ?, total_reduction = ?
            WHERE id = ?
        `, [
            finalHT,
            finalTVA,
            final_montant_ttc,
            parseFloat(sumRedPct.toFixed(4)),
            total_items_reduction,
            factureId
        ]);

        // Si des règlements ont été saisis sur la commande avant création de facture,
        // rattacher automatiquement les lignes encore non liées à cette nouvelle facture.
        if (final_commande_id) {
            await connection.execute(
                `UPDATE reglements_clients
                 SET facture_id = ?
                 WHERE commande_id = ?
                   AND (facture_id IS NULL OR facture_id = 0)`,
                [factureId, final_commande_id]
            );
        }

        // La facture reste en_attente jusqu'à validation explicite dans Approvals.

        if (
            userProvidedCommandeId != null &&
            Number.isFinite(userProvidedCommandeId) &&
            Number(final_commande_id) === userProvidedCommandeId
        ) {
            await assertCommandeEligibleForFactureLink(connection, userProvidedCommandeId, factureId);
        }

        await connection.commit();
        res.status(201).json({ message: "Facture créée", id: factureId });

        // Notify via Socket.io
        const io = req.app.get("io");
        if (io) {
            io.emit("notification", {
                type: "facture",
                numero: final_facture_numero,
                user: `${req.user.prenom} ${req.user.nom}`,
                date: new Date().toISOString()
            });
        }

    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error creating facture:", err);
        const code = err.statusCode || 500;
        res.status(code).json({
            message: code === 500 ? "Internal server error" : err.message,
            error: err.message,
        });
    } finally {
        connection.release();
    }
};


/* ===============================
   GET ALL FACTURES
================================= */
exports.getAllFactures = async (req, res) => {
    try {
        let sql = `
            SELECT 
                f.*,
                cl.nom_complet AS client_nom,
                cl.\`type\` as client_type,
                cl.ice as client_ice,
                cl.telephone as client_telephone,
                cl.email as client_email,
                cl.adresse as client_adresse,
                CONCAT(u.prenom, ' ', u.nom) as user_nom,
                COALESCE(pvf.nom, pvc.nom) AS point_de_vente_nom,
                (
                    SELECT COUNT(DISTINCT p.id_point_de_vente)
                    FROM facture_items fi
                    INNER JOIN products p ON fi.produit_id = p.id
                    WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                ) AS pdv_count_from_items,
                (
                    SELECT pvx.nom
                    FROM facture_items fi
                    INNER JOIN products p ON fi.produit_id = p.id
                    INNER JOIN point_de_vente pvx ON pvx.id = p.id_point_de_vente
                    WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                    ORDER BY fi.id
                    LIMIT 1
                ) AS point_de_vente_nom_from_items,
                COALESCE(ssf.NOM_SOUS_SOCIETE, ssc.NOM_SOUS_SOCIETE) AS sous_societe_nom,
                (
                    SELECT ss_items.NOM_SOUS_SOCIETE
                    FROM facture_items fi
                    INNER JOIN products p ON fi.produit_id = p.id
                    INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                    LEFT JOIN sous_societe ss_items ON ss_items.ID = pv_items.id_sous_gestionnaire
                    WHERE fi.facture_id = f.id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY fi.id
                    LIMIT 1
                ) AS sous_societe_nom_from_items,
                (
                    SELECT ssn.NOM_SOUS_SOCIETE
                    FROM sous_societe ssn
                    WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(f.numero_facture, '-', 2), '-', -1))
                    ORDER BY ssn.ID
                    LIMIT 1
                ) AS sous_societe_nom_from_numero,
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
                        WHERE rc2.commande_id = f.commande_id AND rc2.statut = 'approuve'
                          AND (rc2.facture_id IS NULL OR rc2.facture_id = 0)
                    ), 0)
                ) AS total_regle,
                GREATEST(
                    f.montant_ttc - (
                        COALESCE((
                            SELECT SUM(rc1.montant)
                            FROM reglements_clients rc1
                            WHERE rc1.facture_id = f.id AND rc1.statut = 'approuve'
                        ), 0)
                        +
                        COALESCE((
                            SELECT SUM(rc2.montant)
                            FROM reglements_clients rc2
                            WHERE rc2.commande_id = f.commande_id AND rc2.statut = 'approuve'
                              AND (rc2.facture_id IS NULL OR rc2.facture_id = 0)
                        ), 0)
                    ),
                    0
                ) AS reste_a_payer,
                (SELECT bl.id FROM bon_de_livraison bl WHERE bl.commande_id = f.commande_id AND (bl.statut IS NULL OR LOWER(TRIM(bl.statut)) NOT IN ('annulé', 'annulée', 'annulee', 'annule')) ORDER BY bl.id DESC LIMIT 1) AS bon_livraison_id,
                (
                    SELECT COALESCE(SUM(
                        CASE
                            WHEN p.prix_de_vente IS NOT NULL AND CAST(p.prix_de_vente AS DECIMAL(14,4)) > 0 THEN
                                COALESCE(fi.quantite, 0) * (CAST(p.prix_de_vente AS DECIMAL(14,4)) - COALESCE(CAST(p.prix AS DECIMAL(14,4)), 0))
                            ELSE
                                COALESCE(fi.montant_ht, 0) - (COALESCE(fi.quantite, 0) * COALESCE(CAST(p.prix AS DECIMAL(14,4)), 0))
                        END
                    ), 0)
                    FROM facture_items fi
                    INNER JOIN products p ON fi.produit_id = p.id
                    WHERE fi.facture_id = f.id
                ) AS marge_ht
            FROM factures f
            LEFT JOIN clients cl ON f.client_id = cl.id
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN point_de_vente pvf ON pvf.id = f.point_de_vente_id
            LEFT JOIN commandes c ON c.id = f.commande_id
            LEFT JOIN point_de_vente pvc ON pvc.id = c.point_de_vente_id
            LEFT JOIN sous_societe ssf ON ssf.ID = pvf.id_sous_gestionnaire
            LEFT JOIN sous_societe ssc ON ssc.ID = pvc.id_sous_gestionnaire
        `;
        const params = [];

        // Admin et Directeur voient toutes les factures.
        // Les autres voient les leurs, SAUF s'ils ont des droits d'approbation (auquel cas ils voient aussi les "en_attente")
        const allowedToApprove = await canApprove(req.user.role, 'facture');
        if (req.user.role !== 'admin' && req.user.role !== 'directeur' && req.user.role !== 'responsable') {
            if (allowedToApprove) {
                sql += " WHERE (f.user_id = ? OR f.statut = 'en_attente')";
                params.push(req.user.id);
            } else {
                sql += " WHERE f.user_id = ?";
                params.push(req.user.id);
            }
        }

        sql += " ORDER BY f.created_at DESC";

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
                    sous_societe_nom: row.sous_societe_nom_from_items || row.sous_societe_nom || row.sous_societe_nom_from_numero || null,
                };
            })
        );
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getFactureById = async (req, res) => {
    const { id } = req.params;

    try {
        let sql = `
            SELECT 
                f.*,
                cl.nom_complet AS client_nom,
                cl.\`type\` as client_type,
                cl.ice as client_ice,
                cl.telephone as client_telephone,
                cl.email as client_email,
                cl.adresse as client_adresse,
                (SELECT p.id_point_de_vente
                 FROM facture_items fi
                 INNER JOIN products p ON fi.produit_id = p.id
                 WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                 ORDER BY fi.id
                 LIMIT 1) AS point_de_vente_id_from_items,
                f.point_de_vente_id AS point_de_vente_id_from_facture,
                c.point_de_vente_id AS point_de_vente_id_from_commande,
                COALESCE(
                    (SELECT p.id_point_de_vente
                     FROM facture_items fi
                     INNER JOIN products p ON fi.produit_id = p.id
                     WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                     ORDER BY fi.id
                     LIMIT 1),
                    f.point_de_vente_id,
                    c.point_de_vente_id
                ) AS point_de_vente_id,
                (
                    SELECT pv.logo
                    FROM point_de_vente pv
                    WHERE pv.id = COALESCE(
                        (SELECT p.id_point_de_vente
                         FROM facture_items fi
                         INNER JOIN products p ON fi.produit_id = p.id
                         WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                         ORDER BY fi.id
                         LIMIT 1),
                        f.point_de_vente_id,
                        c.point_de_vente_id
                    )
                    LIMIT 1
                ) AS point_de_vente_logo,
                COALESCE(ssf.NOM_SOUS_SOCIETE, ssc.NOM_SOUS_SOCIETE) AS sous_societe_nom,
                (
                    SELECT ssn.NOM_SOUS_SOCIETE
                    FROM sous_societe ssn
                    WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(f.numero_facture, '-', 2), '-', -1))
                    ORDER BY ssn.ID
                    LIMIT 1
                ) AS sous_societe_nom_from_numero,
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
                        WHERE rc2.commande_id = f.commande_id AND rc2.statut = 'approuve'
                          AND (rc2.facture_id IS NULL OR rc2.facture_id = 0)
                    ), 0)
                ) AS total_regle,
                GREATEST(
                    f.montant_ttc - (
                        COALESCE((
                            SELECT SUM(rc1.montant)
                            FROM reglements_clients rc1
                            WHERE rc1.facture_id = f.id AND rc1.statut = 'approuve'
                        ), 0)
                        +
                        COALESCE((
                            SELECT SUM(rc2.montant)
                            FROM reglements_clients rc2
                            WHERE rc2.commande_id = f.commande_id AND rc2.statut = 'approuve'
                              AND (rc2.facture_id IS NULL OR rc2.facture_id = 0)
                        ), 0)
                    ),
                    0
                ) AS reste_a_payer,
                (SELECT bl.id FROM bon_de_livraison bl WHERE bl.commande_id = f.commande_id AND (bl.statut IS NULL OR LOWER(TRIM(bl.statut)) NOT IN ('annulé', 'annulée', 'annulee', 'annule')) ORDER BY bl.id DESC LIMIT 1) AS bon_livraison_id,
                (SELECT bl.numero_bon_livraison FROM bon_de_livraison bl WHERE bl.commande_id = f.commande_id AND (bl.statut IS NULL OR LOWER(TRIM(bl.statut)) NOT IN ('annulé', 'annulée', 'annulee', 'annule')) ORDER BY bl.id DESC LIMIT 1) AS numero_bon_livraison_linked
            FROM factures f
            LEFT JOIN clients cl ON f.client_id = cl.id
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN point_de_vente pvf ON pvf.id = f.point_de_vente_id
            LEFT JOIN commandes c ON c.id = f.commande_id
            LEFT JOIN point_de_vente pvc ON pvc.id = c.point_de_vente_id
            LEFT JOIN sous_societe ssf ON ssf.ID = pvf.id_sous_gestionnaire
            LEFT JOIN sous_societe ssc ON ssc.ID = pvc.id_sous_gestionnaire
            WHERE f.id = ?
        `;
        const params = [id];

        // Admin, Directeur et Responsable peuvent consulter toutes les factures, les autres seulement les leurs
        if (req.user.role !== 'admin' && req.user.role !== 'directeur' && req.user.role !== 'responsable') {
            sql += " AND f.user_id = ?";
            params.push(req.user.id);
        }

        const [rows] = await db.execute(sql, params);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Facture not found or unauthorized" });
        }

        const [items] = await db.execute(`
            SELECT fi.*, p.photo, p.grammage, p.code_barre, p.reference, p.pricing_metal, p.pricing_variant,
                   COALESCE(p.nom, fi.designation) as designation,
                   pt.name AS product_type_name
            FROM facture_items fi
            LEFT JOIN products p ON fi.produit_id = p.id
            LEFT JOIN product_types pt ON p.product_type_id = pt.id
            WHERE fi.facture_id = ?
        `, [id]);

        res.status(200).json({
            ...rows[0],
            sous_societe_nom: rows[0].sous_societe_nom_from_numero || rows[0].sous_societe_nom || null,
            items,
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/* ===============================
   TOP SOLD PRODUCTS (for dashboard)
================================= */
exports.getTopSoldProducts = async (req, res) => {
    try {
        const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
        const months = Math.min(24, Math.max(1, Number(req.query.months) || 6));

        let sql = `
            SELECT
                COALESCE(p.nom, fi.designation) AS name,
                SUM(COALESCE(fi.quantite, 0)) AS quantity
            FROM facture_items fi
            INNER JOIN factures f ON f.id = fi.facture_id
            LEFT JOIN products p ON p.id = fi.produit_id
            WHERE f.statut IN ('non_payee', 'payee')
              AND COALESCE(f.date_facture, f.created_at) >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        `;
        const params = [months];

        // Admin et Directeur voient tout; les autres seulement leurs factures
        if (req.user.role !== 'admin' && req.user.role !== 'directeur') {
            sql += " AND f.user_id = ?";
            params.push(req.user.id);
        }

        sql += `
            GROUP BY COALESCE(p.nom, fi.designation)
            ORDER BY quantity DESC
            LIMIT ?
        `;
        params.push(limit);

        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows.map((r) => ({ name: r.name, quantity: Number(r.quantity) || 0 })));
    } catch (err) {
        console.error("Error fetching top sold products:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getLeastSoldProducts = async (req, res) => {
    try {
        const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
        const months = Math.min(24, Math.max(1, Number(req.query.months) || 6));

        let sql = `
            SELECT
                p.nom AS name,
                COALESCE(SUM(fi.quantite), 0) AS quantity
            FROM products p
            LEFT JOIN facture_items fi ON fi.produit_id = p.id
            LEFT JOIN factures f ON f.id = fi.facture_id 
                AND f.statut IN ('non_payee', 'payee')
                AND COALESCE(f.date_facture, f.created_at) >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
            GROUP BY p.id, p.nom
            ORDER BY quantity ASC
            LIMIT ?
        `;
        const params = [months, limit];

        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows.map((r) => ({ name: r.name, quantity: Number(r.quantity) || 0 })));
    } catch (err) {
        console.error("Error fetching least sold products:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateFacture = async (req, res) => {
    const { id } = req.params;
    const {
        numero_facture,
        date_facture,
        date_echeance,
        client_id,
        point_de_vente_id,
        commande_id,
        devis_id,
        items,
        mode_paiement,
        statut,
        status,
        reduction,
        montant_ttc: prop_montant_ttc
    } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check ownership + toute modification remet la facture en attente d'approbation
        let checkSql = "SELECT user_id, statut FROM factures WHERE id = ?";
        const [rows] = await connection.execute(checkSql, [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Facture not found" });
        }
        if (
            req.user.role !== 'admin' &&
            req.user.role !== 'directeur' &&
            req.user.role !== 'responsable' &&
            rows[0].user_id !== req.user.id
        ) {
            await connection.rollback();
            return res.status(403).json({ message: "Unauthorized" });
        }

        const final_statut = "en_attente";
        const clean_commande_id = (commande_id === "" || commande_id === "none" || !commande_id) ? null : commande_id;

        // Resolve point_de_vente_id (same logic as createFacture)
        let pdv_id = point_de_vente_id;
        if (!pdv_id || pdv_id === "" || pdv_id === "none") {
            const [pdvs] = await connection.query("SELECT id FROM point_de_vente LIMIT 1");
            pdv_id = pdvs.length > 0 ? pdvs[0].id : 1;
        }

        // Calculate totals
        let totalHT = 0;
        let totalTVA = 0;
        let totalItemsRed = 0;
        let sumRedPct = 0;

        if (items && Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                const bruteHT = Number(item.quantite) * Number(item.prix_unitaire);
                const itemRedRate = Number(item.reduction) || 0;
                const itemRedAmount = bruteHT * (itemRedRate / 100);
                const ht = bruteHT - itemRedAmount;
                const tva = ht * (Number(item.tva) / 100);
                totalHT += ht;
                totalTVA += tva;
                totalItemsRed += itemRedAmount;
                sumRedPct += itemRedRate;
            }
        }

        const totalHT_after_red = totalHT;
        const totalTVA_after_red = totalTVA;
        const final_montant_ttc = totalHT_after_red + totalTVA_after_red;

        if (clean_commande_id) {
            await assertCommandeEligibleForFactureLink(connection, Number(clean_commande_id), Number(id));
        }

        // 1. Update Facture Main Info
        await connection.execute(`
            UPDATE factures
            SET numero_facture = ?, date_facture = ?, date_echeance = ?, 
                client_id = ?, point_de_vente_id = ?, commande_id = ?, devis_id = ?, 
                statut = ?,
                montant_ht = ?, montant_tva = ?, montant_ttc = ?,
                reduction = ?, total_reduction = ?
            WHERE id = ?
        `, [
            numero_facture,
            date_facture,
            date_echeance,
            client_id,
            pdv_id,
            clean_commande_id,
            (devis_id === "" || devis_id === "none" || !devis_id) ? null : devis_id,
            final_statut,
            totalHT_after_red,
            totalTVA_after_red,
            final_montant_ttc,
            parseFloat(sumRedPct.toFixed(4)),
            totalItemsRed,
            id
        ]);

        // 2. Update Items: Delete and Insert
        if (items && Array.isArray(items)) {
            await connection.execute("DELETE FROM facture_items WHERE facture_id = ?", [id]);
            for (const item of items) {
                if (!item.produit_id && !item.designation) continue;
                await connection.execute(`
                    INSERT INTO facture_items
            (facture_id, produit_id, designation, quantite, prix_unitaire, tva, reduction, montant_ht)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
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
        res.status(200).json({ message: "Facture mise à jour" });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        const code = err.statusCode || 500;
        res.status(code).json({
            message: code === 500 ? "Internal server error" : err.message,
            error: err.message,
        });
    } finally {
        connection.release();
    }
};

/* ===============================
   DELETE FACTURE
================================= */
exports.deleteFacture = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Check ownership/existence
        let checkSql = "SELECT user_id FROM factures WHERE id = ?";
        const [rows] = await connection.execute(checkSql, [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Facture not found" });
        }
        if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
            await connection.rollback();
            return res.status(403).json({ message: "Unauthorized" });
        }

        // 1. Delete items first
        await connection.execute("DELETE FROM facture_items WHERE facture_id = ?", [id]);

        // 2. Delete the facture
        await connection.execute("DELETE FROM factures WHERE id = ?", [id]);

        await connection.commit();
        res.status(200).json({ message: "Facture supprimée" });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error deleting facture:", err);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

/* ===============================
   APPROVE FACTURE
================================= */
exports.approveFacture = async (req, res) => {
    const { id } = req.params;
    // Dynamic approval check
    const allowed = await canApprove(req.user.role, 'facture');
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour valider une facture" });
    }

    try {
        // Même logique que getAllFactures : règlements approuvés sur la facture OU sur la commande liée
        const [rows] = await db.execute(
            `SELECT f.id, f.numero_facture, f.montant_ttc, f.commande_id, c.statut AS commande_statut,
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
                          AND (rc2.facture_id IS NULL OR rc2.facture_id = 0)
                    ), 0)
                ) AS total_regle
             FROM factures f
             LEFT JOIN commandes c ON c.id = f.commande_id
             WHERE f.id = ? AND f.statut = 'en_attente'`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Facture non trouvée ou déjà validée" });
        }

        const f = rows[0];
        const montantTtc = Number(f.montant_ttc) || 0;
        const totalRegle = Number(f.total_regle) || 0;
        const st = String(f.commande_statut || "").toLowerCase();
        const cmdRegleeParStatut = st === "paye" || st === "payee" || st === "reglee";
        const regleeParMontants = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
        const nextStatut = regleeParMontants || cmdRegleeParStatut ? "payee" : "non_payee";

        // Déstockage déplacé sur la validation de commande.
        // La validation de facture ne modifie plus le stock produit.

        const [result] = await db.execute(
            "UPDATE factures SET statut = ? WHERE id = ? AND statut = 'en_attente'",
            [nextStatut, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Facture non trouvée ou déjà validée" });
        }

        res.status(200).json({ message: "Facture validée avec succès", statut: nextStatut });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

/* ===============================
   REJECT FACTURE -> NON PAYÉ
================================= */
exports.rejectFacture = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, 'facture');
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour rejeter une facture" });
    }

    try {
        // Refuser une facture la remet simplement en "non payée"
        const [result] = await db.execute(
            "UPDATE factures SET statut = 'non_payee' WHERE id = ? AND statut <> 'payee'",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Facture non trouvée ou déjà payée" });
        }

        res.status(200).json({ message: "Facture marquée comme non payée" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

/* ===============================
   REOPEN FACTURE (non_payee -> en_attente)
================================= */
exports.reopenFacture = async (req, res) => {
    const { id } = req.params;
    // Admin, responsable et directeur peuvent rouvrir les factures
    if (req.user.role !== 'admin' && req.user.role !== 'responsable' && req.user.role !== 'directeur') {
        return res.status(403).json({ message: "Seuls les administrateurs, responsables ou directeurs peuvent rouvrir les factures" });
    }

    try {
        const [rows] = await db.execute("SELECT statut FROM factures WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Facture non trouvée" });
        }

        if (rows[0].statut !== 'non_payee') {
            return res.status(400).json({ message: "Seules les factures non payées peuvent être remises en attente" });
        }

        await db.execute(
            "UPDATE factures SET statut = 'en_attente' WHERE id = ?",
            [id]
        );

        res.status(200).json({ message: "Facture rouverte et remise en attente de validation" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

/* ===============================
   MARK AS PAID
================================= */
exports.markAsPaid = async (req, res) => {
    const { id } = req.params;
    // Admin, responsable et directeur peuvent marquer les factures comme payées
    if (req.user.role !== 'admin' && req.user.role !== 'responsable' && req.user.role !== 'directeur') {
        return res.status(403).json({ message: "Seuls les administrateurs, responsables ou directeurs peuvent marquer les factures comme payées" });
    }

    try {
        const [result] = await db.execute(
            "UPDATE factures SET statut = 'payee' WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Facture non trouvée" });
        }

        res.status(200).json({ message: "Facture marquée comme payée" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

const pdfConfig = {
    type: 'FACTURE',
    title: 'FACTURE',
    infoTitle: 'Facture',
    numberField: 'numero_facture',
    dateField: 'date_facture',
    statusField: 'statut',
    defaultStatus: 'Non payée',
    footerLeft: "Merci pour votre règlement dans les délais indiqués. Toute facture non payée à échéance peut faire l'objet de pénalités."
};

const fournisseurPdfConfig = {
    type: 'FACTURE_FOURNISSEUR',
    title: 'FACTURE FOURNISSEUR',
    infoTitle: 'Facture fournisseur',
    numberField: 'numero',
    dateField: 'date_achat',
    statusField: 'statut',
    defaultStatus: 'En attente',
    footerLeft: "Document fournisseur transmis dans le cadre de la déclaration fiscale.",
};

let factureEmailHistorySchemaReady = false;
const ensureFactureEmailHistoryTable = async () => {
    if (factureEmailHistorySchemaReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS facture_email_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            recipients TEXT NULL,
            subject TEXT NULL,
            message TEXT NULL,
            facture_ids_json LONGTEXT NULL,
            results_json LONGTEXT NULL,
            sent_count INT NOT NULL DEFAULT 0,
            failed_count INT NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'success',
            date_from DATE NULL,
            date_to DATE NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    const [colsFrom] = await db.query("SHOW COLUMNS FROM facture_email_history LIKE 'date_from'");
    if (!Array.isArray(colsFrom) || colsFrom.length === 0) {
        await db.query("ALTER TABLE facture_email_history ADD COLUMN date_from DATE NULL AFTER status");
    }
    const [colsTo] = await db.query("SHOW COLUMNS FROM facture_email_history LIKE 'date_to'");
    if (!Array.isArray(colsTo) || colsTo.length === 0) {
        await db.query("ALTER TABLE facture_email_history ADD COLUMN date_to DATE NULL AFTER date_from");
    }
    const [colsSupplier] = await db.query("SHOW COLUMNS FROM facture_email_history LIKE 'fournisseur_facture_ids_json'");
    if (!Array.isArray(colsSupplier) || colsSupplier.length === 0) {
        await db.query("ALTER TABLE facture_email_history ADD COLUMN fournisseur_facture_ids_json LONGTEXT NULL AFTER facture_ids_json");
    }
    factureEmailHistorySchemaReady = true;
};

exports.sendFactureEmail = async (req, res) => {
    const { id } = req.params;
    const { to, subject, message } = req.body;

    if (!to) {
        return res.status(400).json({ message: "Le destinataire est requis" });
    }

    try {
        const [rows] = await db.execute(`
            SELECT f.*,
                   cl.nom_complet AS client_nom,
                   cl.\`type\` as client_type,
                   cl.ice as client_ice,
                   cl.telephone as client_telephone,
                   cl.email as client_email,
                   cl.adresse as client_adresse,
                   c.point_de_vente_id AS point_de_vente_id_from_commande,
                   (
                       SELECT pv.logo
                       FROM point_de_vente pv
                       WHERE pv.id = COALESCE(
                           (
                               SELECT p.id_point_de_vente
                               FROM facture_items fi
                               INNER JOIN products p ON fi.produit_id = p.id
                               WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                               ORDER BY fi.id
                               LIMIT 1
                           ),
                           f.point_de_vente_id,
                           c.point_de_vente_id
                       )
                       LIMIT 1
                   ) AS point_de_vente_logo
            FROM factures f
            LEFT JOIN clients cl ON f.client_id = cl.id
            LEFT JOIN commandes c ON c.id = f.commande_id
            WHERE f.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Facture introuvable" });
        }

        const [items] = await db.execute(`
            SELECT fi.*, p.photo, p.grammage, COALESCE(p.nom, fi.designation) as designation 
            FROM facture_items fi
            LEFT JOIN products p ON fi.produit_id = p.id
            WHERE fi.facture_id = ?
        `, [id]);

        const docData = rows[0];
        const [pdvRows] = await db.execute(
            `
            SELECT COALESCE(
                (
                    SELECT p.id_point_de_vente
                    FROM facture_items fi
                    INNER JOIN products p ON fi.produit_id = p.id
                    WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                    ORDER BY fi.id
                    LIMIT 1
                ),
                f.point_de_vente_id,
                c.point_de_vente_id
            ) AS resolved_point_de_vente_id
            FROM factures f
            LEFT JOIN commandes c ON c.id = f.commande_id
            WHERE f.id = ?
        `,
            [id]
        );
        if (Array.isArray(pdvRows) && pdvRows.length > 0) {
            docData.point_de_vente_id = pdvRows[0].resolved_point_de_vente_id || docData.point_de_vente_id || null;
        }

        const [reglementsRows] = await db.execute(
            `
            SELECT id, facture_id, commande_id, date_reglement, created_at, mode_paiement, montant, statut
            FROM reglements_clients
            WHERE (facture_id = ? OR (commande_id = ? AND commande_id IS NOT NULL))
            ORDER BY COALESCE(date_reglement, created_at) DESC, id DESC
        `,
            [id, docData.commande_id || null]
        );

        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(
            {
                ...docData,
                reglements: Array.isArray(reglementsRows) ? reglementsRows : [],
            },
            items,
            pdfConfig
        );

        const emailSubject = subject || `[Facture] ${docData.numero_facture}`;
        const emailText = message || `Veuillez trouver ci-joint la facture ${docData.numero_facture}.`;

        const { sendMail } = require("../services/emailService");
        await sendMail(to, emailSubject, emailText, [
            { filename: `Facture_${docData.numero_facture}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
        ]);

        res.status(200).json({ message: "Email envoyé avec succès" });
    } catch (error) {
        console.error("Error sending facture email:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
    }
};

exports.sendFacturesBulkEmail = async (req, res) => {
    const { factureIds, fournisseurFactureIds, recipients, subject, message, dateFrom, dateTo } = req.body || {};

    const ids = Array.isArray(factureIds)
        ? factureIds.map((x) => Number(x)).filter((x) => Number.isFinite(x))
        : [];
    const supplierIds = Array.isArray(fournisseurFactureIds)
        ? fournisseurFactureIds.map((x) => Number(x)).filter((x) => Number.isFinite(x))
        : [];
    const toListRaw = Array.isArray(recipients)
        ? recipients
        : String(recipients || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
    const toList = [...new Set(toListRaw.map((x) => x.toLowerCase()))];

    if (ids.length === 0 && supplierIds.length === 0) {
        return res.status(400).json({ message: "Aucune facture sélectionnée." });
    }
    if (toList.length === 0) {
        return res.status(400).json({ message: "Veuillez renseigner au moins un destinataire." });
    }

    const { buildGenericPdf } = require("../services/pdfGeneratorService");
    const { sendMail } = require("../services/emailService");
    await ensureFactureEmailHistoryTable();
    const safeDateFrom =
        typeof dateFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : null;
    const safeDateTo =
        typeof dateTo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : null;

    const processOneFacture = async (id) => {
        try {
            const [rows] = await db.execute(
                `
                SELECT f.*,
                       cl.nom_complet AS client_nom,
                       cl.\`type\` as client_type,
                       cl.ice as client_ice,
                       cl.telephone as client_telephone,
                       cl.email as client_email,
                       cl.adresse as client_adresse
                FROM factures f
                LEFT JOIN clients cl ON f.client_id = cl.id
                WHERE f.id = ?
            `,
                [id]
            );

            if (!rows.length) {
                return { facture_id: id, success: false, error: "Facture introuvable" };
            }

            const [items] = await db.execute(
                `
                SELECT fi.*, p.photo, p.grammage, COALESCE(p.nom, fi.designation) as designation
                FROM facture_items fi
                LEFT JOIN products p ON fi.produit_id = p.id
                WHERE fi.facture_id = ?
            `,
                [id]
            );

            const docData = rows[0];
            const pdfBuffer = await buildGenericPdf(docData, items, pdfConfig);
            const emailSubject = (subject || "").trim() || `[Facture] ${docData.numero_facture}`;
            const emailText =
                (message || "").trim() || `Veuillez trouver ci-joint la facture ${docData.numero_facture}.`;

            await sendMail(toList, emailSubject, emailText, [
                {
                    filename: `Facture_${docData.numero_facture}.pdf`,
                    content: pdfBuffer,
                    contentType: "application/pdf",
                },
            ]);

            return {
                facture_id: id,
                numero_facture: docData.numero_facture,
                success: true,
            };
        } catch (error) {
            console.error("Bulk facture email error:", error);
            return {
                facture_id: id,
                success: false,
                error: "Échec de l'envoi",
            };
        }
    };

    const processOneFournisseurFacture = async (id) => {
        try {
            const [rows] = await db.execute(
                `
                SELECT af.*,
                       f.nom AS fournisseur_nom,
                       f.ice AS fournisseur_ice,
                       f.telephone AS fournisseur_telephone,
                       f.email AS fournisseur_email,
                       f.adresse AS fournisseur_adresse,
                       COALESCE(af.designation_libre, p.nom) AS produit_nom
                FROM achats_fournisseurs af
                LEFT JOIN fournisseur f ON af.fournisseur_id = f.id
                LEFT JOIN products p ON af.product_id = p.id
                WHERE af.id = ?
            `,
                [id]
            );

            if (!rows.length) {
                return { type: "fournisseur", facture_id: id, success: false, error: "Facture fournisseur introuvable" };
            }

            const docDataBase = rows[0];
            const uploadedFilename = String(docDataBase.facture_fournisseur || "").trim();
            const uploadedPath = getUploadedSupplierInvoicePath(uploadedFilename);
            if (uploadedFilename && uploadedPath && fs.existsSync(uploadedPath)) {
                const emailSubject =
                    (subject || "").trim() ||
                    `[Facture fournisseur] ${docDataBase.numero || `Achat #${docDataBase.id}`}`;
                const emailText =
                    (message || "").trim() ||
                    `Veuillez trouver ci-joint la facture fournisseur ${docDataBase.numero || `#${docDataBase.id}`}.`;
                const uploadedBuffer = fs.readFileSync(uploadedPath);
                await sendMail(toList, emailSubject, emailText, [
                    {
                        filename: uploadedFilename,
                        content: uploadedBuffer,
                        contentType: "application/pdf",
                    },
                ]);
                return {
                    type: "fournisseur",
                    facture_id: id,
                    numero_facture: docDataBase.numero || null,
                    success: true,
                };
            }

            const [itemsRows] = await db.execute(
                `
                SELECT af.*,
                       COALESCE(af.designation_libre, p.nom) AS designation
                FROM achats_fournisseurs af
                LEFT JOIN products p ON af.product_id = p.id
                WHERE af.numero = ?
                ORDER BY af.id ASC
            `,
                [docDataBase.numero]
            );

            const items = (itemsRows || []).map((it) => {
                const qte = Number(it.quantite || 0);
                const pu = Number(it.prix_unitaire || 0);
                const montantHt = qte * pu;
                return {
                    designation: it.designation || "Article",
                    quantite: qte,
                    prix_unitaire: pu,
                    tva: Number(it.tva || 0),
                    reduction: 0,
                    montant_ht: montantHt,
                };
            });

            const montantHt = items.reduce((sum, it) => sum + Number(it.montant_ht || 0), 0);
            const montantTva = items.reduce(
                (sum, it) => sum + (Number(it.montant_ht || 0) * Number(it.tva || 0)) / 100,
                0
            );
            const montantTtc = montantHt + montantTva;

            const docData = {
                ...docDataBase,
                client_nom: docDataBase.fournisseur_nom || "Fournisseur",
                client_type: "fournisseur",
                client_ice: docDataBase.fournisseur_ice || null,
                client_telephone: docDataBase.fournisseur_telephone || null,
                client_email: docDataBase.fournisseur_email || null,
                client_adresse: docDataBase.fournisseur_adresse || null,
                montant_ht: montantHt,
                montant_tva: montantTva,
                montant_ttc: montantTtc,
                reduction: 0,
                total_reduction: 0,
            };

            const pdfBuffer = await buildGenericPdf(docData, items, fournisseurPdfConfig);
            const emailSubject =
                (subject || "").trim() || `[Facture fournisseur] ${docData.numero || `Achat #${docData.id}`}`;
            const emailText =
                (message || "").trim() ||
                `Veuillez trouver ci-joint la facture fournisseur ${docData.numero || `#${docData.id}`}.`;

            await sendMail(toList, emailSubject, emailText, [
                {
                    filename: `Facture_Fournisseur_${docData.numero || docData.id}.pdf`,
                    content: pdfBuffer,
                    contentType: "application/pdf",
                },
            ]);

            return {
                type: "fournisseur",
                facture_id: id,
                numero_facture: docData.numero || null,
                success: true,
            };
        } catch (error) {
            console.error("Bulk fournisseur facture email error:", error);
            return {
                type: "fournisseur",
                facture_id: id,
                success: false,
                error: "Échec de l'envoi",
            };
        }
    };

    // Exécute les envois en parallèle par lot (concurrency limitée) pour réduire le temps total.
    const BATCH_SIZE = 4;
    const results = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batchIds = ids.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batchIds.map((id) => processOneFacture(id)));
        results.push(...batchResults);
    }
    for (let i = 0; i < supplierIds.length; i += BATCH_SIZE) {
        const batchIds = supplierIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batchIds.map((id) => processOneFournisseurFacture(id))
        );
        results.push(...batchResults);
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.length - sent;
    const finalStatus = failed > 0 ? (sent > 0 ? "partial" : "failed") : "success";

    try {
        await db.query(
            `INSERT INTO facture_email_history
            (user_id, recipients, subject, message, facture_ids_json, fournisseur_facture_ids_json, results_json, sent_count, failed_count, status, date_from, date_to)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user?.id || null,
                JSON.stringify(toList),
                String(subject || ""),
                String(message || ""),
                JSON.stringify(ids),
                JSON.stringify(supplierIds),
                JSON.stringify(results),
                sent,
                failed,
                finalStatus,
                safeDateFrom,
                safeDateTo,
            ]
        );
    } catch (e) {
        console.error("Failed to store facture email history:", e);
    }

    return res.status(200).json({
        message: failed > 0 ? "Envoi terminé avec des erreurs." : "Envoi terminé avec succès.",
        summary: { total: results.length, sent, failed, status: finalStatus },
        results,
    });
};

exports.getFactureEmailHistory = async (req, res) => {
    try {
        await ensureFactureEmailHistoryTable();
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
        const [rows] = await db.query(
            `SELECT id, user_id, recipients, subject, message, facture_ids_json, fournisseur_facture_ids_json, results_json,
                    sent_count, failed_count, status, date_from, date_to, created_at
             FROM facture_email_history
             ORDER BY id DESC
             LIMIT ?`,
            [limit]
        );

        const mapped = (rows || []).map((r) => {
            let recipients = [];
            let facture_ids = [];
            let fournisseur_facture_ids = [];
            let results = [];
            try { recipients = JSON.parse(r.recipients || "[]"); } catch {}
            try { facture_ids = JSON.parse(r.facture_ids_json || "[]"); } catch {}
            try { fournisseur_facture_ids = JSON.parse(r.fournisseur_facture_ids_json || "[]"); } catch {}
            try { results = JSON.parse(r.results_json || "[]"); } catch {}
            return {
                id: r.id,
                user_id: r.user_id,
                recipients,
                subject: r.subject || "",
                message: r.message || "",
                facture_ids,
                fournisseur_facture_ids,
                results,
                sent_count: Number(r.sent_count || 0),
                failed_count: Number(r.failed_count || 0),
                status: r.status || "success",
                date_from: r.date_from || null,
                date_to: r.date_to || null,
                created_at: r.created_at,
            };
        });

        return res.status(200).json(mapped);
    } catch (error) {
        console.error("Error fetching facture email history:", error);
        return res.status(500).json({ message: "Erreur lors de la récupération de l'historique." });
    }
};

exports.downloadFacturePdf = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.execute(`
            SELECT f.*,
                   cl.nom_complet AS client_nom,
                   cl.\`type\` as client_type,
                   cl.ice as client_ice,
                   cl.telephone as client_telephone,
                   cl.email as client_email,
                   cl.adresse as client_adresse,
                   (
                       SELECT ssn.NOM_SOUS_SOCIETE
                       FROM sous_societe ssn
                       WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(f.numero_facture, '-', 2), '-', -1))
                       ORDER BY ssn.ID
                       LIMIT 1
                   ) AS sous_societe_nom_from_numero
            FROM factures f
            LEFT JOIN clients cl ON f.client_id = cl.id
            WHERE f.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Facture introuvable" });
        }

        const [items] = await db.execute(`
            SELECT fi.*, p.photo, p.grammage, COALESCE(p.nom, fi.designation) as designation 
            FROM facture_items fi
            LEFT JOIN products p ON fi.produit_id = p.id
            WHERE fi.facture_id = ?
        `, [id]);

        const docData = rows[0];
        const [pdvRows] = await db.execute(
            `
            SELECT
                COALESCE(
                    (
                        SELECT p.id_point_de_vente
                        FROM facture_items fi
                        INNER JOIN products p ON fi.produit_id = p.id
                        WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                        ORDER BY fi.id
                        LIMIT 1
                    ),
                    (
                        SELECT pvn.id
                        FROM point_de_vente pvn
                        INNER JOIN sous_societe ssn ON ssn.ID = pvn.id_sous_gestionnaire
                        WHERE UPPER(LEFT(TRIM(ssn.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(f.numero_facture, '-', 2), '-', -1))
                        ORDER BY pvn.id
                        LIMIT 1
                    ),
                    f.point_de_vente_id,
                    c.point_de_vente_id
                ) AS resolved_point_de_vente_id,
                (
                    SELECT pv.logo
                    FROM point_de_vente pv
                    WHERE pv.id = COALESCE(
                        (
                            SELECT p2.id_point_de_vente
                            FROM facture_items fi2
                            INNER JOIN products p2 ON fi2.produit_id = p2.id
                            WHERE fi2.facture_id = f.id AND p2.id_point_de_vente IS NOT NULL
                            ORDER BY fi2.id
                            LIMIT 1
                        ),
                        (
                            SELECT pvn2.id
                            FROM point_de_vente pvn2
                            INNER JOIN sous_societe ssn2 ON ssn2.ID = pvn2.id_sous_gestionnaire
                            WHERE UPPER(LEFT(TRIM(ssn2.NOM_SOUS_SOCIETE), 1)) = UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(f.numero_facture, '-', 2), '-', -1))
                            ORDER BY pvn2.id
                            LIMIT 1
                        ),
                        f.point_de_vente_id,
                        c.point_de_vente_id
                    )
                    LIMIT 1
                ) AS resolved_point_de_vente_logo
            FROM factures f
            LEFT JOIN commandes c ON c.id = f.commande_id
            WHERE f.id = ?
        `,
            [id]
        );
        if (Array.isArray(pdvRows) && pdvRows.length > 0) {
            docData.point_de_vente_id = pdvRows[0].resolved_point_de_vente_id || docData.point_de_vente_id || null;
            docData.point_de_vente_logo = pdvRows[0].resolved_point_de_vente_logo || docData.point_de_vente_logo || null;
        }
        docData.sous_societe_nom =
            docData.sous_societe_nom ||
            docData.sous_societe_nom_from_numero ||
            null;
        console.log("[Facture][download][pdv_resolved]", {
            id: docData.id,
            numero_facture: docData.numero_facture,
            point_de_vente_id: docData.point_de_vente_id || null,
            point_de_vente_logo: docData.point_de_vente_logo || null,
        });

        const [reglementsRows] = await db.execute(
            `
            SELECT id, facture_id, commande_id, date_reglement, created_at, mode_paiement, montant, statut
            FROM reglements_clients
            WHERE (facture_id = ? OR (commande_id = ? AND commande_id IS NOT NULL))
            ORDER BY COALESCE(date_reglement, created_at) DESC, id DESC
        `,
            [id, docData.commande_id || null]
        );

        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(
            {
                ...docData,
                reglements: Array.isArray(reglementsRows) ? reglementsRows : [],
            },
            items,
            pdfConfig
        );

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=Facture_${docData.numero_facture}.pdf`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating facture PDF for download:", error);
        res.status(500).json({ message: "Erreur serveur lors de la génération du PDF" });
    }
};

exports.downloadFournisseurFacturePdf = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.execute(
            `
            SELECT af.*,
                   f.nom AS fournisseur_nom,
                   f.ice AS fournisseur_ice,
                   f.telephone AS fournisseur_telephone,
                   f.email AS fournisseur_email,
                   f.adresse AS fournisseur_adresse,
                   COALESCE(af.designation_libre, p.nom) AS produit_nom
            FROM achats_fournisseurs af
            LEFT JOIN fournisseur f ON af.fournisseur_id = f.id
            LEFT JOIN products p ON af.product_id = p.id
            WHERE af.id = ?
        `,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Facture fournisseur introuvable" });
        }

        const docDataBase = rows[0];
        const uploadedFilename = String(docDataBase.facture_fournisseur || "").trim();
        const uploadedPath = getUploadedSupplierInvoicePath(uploadedFilename);
        if (uploadedFilename && uploadedPath && fs.existsSync(uploadedPath)) {
            return res.download(uploadedPath, uploadedFilename);
        }

        const [itemsRows] = await db.execute(
            `
            SELECT af.*,
                   COALESCE(af.designation_libre, p.nom) AS designation
            FROM achats_fournisseurs af
            LEFT JOIN products p ON af.product_id = p.id
            WHERE af.numero = ?
            ORDER BY af.id ASC
        `,
            [docDataBase.numero]
        );

        const items = (itemsRows || []).map((it) => {
            const qte = Number(it.quantite || 0);
            const pu = Number(it.prix_unitaire || 0);
            const montantHt = qte * pu;
            return {
                designation: it.designation || "Article",
                quantite: qte,
                prix_unitaire: pu,
                tva: Number(it.tva || 0),
                reduction: 0,
                montant_ht: montantHt,
            };
        });

        const montantHt = items.reduce((sum, it) => sum + Number(it.montant_ht || 0), 0);
        const montantTva = items.reduce(
            (sum, it) => sum + (Number(it.montant_ht || 0) * Number(it.tva || 0)) / 100,
            0
        );
        const montantTtc = montantHt + montantTva;

        const docData = {
            ...docDataBase,
            client_nom: docDataBase.fournisseur_nom || "Fournisseur",
            client_type: "fournisseur",
            client_ice: docDataBase.fournisseur_ice || null,
            client_telephone: docDataBase.fournisseur_telephone || null,
            client_email: docDataBase.fournisseur_email || null,
            client_adresse: docDataBase.fournisseur_adresse || null,
            montant_ht: montantHt,
            montant_tva: montantTva,
            montant_ttc: montantTtc,
            reduction: 0,
            total_reduction: 0,
        };

        const { buildGenericPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildGenericPdf(docData, items, fournisseurPdfConfig);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=Facture_Fournisseur_${docData.numero || docData.id}.pdf`
        );
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating fournisseur facture PDF for download:", error);
        res.status(500).json({ message: "Erreur serveur lors de la génération du PDF fournisseur" });
    }
};
