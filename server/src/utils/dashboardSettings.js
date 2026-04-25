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

/**
 * Gets the dashboard widget visibility configuration.
 * Returns an object: { role_name: [widget_ids] }
 */
const getDashboardWidgetsVisibility = async () => {
    await ensureSettingsTable();
    const [rows] = await db.query("SELECT setting_value FROM general_settings WHERE setting_key = 'dashboard_widgets_visibility'");
    if (rows.length === 0) {
        // Default visibility if none set
        return {
            admin: [
                "stats_revenue", "stats_month", "stats_products", "stats_clients", 
                "stats_ca_today", "stats_total_avoirs", "stats_fournisseurs", "stats_pending_commandes",
                "chart_monthly_sales", "chart_pdv_sales", "chart_client_types", "chart_caisse_recap",
                "sales_insights",
                "table_top_products", "table_least_products", "table_low_stock", "quick_actions"
            ],
            responsable: [
                "stats_revenue", "stats_month", "stats_products", "stats_clients", 
                "stats_ca_today", "stats_total_avoirs", "stats_fournisseurs", "stats_pending_commandes",
                "chart_monthly_sales", "chart_pdv_sales", "chart_client_types", "chart_caisse_recap",
                "sales_insights",
                "table_top_products", "table_least_products", "table_low_stock", "quick_actions"
            ],
            user: [
                "stats_products", "stats_clients", "stats_ca_today", "stats_total_avoirs", "stats_pending_commandes",
                "chart_monthly_sales", "sales_insights", "table_top_products", "table_low_stock", "quick_actions"
            ]
        };
    }
    try {
        return JSON.parse(rows[0].setting_value);
    } catch (e) {
        return {};
    }
};

/**
 * Updates the dashboard widget visibility configuration.
 * @param {Object} visibility - { role_name: [widget_ids] }
 */
const updateDashboardWidgetsVisibility = async (visibility) => {
    await ensureSettingsTable();
    const value = JSON.stringify(visibility);
    await db.query(`
        INSERT INTO general_settings (setting_key, setting_value) 
        VALUES ('dashboard_widgets_visibility', ?) 
        ON DUPLICATE KEY UPDATE setting_value = ?
    `, [value, value]);
};

module.exports = {
    getDashboardWidgetsVisibility,
    updateDashboardWidgetsVisibility
};
