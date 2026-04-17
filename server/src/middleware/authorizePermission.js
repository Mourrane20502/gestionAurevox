const db = require("../config/db");

const authorizePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ message: "Non authentifié" });
        }

        // Backward-compatibility: during a short period we used "commercial"
        // as a role name for basic users. Normalize it back to "user" so
        // permission checks are consistent with the roles table.
        const roleName = req.user.role === "commercial" ? "user" : req.user.role;

        // Super administrateur : accès total, sans vérification de permissions fines
        if (roleName === "superadmin") {
            return next();
        }

        if (roleName === "admin") {
            return next();
        }

        const sql = `
            SELECT p.name 
            FROM permissions p 
            JOIN role_permissions rp ON p.id = rp.permission_id 
            JOIN roles r ON r.id = rp.role_id 
            WHERE r.name = ? AND p.name = ?
        `;

        db.query(sql, [roleName, permission], (err, result) => {
            if (err) {
                console.error("Authorization error:", err);
                return res.status(500).json({ message: "Internal server error" });
            }

            if (result.length === 0) {
                return res.status(403).json({ message: "Accès refusé : Permission manquante" });
            }
            next();
        });
    };
};

module.exports = authorizePermission;
