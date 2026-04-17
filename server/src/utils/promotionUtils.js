const db = require("../config/db");

const ensurePromotionsTable = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS promotions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT,
            label VARCHAR(255) NOT NULL,
            description TEXT,
            discount_percent DECIMAL(5,2),
            start_date DATE,
            end_date DATE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    `;
    try {
        await db.promise().query(query);
        console.log("Table 'promotions' vérifiée/créée.");
    } catch (err) {
        console.error("Erreur lors de la création de la table promotions:", err);
    }
};

module.exports = { ensurePromotionsTable };
