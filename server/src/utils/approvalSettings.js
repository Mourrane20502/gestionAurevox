const db = require("../config/db").promise();

const ensureSettingsTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS general_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value TEXT
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS approval_configs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            document_type VARCHAR(50) NOT NULL,
            role_name VARCHAR(50) NOT NULL,
            UNIQUE KEY (document_type, role_name)
        )
    `);
};

const getApprovalConfigs = async () => {
    await ensureSettingsTable();
    const [rows] = await db.query("SELECT * FROM approval_configs");
    return rows;
};

const updateApprovalConfigs = async (configs) => {
    await ensureSettingsTable();
    // configs is expected to be an object: { document_type: [roles] }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query("DELETE FROM approval_configs");
        
        const values = [];
        for (const [docType, roles] of Object.entries(configs)) {
            roles.forEach(role => {
                values.push([docType, role]);
            });
        }

        if (values.length > 0) {
            await connection.query("INSERT INTO approval_configs (document_type, role_name) VALUES ?", [values]);
        }
        
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

const canApprove = async (roleName, documentType) => {
    // Superadmin always can approve
    if (roleName === 'superadmin') return true;

    const [rows] = await db.query(
        "SELECT id FROM approval_configs WHERE document_type = ? AND role_name = ?",
        [documentType, roleName]
    );
    return rows.length > 0;
};

const getAutoApprovalHour = async () => {
    await ensureSettingsTable();
    const [rows] = await db.query("SELECT setting_value FROM general_settings WHERE setting_key = 'auto_approval_hour'");
    if (rows.length === 0) return null;
    const v = String(rows[0].setting_value ?? "").trim();
    return v || null;
};

const normalizeRoleForAutoApproval = (role) => {
    const r = String(role ?? "").trim().toLowerCase();
    if (r === "commercial") return "user";
    return r;
};

const setAutoApprovalHour = async (hour) => {
    await ensureSettingsTable();
    await db.query(`
        INSERT INTO general_settings (setting_key, setting_value) 
        VALUES ('auto_approval_hour', ?) 
        ON DUPLICATE KEY UPDATE setting_value = ?
    `, [hour, hour]);
};

const AUTO_APPROVAL_ENABLED_KEY = "auto_approval_enabled";

/** @returns {Promise<boolean>} true = la validation auto peut s'appliquer (si heure + rôle OK). Défaut true si clé absente (rétrocompat). */
const getAutoApprovalEnabled = async () => {
    await ensureSettingsTable();
    const [rows] = await db.query(
        "SELECT setting_value FROM general_settings WHERE setting_key = ?",
        [AUTO_APPROVAL_ENABLED_KEY]
    );
    if (rows.length === 0) return true;
    const v = String(rows[0].setting_value ?? "")
        .trim()
        .toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "non") return false;
    return true;
};

const setAutoApprovalEnabled = async (enabled) => {
    await ensureSettingsTable();
    const val = enabled ? "1" : "0";
    await db.query(
        `
        INSERT INTO general_settings (setting_key, setting_value) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE setting_value = ?
    `,
        [AUTO_APPROVAL_ENABLED_KEY, val, val]
    );
};

/**
 * Validation automatique après l'heure de clôture (tous les rôles).
 */
const shouldAutoApprove = async (user) => {
    try {
        const userRole = normalizeRoleForAutoApproval(user?.role);

        const featureOn = await getAutoApprovalEnabled();
        if (!featureOn) return false;

        const closingHourSetting = await getAutoApprovalHour();
        if (!closingHourSetting) return false;

        const parts = closingHourSetting.split(":");
        const cHour = parseInt(parts[0], 10);
        const cMin = parseInt(parts[1] ?? "0", 10);
        if (!Number.isFinite(cHour) || !Number.isFinite(cMin)) return false;

        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        const isAfterHours =
            currentHour > cHour || (currentHour === cHour && currentMin >= cMin);

        console.log(
            `[Auto-Approval] now=${currentHour}:${String(currentMin).padStart(2, "0")} closing=${cHour}:${String(cMin).padStart(2, "0")} role=${userRole} enabled=${featureOn} triggered=${isAfterHours}`
        );

        return isAfterHours;
    } catch (err) {
        console.error("Error in shouldAutoApprove:", err);
        return false;
    }
};

/**
 * Statut initial à la création selon validation auto / droits d'approbation.
 */
const resolveCreationApprovalStatut = async (
    user,
    documentType,
    { pending, approved, requested }
) => {
    const featureOn = await getAutoApprovalEnabled();
    if (!featureOn) {
        return pending;
    }

    const autoApprove = await shouldAutoApprove(user);
    if (autoApprove) return approved;

    const allowedToApprove = await canApprove(user.role, documentType);
    if (allowedToApprove) return requested ?? approved;

    const role = (user?.role || "").toString().toLowerCase();
    if (role === "user") return pending;
    return requested ?? approved;
};

module.exports = {
    getApprovalConfigs,
    updateApprovalConfigs,
    canApprove,
    getAutoApprovalHour,
    setAutoApprovalHour,
    getAutoApprovalEnabled,
    setAutoApprovalEnabled,
    shouldAutoApprove,
    resolveCreationApprovalStatut,
};
