require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const db = require("../config/db");

const createTables = async () => {
    try {
        console.log("Starting RBAC table creation...");

        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE
            )
        `);

        // Ensure users.role supports the comptable role (migration-safe)
        try {
            await db.promise().query(`
                ALTER TABLE users 
                MODIFY COLUMN role ENUM('admin','responsable','directeur','comptable','user','superadmin') NOT NULL DEFAULT 'user'
            `);
        } catch (e) {
            // Ignore when users table does not exist yet in very early bootstrap
            if (e.code !== "ER_NO_SUCH_TABLE") throw e;
        }

        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT
            )
        `);

        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id INT NOT NULL,
                permission_id INT NOT NULL,
                PRIMARY KEY (role_id, permission_id),
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
            )
        `);

        // Product movements table (audit des produits)
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS product_movements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                \`type\` VARCHAR(50) NOT NULL,
                quantity_before INT NULL,
                quantity_after INT NULL,
                description TEXT,
                user_id INT NULL,
                reference_type VARCHAR(50) NULL,
                reference_id INT NULL,
                reference_numero VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add reference columns if table already existed without them (migration)
        try {
            await db.promise().query("ALTER TABLE product_movements ADD COLUMN reference_type VARCHAR(50) NULL AFTER user_id");
        } catch (e) {
            if (e.code !== "ER_DUP_FIELDNAME") throw e;
        }
        try {
            await db.promise().query("ALTER TABLE product_movements ADD COLUMN reference_id INT NULL AFTER reference_type");
        } catch (e) {
            if (e.code !== "ER_DUP_FIELDNAME") throw e;
        }
        try {
            await db.promise().query("ALTER TABLE product_movements ADD COLUMN reference_numero VARCHAR(100) NULL AFTER reference_id");
        } catch (e) {
            if (e.code !== "ER_DUP_FIELDNAME") throw e;
        }

        // Vérifications inventaire (écarts stock → approbations)
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS inventory_verifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                product_nom VARCHAR(255) NOT NULL,
                stock_systeme INT NOT NULL,
                stock_reel INT NOT NULL,
                ecart INT NOT NULL,
                justification TEXT,
                user_id INT NULL,
                statut VARCHAR(50) NOT NULL DEFAULT 'en_attente',
                admin_message TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);

        // Insert default roles
        await db.promise().query(`
            INSERT IGNORE INTO roles (id, name) VALUES 
            (1, 'admin'),
            (2, 'user'),
            (3, 'responsable'),
            (4, 'directeur'),
            (5, 'comptable')
        `);

        // Insert default permissions based on App.tsx routes
        const permissions = [
            ['dashboard_view', 'Accès au Tableau de Bord'],
            ['products_view', 'Accès aux Produits'],
            ['products_inventory_view', 'Accès à l\'inventaire produits'],
            ['products_movements_view', 'Accès aux mouvements produits'],
            ['clients_view', 'Accès aux Clients'],
            ['pdv_view', 'Accès au Point de Vente'],
            ['categories_view', 'Accès aux Catégories'],
            ['devis_view', 'Accès aux Devis'],
            ['devis_gros_view', 'Accès aux Devis gros'],
            ['commandes_view', 'Accès aux Commandes'],
            ['bons_livraison_view', 'Accès aux bons de livraison'],
            ['commandes_gros_view', 'Accès aux Commandes gros'],
            ['factures_view', 'Accès aux Factures'],
            ['factures_gros_view', 'Accès aux Factures gros'],
            ['avoirs_view', 'Accès aux Avoirs'],
            ['avoirs_gros_view', 'Accès aux Avoirs gros'],
            ['fournisseurs_view', 'Accès aux Fournisseurs'],
            ['gestionnaires_view', 'Accès aux Gestionnaires'],
            ['employees_view', 'Accès aux Employés'],
            ['conges_view', 'Accès aux Congés'],
            ['pointage_view', 'Accès au pointage (présences)'],
            ['salaries_view', 'Accès aux Salaires'],
            ['users_view', 'Accès aux Utilisateurs'],
            ['tickets_view', 'Accès aux Tickets'],
            ['settings_view', 'Accès aux Paramètres'],
            ['payments_view', 'Accès aux Paiements'],
            ['reglements_view', 'Accès aux Règlements clients'],
            ['reglements_approve', 'Approbation des règlements clients'],
            ['bilan_view', 'Accès au Bilan'],
            ['banque_view', 'Accès à la Banque'],
            ['caisse_view', 'Accès à la Caisse'],
            ['paie_view', 'Accès à la Paie'],
            ['approvals_view', 'Accès aux approbations (validations)']
        ];

        for (const [name, description] of permissions) {
            await db.promise().query(`
                INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)
            `, [name, description]);
        }

        // Assign all permissions to admin (role_id = 1)
        const [allPermissions] = await db.promise().query('SELECT id FROM permissions');
        for (const perm of allPermissions) {
            await db.promise().query(`
                INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (1, ?)
            `, [perm.id]);
        }

        // Assign some permissions to basic user (role_id = 2) by default
        const userPerms = ['products_view', 'pdv_view', 'clients_view', 'devis_view', 'commandes_view', 'bons_livraison_view', 'factures_view', 'tickets_view'];
        for (const permName of userPerms) {
            const [perm] = await db.promise().query('SELECT id FROM permissions WHERE name = ?', [permName]);
            if (perm.length > 0) {
                await db.promise().query(`
                    INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (2, ?)
                `, [perm[0].id]);
            }
        }

        // Assign broad permissions to responsable (role_id = 3)
        const responsablePerms = ['dashboard_view', 'products_view', 'products_inventory_view', 'products_movements_view', 'pdv_view', 'clients_view', 'devis_view', 'commandes_view', 'bons_livraison_view', 'factures_view', 'avoirs_view', 'fournisseurs_view', 'gestionnaires_view', 'employees_view', 'conges_view', 'pointage_view', 'tickets_view', 'banque_view', 'caisse_view', 'reglements_view'];
        for (const permName of responsablePerms) {
            const [perm] = await db.promise().query('SELECT id FROM permissions WHERE name = ?', [permName]);
            if (perm.length > 0) {
                await db.promise().query(`
                    INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (3, ?)
                `, [perm[0].id]);
            }
        }

        // Assign high-level oversight permissions to directeur (role_id = 4)
        const directeurPerms = ['dashboard_view', 'products_view', 'products_inventory_view', 'products_movements_view', 'clients_view', 'devis_view', 'commandes_view', 'bons_livraison_view', 'factures_view', 'avoirs_view', 'fournisseurs_view', 'gestionnaires_view', 'employees_view', 'conges_view', 'pointage_view', 'bilan_view', 'banque_view', 'caisse_view', 'tickets_view', 'reglements_view', 'reglements_approve'];
        for (const permName of directeurPerms) {
            const [perm] = await db.promise().query('SELECT id FROM permissions WHERE name = ?', [permName]);
            if (perm.length > 0) {
                await db.promise().query(`
                    INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (4, ?)
                `, [perm[0].id]);
            }
        }

        // Assign finance-oriented permissions to comptable (role_id = 5)
        const comptablePerms = ['dashboard_view', 'clients_view', 'commandes_view', 'bons_livraison_view', 'factures_view', 'avoirs_view', 'fournisseurs_view', 'reglements_view', 'bilan_view', 'banque_view', 'caisse_view'];
        for (const permName of comptablePerms) {
            const [perm] = await db.promise().query('SELECT id FROM permissions WHERE name = ?', [permName]);
            if (perm.length > 0) {
                await db.promise().query(`
                    INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (5, ?)
                `, [perm[0].id]);
            }
        }

        console.log("RBAC tables and initial data created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error creating RBAC tables:", error);
        process.exit(1);
    }
};

createTables();
