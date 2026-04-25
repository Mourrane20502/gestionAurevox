const db = require("../config/db").promise();


exports.getAllBanques = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM banques");
        res.json(rows);
    } catch (error) {
        console.error("Error fetching banques:", error);
        res.status(500).json({ message: "Error fetching banques" });
    }
}

exports.createBanque = async (req, res) => {
    const { nom_banque, nom_compte, numero_compte, devise = "MAD", solde_initial = 0, solde_actuel = 0, actif = true } = req.body;

    try {
        if (!nom_banque || !nom_compte) {
            return res.status(400).json({ message: "nom banque et nom_compte sont requis" });
        }
        const [rows] = await db.query("INSERT INTO banques (nom_banque,nom_compte,numero_compte,devise,solde_initial,solde_actuel,actif) VALUES (?,?,?,?,?,?,?)", [nom_banque, nom_compte, numero_compte, devise, solde_initial, solde_actuel, actif]);
        res.json(rows);
    } catch (err) {
        console.error("Error creating banque:", err);
        res.status(500).json({ message: "Error creating banque" });
    }
}

exports.updateBanque = async (req, res) => {
    const { id } = req.params;
    const { nom_banque, nom_compte, numero_compte, devise, solde_initial, solde_actuel, actif } = req.body;

    try {
        if (!nom_banque || !nom_compte || !numero_compte) {
            return res.status(400).json({ message: "Nom banque, nom compte et numéro de compte sont requis" });
        }
        const [rows] = await db.query("UPDATE banques SET nom_banque = ?,nom_compte = ?,numero_compte = ?,devise = ?,solde_initial = ?,solde_actuel = ?,actif = ? WHERE id = ?", [nom_banque, nom_compte, numero_compte, devise, solde_initial, solde_actuel, actif, id]);
        res.json(rows);
    } catch (err) {
        console.error("Error updating banque:", err);
        res.status(500).json({ message: "Error updating banque" });
    }
}

exports.deleteBanque = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.query("DELETE FROM banques WHERE id = ?", [id]);
        res.json(rows);
    } catch (err) {
        console.error("Error deleting banque:", err);
        res.status(500).json({ message: "Error deleting banque" });
    }
}