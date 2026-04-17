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

async function addColumn(table, column, definition) {
    try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`Column ${column} added to ${table}`);
    } catch (err) {
        if (err.code === 'ER_DUP_COLUMN_NAME') {
            console.log(`Column ${column} already exists in ${table}`);
        } else {
            console.error(`Error adding ${column} to ${table}:`, err);
        }
    }
}

async function updateTables() {
    try {
        const tables = ['devis', 'commandes', 'factures'];
        for (const table of tables) {
            await addColumn(table, 'reduction', 'DECIMAL(5, 2) DEFAULT 0.00');
            await addColumn(table, 'montant_ttc', 'DECIMAL(15, 2) DEFAULT 0.00');
        }
        console.log("Tables check completed!");
        process.exit(0);
    } catch (err) {
        console.error("Critical error:", err);
        process.exit(1);
    }
}

updateTables();
