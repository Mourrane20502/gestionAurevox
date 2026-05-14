const db = require("../config/db").promise();

/**
 * Logo du gestionnaire « courant » pour favicon / branding (même ordre que la liste produits : dernier id).
 * Accessible à tout utilisateur authentifié (sans permission gestionnaires_view).
 */
exports.getBrandingLogo = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT logo FROM gestionnaire ORDER BY id DESC LIMIT 1"
        );
        const logo = rows?.[0]?.logo != null ? String(rows[0].logo).trim() : "";
        if (!logo) {
            return res.json({ logo: null });
        }
        return res.json({ logo });
    } catch (error) {
        console.error("Error fetching gestionnaire branding logo:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Get all gestionnaires
 */
exports.getAllGestionnaires = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM gestionnaire ORDER BY id DESC"
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching gestionnaires:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Get gestionnaire by ID
 */
exports.getGestionnaireById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            "SELECT * FROM gestionnaire WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Gestionnaire not found" });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error("Error fetching gestionnaire:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Create gestionnaire
 */
exports.createGestionnaire = async (req, res) => {
    try {
        const {
            nom,
            adresse,
            type_entreprise,
            email,
            responsable,
            telephone,
            ice,
            identifiant_fiscale,
            patente,
            cnss
        } = req.body;

        const logoFile = req.file ? req.file.filename : null;

        if (!nom) {
            return res.status(400).json({ message: "Nom is required" });
        }

        const [result] = await db.query(
            `
            INSERT INTO gestionnaire
            (nom, logo, adresse, type_entreprise, email, responsable, telephone, ice, identifiant_fiscale, patente, cnss)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            [
                nom,
                logoFile,
                adresse || null,
                type_entreprise || null,
                email || null,
                responsable || null,
                telephone || null,
                ice || null,
                identifiant_fiscale || null,
                patente || null,
                cnss || null
            ]
        );

        res.status(201).json({
            message: "Gestionnaire created successfully",
            id: result.insertId
        });

    } catch (error) {
        console.error("Error creating gestionnaire:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Update gestionnaire
 */
exports.updateGestionnaire = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            nom,
            adresse,
            type_entreprise,
            email,
            responsable,
            telephone,
            ice,
            identifiant_fiscale,
            patente,
            cnss
        } = req.body;

        const [existing] = await db.query(
            "SELECT id, logo FROM gestionnaire WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Gestionnaire not found" });
        }

        const finalLogo = req.file ? req.file.filename : existing[0].logo;

        await db.query(
            `
            UPDATE gestionnaire
            SET nom = ?,
                logo = ?,
                adresse = ?,
                type_entreprise = ?,
                email = ?,
                responsable = ?,
                telephone = ?,
                ice = ?,
                identifiant_fiscale = ?,
                patente = ?,
                cnss = ?
            WHERE id = ?
        `,
            [
                nom,
                finalLogo,
                adresse,
                type_entreprise,
                email,
                responsable,
                telephone,
                ice,
                identifiant_fiscale,
                patente,
                cnss,
                id
            ]
        );

        res.json({ message: "Gestionnaire updated successfully" });

    } catch (error) {
        console.error("Error updating gestionnaire:", error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * Delete gestionnaire
 */
exports.deleteGestionnaire = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await db.query(
            "SELECT id FROM gestionnaire WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Gestionnaire not found" });
        }

        await db.query(
            "DELETE FROM gestionnaire WHERE id = ?",
            [id]
        );

        res.json({ message: "Gestionnaire deleted successfully" });

    } catch (error) {
        console.error("Error deleting gestionnaire:", error);
        res.status(500).json({ message: "Server error" });
    }
};
