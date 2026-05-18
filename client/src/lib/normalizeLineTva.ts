/**
 * TVA % sur une ligne de devis / commande / facture.
 * 20 % par défaut si la valeur est absente ou invalide.
 * Conserve 0 si la TVA est explicitement 0 (exonération).
 */
export function normalizeLineTvaPercent(raw: unknown): number {
    if (raw === null || raw === undefined || raw === "") return 20;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 20;
}

type FactureTvaSource = {
    montant_ht?: number | string | null;
    montant_tva?: number | string | null;
    items?: { tva?: number | string | null }[] | null;
};

/** Taux TVA % déduit de la facture (lignes puis en-tête HT/TVA). */
export function factureHeaderTvaPercent(facture: FactureTvaSource): number {
    const items = facture.items || [];
    for (const it of items) {
        if (it.tva === null || it.tva === undefined || it.tva === "") continue;
        const n = Number(it.tva);
        if (Number.isFinite(n) && n > 0) return n;
    }
    const ht = Number(facture.montant_ht) || 0;
    const tvaAmt = Number(facture.montant_tva) || 0;
    if (ht > 0 && tvaAmt > 0) {
        const rate = (tvaAmt / ht) * 100;
        for (const common of [0, 7, 10, 20]) {
            if (Math.abs(rate - common) < 0.5) return common;
        }
        return Math.round(rate * 100) / 100;
    }
    const allLinesZeroTva =
        items.length > 0 &&
        items.every(
            (it) =>
                it.tva === null ||
                it.tva === undefined ||
                it.tva === "" ||
                Math.abs(Number(it.tva) || 0) < 0.005
        );
    if (allLinesZeroTva && Math.abs(tvaAmt) < 0.005) return 0;
    return 20;
}

/** TVA % d'une ligne facture : valeur ligne si renseignée, sinon taux facture. */
export function factureLineTvaPercent(
    itemTva: unknown,
    factureTvaRate: number
): number {
    if (itemTva !== null && itemTva !== undefined && itemTva !== "") {
        const n = Number(itemTva);
        if (Number.isFinite(n)) return n;
    }
    return factureTvaRate;
}
