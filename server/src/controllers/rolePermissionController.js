const db = require("../config/db");

exports.getRoles = async (req, res) => {
    try {
        await db.promise().query(
            `
            INSERT IGNORE INTO roles (name) VALUES
            ('admin'),
            ('user'),
            ('responsable'),
            ('directeur'),
            ('comptable')
            `
        );
        const [roles] = await db.promise().query("SELECT * FROM roles");
        res.status(200).json(roles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur lors de la récupération des rôles" });
    }
};

exports.getPermissions = async (req, res) => {
    try {
        await db.promise().query(
            `
            INSERT IGNORE INTO permissions (name, description) VALUES
            ('devis_gros_view', 'Accès aux Devis gros'),
            ('commandes_gros_view', 'Accès aux Commandes gros'),
            ('factures_gros_view', 'Accès aux Factures gros'),
            ('avoirs_gros_view', 'Accès aux Avoirs gros'),
            ('bons_livraison_view', 'Accès aux bons de livraison'),
            ('pointage_view', 'Accès au pointage (présences)')
            `
        );
        const [permissions] = await db.promise().query("SELECT * FROM permissions");
        res.status(200).json(permissions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
};

exports.getRolePermissions = async (req, res) => {
    try {
        const { roleId } = req.params;
        const [rolePermissions] = await db.promise().query(
            "SELECT permission_id FROM role_permissions WHERE role_id = ?",
            [roleId]
        );
        const permissionIds = rolePermissions.map(rp => rp.permission_id);
        res.status(200).json(permissionIds);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur lors de la récupération des permissions du rôle" });
    }
};

exports.updateRolePermissions = async (req, res) => {
    const { roleId, permissionIds } = req.body;
    if (!roleId) {
        return res.status(400).json({ message: "L'ID du rôle est requis" });
    }

    try {
        await db.promise().query("DELETE FROM role_permissions WHERE role_id = ?", [roleId]);

        if (permissionIds && Array.isArray(permissionIds) && permissionIds.length > 0) {
            const values = permissionIds.map(permId => [roleId, permId]);
            await db.promise().query("INSERT INTO role_permissions (role_id, permission_id) VALUES ?", [values]);
        }

        res.status(200).json({ message: "Permissions du rôle mises à jour avec succès" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erreur lors de la mise à jour des permissions du rôle" });
    }
};
