const { logProductMovement } = require("./productMovementLogger");

async function getProductStock(connection, productId) {
    const [rows] = await connection.execute("SELECT stock FROM products WHERE id = ?", [productId]);
    return rows.length > 0 ? Number(rows[0].stock) : null;
}

/**
 * Trace ajout de ligne devis (sans modification de stock).
 */
async function logDevisCreation(connection, { produitId, devisId, numeroDevis, userId }) {
    if (!produitId) return;
    const stockNow = await getProductStock(connection, produitId);
    await logProductMovement(
        {
            productId: produitId,
            type: "devis_creation",
            quantityBefore: stockNow,
            quantityAfter: stockNow,
            description: "Ligne ajoutée dans un devis",
            userId,
            referenceType: "devis",
            referenceId: devisId,
            referenceNumero: numeroDevis,
        },
        connection
    );
}

/**
 * Trace acceptation devis (sans déstockage : le stock physique sort à la validation commande).
 */
async function logDevisSortie(connection, { produitId, devisId, numeroDevis, userId }) {
    if (!produitId) return;
    const stockNow = await getProductStock(connection, produitId);
    await logProductMovement(
        {
            productId: produitId,
            type: "devis_sortie",
            quantityBefore: stockNow,
            quantityAfter: stockNow,
            description: "Devis accepté (sortie commerciale, stock inchangé)",
            userId,
            referenceType: "devis",
            referenceId: devisId,
            referenceNumero: numeroDevis,
        },
        connection
    );
}

async function logFactureCreation(connection, { produitId, factureId, numeroFacture, userId }) {
    if (!produitId) return;
    const stockNow = await getProductStock(connection, produitId);
    await logProductMovement(
        {
            productId: produitId,
            type: "facture_creation",
            quantityBefore: stockNow,
            quantityAfter: stockNow,
            description: "Ligne ajoutée dans une facture",
            userId,
            referenceType: "facture",
            referenceId: factureId,
            referenceNumero: numeroFacture,
        },
        connection
    );
}

async function logBonLivraisonCreation(connection, { produitId, bonLivraisonId, numeroBl, userId }) {
    if (!produitId) return;
    const stockNow = await getProductStock(connection, produitId);
    await logProductMovement(
        {
            productId: produitId,
            type: "bon_livraison_creation",
            quantityBefore: stockNow,
            quantityAfter: stockNow,
            description: "Ligne ajoutée dans un bon de livraison",
            userId,
            referenceType: "bon_livraison",
            referenceId: bonLivraisonId,
            referenceNumero: numeroBl,
        },
        connection
    );
}

/** Trace livraison / clôture BL (sans modifier le stock). */
async function logBonLivraisonSortie(connection, { produitId, bonLivraisonId, numeroBl, userId, description }) {
    if (!produitId) return;
    const stockNow = await getProductStock(connection, produitId);
    await logProductMovement(
        {
            productId: produitId,
            type: "bon_livraison_sortie",
            quantityBefore: stockNow,
            quantityAfter: stockNow,
            description: description || "Bon de livraison livré",
            userId,
            referenceType: "bon_livraison",
            referenceId: bonLivraisonId,
            referenceNumero: numeroBl,
        },
        connection
    );
}

/** Trace suppression de ligne facture (sans modifier le stock — déstockage sur commande). */
async function logFactureSortie(connection, { produitId, factureId, numeroFacture, userId }) {
    if (!produitId) return;
    const stockNow = await getProductStock(connection, produitId);
    await logProductMovement(
        {
            productId: produitId,
            type: "facture_sortie",
            quantityBefore: stockNow,
            quantityAfter: stockNow,
            description: "Ligne retirée (suppression facture)",
            userId,
            referenceType: "facture",
            referenceId: factureId,
            referenceNumero: numeroFacture,
        },
        connection
    );
}

module.exports = {
    logDevisCreation,
    logDevisSortie,
    logFactureCreation,
    logFactureSortie,
    logBonLivraisonCreation,
    logBonLivraisonSortie,
};
