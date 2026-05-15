const db = require("../config/db").promise();
let ensuredProductMovementsAuditSchema = false;

const ensureProductMovementsAuditSchema = async () => {
    if (ensuredProductMovementsAuditSchema) return;
    try {
        const [fkRows] = await db.execute(
            `
            SELECT rc.CONSTRAINT_NAME
            FROM information_schema.REFERENTIAL_CONSTRAINTS rc
            WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
              AND rc.TABLE_NAME = 'product_movements'
              AND rc.REFERENCED_TABLE_NAME = 'products'
            `
        );

        for (const row of fkRows || []) {
            const constraintName = row?.CONSTRAINT_NAME;
            if (!constraintName) continue;
            await db.query(
                `ALTER TABLE product_movements DROP FOREIGN KEY \`${constraintName}\``
            );
        }
    } catch (err) {
        console.error("Error ensuring product movements audit schema:", err.message);
    } finally {
        ensuredProductMovementsAuditSchema = true;
    }
};

/**
 * Log a product stock movement (optionally linked to devis/commande/facture/avoir).
 * @param {Object} opts
 * @param {number} opts.productId
 * @param {string} opts.type - e.g. "create", "update", "delete", "devis_creation", "devis_sortie", "facture_creation", "facture_sortie", "bon_livraison_creation", "bon_livraison_sortie", "commande_creation", "commande_sortie", "avoir_retour", "avoir_sortie"
 * @param {number|null} opts.quantityBefore
 * @param {number|null} opts.quantityAfter
 * @param {string|null} opts.description
 * @param {number|null} opts.userId
 * @param {string|null} opts.referenceType - "devis" | "commande" | "facture" | "avoir" | "bon_livraison"
 * @param {number|null} opts.referenceId
 * @param {string|null} opts.referenceNumero - e.g. "DEV-001", "AV-002"
 */
const logProductMovement = async (
    {
        productId,
        type,
        quantityBefore = null,
        quantityAfter = null,
        description = null,
        userId = null,
        referenceType = null,
        referenceId = null,
        referenceNumero = null
    },
    connection = null
) => {
    await ensureProductMovementsAuditSchema();
    const baseParams = [productId, type, quantityBefore, quantityAfter, description, userId];
    const executor = connection || db;

    try {
        await executor.execute(
            `INSERT INTO product_movements
             (product_id, \`type\`, quantity_before, quantity_after, description, user_id, reference_type, reference_id, reference_numero)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [...baseParams, referenceType, referenceId, referenceNumero]
        );
    } catch (err) {
        if (err.code === "ER_BAD_FIELD_ERROR" || (err.message && err.message.includes("reference_type"))) {
            try {
                await executor.execute(
                    `INSERT INTO product_movements
                     (product_id, \`type\`, quantity_before, quantity_after, description, user_id)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    baseParams
                );
            } catch (err2) {
                console.error("Error logging product movement (fallback):", err2.message);
            }
        } else {
            console.error("Error logging product movement:", err.message);
        }
    }
};

module.exports = { logProductMovement, ensureProductMovementsAuditSchema };
