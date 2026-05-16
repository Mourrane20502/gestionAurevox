/** Total ligne document = prix unitaire × quantité */

export const roundMoney = (v: number) => Math.round(v * 100) / 100;

export type DocumentLineQtyPrice = {
    quantite?: number | string | null;
    prix_unitaire?: number | string | null;
};

export const lineTotalPuQty = (item: DocumentLineQtyPrice): number =>
    roundMoney((Number(item.quantite) || 0) * (Number(item.prix_unitaire) || 0));

export const formatLineTotalPuQty = (
    item: DocumentLineQtyPrice,
    options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string => {
    const min = options?.minimumFractionDigits ?? 2;
    const max = options?.maximumFractionDigits ?? 2;
    return `${lineTotalPuQty(item).toLocaleString("fr-FR", {
        minimumFractionDigits: min,
        maximumFractionDigits: max,
    })} DH`;
};
