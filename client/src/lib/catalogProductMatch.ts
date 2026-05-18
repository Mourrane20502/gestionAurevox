export function normalizeCatalogLabel(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export type CatalogProductLike = {
    id: number;
    nom: string;
    reference?: string | null;
};

/** Produit catalogue correspondant à la désignation (id lié ou nom / référence exacte). */
export function findCatalogProduct<T extends CatalogProductLike>(
    products: T[],
    designation: string,
    produitId?: number
): T | undefined {
    if (produitId != null && produitId > 0) {
        return products.find((p) => p.id === produitId);
    }
    const norm = normalizeCatalogLabel(designation);
    if (!norm) return undefined;
    return products.find((p) => {
        if (normalizeCatalogLabel(p.nom) === norm) return true;
        const ref = String(p.reference || "").trim();
        return ref.length > 0 && normalizeCatalogLabel(ref) === norm;
    });
}

/** Ligne saisie à la main, absente du catalogue produits. */
export function isManualCatalogLine(
    products: CatalogProductLike[],
    designation: string,
    produitId?: number
): boolean {
    const trimmed = designation.trim();
    if (!trimmed) return false;
    return !findCatalogProduct(products, designation, produitId);
}
