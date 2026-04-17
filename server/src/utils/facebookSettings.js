const db = require("../config/db").promise();

const ensureSettingsTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS general_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value TEXT
        )
    `);
};

const SETTINGS_KEYS = {
    pageId: "facebook_page_id",
    pageAccessToken: "facebook_page_access_token",
    apiVersion: "facebook_api_version",
    apiUrl: "facebook_api_url",
};

const getSettingValue = async (key) => {
    const [rows] = await db.query(
        "SELECT setting_value FROM general_settings WHERE setting_key = ? LIMIT 1",
        [key]
    );
    return rows[0]?.setting_value ?? null;
};

const upsertSetting = async (key, value) => {
    await db.query(
        `
            INSERT INTO general_settings (setting_key, setting_value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `,
        [key, value]
    );
};

const getFacebookSettingsFromDb = async () => {
    await ensureSettingsTable();
    const [pageId, pageAccessToken, apiVersion, apiUrl] = await Promise.all([
        getSettingValue(SETTINGS_KEYS.pageId),
        getSettingValue(SETTINGS_KEYS.pageAccessToken),
        getSettingValue(SETTINGS_KEYS.apiVersion),
        getSettingValue(SETTINGS_KEYS.apiUrl),
    ]);

    return {
        pageId,
        pageAccessToken,
        apiVersion,
        apiUrl,
    };
};

const updateFacebookSettingsInDb = async ({
    pageId,
    pageAccessToken,
    apiVersion,
    apiUrl,
}) => {
    await ensureSettingsTable();

    const updates = [];
    if (pageId !== undefined) updates.push(upsertSetting(SETTINGS_KEYS.pageId, pageId || ""));
    if (pageAccessToken !== undefined) updates.push(upsertSetting(SETTINGS_KEYS.pageAccessToken, pageAccessToken || ""));
    if (apiVersion !== undefined) updates.push(upsertSetting(SETTINGS_KEYS.apiVersion, apiVersion || ""));
    if (apiUrl !== undefined) updates.push(upsertSetting(SETTINGS_KEYS.apiUrl, apiUrl || ""));

    await Promise.all(updates);
};

module.exports = {
    getFacebookSettingsFromDb,
    updateFacebookSettingsInDb,
};

