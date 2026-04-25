const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const db = require("./src/config/db");

async function migrate() {
    try {
        console.log("Starting migration...");

        // 1. Add 'revendeur' to the ENUM if it's currently ('particulier', 'societe')
        console.log("Expanding ENUM definition...");
        await db.promise().execute("ALTER TABLE clients MODIFY COLUMN type ENUM('particulier', 'revendeur', 'societe') DEFAULT 'particulier'");

        // 2. Update existing 'societe' to 'revendeur'
        console.log("Updating 'societe' values to 'revendeur'...");
        await db.promise().execute("UPDATE clients SET type = 'revendeur' WHERE type = 'societe'");

        // 3. Remove 'societe' from the ENUM definition
        console.log("Finalizing ENUM definition...");
        await db.promise().execute("ALTER TABLE clients MODIFY COLUMN type ENUM('particulier', 'revendeur') DEFAULT 'particulier'");

        console.log("Migration successful!");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
