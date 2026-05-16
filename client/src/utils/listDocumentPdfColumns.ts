/** Montants pour les exports PDF « Liste des devis / commandes / factures ». */

/** Entier lisible par jsPDF (pas d'espaces insécables fr-FR). */
export function formatListPdfAmount(value: number): string {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return "—";
    return String(n);
}

export function formatListPdfDh(value: number): string {
    const formatted = formatListPdfAmount(value);
    return formatted === "—" ? formatted : `${formatted} DH`;
}

export function formatListPdfMargeHt(margeHt: unknown): string {
    const n = Number(margeHt);
    if (!Number.isFinite(n)) return "—";
    return formatListPdfDh(n);
}

function resolvePrixVenteHt(prixVenteHt: unknown, montantHtFallback?: unknown): number {
    const fromCatalog = Number(prixVenteHt);
    if (Number.isFinite(fromCatalog)) return fromCatalog;
    const ht = Number(montantHtFallback);
    return Number.isFinite(ht) ? ht : 0;
}

/** Prix de vente HT = Σ (qté × prix_de_vente produit, ou repli prix catalogue / ligne). */
export function formatListPdfPrixVenteProduit(
    prixVenteHt: unknown,
    montantHtFallback?: unknown
): string {
    const ht = resolvePrixVenteHt(prixVenteHt, montantHtFallback);
    return ht > 0 || prixVenteHt != null ? formatListPdfDh(ht) : "—";
}

/** TVA calculée sur la base HT (prix de vente catalogue), avec prorata si besoin. */
export function resolveListPdfTvaAmount(
    baseHt: unknown,
    montantTva?: unknown,
    docMontantHt?: unknown,
    tauxTva?: unknown
): number {
    const base = Number(baseHt);
    if (!Number.isFinite(base) || base <= 0) {
        const docTva = Number(montantTva);
        return Number.isFinite(docTva) ? docTva : 0;
    }
    const taux = Number(tauxTva);
    if (Number.isFinite(taux) && taux > 0) {
        return (base * taux) / 100;
    }
    const docHt = Number(docMontantHt) || 0;
    const docTva = Number(montantTva);
    if (docHt > 0 && Number.isFinite(docTva)) {
        return (base / docHt) * docTva;
    }
    return Number.isFinite(docTva) ? docTva : 0;
}

export function formatListPdfTva(
    montantTva: unknown,
    baseHt?: unknown,
    tauxTva?: unknown,
    docMontantHt?: unknown
): string {
    return formatListPdfDh(resolveListPdfTvaAmount(baseHt, montantTva, docMontantHt, tauxTva));
}

/** Prix total TTC = prix de vente HT (catalogue) + TVA. */
export function resolveListPdfPrixTotalTtc(
    prixVenteHt: unknown,
    montantTva?: unknown,
    docMontantHt?: unknown,
    tauxTva?: unknown
): number {
    const venteHt = resolvePrixVenteHt(prixVenteHt, docMontantHt);
    const tva = resolveListPdfTvaAmount(venteHt, montantTva, docMontantHt, tauxTva);
    return venteHt + tva;
}

export function formatListPdfPrixTotal(
    prixVenteHt: unknown,
    montantTva?: unknown,
    docMontantHt?: unknown,
    tauxTva?: unknown
): string {
    return formatListPdfDh(resolveListPdfPrixTotalTtc(prixVenteHt, montantTva, docMontantHt, tauxTva));
}

/** Coût d'achat HT document = vente HT − marge HT (si marge connue). */
export function formatListPdfPrixAchatHt(montantHt: unknown, margeHt: unknown): string {
    const ht = Number(montantHt);
    const marge = Number(margeHt);
    if (!Number.isFinite(ht) || !Number.isFinite(marge)) return "—";
    return formatListPdfDh(Math.max(0, ht - marge));
}

export function resolveListPdfPrixVenteTtc(
    montantHt: unknown,
    montantTva: unknown,
    montantTtc: unknown
): number {
    const ttc = Number(montantTtc);
    if (Number.isFinite(ttc) && ttc > 0) return ttc;
    const ht = Number(montantHt) || 0;
    const tva = Number(montantTva) || 0;
    return ht + tva;
}

export const LIST_DOC_PDF_HEAD = [
    "Numéro",
    "Client",
    "Société",
    "Prix d'achat",
    "Prix de vente",
    "TVA",
    "Prix total",
    "Marge",
    "Date",
] as const;

export const LIST_DOC_PDF_COLUMN_STYLES = {
    3: { halign: "right" as const, cellWidth: 18 },
    4: { halign: "right" as const, cellWidth: 20 },
    5: { halign: "right" as const, cellWidth: 16 },
    6: { halign: "right" as const, fontStyle: "bold" as const, cellWidth: 20 },
    7: { halign: "right" as const, cellWidth: 16 },
    8: { halign: "center" as const },
    9: { halign: "center" as const },
    10: { halign: "center" as const },
};
