import jsPDF from "jspdf";
import QRCode from "qrcode";

interface FacturePdfItem {
    designation: string;
    produit_nom?: string;
    code_barre?: string;
    reference?: string;
    quantite: number;
    grammage?: number;
    prix_unitaire: number;
    tva: number;
    reduction?: number;
    montant_ht: number;
}

interface FacturePdfData {
    id: number;
    numero_facture: string;
    date_facture: string;
    date_echeance: string;
    client_nom?: string;
    client_type?: string;
    client_telephone?: string;
    client_ice?: string;
    client_email?: string;
    client_adresse?: string;
    client_id?: number;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    /** Statut document / paiement renvoyé par l'API (prioritaire) */
    statut?: string;
    /** Alias anglais éventuel */
    status?: string;
    /** Somme des règlements approuvés (facture + commande liée côté API) */
    total_regle?: number;
    reste_a_payer?: number;
    mode_paiement?: string;
    point_de_vente_id?: number | null;
    point_de_vente_logo?: string | null;
    commande_id?: number | null;
    reduction?: number;
    total_reduction?: number;
    items?: FacturePdfItem[];
    sous_societe_nom?: string | null;
    reglements?: FacturePdfReglement[] | null;
}

interface FacturePdfReglement {
    id?: number;
    facture_id?: number | null;
    date_reglement?: string;
    created_at?: string;
    mode_paiement?: string;
    banque_nom?: string | null;
    montant?: number;
    statut?: string;
    commentaire?: string | null;
}

interface PdvInfo {
    nom: string;
    logoUrl: string | null;
    email: string | null;
    telephone: string | null;
    if: string | null;
    ice: string | null;
    patente: string | null;
    cnss: string | null;
    rc: string | null;
    adresse: string | null;
}

const toLogoUrl = (rawLogo: unknown): string | null => {
    const v = String(rawLogo || "").trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    const base = String(import.meta.env.VITE_API_BASE_URL || "").trim();
    if (v.startsWith("/uploads/")) return base ? `${base}${v}` : v;
    if (v.startsWith("uploads/")) return base ? `${base}/${v}` : `/${v}`;
    return base ? `${base}/uploads/${v}` : `/uploads/${v}`;
};

const loadImageAsPngDataUrl = async (url: string): Promise<string | null> => {
    const toDataUrl = async (res: Response): Promise<string | null> => {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        return await new Promise<string | null>((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, img.naturalWidth || img.width || 1);
                    canvas.height = Math.max(1, img.naturalHeight || img.height || 1);
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        resolve(null);
                        return;
                    }
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL("image/png"));
                } catch {
                    resolve(null);
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(null);
            };
            img.src = objectUrl;
        });
    };
    const candidates = [url];
    try {
        const pathname = new URL(url, window.location.origin).pathname;
        if (pathname.startsWith("/uploads/") && !candidates.includes(pathname)) candidates.push(pathname);
    } catch {
        // ignore URL parse fallback
    }
    try {
        const token = localStorage.getItem("token");
        for (const candidate of candidates) {
            const resPublic = await fetch(candidate, { cache: "no-store" });
            if (resPublic.ok) return await toDataUrl(resPublic);
            console.warn("[FacturePdf] public logo fetch failed", { url: candidate, status: resPublic.status });

            if (token) {
                const resAuth = await fetch(candidate, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });
                if (resAuth.ok) return await toDataUrl(resAuth);
                console.warn("[FacturePdf] auth logo fetch failed", { url: candidate, status: resAuth.status });
            }
        }
    } catch (error) {
        console.warn("[FacturePdf] logo load exception", { url, error });
        return null;
    }
    return null;
};

const inferImageFormat = (dataUrl: string): "PNG" | "JPEG" => {
    return dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg") ? "JPEG" : "PNG";
};

