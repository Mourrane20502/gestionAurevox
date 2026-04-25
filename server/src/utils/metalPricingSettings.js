const db = require("../config/db").promise();

const SETTING_KEY = "metal_pricing";

const ALLOWED_KEYS = [
    "defaultMetal",
    "priceOrResign",
    "priceOrRafinity",
    "priceOrBeldi",
    "priceOrOccasion",
    "priceSilverBeldy",
    "priceSilverRafinity",
];

const ensureSettingsTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS general_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value TEXT
        )
    `);
};

const defaultPricing = () => ({
    defaultMetal: "or",
    priceOrResign: "",
    priceOrRafinity: "",
    priceOrBeldi: "",
    priceOrOccasion: "",
    priceSilverBeldy: "",
    priceSilverRafinity: "",
});

/**
 * @returns {Promise<Record<string, string>>}
 */
const getMetalPricing = async () => {
    await ensureSettingsTable();
    const [rows] = await db.query(
        "SELECT setting_value FROM general_settings WHERE setting_key = ? LIMIT 1",
        [SETTING_KEY]
    );
    const base = defaultPricing();
    if (!rows.length || !rows[0].setting_value) return base;
    try {
        const parsed = JSON.parse(rows[0].setting_value);
        return { ...base, ...parsed };
    } catch {
        return base;
    }
};

/**
 * @param {Record<string, unknown>} patch
 */
const mergeMetalPricing = async (patch) => {
    await ensureSettingsTable();
    const current = await getMetalPricing();
    const merged = { ...current };
    for (const k of ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) {
            const v = patch[k];
            merged[k] = v == null ? "" : String(v).trim();
        }
    }
    merged.defaultMetal = merged.defaultMetal === "silver" ? "silver" : "or";
    const json = JSON.stringify(merged);
    await db.query(
        `
            INSERT INTO general_settings (setting_key, setting_value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `,
        [SETTING_KEY, json]
    );
    return merged;
};

module.exports = {
    getMetalPricing,
    mergeMetalPricing,
};
