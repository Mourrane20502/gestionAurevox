const db = require("../config/db").promise();

const TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS numbering_settings (
        \`type\` VARCHAR(64) PRIMARY KEY,
        \`offset\` INT NOT NULL DEFAULT 0
    )
`;

const normalizeCounterType = (type) => {
    const upper = String(type || "").toUpperCase();
    return upper;
};


const ensureTable = async (connection) => {
    const conn = connection || await db.getConnection();
    const shouldRelease = !connection;
    try {
        await conn.query(TABLE_SQL);
    } finally {
        if (shouldRelease) {
            conn.release();
        }
    }
};

/**
 * Renvoie la valeur de "prochain numéro" pour un type donné SANS l'incrémenter.
 * - Si offset > 0 dans la table, on retourne cette valeur.
 * - Sinon, on retourne 0 (pour laisser le contrôleur utiliser son fallback basé sur l'id).
 */
const buildScopedType = (type, options = {}) => {
    const upper = normalizeCounterType(type);
    const ssId = Number(options?.sousSocieteId);
    if (Number.isFinite(ssId) && ssId > 0) {
        return `${upper}__SS${Math.trunc(ssId)}`;
    }
    return upper;
};

const getOffset = async (type, options = {}) => {
    const scopedType = buildScopedType(type, options);
    await ensureTable();
    const [rows] = await db.query(
        "SELECT `offset` FROM numbering_settings WHERE `type` = ?",
        [scopedType]
    );
    if (rows.length === 0) {
        return 0;
    }
    const value = Number(rows[0].offset);
    return Number.isFinite(value) ? value : 0;
};

/**
 * Renvoie le prochain numéro de séquence pour un document donné,
 * en utilisant la même connexion que la transaction du contrôleur.
 *
 * Règles:
 * - Si offset (stocké) > 0: on utilise cette valeur comme prochain numéro,
 *   puis on incrémente offset = offset + 1 (pour la prochaine fois).
 * - Si offset == 0 ou null: on utilise fallbackId (l'id auto-incrémenté),
 *   et on laisse offset à 0 pour continuer le comportement "classique".
 */
const getNextNumber = async (type, fallbackId, connection, options = {}) => {
    const conn = connection || await db.getConnection();
    const shouldRelease = !connection;
    const upper = buildScopedType(type, options);

    try {
        await ensureTable(conn);

        // On verrouille la ligne pour éviter les races si plusieurs créations en parallèle
        const [rows] = await conn.execute(
            "SELECT `offset` FROM numbering_settings WHERE `type` = ? FOR UPDATE",
            [upper]
        );

        let stored = 0;
        if (rows.length === 0) {
            await conn.execute(
                "INSERT INTO numbering_settings (`type`, `offset`) VALUES (?, 0)",
                [upper]
            );
        } else {
            const val = Number(rows[0].offset);
            stored = Number.isFinite(val) ? val : 0;
        }

        let nextNumber;

        if (stored > 0) {
            // Mode "séquence personnalisée"
            nextNumber = stored;
            await conn.execute(
                "UPDATE numbering_settings SET `offset` = ? WHERE `type` = ?",
                [stored + 1, upper]
            );
        } else {
            // Mode "par défaut" basé sur l'id de la table métier
            nextNumber = fallbackId;
        }

        return nextNumber;
    } finally {
        if (shouldRelease) {
            conn.release();
        }
    }
};

const getAllNumberingSettings = async (options = {}) => {
    const scoped = {
        FA: buildScopedType("FA", options),
        DE: buildScopedType("DE", options),
        CO: buildScopedType("CO", options),
        AV: buildScopedType("AV", options),
        RC: buildScopedType("RC", options),
    };
    await ensureTable();
    const [rows] = await db.query(
        "SELECT `type`, `offset` FROM numbering_settings WHERE `type` IN (?, ?, ?, ?, ?)",
        [scoped.FA, scoped.DE, scoped.CO, scoped.AV, scoped.RC]
    );
    const map = {};
    for (const row of rows) {
        map[row.type] = Number.isFinite(Number(row.offset)) ? Number(row.offset) : 0;
    }
    return {
        FA: map[scoped.FA] || 0,
        DE: map[scoped.DE] || 0,
        CO: map[scoped.CO] || 0,
        AV: map[scoped.AV] || 0,
        RC: map[scoped.RC] || 0,
    };
};

const updateNumberingSettingsInDb = async (updates, options = {}) => {
    await ensureTable();
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const entries = Object.entries(updates);
        const merged = new Map();
        for (const [type, value] of entries) {
            const safe = Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
            const scopedType = buildScopedType(type, options);
            const prev = merged.get(scopedType);
            merged.set(scopedType, prev == null ? safe : Math.max(prev, safe));
        }
        for (const [scopedType, safe] of merged.entries()) {
            await conn.execute(
                "INSERT INTO numbering_settings (`type`, `offset`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `offset` = VALUES(`offset`)",
                [scopedType, safe]
            );
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

module.exports = {
    getOffset,
    getNextNumber,
    getAllNumberingSettings,
    updateNumberingSettingsInDb,
};


