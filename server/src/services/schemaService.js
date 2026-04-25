const db = require("../config/db").promise();

/**
 * Service to introspect the MySQL database and provide schema metadata to the AI.
 */
class SchemaService {
    constructor() {
        this.cache = null;
        this.lastFetch = 0;
        this.CACHE_TTL = 1000 * 60 * 60; // 1 hour
    }

    async getFullSchemaContext() {
        if (this.cache && (Date.now() - this.lastFetch < this.CACHE_TTL)) {
            return this.cache;
        }

        try {
            // 1. Fetch Columns metadata
            const [columns] = await db.execute(`
                SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME NOT IN ('users', 'sessions')
            `);

            // 2. Fetch Foreign Keys for relationship understanding
            const [fks] = await db.execute(`
                SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE()
                AND REFERENCED_TABLE_NAME IS NOT NULL
            `);

            const schemaMap = {};
            columns.forEach(col => {
                if (!schemaMap[col.TABLE_NAME]) schemaMap[col.TABLE_NAME] = { columns: [], relations: [] };
                schemaMap[col.TABLE_NAME].columns.push(`${col.COLUMN_NAME} (${col.DATA_TYPE})`);
            });

            fks.forEach(fk => {
                if (schemaMap[fk.TABLE_NAME]) {
                    schemaMap[fk.TABLE_NAME].relations.push(
                        `${fk.COLUMN_NAME} references ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})`
                    );
                }
            });

            this.cache = Object.entries(schemaMap)
                .map(([table, data]) => {
                    let desc = `Table ${table}:\n  Columns: ${data.columns.join(", ")}`;
                    if (data.relations.length > 0) {
                        desc += `\n  Relations: ${data.relations.join(", ")}`;
                    }
                    return desc;
                })
                .join("\n\n");

            this.lastFetch = Date.now();
            return this.cache;

        } catch (error) {
            console.error("SchemaService Error:", error);
            return "Unable to retrieve database schema.";
        }
    }
}

module.exports = new SchemaService();
