const db = require("../config/db").promise();
const { resolveCreationApprovalStatut } = require("../utils/approvalSettings");

const getNow = () => new Date().toISOString().slice(0, 19).replace("T", " ");

async function ensureFournisseurFromAchat({ fournisseur_id, achat_id }) {
    if (fournisseur_id) return fournisseur_id;

    if (achat_id) {
        const [rows] = await db.execute(
            "SELECT fournisseur_id FROM achats_fournisseurs WHERE id = ? LIMIT 1",
            [achat_id]
        );
        if (rows.length > 0) return rows[0].fournisseur_id;
    }

    throw new Error("Impossible de déterminer le fournisseur pour ce règlement");
}

async function computeAchatReglementTotals(achatId) {
    const [[achat]] = await db.execute(
        "SELECT id, quantite, prix_unitaire, tva FROM achats_fournisseurs WHERE id = ?",
        [achatId]
    );
    if (!achat) return null;

    const qte = Number(achat.quantite || 0);
    const pu = Number(achat.prix_unitaire || 0);
    const tva = Number(achat.tva || 0);
    const montantHt = qte * pu;
    const montantTtc = montantHt * (1 + tva / 100);

    const [[row]] = await db.execute(
        `
        SELECT COALESCE(SUM(montant), 0) AS total_regle
        FROM reglements_fournisseurs
        WHERE achat_id = ? AND statut = 'approuve'
        `,
        [achatId]
    );

    const totalRegle = Number(row.total_regle || 0);
    const reste = Math.max(montantTtc - totalRegle, 0);

    return {
        achat_id: achatId,
        montant_ttc: montantTtc,
        total_regle: totalRegle,
        reste_a_payer: reste,
    };
}

