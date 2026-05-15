const db = require("../config/db").promise();
const { formatDocumentNumber } = require("../utils/documentFormatter");
const { getNextNumber } = require("../utils/numberingSettings");
const { canApprove, resolveCreationApprovalStatut } = require("../utils/approvalSettings");

const { isGrosProductRow } = require("../utils/grosProduct");

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

function aggregateByProduct(items) {
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

async function addGrammageToProducts(connection, itemsByProductMap) {
    for (const [pid, totalG] of itemsByProductMap) {
        await connection.execute(
            "UPDATE products SET grammage = grammage + ? WHERE id = ? AND pricing_metal IN ('or','silver')",
            [totalG, pid]
        );
    }
}

async function subtractGrammageFromProducts(connection, itemsByProductMap) {
    for (const [pid, totalG] of itemsByProductMap) {
        const [rows] = await connection.execute(
            "SELECT grammage, pricing_metal FROM products WHERE id = ? FOR UPDATE",
            [pid]
        );
        if (rows.length === 0) continue;
        if (!isGrosProductRow(rows[0])) continue;
        const current = Number(rows[0].grammage) || 0;
        if (current + 1e-8 < totalG) {
            const err = new Error(`Grammage insuffisant pour le produit (id ${pid})`);
            err.statusCode = 400;
            throw err;
        }
        await connection.execute(
            "UPDATE products SET grammage = grammage - ? WHERE id = ? AND pricing_metal IN ('or','silver')",
            [totalG, pid]
        );
    }
}

async function resolveSousSociete(connection, factureGrosId, commandeGrosId) {
    const fgId = Number(factureGrosId);
    if (Number.isFinite(fgId) && fgId > 0) {
        const [rows] = await connection.execute(
            `SELECT pdv.id_sous_gestionnaire, ss.NOM_SOUS_SOCIETE
             FROM factures_gros fg
             LEFT JOIN point_de_vente pdv ON pdv.id = fg.point_de_vente_id
             LEFT JOIN sous_societe ss ON ss.ID = pdv.id_sous_gestionnaire
             WHERE fg.id = ? LIMIT 1`,
            [fgId]
        );
        if (rows.length > 0) return { id: rows[0].id_sous_gestionnaire || null, nom: rows[0].NOM_SOUS_SOCIETE || null };
    }
    const cgId = Number(commandeGrosId);
    if (Number.isFinite(cgId) && cgId > 0) {
        const [rows] = await connection.execute(
            `SELECT pdv.id_sous_gestionnaire, ss.NOM_SOUS_SOCIETE
             FROM commandes_gros cg
             LEFT JOIN point_de_vente pdv ON pdv.id = cg.point_de_vente_id
             LEFT JOIN sous_societe ss ON ss.ID = pdv.id_sous_gestionnaire
             WHERE cg.id = ? LIMIT 1`,
            [cgId]
        );
        if (rows.length > 0) return { id: rows[0].id_sous_gestionnaire || null, nom: rows[0].NOM_SOUS_SOCIETE || null };
    }
    return { id: null, nom: null };
}

function computeFinance(items) {
    const normalizedItems = items.map((it) => {
        const grammage = Number(it.grammage) || 0;
        const prix_unitaire = Number(it.prix_unitaire) || 0;
        const reduction = Math.min(100, Math.max(0, Number(it.reduction) || 0));
        const taux_tva = Number(it.taux_tva) || 0;
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
    const grammage = round4(normalizedItems.reduce((acc, it) => acc + it.grammage, 0));
    return { normalizedItems, totals: { grammage, prix_total, reduction, montant_ht, taux_tva, montant_tva, montant_ttc } };
}

exports.createAvoirGros = async (req, res) => {
    const { date_avoir, client_id, facture_gros_id, commande_gros_id, devis_gros_id, items, statut, status } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        let effectiveClientId = client_id;
        if (req.user.role !== "admin" && !effectiveClientId) {
            const nomComplet = `${req.user.nom} ${req.user.prenom}`.trim();
            const [existingClient] = await connection.execute("SELECT id FROM clients WHERE nom_complet = ?", [nomComplet]);
            if (existingClient.length > 0) effectiveClientId = existingClient[0].id;
        }
        if (!effectiveClientId) {
            await connection.rollback();
            return res.status(400).json({ message: "client_id is required" });
        }
        const finalFactureId = facture_gros_id && facture_gros_id !== "none" ? Number(facture_gros_id) : null;
        const finalCommandeId = commande_gros_id && commande_gros_id !== "none" ? Number(commande_gros_id) : null;
        const finalDevisId = devis_gros_id && devis_gros_id !== "none" ? Number(devis_gros_id) : null;

        if (finalFactureId) {
            const [existing] = await connection.execute("SELECT id FROM avoirs_gros WHERE facture_gros_id = ? LIMIT 1", [finalFactureId]);
            if (existing.length > 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Un avoir gros existe déjà pour cette facture gros." });
            }
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

        const finalStatut = await resolveCreationApprovalStatut(req.user, "avoir", {
            pending: "en_attente",
            approved: "valide",
            requested: statut || status,
        });

        const [insertRes] = await connection.execute(
            `INSERT INTO avoirs_gros
            (numero_avoir, date_avoir, client_id, user_id, facture_gros_id, commande_gros_id, devis_gros_id, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [`TEMP-${Date.now()}`, date_avoir || new Date().toISOString().split("T")[0], effectiveClientId, req.user.id, finalFactureId, finalCommandeId, finalDevisId, finalStatut]
        );
        const avoirGrosId = insertRes.insertId;
        const sousSociete = await resolveSousSociete(connection, finalFactureId, finalCommandeId);
        const seqNumber = await getNextNumber("AG", avoirGrosId, connection, { sousSocieteId: sousSociete.id });
        const numeroAvoir = formatDocumentNumber("AG", seqNumber, new Date(), { sousSocieteNom: sousSociete.nom });
        await connection.execute("UPDATE avoirs_gros SET numero_avoir = ? WHERE id = ?", [numeroAvoir, avoirGrosId]);

        const { normalizedItems, totals } = computeFinance(items);
        const rows = normalizedItems.map((it) => [
            avoirGrosId,
            it.produit_id || null,
            String(it.designation).trim(),
            Number(it.grammage) || 0,
            Number(it.prix_unitaire) || 0,
            Number(it.reduction) || 0,
            Number(it.montant_ht) || 0,
            Number(it.taux_tva) || 0,
            Number(it.montant_tva) || 0,
            Number(it.montant_ttc) || 0,
        ]);
        await connection.query(
            "INSERT INTO avoir_gros_items (avoir_gros_id, produit_id, designation, grammage, prix_unitaire, reduction, montant_ht, taux_tva, montant_tva, montant_ttc) VALUES ?",
            [rows]
        );

        await connection.execute(
            `UPDATE avoirs_gros
             SET grammage = ?, prix_total = ?, reduction = ?, montant_ht = ?, taux_tva = ?, montant_tva = ?, montant_ttc = ?
             WHERE id = ?`,
            [totals.grammage, totals.prix_total, totals.reduction, totals.montant_ht, totals.taux_tva, totals.montant_tva, totals.montant_ttc, avoirGrosId]
        );

        if (finalStatut === "valide") {
            const map = aggregateByProduct(items);
            await addGrammageToProducts(connection, map);
        }

        await connection.commit();
        res.status(201).json({ message: "Avoir gros créé", id: avoirGrosId, numero_avoir: numeroAvoir });
    } catch (error) {
        await connection.rollback();
        console.error("[avoirGros][create]", error);
        res.status(error.statusCode || 500).json({ message: error.message || "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.getAllAvoirsGros = async (req, res) => {
    try {
        let sql = `
            SELECT ag.*, c.nom_complet AS client_nom, CONCAT(u.prenom, ' ', u.nom) AS user_nom,
                   fg.numero_facture AS facture_gros_numero, cg.numero_commande AS commande_gros_numero, dg.numero_devis AS devis_gros_numero
            FROM avoirs_gros ag
            LEFT JOIN clients c ON ag.client_id = c.id
            LEFT JOIN users u ON ag.user_id = u.id
            LEFT JOIN factures_gros fg ON ag.facture_gros_id = fg.id
            LEFT JOIN commandes_gros cg ON ag.commande_gros_id = cg.id
            LEFT JOIN devis_gros dg ON ag.devis_gros_id = dg.id
        `;
        const params = [];
        const allowedToApprove = await canApprove(req.user.role, "avoir");
        if (req.user.role !== "admin" && req.user.role !== "directeur" && req.user.role !== "responsable") {
            if (allowedToApprove) {
                sql += " WHERE (ag.user_id = ? OR ag.statut = 'en_attente')";
                params.push(req.user.id);
            } else {
                sql += " WHERE ag.user_id = ?";
                params.push(req.user.id);
            }
        }
        sql += " ORDER BY ag.id DESC";
        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error("[avoirGros][list]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getAvoirGrosById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute(
            `SELECT ag.*, c.nom_complet AS client_nom, CONCAT(u.prenom, ' ', u.nom) AS user_nom,
                    fg.numero_facture AS facture_gros_numero, cg.numero_commande AS commande_gros_numero, dg.numero_devis AS devis_gros_numero
             FROM avoirs_gros ag
             LEFT JOIN clients c ON ag.client_id = c.id
             LEFT JOIN users u ON ag.user_id = u.id
             LEFT JOIN factures_gros fg ON ag.facture_gros_id = fg.id
             LEFT JOIN commandes_gros cg ON ag.commande_gros_id = cg.id
             LEFT JOIN devis_gros dg ON ag.devis_gros_id = dg.id
             WHERE ag.id = ?`,
            [id]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Avoir gros introuvable" });
        const [items] = await db.execute(
            `SELECT ai.*, p.nom AS produit_nom, p.reference
             FROM avoir_gros_items ai
             LEFT JOIN products p ON ai.produit_id = p.id
             WHERE ai.avoir_gros_id = ?
             ORDER BY ai.id`,
            [id]
        );
        res.status(200).json({ ...rows[0], items });
    } catch (error) {
        console.error("[avoirGros][byId]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateAvoirGros = async (req, res) => {
    const { id } = req.params;
    const { date_avoir, client_id, facture_gros_id, commande_gros_id, devis_gros_id, items, statut, status } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.execute("SELECT user_id, statut FROM avoirs_gros WHERE id = ?", [id]);
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Avoir gros introuvable" });
        }
        if (req.user.role !== "admin" && Number(existing[0].user_id) !== Number(req.user.id)) {
            await connection.rollback();
            return res.status(403).json({ message: "Non autorisé" });
        }
        const oldWasValid = String(existing[0].statut) === "valide";
        const finalFactureId = facture_gros_id && facture_gros_id !== "none" ? Number(facture_gros_id) : null;
        if (finalFactureId) {
            const [dup] = await connection.execute("SELECT id FROM avoirs_gros WHERE facture_gros_id = ? AND id != ? LIMIT 1", [finalFactureId, id]);
            if (dup.length > 0) {
                await connection.rollback();
                return res.status(400).json({ message: "Un avoir gros existe déjà pour cette facture gros." });
            }
        }
        if (!Array.isArray(items) || items.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: "Au moins une ligne est requise" });
        }
        const [oldItems] = await connection.execute("SELECT produit_id, grammage FROM avoir_gros_items WHERE avoir_gros_id = ?", [id]);
        if (oldWasValid) await subtractGrammageFromProducts(connection, aggregateByProduct(oldItems));
        const finalStatut = statut || status || "valide";
        const { normalizedItems, totals } = computeFinance(items);
        await connection.execute(
            `UPDATE avoirs_gros
             SET date_avoir = ?, client_id = ?, facture_gros_id = ?, commande_gros_id = ?, devis_gros_id = ?, statut = ?,
                 grammage = ?, prix_total = ?, reduction = ?, montant_ht = ?, taux_tva = ?, montant_tva = ?, montant_ttc = ?
             WHERE id = ?`,
            [
                date_avoir || new Date().toISOString().split("T")[0],
                client_id,
                finalFactureId,
                commande_gros_id && commande_gros_id !== "none" ? Number(commande_gros_id) : null,
                devis_gros_id && devis_gros_id !== "none" ? Number(devis_gros_id) : null,
                finalStatut,
                totals.grammage,
                totals.prix_total,
                totals.reduction,
                totals.montant_ht,
                totals.taux_tva,
                totals.montant_tva,
                totals.montant_ttc,
                id,
            ]
        );
        await connection.execute("DELETE FROM avoir_gros_items WHERE avoir_gros_id = ?", [id]);
        const rows = normalizedItems.map((it) => [
            Number(id),
            it.produit_id || null,
            String(it.designation).trim(),
            Number(it.grammage) || 0,
            Number(it.prix_unitaire) || 0,
            Number(it.reduction) || 0,
            Number(it.montant_ht) || 0,
            Number(it.taux_tva) || 0,
            Number(it.montant_tva) || 0,
            Number(it.montant_ttc) || 0,
        ]);
        await connection.query(
            "INSERT INTO avoir_gros_items (avoir_gros_id, produit_id, designation, grammage, prix_unitaire, reduction, montant_ht, taux_tva, montant_tva, montant_ttc) VALUES ?",
            [rows]
        );
        if (finalStatut === "valide") await addGrammageToProducts(connection, aggregateByProduct(items));
        await connection.commit();
        res.status(200).json({ message: "Avoir gros mis à jour" });
    } catch (error) {
        await connection.rollback();
        console.error("[avoirGros][update]", error);
        res.status(error.statusCode || 500).json({ message: error.message || "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.deleteAvoirGros = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT user_id, statut FROM avoirs_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Avoir gros introuvable" });
        }
        if (req.user.role !== "admin" && Number(rows[0].user_id) !== Number(req.user.id)) {
            await connection.rollback();
            return res.status(403).json({ message: "Non autorisé" });
        }
        if (String(rows[0].statut) === "valide") {
            const [items] = await connection.execute("SELECT produit_id, grammage FROM avoir_gros_items WHERE avoir_gros_id = ?", [id]);
            await subtractGrammageFromProducts(connection, aggregateByProduct(items));
        }
        await connection.execute("DELETE FROM avoirs_gros WHERE id = ?", [id]);
        await connection.commit();
        res.status(200).json({ message: "Avoir gros supprimé" });
    } catch (error) {
        await connection.rollback();
        console.error("[avoirGros][delete]", error);
        res.status(error.statusCode || 500).json({ message: error.message || "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.approveAvoirGros = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, "avoir");
    if (!allowed) return res.status(403).json({ message: "Vous n'avez pas les droits pour valider un avoir gros" });
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT statut FROM avoirs_gros WHERE id = ?", [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Avoir gros introuvable" });
        }
        if (String(rows[0].statut) !== "en_attente") {
            await connection.rollback();
            return res.status(400).json({ message: "Cet avoir gros n'est pas en attente de validation" });
        }
        const [items] = await connection.execute("SELECT produit_id, grammage FROM avoir_gros_items WHERE avoir_gros_id = ?", [id]);
        await addGrammageToProducts(connection, aggregateByProduct(items));
        await connection.execute("UPDATE avoirs_gros SET statut = 'valide' WHERE id = ?", [id]);
        await connection.commit();
        res.status(200).json({ message: "Avoir gros validé" });
    } catch (error) {
        await connection.rollback();
        console.error("[avoirGros][approve]", error);
        res.status(error.statusCode || 500).json({ message: error.message || "Internal server error" });
    } finally {
        connection.release();
    }
};

exports.rejectAvoirGros = async (req, res) => {
    const { id } = req.params;
    const allowed = await canApprove(req.user.role, "avoir");
    if (!allowed) return res.status(403).json({ message: "Vous n'avez pas les droits pour rejeter un avoir gros" });
    try {
        const [rows] = await db.execute("SELECT statut FROM avoirs_gros WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Avoir gros introuvable" });
        if (String(rows[0].statut) !== "en_attente") return res.status(400).json({ message: "Cet avoir gros n'est pas en attente de validation" });
        await db.execute("UPDATE avoirs_gros SET statut = 'rejete' WHERE id = ?", [id]);
        res.status(200).json({ message: "Avoir gros rejeté" });
    } catch (error) {
        console.error("[avoirGros][reject]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.reopenAvoirGros = async (req, res) => {
    const { id } = req.params;
    if (req.user.role !== "admin" && req.user.role !== "responsable") {
        return res.status(403).json({ message: "Seul un admin ou responsable peut rouvrir un avoir gros" });
    }
    try {
        const [rows] = await db.execute("SELECT statut FROM avoirs_gros WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Avoir gros introuvable" });
        if (String(rows[0].statut) !== "rejete") return res.status(400).json({ message: "Seuls les avoirs gros rejetés peuvent être rouverts" });
        await db.execute("UPDATE avoirs_gros SET statut = 'en_attente' WHERE id = ?", [id]);
        res.status(200).json({ message: "Avoir gros rouvert" });
    } catch (error) {
        console.error("[avoirGros][reopen]", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
