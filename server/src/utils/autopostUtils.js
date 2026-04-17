const db = require("../config/db");

const ensureAutopostsTable = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS social_autoposts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            content TEXT NOT NULL,
            media_url VARCHAR(1024) NULL,
            scheduled_for DATETIME NOT NULL,
            platforms_json TEXT NOT NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
            platform_results_json LONGTEXT NULL,
            last_error LONGTEXT NULL,
            created_by INT NULL,
            job_id VARCHAR(120) NULL,
            published_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_social_autoposts_status (status),
            INDEX idx_social_autoposts_scheduled_for (scheduled_for)
        )
    `;

    try {
        await db.promise().query(query);
        console.log("Table 'social_autoposts' verifiee/cree.");
    } catch (err) {
        console.error("Erreur lors de la creation de la table social_autoposts:", err);
    }
};

module.exports = { ensureAutopostsTable };
