const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const uploadsRoot = path.resolve(__dirname, "../../uploads");
const signaturesDir = path.join(uploadsRoot, "signatures");

const ensureDir = async (dirPath) => {
    await fs.promises.mkdir(dirPath, { recursive: true });
};

const toDbPath = (absolutePath) => {
    const normalized = String(absolutePath || "").replace(/\\/g, "/");
    if (!normalized) return null;
    if (normalized.startsWith("uploads/")) {
        return normalized.slice("uploads/".length);
    }
    if (normalized.startsWith("/uploads/")) {
        return normalized.slice("/uploads/".length);
    }
    const marker = "/uploads/";
    const idx = normalized.lastIndexOf(marker);
    if (idx === -1) return null;
    return normalized.slice(idx + marker.length);
};

const toAbsoluteUploadPath = (dbPathValue) => {
    const rel = String(dbPathValue || "").trim();
    if (!rel) return null;
    return path.join(uploadsRoot, rel);
};

const saveSignatureDataUrl = async (dataUrl, prefix) => {
    const raw = String(dataUrl || "").trim();
    if (!raw) return null;
    const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
    if (!match) return null;

    const ext = match[1].toLowerCase() === "png" ? "png" : "jpg";
    const base64Data = match[2];
    const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await ensureDir(signaturesDir);
    const absPath = path.join(signaturesDir, fileName);
    await fs.promises.writeFile(absPath, Buffer.from(base64Data, "base64"));
    return toDbPath(absPath);
};

const safeDeleteUploadFile = async (dbPathValue) => {
    const absPath = toAbsoluteUploadPath(dbPathValue);
    if (!absPath) return;
    try {
        await fs.promises.unlink(absPath);
    } catch {
        // ignore missing file
    }
};

exports.getContrats = async (_req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT c.id, c.pdf, c.signature_client, c.signature_gestionnaire, c.gestionnaire_id, c.created_at,
                    g.nom AS gestionnaire_nom
             FROM contrat c
             LEFT JOIN gestionnaire g ON g.id = c.gestionnaire_id
             ORDER BY c.id DESC`
        );
        return res.status(200).json(rows);
    } catch (error) {
        console.error("getContrats error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.getContratById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "Invalid contrat id" });
        }
        const [rows] = await db.promise().query(
            `SELECT c.id, c.pdf, c.signature_client, c.signature_gestionnaire, c.gestionnaire_id, c.created_at,
                    g.nom AS gestionnaire_nom
             FROM contrat c
             LEFT JOIN gestionnaire g ON g.id = c.gestionnaire_id
             WHERE c.id = ?
             LIMIT 1`,
            [id]
        );
        if (!rows || rows.length === 0) {
            return res.status(404).json({ message: "Contrat not found" });
        }
        return res.status(200).json(rows[0]);
    } catch (error) {
        console.error("getContratById error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.createContrat = async (req, res) => {
    try {
        const { gestionnaire_id, signature_client_data, signature_gestionnaire_data } = req.body;
        const gestionnaireIdNum = Number(gestionnaire_id);
        if (!Number.isFinite(gestionnaireIdNum) || gestionnaireIdNum <= 0) {
            return res.status(400).json({ message: "gestionnaire_id is required" });
        }

        const pdfPath = req.file ? toDbPath(req.file.path) : null;
        if (!pdfPath) {
            return res.status(400).json({ message: "Le fichier PDF du contrat est requis" });
        }

        const signatureClientPath = await saveSignatureDataUrl(signature_client_data, "contrat_client");
        const signatureGestionnairePath = await saveSignatureDataUrl(signature_gestionnaire_data, "contrat_gestionnaire");
        if (!signatureClientPath || !signatureGestionnairePath) {
            return res.status(400).json({ message: "Les signatures client et gestionnaire sont requises" });
        }

        const [result] = await db.promise().query(
            `INSERT INTO contrat (pdf, signature_client, signature_gestionnaire, gestionnaire_id)
             VALUES (?, ?, ?, ?)`,
            [pdfPath, signatureClientPath, signatureGestionnairePath, gestionnaireIdNum]
        );

        return res.status(201).json({
            message: "Contrat créé avec succès",
            id: result.insertId,
        });
    } catch (error) {
        console.error("createContrat error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateContrat = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "Invalid contrat id" });
        }

        const [existingRows] = await db.promise().query("SELECT * FROM contrat WHERE id = ? LIMIT 1", [id]);
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({ message: "Contrat not found" });
        }
        const existing = existingRows[0];

        const nextGestionnaireId =
            req.body.gestionnaire_id != null && String(req.body.gestionnaire_id).trim() !== ""
                ? Number(req.body.gestionnaire_id)
                : Number(existing.gestionnaire_id);
        if (!Number.isFinite(nextGestionnaireId) || nextGestionnaireId <= 0) {
            return res.status(400).json({ message: "gestionnaire_id invalide" });
        }

        let nextPdf = existing.pdf || null;
        if (req.file) {
            const newPdfPath = toDbPath(req.file.path);
            if (newPdfPath) {
                nextPdf = newPdfPath;
                await safeDeleteUploadFile(existing.pdf);
            }
        }

        let nextSignatureClient = existing.signature_client || null;
        if (String(req.body.signature_client_data || "").trim()) {
            const newClientSign = await saveSignatureDataUrl(req.body.signature_client_data, "contrat_client");
            if (!newClientSign) {
                return res.status(400).json({ message: "Signature client invalide" });
            }
            nextSignatureClient = newClientSign;
            await safeDeleteUploadFile(existing.signature_client);
        }

        let nextSignatureGestionnaire = existing.signature_gestionnaire || null;
        if (String(req.body.signature_gestionnaire_data || "").trim()) {
            const newGestionnaireSign = await saveSignatureDataUrl(req.body.signature_gestionnaire_data, "contrat_gestionnaire");
            if (!newGestionnaireSign) {
                return res.status(400).json({ message: "Signature gestionnaire invalide" });
            }
            nextSignatureGestionnaire = newGestionnaireSign;
            await safeDeleteUploadFile(existing.signature_gestionnaire);
        }

        await db.promise().query(
            `UPDATE contrat
             SET pdf = ?, signature_client = ?, signature_gestionnaire = ?, gestionnaire_id = ?
             WHERE id = ?`,
            [nextPdf, nextSignatureClient, nextSignatureGestionnaire, nextGestionnaireId, id]
        );

        return res.status(200).json({ message: "Contrat mis à jour avec succès" });
    } catch (error) {
        console.error("updateContrat error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.deleteContrat = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "Invalid contrat id" });
        }

        const [rows] = await db.promise().query("SELECT * FROM contrat WHERE id = ? LIMIT 1", [id]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ message: "Contrat not found" });
        }
        const row = rows[0];

        await db.promise().query("DELETE FROM contrat WHERE id = ?", [id]);
        await Promise.all([
            safeDeleteUploadFile(row.pdf),
            safeDeleteUploadFile(row.signature_client),
            safeDeleteUploadFile(row.signature_gestionnaire),
        ]);

        return res.status(200).json({ message: "Contrat supprimé avec succès" });
    } catch (error) {
        console.error("deleteContrat error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
