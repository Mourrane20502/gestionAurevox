/**
 * Exécute server/migrations/001_devis_commande_facture_gros.sql
 * Usage (depuis le dossier server): node scripts/runMigrationGros.js
 * Requiert .env avec DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function main() {
    const sqlPath = path.join(__dirname, "../migrations/001_devis_commande_facture_gros.sql");
    if (!fs.existsSync(sqlPath)) {
        console.error("Fichier introuvable:", sqlPath);
        process.exit(1);
    }
    const sql = fs.readFileSync(sqlPath, "utf8");

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        multipleStatements: true,
    });

    try {
        await connection.query(sql);
        console.log("Migration 001_devis_commande_facture_gros.sql exécutée avec succès.");
    } finally {
        await connection.end();
    }
}

main().catch((err) => {
    console.error("Erreur migration:", err.message);
    process.exit(1);
});
