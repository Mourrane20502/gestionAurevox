const db = require("../config/db").promise();
const fs = require("fs");
const path = require("path");

const normalizeTextOrNull = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
};

const uploadsDir = path.join(__dirname, "../../uploads");
const resolveUploadPath = (filename) => path.join(uploadsDir, path.basename(String(filename || "")));
const safeUnlink = async (filename) => {
    const clean = String(filename || "").trim();
    if (!clean) return;
    try {
        await fs.promises.unlink(resolveUploadPath(clean));
    } catch {
        // ignore
    }
};

exports.getAllContrats = async (_req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT c.*, g.nom AS gestionnaire_nom
             FROM contrats c
             LEFT JOIN gestionnaire g ON g.id = c.gestionnaire_id
             ORDER BY c.created_at DESC, c.id DESC`
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur chargement contrats" });
    }
};

exports.getContratById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(
            `SELECT c.*, g.nom AS gestionnaire_nom
             FROM contrats c
             LEFT JOIN gestionnaire g ON g.id = c.gestionnaire_id
             WHERE c.id = ?
             LIMIT 1`,
            [id]
        );
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({ message: "Contrat introuvable" });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur chargement contrat" });
    }
};

exports.createContrat = async (req, res) => {
    try {
        const { gestionnaire_id, signature_client, signature_gestionnaire, pdf_path } = req.body || {};
        const gid = Number(gestionnaire_id);
        if (!Number.isFinite(gid) || gid <= 0) {
            return res.status(400).json({ message: "Gestionnaire invalide" });
        }
        const pdf = normalizeTextOrNull(pdf_path);
        const clientSig = normalizeTextOrNull(signature_client);
        const gestionnaireSig = normalizeTextOrNull(signature_gestionnaire);
        if (!pdf) {
            return res.status(400).json({ message: "PDF contrat obligatoire" });
        }
        if (!clientSig || !gestionnaireSig) {
            return res.status(400).json({ message: "Les deux signatures sont obligatoires" });
        }

        const [result] = await db.query(
            `INSERT INTO contrats
                (gestionnaire_id, signature_client, signature_gestionnaire, pdf_path)
             VALUES (?, ?, ?, ?)`,
            [
                gid,
                clientSig,
                gestionnaireSig,
                pdf.slice(0, 500),
            ]
        );

        res.status(201).json({ message: "Contrat créé", id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur création contrat" });
    }
};

exports.updateContrat = async (req, res) => {
    try {
        const { id } = req.params;
        const { gestionnaire_id, signature_client, signature_gestionnaire, pdf_path } = req.body || {};
        const gid = Number(gestionnaire_id);
        if (!Number.isFinite(gid) || gid <= 0) {
            return res.status(400).json({ message: "Gestionnaire invalide" });
        }
        const pdf = normalizeTextOrNull(pdf_path);
        const clientSig = normalizeTextOrNull(signature_client);
        const gestionnaireSig = normalizeTextOrNull(signature_gestionnaire);
        if (!pdf) {
            return res.status(400).json({ message: "PDF contrat obligatoire" });
        }
        if (!clientSig || !gestionnaireSig) {
            return res.status(400).json({ message: "Les deux signatures sont obligatoires" });
        }

        const [result] = await db.query(
            `UPDATE contrats SET
                gestionnaire_id = ?,
                signature_client = ?,
                signature_gestionnaire = ?,
                pdf_path = ?
             WHERE id = ?`,
            [
                gid,
                clientSig,
                gestionnaireSig,
                pdf.slice(0, 500),
                id,
            ]
        );
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Contrat introuvable" });
        }
        res.status(200).json({ message: "Contrat mis à jour" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur mise à jour contrat" });
    }
};

exports.deleteContrat = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.query("DELETE FROM contrats WHERE id = ?", [id]);
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Contrat introuvable" });
        }
        res.status(200).json({ message: "Contrat supprimé" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur suppression contrat" });
    }
};

exports.uploadContratPdf = async (req, res) => {
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
    return res.status(200).json({
        message: "PDF téléversé avec succès",
        pdf_path: file.filename,
        pdf_url: `/uploads/${encodeURIComponent(file.filename)}`,
    });
};