const loadPdvInfo = async (
    point_de_vente_id?: number | null,
    preferredSousSocieteName?: string | null,
    docNumero?: string | null
): Promise<PdvInfo | null> => {
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/pdv", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const normalize = (v: unknown) =>
            String(v || "")
                .trim()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
        const wantedSousSociete = normalize(preferredSousSocieteName);
        const numeroParts = String(docNumero || "").trim().toUpperCase().split("-");
        const numeroTag = numeroParts.length >= 2 ? String(numeroParts[1] || "").trim().charAt(0) : "";

        const byId =
            point_de_vente_id != null ? data.find((p: { id: number }) => Number(p.id) === Number(point_de_vente_id)) : null;
        const bySousSocieteName = wantedSousSociete
            ? data.find((p: any) => normalize(p?.sous_societe_nom) === wantedSousSociete)
            : null;
        const byNumeroTag = numeroTag
            ? data.find((p: any) => {
                  const first = String(p?.sous_societe_nom || "")
                      .trim()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .charAt(0)
                      .toUpperCase();
                  return first === numeroTag;
              })
            : null;
        const pdv = byId || bySousSocieteName || byNumeroTag || data[0];
        const logoUrl = toLogoUrl(pdv.logo);
        return {
            nom: pdv.nom || "Point de vente",
            logoUrl,
            email: pdv.email || null,
            telephone: pdv.telephone || null,
            if: pdv.if || null,
            ice: pdv.ice || null,
            patente: pdv.patente || null,
            cnss: pdv.cnss || null,
            rc: pdv.rc || null,
            adresse: pdv.adresse || null,
        };
    } catch {
        return null;
    }
};

const loadReglementsForPdf = async (facture: FacturePdfData): Promise<FacturePdfReglement[]> => {
    const currentFactureId = Number(facture.id);
    const keepOnlyCurrentFacture = (rows: FacturePdfReglement[]) => {
        if (!Number.isFinite(currentFactureId) || currentFactureId <= 0) return rows;
        return rows.filter((r) => {
            const fid = Number((r as any)?.facture_id);
            // If facture_id is present, keep only exact matches to current facture.
            // If not present in payload, keep row as fallback.
            return !Number.isFinite(fid) || fid <= 0 || fid === currentFactureId;
        });
    };

    if (Array.isArray(facture.reglements) && facture.reglements.length > 0) {
        return keepOnlyCurrentFacture(facture.reglements);
    }
    try {
        const token = localStorage.getItem("token");
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const rowsA = await fetch(`/api/reglements-clients?factureId=${facture.id}`, { headers }).then((r) =>
            r.ok ? r.json() : []
        );
        const merged = Array.isArray(rowsA) ? rowsA : [];
        const seen = new Set<number>();
        const unique = merged.filter((r: any) => {
            const idNum = Number(r?.id);
            if (!Number.isFinite(idNum)) return true;
            if (seen.has(idNum)) return false;
            seen.add(idNum);
            return true;
        });
        return keepOnlyCurrentFacture(unique);
    } catch {
        return [];
    }
};

const enrichFactureClientInfo = async (facture: FacturePdfData): Promise<FacturePdfData> => {
    const clientId = Number(facture.client_id);
    if (!Number.isFinite(clientId) || clientId <= 0) return facture;
    if (facture.client_ice || facture.client_adresse) return facture;
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/clients", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return facture;
        const clients = await res.json();
        if (!Array.isArray(clients)) return facture;
        const client = clients.find((c: any) => Number(c?.id) === clientId);
        if (!client) return facture;
        return {
            ...facture,
            client_ice: facture.client_ice || client?.ice || undefined,
            client_adresse: facture.client_adresse || client?.adresse || undefined,
        };
    } catch {
        return facture;
    }
};

const twoDigitsToWordsFr = (n: number): string => {
    const units = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
    const teens = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
    if (n < 10) return units[n];
    if (n < 17) return teens[n - 10];
    if (n < 20) return `dix-${units[n - 10]}`;
    if (n < 70) {
        const t = Math.floor(n / 10);
        const u = n % 10;
        if (u === 0) return tens[t];
        if (u === 1) return `${tens[t]} et un`;
        return `${tens[t]}-${units[u]}`;
    }
    if (n < 80) {
        if (n === 71) return "soixante et onze";
        return `soixante-${twoDigitsToWordsFr(n - 60)}`;
    }
    if (n === 80) return "quatre-vingts";
    return `quatre-vingt-${twoDigitsToWordsFr(n - 80)}`;
};

