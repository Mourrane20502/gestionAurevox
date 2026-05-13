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
