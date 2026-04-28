const db = require("../config/db").promise();

let fiscalSchemaReady = false;
const ensureFournisseurFiscalSchema = async () => {
    if (fiscalSchemaReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS regularite_fiscale_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fournisseur_id INT NOT NULL UNIQUE,
            date_debut DATE NOT NULL,
            date_expiration DATE NOT NULL
        )
    `);

    const [pdfCols] = await db.query("SHOW COLUMNS FROM regularite_fiscale_details LIKE 'pdf_document'");
    if (!Array.isArray(pdfCols) || pdfCols.length === 0) {
        await db.query(
            "ALTER TABLE regularite_fiscale_details ADD COLUMN pdf_document VARCHAR(255) NULL AFTER fournisseur_id"
        );
    }
    const [reminderCols] = await db.query("SHOW COLUMNS FROM regularite_fiscale_details LIKE 'reminder_sent_at'");
    if (!Array.isArray(reminderCols) || reminderCols.length === 0) {
        await db.query(
            "ALTER TABLE regularite_fiscale_details ADD COLUMN reminder_sent_at DATETIME NULL AFTER date_expiration"
        );
    }

    fiscalSchemaReady = true;
};

const toTinyIntBool = (value) => {
    if (value === undefined || value === null || value === "") return 0;
    const normalized = String(value).trim().toLowerCase();
    return ["1", "true", "oui", "yes", "on"].includes(normalized) ? 1 : 0;
};

const computeExpirationPlusSixMonths = (dateDebut) => {
    if (!dateDebut) return null;
    const dt = new Date(dateDebut);
    if (Number.isNaN(dt.getTime())) return null;
    dt.setMonth(dt.getMonth() + 6);
    return dt.toISOString().slice(0, 10);
};

exports.getAllFournisseurs = async (req, res) => {
    try {
        await ensureFournisseurFiscalSchema();
        const [rows] = await db.query(`
            SELECT f.*,
                   rfd.pdf_document AS regularite_pdf_document,
                   rfd.date_debut AS regularite_date_debut,
                   rfd.date_expiration AS regularite_date_expiration
            FROM fournisseur f
            LEFT JOIN regularite_fiscale_details rfd ON rfd.fournisseur_id = f.id
            ORDER BY f.id DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching fournisseurs:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.getFournisseurById = async (req, res) => {
    try {
        await ensureFournisseurFiscalSchema();
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT f.*,
                    rfd.pdf_document AS regularite_pdf_document,
                    rfd.date_debut AS regularite_date_debut,
                    rfd.date_expiration AS regularite_date_expiration
             FROM fournisseur f
             LEFT JOIN regularite_fiscale_details rfd ON rfd.fournisseur_id = f.id
             WHERE f.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Fournisseur not found" });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error("Error fetching fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    }
};


exports.createFournisseur = async (req, res) => {
    try {
        await ensureFournisseurFiscalSchema();
        const {
            nom,
            ice,
            telephone,
            email,
            rc,
            adresse,
            numero_tva,
            if_number,
            cnss,
            patente,
            regularite_fiscale,
            regularite_date_debut,
            regularite_date_expiration,
        } = req.body;

        if (!nom) {
            return res.status(400).json({ message: "Nom is required" });
        }

        if (req.file) {
            const ext = String(req.file.originalname || "").toLowerCase();
            const isPdf = req.file.mimetype === "application/pdf" || ext.endsWith(".pdf");
            if (!isPdf) {
                return res.status(400).json({ message: "Le document de régularité fiscale doit être un PDF." });
            }
        }

        const regulariteFiscaleVal = toTinyIntBool(regularite_fiscale);
        const tauxRas = regulariteFiscaleVal ? 75 : 100;
        if (regulariteFiscaleVal && !regularite_date_debut) {
            return res.status(400).json({
                message: "Date début requise si régularité fiscale activée.",
            });
        }
        const computedExpiration = regulariteFiscaleVal
            ? computeExpirationPlusSixMonths(regularite_date_debut)
            : null;
        if (regulariteFiscaleVal && !computedExpiration) {
            return res.status(400).json({ message: "Date début invalide." });
        }

        const [result] = await db.query(
            `INSERT INTO fournisseur 
            (nom, ice, telephone, email, rc, adresse, numero_tva, if_number, cnss, patente, regularite_fiscale, taux_ras) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nom,
                ice || null,
                telephone || null,
                email || null,
                rc || null,
                adresse || null,
                numero_tva || null,
                if_number || null,
                cnss || null,
                patente || null,
                regulariteFiscaleVal,
                tauxRas,
            ]
        );

        if (regulariteFiscaleVal) {
            const pdf = req.file ? req.file.filename : null;
            await db.query(
                `INSERT INTO regularite_fiscale_details
                 (fournisseur_id, pdf_document, date_debut, date_expiration, reminder_sent_at)
                 VALUES (?, ?, ?, ?, NULL)`,
                [result.insertId, pdf, regularite_date_debut, computedExpiration]
            );
        }

        res.status(201).json({
            message: "Fournisseur created successfully",
            id: result.insertId
        });

    } catch (error) {
        console.error("Error creating fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.updateFournisseur = async (req, res) => {
    try {
        await ensureFournisseurFiscalSchema();
        const { id } = req.params;
        const {
            nom,
            ice,
            telephone,
            email,
            rc,
            adresse,
            numero_tva,
            if_number,
            cnss,
            patente,
            regularite_fiscale,
            regularite_date_debut,
            regularite_date_expiration,
        } = req.body;

        // Check existence
        const [existing] = await db.query(
            "SELECT id FROM fournisseur WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Fournisseur not found" });
        }

        if (req.file) {
            const ext = String(req.file.originalname || "").toLowerCase();
            const isPdf = req.file.mimetype === "application/pdf" || ext.endsWith(".pdf");
            if (!isPdf) {
                return res.status(400).json({ message: "Le document de régularité fiscale doit être un PDF." });
            }
        }

        const regulariteFiscaleVal = toTinyIntBool(regularite_fiscale);
        const tauxRas = regulariteFiscaleVal ? 75 : 100;
        if (regulariteFiscaleVal && !regularite_date_debut) {
            return res.status(400).json({
                message: "Date début requise si régularité fiscale activée.",
            });
        }
        const computedExpiration = regulariteFiscaleVal
            ? computeExpirationPlusSixMonths(regularite_date_debut)
            : null;
        if (regulariteFiscaleVal && !computedExpiration) {
            return res.status(400).json({ message: "Date début invalide." });
        }

        await db.query(
            `UPDATE fournisseur 
             SET nom = ?, ice = ?, telephone = ?, email = ?, rc = ?, adresse = ?, numero_tva = ?, if_number = ?, cnss = ?, patente = ?, regularite_fiscale = ?, taux_ras = ?
             WHERE id = ?`,
            [
                nom,
                ice || null,
                telephone || null,
                email || null,
                rc || null,
                adresse || null,
                numero_tva || null,
                if_number || null,
                cnss || null,
                patente || null,
                regulariteFiscaleVal,
                tauxRas,
                id,
            ]
        );

        const [[existingFiscal]] = await db.query(
            "SELECT id, pdf_document FROM regularite_fiscale_details WHERE fournisseur_id = ? LIMIT 1",
            [id]
        );

        if (regulariteFiscaleVal) {
            const nextPdf = req.file ? req.file.filename : (existingFiscal?.pdf_document || null);
            if (existingFiscal?.id) {
                await db.query(
                    `UPDATE regularite_fiscale_details
                     SET pdf_document = ?, date_debut = ?, date_expiration = ?, reminder_sent_at = NULL
                     WHERE id = ?`,
                    [nextPdf, regularite_date_debut, computedExpiration, existingFiscal.id]
                );
            } else {
                await db.query(
                    `INSERT INTO regularite_fiscale_details
                     (fournisseur_id, pdf_document, date_debut, date_expiration, reminder_sent_at)
                     VALUES (?, ?, ?, ?, NULL)`,
                    [id, nextPdf, regularite_date_debut, computedExpiration]
                );
            }
        } else {
            await db.query("DELETE FROM regularite_fiscale_details WHERE fournisseur_id = ?", [id]);
        }

        res.json({ message: "Fournisseur updated successfully" });

    } catch (error) {
        console.error("Error updating fournisseur:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.deleteFournisseur = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await db.query(
            "SELECT id FROM fournisseur WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Fournisseur not found" });
        }

        await db.query(
            "DELETE FROM fournisseur WHERE id = ?",
            [id]
        );

        res.json({ message: "Fournisseur deleted successfully" });

    } catch (error) {
        console.error("Error deleting fournisseur:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