const threeDigitsToWordsFr = (n: number): string => {
    if (n < 100) return twoDigitsToWordsFr(n);
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (h === 1) return r === 0 ? "cent" : `cent ${twoDigitsToWordsFr(r)}`;
    if (r === 0) return `${twoDigitsToWordsFr(h)} cents`;
    return `${twoDigitsToWordsFr(h)} cent ${twoDigitsToWordsFr(r)}`;
};

const integerToWordsFr = (n: number): string => {
    if (!Number.isFinite(n) || n <= 0) return "zero";
    const parts: string[] = [];
    const billions = Math.floor(n / 1_000_000_000);
    const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
    const thousands = Math.floor((n % 1_000_000) / 1000);
    const rest = n % 1000;

    if (billions > 0) {
        parts.push(billions === 1 ? "un milliard" : `${threeDigitsToWordsFr(billions)} milliards`);
    }
    if (millions > 0) {
        parts.push(millions === 1 ? "un million" : `${threeDigitsToWordsFr(millions)} millions`);
    }
    if (thousands > 0) {
        if (thousands === 1) parts.push("mille");
        else parts.push(`${threeDigitsToWordsFr(thousands)} mille`);
    }
    if (rest > 0) {
        parts.push(threeDigitsToWordsFr(rest));
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
};

const amountToWordsFrDh = (amount: number): string => {
    const numericAmount = Number(amount);
    const safe = Number.isFinite(numericAmount) ? Math.max(0, numericAmount) : 0;
    const rounded = Math.round(safe * 100) / 100;
    const dirhams = Math.floor(rounded);
    const centimes = Math.round((rounded - dirhams) * 100);
    const dirhamsWords = `${integerToWordsFr(dirhams)} ${dirhams > 1 ? "dirhams" : "dirham"}`;
    if (centimes === 0) return `${dirhamsWords}`;
    const centimesWords = `${integerToWordsFr(centimes)} ${centimes > 1 ? "centimes" : "centime"}`;
    return `${dirhamsWords} et ${centimesWords}`;
};

const toSafeNumber = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const round2 = (value: unknown): number => Math.round(toSafeNumber(value) * 100) / 100;

const formatQty = (value: unknown): string => {
    const qty = toSafeNumber(value);
    // Keep quantity readable in PDF (avoid long floating tails).
    const abs = Math.abs(qty);
    const maxFractionDigits = abs > 0 && abs < 1 ? 6 : 3;
    return qty.toLocaleString("fr-FR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxFractionDigits,
    });
};

const formatNumberForPdf = (
    value: unknown,
    options?: Intl.NumberFormatOptions
): string => {
    const formatted = toSafeNumber(value).toLocaleString("fr-FR", options);
    // jsPDF built-in fonts can render nbsp/nnbsp poorly; normalize to ASCII space.
    return formatted.replace(/[\u00A0\u202F]/g, " ");
};

