import type { RecuPaiementData } from "@/components/pdf/RecuPaiementPdf";
import { metalTypeLabelFromProductTypeName } from "@/lib/metalTypeLabel";

export type ReglementForRecu = {
    id: number;
    numero_recu?: number | null;
    client_nom?: string | null;
    client_id?: number | null;
    montant?: number | string | null;
    date_reglement?: string | null;
    mode_paiement?: string | null;
    banque_nom?: string | null;
    numero_facture?: string | null;
    numero_commande?: string | null;
    facture_id?: number | null;
    commande_id?: number | null;
    facture_gros_id?: number | null;
    commande_gros_id?: number | null;
};

export async function buildRecuPaiementDataForReglement(
    reglementType: "client" | "client_gros",
    reglement: ReglementForRecu,
    token: string,
    options?: { isCadeau?: boolean }
): Promise<RecuPaiementData | null> {
    const isFacture = !!reglement.numero_facture;
    const isGros = reglementType === "client_gros";
    const docType = isFacture ? (isGros ? "factures-gros" : "factures") : isGros ? "commandes-gros" : "commandes";
    const docId = isFacture
        ? isGros
            ? reglement.facture_gros_id
            : reglement.facture_id
        : isGros
          ? reglement.commande_gros_id
          : reglement.commande_id;
    const document_numero = isFacture ? reglement.numero_facture : reglement.numero_commande;

    if (!docId || !document_numero) return null;

    let prixTotal = 0;
    let montantHt = 0;
    let montantTva = 0;
    let resteAPayer = 0;
    let recuItems: RecuPaiementData["items"] = [];

    try {
        const [docRes, sitRes] = await Promise.all([
            fetch(`/api/${docType}/${docId}`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(
                `${isGros ? "/api/reglements-clients-gros/situation" : "/api/reglements-clients/situation"}?${
                    isFacture ? "factureId=" + docId : "commandeId=" + docId
                }`,
                { headers: { Authorization: `Bearer ${token}` } }
            ),
        ]);

        if (docRes.ok) {
            const docData = await docRes.json();
            prixTotal = Number(docData.montant_ttc) || 0;
            montantHt = Number(docData.montant_ht) || 0;
            montantTva = Number(docData.montant_tva) || 0;
            if (docData.items && docData.items.length > 0) {
                recuItems = docData.items.map((it: {
                    designation?: string;
                    product_type_name?: string;
                    quantite?: number;
                    montant_ht?: number;
                    photo?: string;
                }) => ({
                    designation: it.designation || "—",
                    product_type_name: it.product_type_name || undefined,
                    type_or_silver: metalTypeLabelFromProductTypeName(it.product_type_name) ?? undefined,
                    quantite: Number(it.quantite) || undefined,
                    montant_ht: Number(it.montant_ht) || 0,
                    image_url: it.photo
                        ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(it.photo)}`
                        : undefined,
                }));
            }
        }

        if (sitRes.ok) {
            const sitData = await sitRes.json();
            resteAPayer = Number(sitData.reste_a_payer) || 0;
        }
    } catch {
        return null;
    }

    const initials = (reglement.client_nom || "CL")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase();
    const clientCode = reglement.client_id != null ? `${initials}${reglement.client_id}GT` : undefined;

    return {
        id: reglement.id,
        numero_recu: reglement.numero_recu ?? null,
        client_nom: reglement.client_nom || "Client",
        client_code: clientCode,
        document_type: isFacture ? "facture" : "commande",
        document_numero: document_numero,
        montant: Number(reglement.montant) || 0,
        date_reglement: reglement.date_reglement || new Date().toISOString(),
        mode_paiement: reglement.mode_paiement || "—",
        banque_nom: reglement.banque_nom || null,
        items: recuItems.length > 0 ? recuItems : undefined,
        montant_ht: montantHt,
        montant_tva: montantTva,
        prix_total: prixTotal,
        reste_a_payer: resteAPayer,
        is_cadeau: options?.isCadeau ?? false,
    };
}
