const db = require("../config/db").promise();

exports.getAllCaisse = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT c.*, b.nom_banque 
            FROM caisse c 
            LEFT JOIN banques b ON c.id_banque = b.id 
            ORDER BY c.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching caisse:", error);
        res.status(500).json({ message: "Erreur lors de la récupération de la caisse" });
    }
};

exports.createCaisse = async (req, res) => {
    const { type, montant, descriptif, id_banque } = req.body;

    try {
        if (!type || !montant) {
            return res.status(400).json({ message: "Le type et le montant sont requis" });
        }

        const [result] = await db.query(
            "INSERT INTO caisse (`type`, montant, descriptif, id_banque) VALUES (?, ?, ?, ?)",
            [type, montant, descriptif, id_banque || null]
        );

        res.status(201).json({ id: result.insertId, message: "Entrée caisse créée avec succès" });
    } catch (err) {
        console.error("Error creating caisse:", err);
        res.status(500).json({ message: "Erreur lors de la création de l'entrée caisse" });
    }
};

exports.updateCaisse = async (req, res) => {
    const { id } = req.params;
    const { type, montant, descriptif, id_banque } = req.body;

    try {
        const [result] = await db.query(
            "UPDATE caisse SET `type` = ?, montant = ?, descriptif = ?, id_banque = ? WHERE id = ?",
            [type, montant, descriptif, id_banque || null, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Entrée caisse non trouvée" });
        }

        res.json({ message: "Entrée caisse mise à jour avec succès" });
    } catch (err) {
        console.error("Error updating caisse:", err);
        res.status(500).json({ message: "Erreur lors de la mise à jour de l'entrée caisse" });
    }
};

exports.deleteCaisse = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query("DELETE FROM caisse WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Entrée caisse non trouvée" });
        }

        res.json({ message: "Entrée caisse supprimée avec succès" });
    } catch (err) {
        console.error("Error deleting caisse:", err);
        res.status(500).json({ message: "Erreur lors de la suppression de l'entrée caisse" });
    }
};
