const db = require("../config/db").promise();


exports.getAllFournisseurs = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM fournisseur ORDER BY id DESC");
        res.json(rows);
    } catch (error) {
        console.error("Error fetching fournisseurs:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.getFournisseurById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            "SELECT * FROM fournisseurs WHERE id = ?",
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
        const { nom, ice, telephone, email, rc, adresse } = req.body;

        if (!nom) {
            return res.status(400).json({ message: "Nom is required" });
        }

        const [result] = await db.query(
            `INSERT INTO fournisseur 
            (nom, ice, telephone, email, rc, adresse) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [nom, ice || null, telephone || null, email || null, rc || null, adresse || null]
        );

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
        const { id } = req.params;
        const { nom, ice, telephone, email, rc, adresse } = req.body;

        // Check existence
        const [existing] = await db.query(
            "SELECT id FROM fournisseur WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Fournisseur not found" });
        }

        await db.query(
            `UPDATE fournisseur 
             SET nom = ?, ice = ?, telephone = ?, email = ?, rc = ?, adresse = ?
             WHERE id = ?`,
            [nom, ice, telephone, email, rc, adresse, id]
        );

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