const formatDhPlain = (value: number): string => {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const fixed = amount.toFixed(2);
    const [intPartRaw, decPart] = fixed.split(".");
    const intPart = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${intPart},${decPart} DH`;
};

const cleanReglementCommentaire = (raw: unknown): string => {
    const text = String(raw || "").trim();
    if (!text) return "";
    // Remove auto-appended status stamp like: [PAYÉ] @ 2026-04-23 15:34:32
    return text.replace(/\s*\[(?:PAY[EÉ]|IMPAY[EÉ]|EN[_ ]?ATTENTE)\]\s*@\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*$/i, "").trim();
};

const qrDataUrlFromValue = async (value: string): Promise<string | null> => {
    try {
        const cleanValue = String(value || "").trim();
        if (!cleanValue) return null;
        return await QRCode.toDataURL(cleanValue, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 280,
        });
    } catch {
        return null;
    }
};

export const generateFacturePdf = async (facture: FacturePdfData) => {
    const enrichedFacture = await enrichFactureClientInfo(facture);
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 20;

  // HEADER AVEC LOGO + IDENTITÉ DU POINT DE VENTE
  const pdv = await loadPdvInfo(
      enrichedFacture.point_de_vente_id ?? undefined,
      enrichedFacture.sous_societe_nom ?? null,
      enrichedFacture.numero_facture
  );
  const forcedLogoUrl = toLogoUrl(enrichedFacture.point_de_vente_logo) || null;
  if (forcedLogoUrl) {
    const logoDataUrl = await loadImageAsPngDataUrl(forcedLogoUrl);
    if (logoDataUrl) doc.addImage(logoDataUrl, inferImageFormat(logoDataUrl), 20, 12, 28, 28);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text((enrichedFacture.sous_societe_nom || "").trim() || pdv?.nom || "Point de vente", pageWidth - 20, 18, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  let headerY = 24;
  if (pdv?.email) {
    doc.text(`Contact : ${pdv.email}`, pageWidth - 20, headerY, { align: "right" });
    headerY += 5;
  }
  if (pdv?.telephone) {
    doc.text(`Tél : ${pdv.telephone}`, pageWidth - 20, headerY, { align: "right" });
    headerY += 5;
  }

  // TITRE FACTURE
  currentY = 50;
  doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("FACTURE", 20, currentY);

    // INFOS FACTURE + CLIENT
    currentY += 12;
    const formattedDate = enrichedFacture.date_facture
        ? new Date(enrichedFacture.date_facture).toLocaleDateString("fr-FR")
        : "";
    const formattedEcheance = enrichedFacture.date_echeance
        ? new Date(enrichedFacture.date_echeance).toLocaleDateString("fr-FR")
        : "";

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Informations Facture", 20, currentY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    currentY += 7;
    doc.text(`Numéro : ${enrichedFacture.numero_facture}`, 20, currentY);
    currentY += 6;
    if (formattedDate) {
        doc.text(`Date : ${formattedDate}`, 20, currentY);
        currentY += 6;
    }
    if (formattedEcheance) {
        doc.text(`Échéance : ${formattedEcheance}`, 20, currentY);
        currentY += 6;
    }

    currentY = 62;
    const clientBlockX = pageWidth / 2 + 2;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Client", clientBlockX, currentY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    currentY += 7;
    doc.text(enrichedFacture.client_nom || "Client non renseigné", clientBlockX, currentY);
    if (enrichedFacture.client_email) {
        currentY += 5;
        doc.text(`Email : ${enrichedFacture.client_email}`, clientBlockX, currentY);
    }
    if (enrichedFacture.client_telephone) {
        currentY += 5;
        doc.text(`Tél : ${enrichedFacture.client_telephone}`, clientBlockX, currentY);
    }
    if (enrichedFacture.client_ice) {
        currentY += 5;
        doc.text(`ICE : ${enrichedFacture.client_ice}`, clientBlockX, currentY);
    }
    if (enrichedFacture.client_adresse) {
        currentY += 5;
        const addrLines = doc.splitTextToSize(`Adresse : ${enrichedFacture.client_adresse}`, pageWidth / 2 - 24);
        doc.text(addrLines as string[], clientBlockX, currentY);
        currentY += 4 * ((addrLines as string[]).length - 1);
    }

    // ESPACE AVANT TABLEAU D'ARTICLES
    currentY += 15;

    // TABLEAU DES LIGNES
    const startTableY = currentY;
    const tableLeft = 20;
    const tableRight = pageWidth - 20;
    const colX = {
        designation: tableLeft,
        grammage: 98,
        quantite: 112,
        prixUnitaire: 131,
        reduction: 150,
        tvaCenter: 166,
        total: tableRight - 2,
    };

    doc.setFillColor(248, 249, 252);
    doc.setDrawColor(220, 223, 230);
    doc.rect(tableLeft, startTableY, tableRight - tableLeft, 8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);

    doc.text("Désignation", colX.designation, startTableY + 5);
    doc.text("Gramme", colX.grammage, startTableY + 5, { align: "right" });
    doc.text("Qté", colX.quantite, startTableY + 5, { align: "right" });
    doc.text("PU", colX.prixUnitaire, startTableY + 5, { align: "right" });
    doc.text("Reduction", colX.reduction, startTableY + 5, { align: "right" });
    doc.text("TVA %", colX.tvaCenter, startTableY + 5, { align: "center" });
    doc.text("Total", colX.total, startTableY + 5, { align: "right" });

    currentY = startTableY + 10;

    const items = (enrichedFacture.items || []) as FacturePdfItem[];
    const rawTargetHt = round2(
        enrichedFacture.montant_ht ??
            items.reduce(
                (sum, item) =>
                    sum + (toSafeNumber(item.montant_ht) || toSafeNumber(item.quantite) * toSafeNumber(item.prix_unitaire)),
                0
            )
    );
    const rawTargetTva = round2(enrichedFacture.montant_tva ?? 0);
    const rawTargetTtc = round2(enrichedFacture.montant_ttc ?? rawTargetHt + rawTargetTva);
    const rowAllTvaZero = items.length > 0 && items.every((item) => Math.abs(toSafeNumber(item.tva)) < 0.0001);
    const targetHtForRows =
        rowAllTvaZero && Math.abs(rawTargetTva) <= 0.05 ? rawTargetTtc : rawTargetHt;
    const lineDisplayTotals = (() => {
        const base = items.map((item) => round2(toSafeNumber(item.montant_ht) || toSafeNumber(item.quantite) * toSafeNumber(item.prix_unitaire)));
        if (base.length === 0) return base;
        const sumBase = round2(base.reduce((s, n) => s + n, 0));
        const delta = round2(targetHtForRows - sumBase);
        if (Math.abs(delta) <= 0.009) return base;
        const adjusted = [...base];
        adjusted[adjusted.length - 1] = round2(adjusted[adjusted.length - 1] + delta);
        return adjusted;
    })();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);

    if (items.length === 0) {
        doc.text("Aucune ligne d'article pour cette facture.", 22, currentY + 4);
        currentY += 10;
    } else {
        const maxYBeforeFooter = 250;

        items.forEach((item, itemIndex) => {
            if (currentY > maxYBeforeFooter) {
                doc.addPage();
              currentY = startTableY;
            }

            const lineBrutHT = toSafeNumber(item.quantite) * toSafeNumber(item.prix_unitaire);
            const totalHTLigne = toSafeNumber(item.montant_ht ?? lineBrutHT);
            const displayedLineHt = lineDisplayTotals[itemIndex] ?? round2(totalHTLigne);
            // Requested behavior: "PU" column should reflect printed invoice amount
            // (line amount on this facture), not product unit price source.
            const displayUnitPrice = round2(displayedLineHt);
            const lineReductionPct = Math.max(0, toSafeNumber(item.reduction));
            const lineReductionAmount =
                lineReductionPct > 0
                    ? Math.max(0, round2((lineBrutHT * lineReductionPct) / 100))
                    : 0;

            const designation = item.designation || "";
            const reference = String(item.reference || "").trim();
            const designationWithRef = reference ? `${designation} (${reference})` : designation;
            const designationLines = doc.splitTextToSize(designationWithRef, colX.quantite - colX.designation - 6);

            doc.text(designationLines as string[], colX.designation, currentY + 4);

            const lineHeight = 4 * (designationLines as string[]).length;
            const rowMidY = currentY + 4;

            doc.text(
                formatNumberForPdf(item.grammage, { maximumFractionDigits: 2 }),
                colX.grammage,
                rowMidY,
                { align: "right" }
            );
            doc.text(formatQty(item.quantite), colX.quantite, rowMidY, { align: "right" });
            doc.text(
                formatNumberForPdf(displayUnitPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                colX.prixUnitaire,
              rowMidY,
                { align: "right" }
            );
            const reductionCell =
                lineReductionAmount > 0
                    ? `- (${formatNumberForPdf(lineReductionAmount, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                      })})`
                    : formatNumberForPdf(0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            doc.text(reductionCell, colX.reduction, rowMidY, { align: "right" });
            doc.text(
                formatNumberForPdf(item.tva, { maximumFractionDigits: 2 }),
                colX.tvaCenter,
              rowMidY,
                { align: "center" }
            );
            doc.text(
                formatNumberForPdf(displayedLineHt, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }),
                colX.total,
              rowMidY,
                { align: "right" }
            );

            const rowBottomY = currentY + lineHeight + 4;
            doc.setDrawColor(240, 240, 240);
            doc.line(tableLeft, rowBottomY + 0.5, tableRight, rowBottomY + 0.5);
            currentY = rowBottomY + 3;
        });
    }

    // CALCUL DES TOTAUX (montant_ht est déjà net après réduction en base)
    let computedHT = round2(
        enrichedFacture.montant_ht ??
            items.reduce((sum, item) => sum + (toSafeNumber(item.montant_ht) || toSafeNumber(item.quantite) * toSafeNumber(item.prix_unitaire)), 0)
    );
    let computedTVA = round2(
        enrichedFacture.montant_tva ??
            items.reduce((sum, item) => {
                const ht = toSafeNumber(item.montant_ht ?? toSafeNumber(item.quantite) * toSafeNumber(item.prix_unitaire));
                const tvaPct = toSafeNumber(item.tva);
                return sum + (ht * tvaPct) / 100;
            }, 0)
    );
    const computedRemisePct = Number(enrichedFacture.reduction) || 0;
    const computedRemiseDh =
        items.length > 0
            ? items.reduce((sum, item) => {
                  const brute = (Number(item.quantite) || 0) * (Number(item.prix_unitaire) || 0);
                  const redPct = Number(item.reduction) || 0;
                  return sum + (brute * redPct) / 100;
              }, 0)
            : Number(enrichedFacture.total_reduction) || (computedHT * computedRemisePct) / 100;
    const computedTTC = round2(enrichedFacture.montant_ttc ?? (computedHT + computedTVA));
    const allItemsTvaZero = items.length > 0 && items.every((item) => Math.abs(toSafeNumber(item.tva)) < 0.0001);
    if (allItemsTvaZero && Math.abs(computedTVA) <= 0.05) {
        // Prevent tiny rounding artifacts like TVA = 0.02 for TVA-zero lines.
        computedTVA = 0;
        computedHT = computedTTC;
    }

    // BLOC TOTAUX
    currentY += 6;
    if (currentY > 230) {
        doc.addPage();
        currentY = 30;
    }

    const totalsX = pageWidth - 80;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("Récapitulatif", totalsX, currentY);

    currentY += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);

    const line = (label: string, value: string) => {
        doc.text(label, totalsX, currentY);
        doc.text(value, pageWidth - 20, currentY, { align: "right" });
        currentY += 5;
    };

    line(
        "Montant :",
        `${formatNumberForPdf(computedHT, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })} DH`
    );
    line(
        "TVA :",
        `${formatNumberForPdf(computedTVA, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })} DH`
    );
    line(
        "Réduction :",
        computedRemiseDh > 0
            ? `- ${formatNumberForPdf(computedRemiseDh, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
              })} DH`
            : `${formatNumberForPdf(0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`
    );

    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129);
    line(
        "Total :",
        `${formatNumberForPdf(computedTTC, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })} DH`
    );

    currentY += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(70, 70, 70);
    const amountWords = amountToWordsFrDh(computedTTC).toUpperCase();
    const introText = "Arrêtée la présente facture à la somme de :";
    doc.text(introText, 20, currentY);
    doc.setDrawColor(70, 70, 70);
    const introWidth = doc.getTextWidth(introText);
    doc.line(20, currentY + 0.8, 20 + introWidth, currentY + 0.8);
    doc.setFont("helvetica", "normal");
    const amountWordsLines = doc.splitTextToSize(amountWords, pageWidth - 40);
    doc.text(amountWordsLines as string[], 20, currentY + 5);
    const amountWordsLineCount = Array.isArray(amountWordsLines) ? amountWordsLines.length : 1;
    currentY += 5 + amountWordsLineCount * 4 + 4;
    const reglements = await loadReglementsForPdf(enrichedFacture);
    const reglementsSorted = reglements
        .slice()
        .sort(
            (a, b) =>
                new Date(String(b.date_reglement || b.created_at || 0)).getTime() -
                new Date(String(a.date_reglement || a.created_at || 0)).getTime()
        );

    if (reglementsSorted.length > 0) {
        const neededHeight = 12 + Math.min(6, reglementsSorted.length) * 6.2;
        if (currentY + neededHeight > 264) {
            doc.addPage();
            currentY = 24;
        } else {
            currentY += 6;
        }

        doc.setDrawColor(220, 223, 230);
        doc.setFillColor(248, 249, 252);
        doc.rect(20, currentY, pageWidth - 40, 7, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(55, 55, 55);
        doc.text("Historique des règlements", 22, currentY + 4.8);

        currentY += 10;
        const xDate = 22;
        const xMode = 74;
        const xCommentaire = 98;
        const xMontant = pageWidth - 22;
        const rowHeight = 6.2;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text("Date", xDate, currentY);
        doc.text("Mode", xMode, currentY);
        doc.text("Commentaire", xCommentaire, currentY);
        doc.text("Montant", xMontant, currentY, { align: "right" });

        currentY += rowHeight;
        doc.setDrawColor(230, 230, 230);
        doc.line(20, currentY - 2.2, pageWidth - 20, currentY - 2.2); // header underline

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(70, 70, 70);
        reglementsSorted.slice(0, 6).forEach((r) => {
            const rowTopY = currentY - 4.2;
            const d = new Date(String(r.date_reglement || r.created_at || ""));
            const dateStr = Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
            const mode = String(r.mode_paiement || "—").replace(/_/g, " ");
            const commentaire = cleanReglementCommentaire(r.commentaire) || "—";
            const montant = formatDhPlain(Number(r.montant || 0));

            doc.text(dateStr, xDate, currentY);
            doc.setTextColor(70, 70, 70);
            doc.text(mode.slice(0, 14), xMode, currentY);
            if (commentaire !== "—") {
                doc.setTextColor(220, 38, 38);
                doc.setFont("helvetica", "bold");
                doc.text(commentaire.slice(0, 34), xCommentaire, currentY);
                doc.setFont("helvetica", "normal");
            } else {
                doc.setTextColor(120, 120, 120);
                doc.text("—", xCommentaire, currentY);
            }
            doc.setTextColor(70, 70, 70);
            doc.text(montant, xMontant, currentY, { align: "right" });

            // Row separators to improve readability
            doc.setDrawColor(235, 235, 235);
            doc.line(20, rowTopY + rowHeight, pageWidth - 20, rowTopY + rowHeight);
            currentY += rowHeight;
        });
    }

    const downloadUrl =
        Number.isFinite(Number(enrichedFacture.id)) && Number(enrichedFacture.id) > 0
            ? `${window.location.origin}/api/factures/${enrichedFacture.id}/pdf/download?source=qr`
            : "";

    if (downloadUrl) {
        currentY += 8;
        if (currentY > 250) {
            doc.addPage();
            currentY = 24;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(55, 55, 55);
        doc.text("QR code lien facture", pageWidth / 2, currentY, { align: "center" });
        currentY += 5;
        const qrDataUrl = await qrDataUrlFromValue(downloadUrl);
        if (qrDataUrl) {
            const qrSize = 34;
            const qrX = pageWidth / 2 - qrSize / 2;
            doc.addImage(qrDataUrl, "PNG", qrX, currentY, qrSize, qrSize);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(70, 70, 70);
            doc.text("Scanner pour ouvrir le lien de la facture PDF", pageWidth / 2, currentY + qrSize + 4, { align: "center" });
            currentY += qrSize + 8;
        }
    }

    // PIED DE PAGE
    const footerY = 285;
    doc.setDrawColor(230, 230, 230);
    doc.line(20, footerY - 6, pageWidth - 20, footerY - 6);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Merci pour votre règlement dans les délais indiqués. Toute facture non payée à échéance peut faire l'objet de pénalités.",
    20,
    footerY
  );
  if (pdv?.ice || pdv?.if || pdv?.patente || pdv?.cnss || pdv?.rc || pdv?.adresse) {
    const fiscalParts: string[] = [];
    if (pdv.ice) fiscalParts.push(`ICE : ${pdv.ice}`);
    if (pdv.if) fiscalParts.push(`IF : ${pdv.if}`);
    if (pdv.patente) fiscalParts.push(`Patente : ${pdv.patente}`);
    if (pdv.cnss) fiscalParts.push(`CNSS : ${pdv.cnss}`);
    if (pdv.rc) fiscalParts.push(`RC : ${pdv.rc}`);
    if (pdv.adresse) fiscalParts.push(`Adresse : ${pdv.adresse}`);
    const fiscalText = fiscalParts.join(" | ");
    const fiscalLines = doc.splitTextToSize(fiscalText, pageWidth - 40);
    doc.text(fiscalLines as string[], pageWidth / 2, footerY + 5, { align: "center" });
  }

    doc.save(`Facture-${enrichedFacture.numero_facture}.pdf`);
};