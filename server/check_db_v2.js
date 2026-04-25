require('dotenv').config();
const db = require("./src/config/db").promise();
async function check() {
    try {
        const [rows] = await db.query("SELECT * FROM roles");
        console.log("Roles:", rows);
        const [columns] = await db.query("SHOW COLUMNS FROM approval_settings");
        console.log("Approval Settings Columns:", columns);
        process.exit(0);
    } catch (err) {
        console.error("Error or table not found");
        process.exit(0);
    }
}
check();
