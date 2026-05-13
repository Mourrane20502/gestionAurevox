/**
 * Un produit est considéré « Gros » (vendu au grammage) lorsqu'il dispose
 * d'un métal de tarification (or / silver). Les colonnes `nature_produit`
 * et `product_type_id` ayant été supprimées, c'est l'unique critère retenu.
 */
function isGroByPricingMetal(value) {
    const v = String(value ?? "").trim().toLowerCase();
    return v === "or" || v === "silver";
}

function isGrosProductRow(row) {
    if (!row) return false;
    return isGroByPricingMetal(row.pricing_metal);
}

module.exports = {
    isGroByPricingMetal,
    isGrosProductRow,
};
