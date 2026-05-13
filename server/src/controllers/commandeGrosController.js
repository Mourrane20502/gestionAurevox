const db = require("../config/db").promise();
const { formatDocumentNumber } = require("../utils/documentFormatter");
const { getNextNumber } = require("../utils/numberingSettings");
const { canApprove } = require("../utils/approvalSettings");
const { logProductMovement } = require("../utils/productMovementLogger");

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

exports.createCommandeGros = async (req, res) => {
    const { date_commande, client_id, point_de_vente_id, items, devis_gros_id, banque_id, mode_paiement, statut } =
        req.body;
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        let effectiveClientId = client_id;
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

        const [client] = await connection.execute("SELECT id FROM clients WHERE id = ?", [effectiveClientId]);
        if (client.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Client not found" });
        }

        let pdv_id = point_de_vente_id;

        let finalDevisGrosId =
            devis_gros_id && devis_gros_id !== "" && devis_gros_id !== "none"
                ? Number(devis_gros_id)
                : null;
        if (finalDevisGrosId) {
            const [dg] = await connection.execute("SELECT id, client_id FROM devis_gros WHERE id = ?", [
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

        const finalModePaiement =
            mode_paiement != null && String(mode_paiement).trim() !== ""
                ? String(mode_paiement).trim()
                : "virement";

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
        const bodyPdvId = Number(pdv_id);
        const pdvFromItems = await resolvePointDeVenteFromItems(connection, items);
        if (pdvFromItems) {
            pdv_id = pdvFromItems;
        } else if (Number.isFinite(bodyPdvId) && bodyPdvId > 0) {
            pdv_id = bodyPdvId;
        } else {
            const [pdvs] = await connection.query("SELECT id FROM point_de_vente LIMIT 1");
            pdv_id = pdvs.length > 0 ? pdvs[0].id : 1;
        }

        const totalGrammage = sumGrammage(items);
        const { normalizedItems, totals } = computeFinance(items);

        const finalStatut = "en_attente";

        // Traçabilité (comme commandes classiques) : créer un devis gros en arrière-plan si aucun n'est lié
        if (!finalDevisGrosId) {
            try {
                const dateDevis = date_commande || new Date().toISOString().split("T")[0];
                const [devisResult] = await connection.execute(
                    `
                    INSERT INTO devis_gros
                    (numero_devis, date_devis, grammage, prix_total, reduction, montant_ht, taux_tva, montant_tva, montant_ttc, user_id, client_id, statuts_devis)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    [
                        `TEMP-${Date.now()}`,
                        dateDevis,
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
                const traceDevisGrosId = devisResult.insertId;
                const sousSocieteDevis = await resolveSousSocieteFromItems(connection, items);
                // DG partage la même séquence que DE (paramètres Settings)
                const seqDg = await getNextNumber("DE", traceDevisGrosId, connection, {
                    sousSocieteId: sousSocieteDevis.id,
                });
                const finalDevisNumero = formatDocumentNumber("DG", seqDg, new Date(), {
                    sousSocieteNom: sousSocieteDevis.nom,
                });
                await connection.execute("UPDATE devis_gros SET numero_devis = ? WHERE id = ?", [
                    finalDevisNumero,
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
                finalDevisGrosId = traceDevisGrosId;
            } catch (devisErr) {
                console.error("[commandeGros][traceability devis gros]", devisErr.message);
            }
        }

        const [result] = await connection.execute(
            `
            INSERT INTO commandes_gros
            (numero_commande, date_commande, grammage, prix_total, reduction, montant_ht, taux_tva, montant_tva, montant_ttc, client_id, user_id, point_de_vente_id, devis_gros_id, banque_id, mode_paiement, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                `TEMP-${Date.now()}`,
                date_commande || new Date().toISOString().split("T")[0],
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
                finalDevisGrosId,
                finalBanqueId,
                finalModePaiement,
                finalStatut,
            ]
        );

        const commandeGrosId = result.insertId;

        const fromItems = await resolveSousSocieteFromItems(connection, items);
        const fromPdv = await resolveSousSocieteFromPdv(connection, pdv_id);
        const sousSociete = fromItems.id ? fromItems : fromPdv;
        // CG partage la même séquence que CO (paramètres Settings)
        const seqNumber = await getNextNumber("CO", commandeGrosId, connection, {
            sousSocieteId: sousSociete.id,
        });
        const final_numero = formatDocumentNumber("CG", seqNumber, new Date(), { sousSocieteNom: sousSociete.nom });
        await connection.execute("UPDATE commandes_gros SET numero_commande = ? WHERE id = ?", [
            final_numero,
            commandeGrosId,
        ]);

        const rowsItems = normalizedItems.map((item) => [
            commandeGrosId,
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
            [rowsItems]
        );

        // Trace création de lignes commande gros (pas de déstockage à ce stade).
        for (const item of normalizedItems) {
            if (!item.produit_id) continue;
            const [prodNow] = await connection.execute("SELECT grammage FROM products WHERE id = ?", [
                item.produit_id,
            ]);
            const grammageNow = prodNow.length > 0 ? Number(prodNow[0].grammage) : null;
            await logProductMovement(
                {
                    productId: item.produit_id,
                    type: "commande_gros_creation",
                    quantityBefore: grammageNow,
                    quantityAfter: grammageNow,
                    description:
                        "Ligne ajoutée dans une commande gros (pas de déstockage avant facturation)",
                    userId: req.user.id,
                    referenceType: "commande_gros",
                    referenceId: commandeGrosId,
                    referenceNumero: final_numero,
                },
                connection
            );
        }

        await connection.commit();
        res.status(201).json({
            message: "Commande gros créée",
            id: commandeGrosId,
            numero_commande: final_numero,
        });
    } catch (error) {
        await connection.rollback();
        console.error("[commandeGros][create]", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.getAllCommandeGros = async (req, res) => {
    try {
        let sql = `
            SELECT
                cg.*,
                c.nom_complet AS client_nom,
                CONCAT(u.prenom, ' ', u.nom) AS user_nom,
                pv.nom AS point_de_vente_nom,
                ss.NOM_SOUS_SOCIETE AS sous_societe_nom,
                dg.numero_devis AS devis_gros_numero,
                EXISTS(SELECT 1 FROM factures_gros fg WHERE fg.commande_gros_id = cg.id LIMIT 1) AS has_facture_gros_link,
                (
                    SELECT fg.id
                    FROM factures_gros fg
                    WHERE fg.commande_gros_id = cg.id
                    ORDER BY fg.id DESC
                    LIMIT 1
                ) AS linked_facture_gros_id
            FROM commandes_gros cg
            LEFT JOIN clients c ON cg.client_id = c.id
            LEFT JOIN users u ON cg.user_id = u.id
            LEFT JOIN point_de_vente pv ON cg.point_de_vente_id = pv.id
            LEFT JOIN sous_societe ss ON ss.ID = pv.id_sous_gestionnaire
            LEFT JOIN devis_gros dg ON cg.devis_gros_id = dg.id
        `;
        const params = [];
        const allowedToApprove = await canApprove(req.user.role, "commande");
        if (req.user.role !== "admin" && req.user.role !== "directeur" && req.user.role !== "responsable") {
            if (allowedToApprove) {
                sql += " WHERE (cg.user_id = ? OR cg.statut = 'en_attente')";
                params.push(req.user.id);
            } else {
                sql += " WHERE cg.user_id = ?";
                params.push(req.user.id);
            }
        }
        sql += " ORDER BY cg.id DESC";
        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getCommandeGrosById = async (req, res) => {
    const { id } = req.params;
    try {
        const [cmdRows] = await db.execute(
            `
            SELECT cg.*, c.nom_complet AS client_nom, pv.nom AS point_de_vente_nom, dg.numero_devis AS devis_gros_numero,
                   b.nom_banque AS banque_nom,
                   CONCAT(u.prenom, ' ', u.nom) AS user_nom
            FROM commandes_gros cg
            LEFT JOIN clients c ON cg.client_id = c.id
            LEFT JOIN point_de_vente pv ON cg.point_de_vente_id = pv.id
            LEFT JOIN devis_gros dg ON cg.devis_gros_id = dg.id
            LEFT JOIN banques b ON cg.banque_id = b.id
            LEFT JOIN users u ON cg.user_id = u.id
            WHERE cg.id = ?
            `,
            [id]
        );
        if (cmdRows.length === 0) {
            return res.status(404).json({ message: "Commande gros introuvable" });
        }
        const [itemRows] = await db.execute(
            `
            SELECT ci.*, p.nom AS produit_nom, p.reference
            FROM commandes_gros_items ci
            LEFT JOIN products p ON ci.produit_id = p.id
            WHERE ci.commande_gros_id = ?
            ORDER BY ci.id
            `,
            [id]
        );
        res.status(200).json({ ...cmdRows[0], items: itemRows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateCommandeGros = async (req, res) => {
    const { id } = req.params;
    const { date_commande, client_id, point_de_vente_id, items, devis_gros_id, banque_id, mode_paiement, statut } =
        req.body;
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [existing] = await connection.execute("SELECT id, user_id FROM commandes_gros WHERE id = ?", [id]);
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Commande gros introuvable" });
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
        const bodyPdvId = Number(pdv_id);
        const pdvFromItems = await resolvePointDeVenteFromItems(connection, items);
        if (pdvFromItems) {
            pdv_id = pdvFromItems;
        } else if (Number.isFinite(bodyPdvId) && bodyPdvId > 0) {
            pdv_id = bodyPdvId;
        } else {
            const [pdvs] = await connection.query("SELECT id FROM point_de_vente LIMIT 1");
            pdv_id = pdvs.length > 0 ? pdvs[0].id : 1;
        }

        let finalDevisGrosId =
            devis_gros_id && devis_gros_id !== "" && devis_gros_id !== "none"
                ? Number(devis_gros_id)
                : null;
        if (finalDevisGrosId) {
            const [dg] = await connection.execute("SELECT client_id FROM devis_gros WHERE id = ?", [finalDevisGrosId]);
            if (dg.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Devis gros introuvable" });
            }
            if (Number(dg[0].client_id) !== Number(client_id)) {
                await connection.rollback();
                return res.status(400).json({ message: "Le devis gros doit être pour le même client" });
            }
        }

        const finalBanqueId =
            banque_id === "" || banque_id === "none" || !banque_id ? null : Number(banque_id);

        const finalModePaiementUpdate =
            mode_paiement != null && String(mode_paiement).trim() !== ""
                ? String(mode_paiement).trim()
                : "virement";

        const totalGrammage = sumGrammage(items);
        const { normalizedItems, totals } = computeFinance(items);

        const allowedToApprove = await canApprove(req.user.role, "commande");
        let statutParam = null;
        if (req.user.role === "admin" || allowedToApprove) {
            if (statut != null && statut !== "") statutParam = statut;
        }

        await connection.execute(
            `
            UPDATE commandes_gros
            SET date_commande = ?, grammage = ?, prix_total = ?, reduction = ?, montant_ht = ?, taux_tva = ?, montant_tva = ?, montant_ttc = ?, client_id = ?, point_de_vente_id = ?,
                devis_gros_id = ?, banque_id = ?, mode_paiement = ?, statut = COALESCE(?, statut)
            WHERE id = ?
            `,
            [
                date_commande || new Date().toISOString().split("T")[0],
                totalGrammage,
                totals.prix_total,
                totals.reduction,
                totals.montant_ht,
                totals.taux_tva,
                totals.montant_tva,
                totals.montant_ttc,
                client_id,
                pdv_id,
                finalDevisGrosId,
                finalBanqueId,
                finalModePaiementUpdate,
                statutParam,
                id,
            ]
        );

        await connection.execute("DELETE FROM commandes_gros_items WHERE commande_gros_id = ?", [id]);
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
            "INSERT INTO commandes_gros_items (commande_gros_id, produit_id, designation, grammage, prix_unitaire, reduction, montant_ht, taux_tva, montant_tva, montant_ttc) VALUES ?",
            [rowsItems]
        );

        await connection.commit();
        res.status(200).json({ message: "Commande gros mise à jour" });
    } catch (error) {
        await connection.rollback();
        console.error("[commandeGros][update]", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.deleteCommandeGros = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute("SELECT user_id FROM commandes_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Commande gros introuvable" });
        }
        if (req.user.role !== "admin" && rows[0].user_id !== req.user.id) {
            return res.status(403).json({ message: "Non autorisé" });
        }
        await db.execute("DELETE FROM commandes_gros WHERE id = ?", [id]);
        res.status(200).json({ message: "Supprimé" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.approveCommandeGros = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, "commande");
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour valider une commande gros" });
    }
    try {
        const [rows] = await db.execute("SELECT id, statut FROM commandes_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Commande gros introuvable" });
        }
        if (rows[0].statut !== "en_attente") {
            return res.status(400).json({ message: "Cette commande gros n'est plus en attente" });
        }
        await db.execute("UPDATE commandes_gros SET statut = 'validee' WHERE id = ?", [id]);
        res.status(200).json({ message: "Commande gros validée" });
    } catch (error) {
        console.error("[commandeGros][approve]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.rejectCommandeGros = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, "commande");
    if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas les droits pour rejeter une commande gros" });
    }
    try {
        const [rows] = await db.execute("SELECT id, statut FROM commandes_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Commande gros introuvable" });
        }
        if (rows[0].statut !== "en_attente") {
            return res.status(400).json({ message: "Cette commande gros n'est plus en attente" });
        }
        await db.execute("UPDATE commandes_gros SET statut = 'refusee' WHERE id = ?", [id]);
        res.status(200).json({ message: "Commande gros rejetée" });
    } catch (error) {
        console.error("[commandeGros][reject]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