exports.createReglementFournisseur = async (req, res) => {
    const {
        fournisseur_id,
        achat_id,
        date_reglement,
        montant,
        mode_paiement,
        banque_id,
        date_echeance,
        commentaire,
        lignes,
    } = req.body;

    const userId = req.user.id;

    if (!achat_id) {
        return res
            .status(400)
            .json({ message: "achat_id est requis pour le règlement fournisseur" });
    }

    const lignesToInsert =
        Array.isArray(lignes) && lignes.length > 0
            ? lignes
            : [
                  {
                      date_reglement,
                      date_echeance,
                      montant,
                      mode_paiement,
                      banque_id,
                      commentaire,
                  },
              ];

    try {
        const effectiveFournisseurId = await ensureFournisseurFromAchat({
            fournisseur_id,
            achat_id,
        });

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [[achatRow]] = await connection.execute(
                `
                SELECT id, quantite, prix_unitaire, tva
                FROM achats_fournisseurs
                WHERE id = ?
                FOR UPDATE
            `,
                [achat_id]
            );
            if (!achatRow) {
                await connection.rollback();
                return res.status(404).json({ message: "Commande d'achat introuvable" });
            }

            const qte = Number(achatRow.quantite || 0);
            const pu = Number(achatRow.prix_unitaire || 0);
            const tva = Number(achatRow.tva || 0);
            const montantTtc = qte * pu * (1 + tva / 100);

            const [[regleRow]] = await connection.execute(
                `
                SELECT COALESCE(SUM(montant), 0) AS total_regle
                FROM reglements_fournisseurs
                WHERE achat_id = ? AND statut = 'approuve'
            `,
                [achat_id]
            );
            const totalRegle = Number(regleRow.total_regle || 0);

            if (totalRegle >= montantTtc - 0.01) {
                await connection.rollback();
                return res.status(409).json({
                    message:
                        "Cette commande est déjà totalement réglée. Aucun nouveau règlement n'est autorisé.",
                });
            }

            const finalStatut = await resolveCreationApprovalStatut(req.user, "reglements", {
                pending: "en_attente",
                approved: "approuve",
            });
            const autoApproveReglement = finalStatut === "approuve";
            const approvedAt = autoApproveReglement ? getNow() : null;

            const insertedIds = [];

            for (const ligne of lignesToInsert) {
                const {
                    date_reglement: lDate,
                    date_echeance: lEcheance,
                    montant: lMontant,
                    mode_paiement: lMode,
                    banque_id: lBanqueId,
                    commentaire: lComment,
                } = ligne;

                if (!lMontant || !lMode) continue;

                const [result] = await connection.execute(
                    `
                    INSERT INTO reglements_fournisseurs
                    (fournisseur_id, achat_id, date_reglement, date_echeance, montant, mode_paiement, banque_id, statut, commentaire, created_by, approved_by, approved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                    [
                        effectiveFournisseurId,
                        achat_id,
                        lDate || getNow(),
                        lEcheance || null,
                        lMontant,
                        lMode,
                        !lBanqueId || lBanqueId === "none" ? null : lBanqueId,
                        finalStatut,
                        lComment || null,
                        userId,
                        autoApproveReglement ? userId : null,
                        approvedAt,
                    ]
                );

                insertedIds.push(result.insertId);
            }

            await connection.commit();

            res.status(201).json({
                message: "Règlement fournisseur créé",
                ids: insertedIds,
            });
        } catch (err) {
            await connection.rollback();
            console.error("Error creating reglement fournisseur:", err);
            res.status(500).json({
                message: "Erreur interne lors de la création du règlement fournisseur",
                error: err.message,
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Error resolving fournisseur for reglement:", err);
        res.status(400).json({ message: err.message });
    }
};

exports.getAllReglementsFournisseurs = async (req, res) => {
    try {
        let sql = `
            SELECT 
                r.*,
                f.nom AS fournisseur_nom,
                af.id AS achat_id,
                COALESCE(af.designation_libre, p.nom) AS achat_designation,
                b.nom_banque AS banque_nom,
                CONCAT(u.prenom, ' ', u.nom) AS created_by_nom,
                CONCAT(u2.prenom, ' ', u2.nom) AS approved_by_nom
            FROM reglements_fournisseurs r
            LEFT JOIN fournisseur f ON r.fournisseur_id = f.id
            LEFT JOIN achats_fournisseurs af ON r.achat_id = af.id
            LEFT JOIN products p ON af.product_id = p.id
            LEFT JOIN banques b ON r.banque_id = b.id
            LEFT JOIN users u ON r.created_by = u.id
            LEFT JOIN users u2 ON r.approved_by = u2.id
        `;

        const params = [];
        const where = [];

        if (req.query.fournisseurId) {
            where.push("r.fournisseur_id = ?");
            params.push(req.query.fournisseurId);
        }
        if (req.query.achatId) {
            where.push("r.achat_id = ?");
            params.push(req.query.achatId);
        }
        if (req.query.statut) {
            where.push("r.statut = ?");
            params.push(req.query.statut);
        }

        if (where.length > 0) {
            sql += " WHERE " + where.join(" AND ");
        }

        sql += " ORDER BY r.created_at DESC";

        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching reglements fournisseurs:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getReglementFournisseurById = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.execute(
            `
            SELECT 
                r.*,
                f.nom AS fournisseur_nom,
                af.id AS achat_id,
                COALESCE(af.designation_libre, p.nom) AS achat_designation,
                b.nom_banque AS banque_nom,
                CONCAT(u.prenom, ' ', u.nom) AS created_by_nom,
                CONCAT(u2.prenom, ' ', u2.nom) AS approved_by_nom
            FROM reglements_fournisseurs r
            LEFT JOIN fournisseur f ON r.fournisseur_id = f.id
            LEFT JOIN achats_fournisseurs af ON r.achat_id = af.id
            LEFT JOIN products p ON af.product_id = p.id
            LEFT JOIN banques b ON r.banque_id = b.id
            LEFT JOIN users u ON r.created_by = u.id
            LEFT JOIN users u2 ON r.approved_by = u2.id
            WHERE r.id = ?
        `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Règlement fournisseur introuvable" });
        }

        res.status(200).json(rows[0]);
    } catch (err) {
        console.error("Error fetching reglement fournisseur by id:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.approveReglementFournisseur = async (req, res) => {
    const { id } = req.params;
    const approverId = req.user.id;

    if (
        req.user.role !== "admin" &&
        req.user.role !== "responsable" &&
        req.user.role !== "directeur"
    ) {
        return res
            .status(403)
            .json({ message: "Seuls les profils autorisés peuvent approuver les règlements fournisseurs" });
    }

    try {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                "SELECT * FROM reglements_fournisseurs WHERE id = ? FOR UPDATE",
                [id]
            );

            if (rows.length === 0) {
                await connection.rollback();
                return res
                    .status(404)
                    .json({ message: "Règlement fournisseur introuvable" });
            }

            const reglement = rows[0];

            if (reglement.statut === "approuve") {
                await connection.rollback();
                return res
                    .status(400)
                    .json({ message: "Règlement fournisseur déjà approuvé" });
            }

            await connection.execute(
                `
                UPDATE reglements_fournisseurs
                SET statut = 'approuve',
                    approved_by = ?,
                    approved_at = ?
                WHERE id = ?
            `,
                [approverId, getNow(), id]
            );

            await connection.commit();

            res.status(200).json({ message: "Règlement fournisseur approuvé" });
        } catch (err) {
            await connection.rollback();
            console.error("Error approving reglement fournisseur:", err);
            res.status(500).json({
                message:
                    "Erreur interne lors de l'approbation du règlement fournisseur",
                error: err.message,
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Error approving reglement fournisseur (conn):", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.rejectReglementFournisseur = async (req, res) => {
    const { id } = req.params;
    const approverId = req.user.id;

    if (
        req.user.role !== "admin" &&
        req.user.role !== "responsable" &&
        req.user.role !== "directeur"
    ) {
        return res
            .status(403)
            .json({ message: "Seuls les profils autorisés peuvent refuser les règlements fournisseurs" });
    }

    try {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                "SELECT * FROM reglements_fournisseurs WHERE id = ? FOR UPDATE",
                [id]
            );

            if (rows.length === 0) {
                await connection.rollback();
                return res
                    .status(404)
                    .json({ message: "Règlement fournisseur introuvable" });
            }

            const reglement = rows[0];

            if (reglement.statut !== "en_attente") {
                await connection.rollback();
                return res.status(400).json({
                    message:
                        "Seul un règlement fournisseur en attente peut être refusé",
                });
            }

            const rejectedComment =
                (reglement.commentaire || "") +
                `\n[REFUSÉ] Rejeté le ${getNow()} par utilisateur #${approverId}`;

            await connection.execute(
                `
                UPDATE reglements_fournisseurs
                SET statut = 'rejete',
                    commentaire = ?
                WHERE id = ?
            `,
                [rejectedComment.trim(), id]
            );

            await connection.commit();

            res.status(200).json({ message: "Règlement fournisseur refusé" });
        } catch (err) {
            await connection.rollback();
            console.error("Error rejecting reglement fournisseur:", err);
            res.status(500).json({
                message:
                    "Erreur interne lors du refus du règlement fournisseur",
                error: err.message,
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Error rejecting reglement fournisseur (conn):", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getSituationReglementFournisseur = async (req, res) => {
    const { achatId } = req.query;

    if (!achatId) {
        return res.status(400).json({
            message: "achatId est requis pour la situation du règlement fournisseur",
        });
    }

    try {
        const totals = await computeAchatReglementTotals(achatId);
        if (!totals) {
            return res
                .status(404)
                .json({ message: "Achat fournisseur introuvable" });
        }
        return res.status(200).json({
            type: "achat",
            ...totals,
        });
    } catch (err) {
        console.error("Error computing situation reglement fournisseur:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/* ===============================
   SEND PAYMENT RECEIPT BY EMAIL (SUPPLIER)
================================= */
exports.sendReglementEmail = async (req, res) => {
    const { id } = req.params;
    const { to, subject, message } = req.body;

    if (!to) {
        return res.status(400).json({ message: "Le destinataire est requis" });
    }

    try {
        // Charger le règlement avec infos fournisseur et document lié
        const [rows] = await db.execute(
            `
            SELECT r.*,
                   f.nom AS fournisseur_nom,
                   f.email AS fournisseur_email,
                   af.id AS achat_id,
                   COALESCE(af.designation_libre, p.nom) AS achat_designation,
                   b.nom_banque AS banque_nom
            FROM reglements_fournisseurs r
            LEFT JOIN fournisseur f ON r.fournisseur_id = f.id
            LEFT JOIN achats_fournisseurs af ON r.achat_id = af.id
            LEFT JOIN products p ON af.product_id = p.id
            LEFT JOIN banques b ON r.banque_id = b.id
            WHERE r.id = ?
        `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Règlement fournisseur introuvable" });
        }

        const reg = rows[0];
        // Mapper pour le template PDF (on réutilise le même template mais avec labels adaptés)
        const pdfData = {
            id: reg.id,
            client_nom: reg.fournisseur_nom, // Le template utilise client_nom
            montant: reg.montant,
            date_reglement: reg.date_reglement,
            mode_paiement: reg.mode_paiement,
            banque_nom: reg.banque_nom,
            document_numero: `Achat #${reg.achat_id}`,
            document_type: 'achat',
            statut: reg.statut,
            commentaire: reg.commentaire
        };

        const emailSubject =
            subject ||
            `[Reçu de paiement fournisseur] Achat #${reg.achat_id} - ${reg.fournisseur_nom}`;
        
        const emailText =
            message ||
            `Bonjour ${reg.fournisseur_nom || ""},\n\nNous vous confirmons l'enregistrement d'un règlement de ${(Number(
                reg.montant
            ) || 0).toFixed(2)} MAD le ${new Date(reg.date_reglement).toLocaleDateString(
                "fr-FR"
            )} pour l'achat #${reg.achat_id} (${reg.achat_designation || ""}).\n\nVous trouverez le reçu de paiement en pièce jointe.\n\nMerci pour votre collaboration.\n`;

        // Générer le PDF
        const { buildReglementPdf } = require("../services/pdfGeneratorService");
        const pdfBuffer = await buildReglementPdf(pdfData);

        const { sendMail } = require("../services/emailService");
        await sendMail(to, emailSubject, emailText, [
            {
                filename: `Recu_Paiement_Fournisseur_${reg.achat_id}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf"
            }
        ]);

        res.status(200).json({ message: "Email envoyé avec succès" });
    } catch (error) {
        console.error("Error sending reglement fournisseur email:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
    }
};

