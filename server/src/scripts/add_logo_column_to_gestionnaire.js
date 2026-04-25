const dotenv = require("dotenv");
dotenv.config();

const db = require("../config/db");

async function main() {
  try {
    const dbName = process.env.DB_NAME;
    if (!dbName) {
      console.error("DB_NAME is not defined in environment.");
      process.exit(1);
    }

    // Check if the 'logo' column already exists
    const [cols] = await db
      .promise()
      .query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'gestionnaire' AND COLUMN_NAME = 'logo'`,
        [dbName]
      );

    if (cols.length > 0) {
      console.log("Column 'logo' already exists on table 'gestionnaire'. Nothing to do.");
      process.exit(0);
    }

    // Add the logo column (nullable VARCHAR)
    await db
      .promise()
      .query(
        "ALTER TABLE gestionnaire ADD COLUMN logo VARCHAR(255) NULL AFTER nom"
      );

    console.log("Column 'logo' added to table 'gestionnaire' successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error adding 'logo' column to gestionnaire:", err);
    process.exit(1);
  }
}

main();

