const db = require("../config/db").promise();

exports.getAllMovements = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT pm.*,
                   p.nom AS produit_nom,
                   p.id_point_de_vente,
                   pdv.nom AS point_de_vente_nom,
                   u.nom AS user_nom,
                   u.prenom AS user_prenom
            FROM product_movements pm
            LEFT JOIN products p ON pm.product_id = p.id
            LEFT JOIN point_de_vente pdv ON p.id_point_de_vente = pdv.id
            LEFT JOIN users u ON pm.user_id = u.id
            ORDER BY pm.created_at DESC
            LIMIT 500
        `);

        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching product movements:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

