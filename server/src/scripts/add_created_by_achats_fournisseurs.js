/**
 * Add created_by column to achats_fournisseurs if missing (to track user who created the achat)
 */
const db = require("../config/db").promise();

async function run() {
    try {
        const [cols] = await db.query(
            "SHOW COLUMNS FROM achats_fournisseurs LIKE 'created_by'"
        );
        if (cols.length > 0) {
            console.log("Column created_by already exists on achats_fournisseurs. Nothing to do.");
            process.exit(0);
            return;
        }
        await db.query(
            "ALTER TABLE achats_fournisseurs ADD COLUMN created_by INT NULL AFTER designation_libre"
        );
        console.log("Column created_by added to achats_fournisseurs.");
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

run();
