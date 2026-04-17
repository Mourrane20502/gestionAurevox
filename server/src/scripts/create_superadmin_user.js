const dotenv = require("dotenv");
dotenv.config();

const bcrypt = require("bcrypt");
const db = require("../config/db");

async function main() {
  const nom = "superadmin";
  const prenom = "aurevox";
  const email = "superadmin@gmail.com";
  const password = "Superadmin";
  const role = "superadmin";

  try {
    const [rows] = await db.promise().query("SELECT id FROM users WHERE email = ?", [email]);
    if (rows.length > 0) {
      console.log("A user with this email already exists. Nothing to do.");
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db
      .promise()
      .query(
        "INSERT INTO users (nom, prenom, email, password, role) VALUES (?, ?, ?, ?, ?)",
        [nom, prenom, email, hashedPassword, role]
      );

    console.log("Superadmin user created successfully:");
    console.log(`  email: ${email}`);
    console.log(`  password: ${password}`);
    console.log(`  role: ${role}`);

    // Optional: ensure a 'superadmin' role exists in roles table and has at least pdv_view permission
    const [roleRows] = await db
      .promise()
      .query("SELECT id FROM roles WHERE name = ?", [role]);

    let roleId = roleRows.length > 0 ? roleRows[0].id : null;

    if (!roleId) {
      const [insertRoleRes] = await db
        .promise()
        .query("INSERT INTO roles (name) VALUES (?)", [role]);
      roleId = insertRoleRes.insertId;
      console.log(`Created new role '${role}' with id ${roleId}`);
    }

    // Grant pdv_view permission to superadmin so Point de Vente works
    const [permRows] = await db
      .promise()
      .query("SELECT id FROM permissions WHERE name = 'pdv_view'");

    if (permRows.length > 0) {
      const permId = permRows[0].id;
      await db
        .promise()
        .query(
          "INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
          [roleId, permId]
        );
      console.log("Granted 'pdv_view' permission to superadmin role.");
    } else {
      console.log(
        "Warning: permission 'pdv_view' not found; please run init_rbac.js if RBAC is not initialized."
      );
    }

    process.exit(0);
  } catch (err) {
    console.error("Error creating superadmin user:", err);
    process.exit(1);
  }
}

main();

