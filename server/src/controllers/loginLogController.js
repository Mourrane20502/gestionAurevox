const db = require("../config/db").promise();

const ENSURE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS login_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        email VARCHAR(255) NULL,
        user_nom VARCHAR(255) NULL,
        user_prenom VARCHAR(255) NULL,
        ip_address VARCHAR(64) NULL,
        location VARCHAR(255) NULL,
        user_agent TEXT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;

const ensureTable = async () => {
    const conn = await db.getConnection();
    try {
        await conn.query(ENSURE_TABLE_SQL);
        // Add location column if it doesn't exist
        try {
            await conn.query("ALTER TABLE login_logs ADD COLUMN location VARCHAR(255) NULL AFTER ip_address");
        } catch (e) {
            // Probably already exists
        }
    } finally {
        conn.release();
    }
};

exports.getLoginLogs = async (req, res) => {
    try {
        await ensureTable();

        const hasPagination = req.query && (req.query.page !== undefined || req.query.limit !== undefined);
        if (!hasPagination) {
            const [rows] = await db.query(
                "SELECT * FROM login_logs ORDER BY created_at DESC LIMIT 200"
            );
            return res.json(rows);
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        const [[countRow]] = await db.query("SELECT COUNT(*) AS total FROM login_logs");
        const total = Number(countRow?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / limit));

        const [rows] = await db.query(
            "SELECT * FROM login_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [limit, offset]
        );

        return res.json({ items: rows, total, page, limit, totalPages });
    } catch (error) {
        console.error("Error fetching login logs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
