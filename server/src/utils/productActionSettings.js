const db = require("../config/db").promise();

const SETTING_KEY = "product_actions_by_role";

const defaultConfig = () => ({
    admin: { canEdit: true, canDelete: true },
    responsable: { canEdit: true, canDelete: true },
    directeur: { canEdit: true, canDelete: true },
    comptable: { canEdit: false, canDelete: false },
    user: { canEdit: false, canDelete: false },
});

const ensureSettingsTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS general_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value TEXT
        )
    `);
};

const normalizeOne = (entry, fallback) => ({
    canEdit: typeof entry?.canEdit === "boolean" ? entry.canEdit : fallback.canEdit,
    canDelete: typeof entry?.canDelete === "boolean" ? entry.canDelete : fallback.canDelete,
});

const normalizeConfig = (raw) => {
    const base = defaultConfig();
    return {
        admin: normalizeOne(raw?.admin, base.admin),
        responsable: normalizeOne(raw?.responsable, base.responsable),
        directeur: normalizeOne(raw?.directeur, base.directeur),
        comptable: normalizeOne(raw?.comptable, base.comptable),
        user: normalizeOne(raw?.user, base.user),
    };
};

const getProductActionConfig = async () => {
    await ensureSettingsTable();
    const [rows] = await db.query(
        "SELECT setting_value FROM general_settings WHERE setting_key = ? LIMIT 1",
        [SETTING_KEY]
    );
    if (!rows.length || !rows[0].setting_value) return defaultConfig();
    try {
        return normalizeConfig(JSON.parse(rows[0].setting_value));
    } catch {
        return defaultConfig();
    }
};

const saveProductActionConfig = async (nextConfig) => {
    await ensureSettingsTable();
    const normalized = normalizeConfig(nextConfig || {});
    await db.query(
        `
            INSERT INTO general_settings (setting_key, setting_value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `,
        [SETTING_KEY, JSON.stringify(normalized)]
    );
    return normalized;
};

module.exports = {
    getProductActionConfig,
    saveProductActionConfig,
};

