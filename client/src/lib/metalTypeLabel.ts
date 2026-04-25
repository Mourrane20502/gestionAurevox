/**
 * Déduit l’étiquette Or / Silver à partir du libellé du type produit (table product_types).
 */
export function metalTypeLabelFromProductTypeName(name: string | null | undefined): "Or" | "Silver" | null {
    if (!name || !String(name).trim()) return null;
    const n = name.toLowerCase();
    if (/\b(silver|argent)\b/.test(n)) return "Silver";
    if (/\bor\b/.test(n)) return "Or";
    return null;
}
