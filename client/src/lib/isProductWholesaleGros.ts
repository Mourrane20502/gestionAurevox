/**
 * Un produit est « Gros » (vendu au grammage) lorsqu'il a un métal de tarification
 * renseigné (or / silver). Les colonnes `nature_produit` et `product_type_id`
 * n'existent plus côté base, on retombe donc sur `pricing_metal`.
 */
export function isProductWholesaleGros(p: {
    pricing_metal?: string | null;
}): boolean {
    const v = String(p?.pricing_metal ?? "").trim().toLowerCase();
    return v === "or" || v === "silver";
}
