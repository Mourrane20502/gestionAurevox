const mysql2 = require("mysql2");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const db = mysql2.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
}).promise();

async function createRemboursementsTable() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS remboursements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                commande_id INT NOT NULL,
                montant DECIMAL(15,2) NOT NULL,
                motif TEXT NOT NULL,
                statut VARCHAR(50) NOT NULL DEFAULT 'en_attente',
                valide_par INT NULL,
                created_by INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_remboursements_commande (commande_id),
                INDEX idx_remboursements_statut (statut)
            )
        `);
        console.log("Table remboursements checked/created successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error creating remboursements table:", err);
        process.exit(1);
    }
}

createRemboursementsTable();
