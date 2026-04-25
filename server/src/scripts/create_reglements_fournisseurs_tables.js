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

async function createReglementsFournisseursTable() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS reglements_fournisseurs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fournisseur_id INT NOT NULL,
                achat_id INT NULL,
                date_reglement DATETIME NOT NULL,
                date_echeance DATETIME NULL,
                montant DECIMAL(15,2) NOT NULL,
                mode_paiement VARCHAR(50) NOT NULL,
                banque_id INT NULL,
                statut VARCHAR(50) NOT NULL DEFAULT 'en_attente',
                commentaire TEXT NULL,
                created_by INT NOT NULL,
                approved_by INT NULL,
                approved_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        console.log("Table reglements_fournisseurs checked/created successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error creating reglements_fournisseurs table:", err);
        process.exit(1);
    }
}

createReglementsFournisseursTable();

