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
    if (rows.length === 0) return null; // Default to null (disabled)
    return rows[0].setting_value;
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
 * Checks if a document should be auto-approved.
 * Logic: if it's after the configured 'auto_approval_hour' 
 * AND the user has role 'user' (commercial).
 */
const shouldAutoApprove = async (user) => {
    try {
        const userRole = (user.role || "").toString().toLowerCase();
        
        // Only commercial users (role 'user') are eligible for auto-approval after hours
        if (userRole !== 'user') return false;

        const featureOn = await getAutoApprovalEnabled();
        if (!featureOn) return false;

        const closingHourSetting = await getAutoApprovalHour();
        if (!closingHourSetting) return false;

        // closingHourSetting is expected as "HH:mm"
        const [cHour, cMin] = closingHourSetting.split(':').map(Number);
        
        // We use the server's local time. 
        // If there's a timezone issue, we'll see it in the log below.
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        const isAfterHours = currentHour > cHour || (currentHour === cHour && currentMin >= cMin);
        
        console.log(`[Auto-Approval Check] Current: ${currentHour}:${currentMin}, Closing: ${cHour}:${cMin}, Role: ${userRole}, Triggered: ${isAfterHours}`);

        return isAfterHours;
    } catch (err) {
        console.error("Error in shouldAutoApprove:", err);
        return false;
    }
};

module.exports = {
    getApprovalConfigs,
    updateApprovalConfigs,
    canApprove,
    getAutoApprovalHour,
    setAutoApprovalHour,
    getAutoApprovalEnabled,
    setAutoApprovalEnabled,
    shouldAutoApprove
};
