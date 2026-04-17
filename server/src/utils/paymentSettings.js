const db = require("../config/db").promise();

const TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS payment_modes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(100) NOT NULL,
        value VARCHAR(50) NOT NULL UNIQUE,
        is_default BOOLEAN DEFAULT FALSE
    )
`;

const ensureTable = async () => {
    await db.query(TABLE_SQL);
};

const getPaymentModes = async () => {
    await ensureTable();
    const [rows] = await db.query("SELECT * FROM payment_modes ORDER BY id ASC");
    if (rows.length === 0) {
        // Initialiser avec les valeurs par défaut si vide
        const defaults = [
            { label: "Espèce", value: "espece" },
            { label: "Chèque", value: "cheque" },
            { label: "Virement", value: "virement" },
            { label: "Carte Bancaire (ou TPE)", value: "carte" },
            { label: "Effet", value: "effet" }
        ];
        for (const d of defaults) {
            await db.execute(
                "INSERT IGNORE INTO payment_modes (label, value, is_default) VALUES (?, ?, TRUE)",
                [d.label, d.value]
            );
        }
        const [refetched] = await db.query("SELECT * FROM payment_modes ORDER BY id ASC");
        return refetched;
    }
    return rows;
};

const addPaymentMode = async (label, value) => {
    await ensureTable();
    await db.execute(
        "INSERT INTO payment_modes (label, value) VALUES (?, ?)",
        [label, value]
    );
};

const deletePaymentMode = async (id) => {
    await ensureTable();
    await db.execute("DELETE FROM payment_modes WHERE id = ?", [id]);
};

module.exports = {
    getPaymentModes,
    addPaymentMode,
    deletePaymentMode
};
