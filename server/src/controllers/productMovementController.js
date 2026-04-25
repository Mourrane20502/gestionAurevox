const db = require("../config/db").promise();
const { ensureProductMovementsAuditSchema } = require("../utils/productMovementLogger");

exports.getAllMovements = async (req, res) => {
    try {
        await ensureProductMovementsAuditSchema();
        const [rows] = await db.execute(`
            SELECT pm.*,
                   COALESCE(
                       p.nom,
                       CASE
                           WHEN pm.type = 'delete'
                                AND pm.description IS NOT NULL
                                AND pm.description LIKE 'Suppression du produit %'
                           THEN TRIM(SUBSTRING(pm.description, LENGTH('Suppression du produit ') + 1))
                           ELSE CONCAT('Produit #', pm.product_id)
                       END
                   ) AS produit_nom,
                   p.reference AS produit_reference,
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

