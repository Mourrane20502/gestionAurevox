require('dotenv').config();
const db = require("./src/config/db").promise();

async function addNumeroColumn() {
    try {
        console.log("Checking if numero column exists in achats_fournisseurs...");
        const [columns] = await db.query("SHOW COLUMNS FROM achats_fournisseurs LIKE 'numero'");
        
        if (columns.length === 0) {
            console.log("Adding numero column to achats_fournisseurs...");
            await db.query("ALTER TABLE achats_fournisseurs ADD COLUMN numero VARCHAR(50) UNIQUE AFTER id");
            console.log("Column added successfully.");
        } else {
            console.log("Numero column already exists.");
        }
        
        console.log("Checking all columns...");
        const [allCols] = await db.query("SHOW COLUMNS FROM achats_fournisseurs");
        console.log("Columns:", allCols.map(c => c.Field).join(", "));
        
        console.log("Filling records with unique numero if NULL...");
        await db.query("UPDATE achats_fournisseurs SET numero = CONCAT('BCF-', LPAD(id, 6, '0')) WHERE numero IS NULL");
        console.log("Records update attempted.");
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        process.exit();
    }
}

addNumeroColumn();
