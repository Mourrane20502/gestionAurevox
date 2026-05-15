import jsPDF from "jspdf";

interface PdvInfo {
    nom: string;
    logoUrl: string | null;
    email: string | null;
    telephone: string | null;
    sous_societe_nom?: string | null;
    if: string | null;
    ice: string | null;
    patente: string | null;
}

export interface RecuPaiementLigne {
    designation: string;
    /** Libellé type produit (table product_types), prioritaire sur le reçu. */
    product_type_name?: string | null;
    /** Or / Silver (repli si product_type_name absent). */
    type_or_silver?: string | null;
    quantite?: number;
    montant_ht?: number;
    /** URL absolue de la photo produit (ex. /uploads/...) */
    image_url?: string | null;
    /** Rempli en interne après chargement pour le rendu PDF */
    image_base64?: string | null;
    /** Dimensions après redimensionnement canvas (ratio dans la vignette) */
    image_display_w?: number;
    image_display_h?: number;
}

export interface RecuPaiementData {
    id: number;
    numero_recu?: number | null;
    client_nom: string;
    client_code?: string;
    document_type: "facture" | "commande";
    document_numero: string;
    montant: number; // Montant du règlement actuel
    date_reglement: string;
    mode_paiement: string;
    banque_nom?: string | null;
    /** Lignes produits à afficher (toutes les lignes du document). */
    items?: RecuPaiementLigne[];
    /** Champs conservés pour compatibilité : une seule ligne si items non fourni. */
    designation?: string;
    image_url?: string | null;
    image_base64?: string | null;
    /** Totaux document (commande / facture) */
    montant_ht?: number;
    montant_tva?: number;
    /** Montant TTC du document (alias historique prix_total) */
    prix_total?: number;
    reste_a_payer?: number;
    /** Mode cadeau: masque le nom client (mais garde le total document) */
    is_cadeau?: boolean;
}

const normalizeMoneyForDisplay = (raw: number): number => {
    const rounded = Math.round((Number(raw) || 0) * 100) / 100;
    const nearestInt = Math.round(rounded);
    // Neutralise les micro-arrondis visuels (ex: 19999.98 / 20000.02).
    if (Math.abs(rounded - nearestInt) <= 0.02) return nearestInt;
    return rounded;
};

/** Type affiché sur le reçu : nom du type produit, sinon Or/Silver. */
const receiptLineTypeLabel = (ligne: RecuPaiementLigne): string => {
    const fromProduct = String(ligne.product_type_name || "").trim();
    if (fromProduct) return fromProduct.slice(0, 18);
    const metal = ligne.type_or_silver;
    if (metal === "Or" || metal === "Silver") return metal;
    return "—";
};

const formatPrice = (val: number | undefined): string => {
    if (val === undefined || val === null) return "—";
    const safeVal = normalizeMoneyForDisplay(val);
    // Using a standard space (ASCII 32) instead of non-breaking space to avoid "5 / 000" rendering issues
    return safeVal.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " Dhs";
};

/** Charge une image (CORS) et la compresse pour intégration PDF */
const loadImageAsDataUrl = (url: string): Promise<{ dataUrl: string; w: number; h: number } | null> =>
    new Promise((res) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                const srcW = img.naturalWidth;
                const srcH = img.naturalHeight;
                if (srcW <= 0 || srcH <= 0) {
                    res(null);
                    return;
                }

                // Uniform square thumbnail (cover + center crop) so all photos
                // render with identical visual size in the receipt table.
                const thumbSide = 220;
                const scale = Math.max(thumbSide / srcW, thumbSide / srcH);
                const drawW = srcW * scale;
                const drawH = srcH * scale;
                const dx = (thumbSide - drawW) / 2;
                const dy = (thumbSide - drawH) / 2;

                const canvas = document.createElement("canvas");
                canvas.width = thumbSide;
                canvas.height = thumbSide;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    res(null);
                    return;
                }
                ctx.drawImage(img, dx, dy, drawW, drawH);
                res({ dataUrl: canvas.toDataURL("image/jpeg", 0.72), w: thumbSide, h: thumbSide });
            } catch {
                res(null);
            }
        };
        img.onerror = () => res(null);
        img.src = url;
    });

const drawThumbInCell = (
    doc: jsPDF,
    dataUrl: string | null | undefined,
    dispW: number | undefined,
    dispH: number | undefined,
    x: number,
    y: number,
    boxW: number,
    boxH: number
) => {
    if (!dataUrl) {
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text("—", x + boxW / 2, y + boxH / 2 + 1, { align: "center" });
        doc.setTextColor(40, 40, 40);
        return;
    }
    try {
        const iw = dispW && dispW > 0 ? dispW : 1;
        const ih = dispH && dispH > 0 ? dispH : 1;
        const pad = 0.6;
        const maxW = boxW - pad * 2;
        const maxH = boxH - pad * 2;
        const scale = Math.min(maxW / iw, maxH / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const ox = x + (boxW - dw) / 2;
        const oy = y + (boxH - dh) / 2;
        const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(dataUrl, fmt, ox, oy, dw, dh);
    } catch {
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.text("?", x + boxW / 2, y + boxH / 2 + 1, { align: "center" });
    }
};

const loadPdvInfo = async (): Promise<PdvInfo | null> => {
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/pdv", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const pdv = data[0];
        const logoUrl = pdv.logo ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${pdv.logo}` : null;
        return {
            nom: pdv.nom || "Point de vente",
            logoUrl,
            email: pdv.email || null,
            telephone: pdv.telephone || null,
            sous_societe_nom: pdv.sous_societe_nom || null,
            if: pdv.if || null,
            ice: pdv.ice || null,
            patente: pdv.patente || null,
        };
    } catch {
        return null;
    }
};

const resolveSousSocieteNameFromNumero = async (numero?: string | null): Promise<string> => {
    const rawNumero = String(numero || "").trim().toUpperCase();
    const parts = rawNumero.split("-");
    const tag = parts.length >= 2 ? String(parts[1] || "").trim().charAt(0) : "";
    if (!tag) return "";
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/settings/sous-societes", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return "";
        const data = await res.json();
        if (!Array.isArray(data)) return "";
        const match = data.find((s: any) => {
            const name = String(s?.nom_sous_societe || "").trim();
            const first = name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .charAt(0)
                .toUpperCase();
            return first === tag;
        });
        return String(match?.nom_sous_societe || "").trim();
    } catch {
        return "";
    }
};


const drawCompactDuplicateReceiptBlock = (
    doc: jsPDF,
    pdv: PdvInfo | null,
    data: RecuPaiementData,
    startY: number,
    blockHeight: number,
    headerTitle?: string
) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 10;
    const right = pageWidth - 10;
    const width = right - left;
    const isCadeau = Boolean(data.is_cadeau);

    // Dark gold border requested by design (#D3A85A)
    doc.setDrawColor(211, 168, 90);
    doc.setLineWidth(0.65);
    doc.roundedRect(left, startY, width, blockHeight, 2.5, 2.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(40, 40, 40);
    doc.text(headerTitle || pdv?.sous_societe_nom || pdv?.nom || "Bijouterie", pageWidth / 2, startY + 8.5, { align: "center" });

    const printedDate = new Date();
    const printedStr = printedDate.toLocaleDateString("fr-FR");
    const printedTime = printedDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.text(`Imprimé : ${printedStr} ${printedTime}`, right - 4, startY + 6.2, { align: "right" });

    const refRecu = data.numero_recu != null ? String(data.numero_recu) : String(data.id);
    const refDocLabel = data.document_type === "facture" ? "Ref facture :" : "Ref commande :";
    const refDocValue = (data.document_numero && data.document_numero.trim()) ? data.document_numero : "—";
    const dateRegStr = new Date(data.date_reglement).toLocaleDateString("fr-FR");

    const metaLabelX = left + 6;
    // Keep a clear gap between label and value (fixes "Ref commande" sticking to number)
    const metaValueX = left + 30;
    const metaValueW = 34;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.text("Ref reçu :", metaLabelX, startY + 16);
    doc.text(refDocLabel, metaLabelX, startY + 20.5);
    doc.setFont("helvetica", "normal");
    doc.text(refRecu, metaValueX, startY + 16);
    const refDocLines = doc.splitTextToSize(refDocValue, metaValueW) as string[];
    doc.text(refDocLines.slice(0, 2), metaValueX, startY + 20.5);
    const dateRowY = startY + 27;
    doc.setFont("helvetica", "bold");
    doc.text("Date :", metaLabelX, dateRowY);
    doc.setFont("helvetica", "normal");
    doc.text(dateRegStr, metaValueX, dateRowY);

    const cX = right - 65;
    const cY = startY + 12.5;
    doc.setDrawColor(211, 168, 90);
    doc.setLineWidth(0.45);
    doc.roundedRect(cX, cY, 55, 18, 1.5, 1.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(isCadeau ? "CADEAU" : (data.client_nom || "Client"), cX + 27.5, cY + 7, { align: "center" });
    if (!isCadeau && data.client_code) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text(`Code : ${data.client_code}`, cX + 27.5, cY + 12.5, { align: "center" });
    }

    const items = (data.items && data.items.length > 0)
        ? data.items
        : [{ designation: data.designation || "—", type_or_silver: null, quantite: undefined, montant_ht: undefined }];
    const shown = items;
    const displayedLineAmounts: Array<number | null> = shown.map((it) =>
        it.montant_ht != null ? normalizeMoneyForDisplay(Number(it.montant_ht) || 0) : null
    );
    if (!isCadeau && displayedLineAmounts.length > 0 && data.prix_total != null) {
        const knownIndices = displayedLineAmounts
            .map((v, idx) => ({ v, idx }))
            .filter((x) => x.v != null) as Array<{ v: number; idx: number }>;
        if (knownIndices.length > 0) {
            const sumDisplayed = normalizeMoneyForDisplay(
                knownIndices.reduce((acc, x) => acc + x.v, 0)
            );
            const expectedTotal = normalizeMoneyForDisplay(Number(data.prix_total) || 0);
            const delta = normalizeMoneyForDisplay(expectedTotal - sumDisplayed);
            if (Math.abs(delta) > 0.0001 && Math.abs(delta) <= 0.05) {
                const last = knownIndices[knownIndices.length - 1];
                displayedLineAmounts[last.idx] = normalizeMoneyForDisplay(last.v + delta);
            }
        }
    }
    const tableTop = startY + 33;
    const xPhoto = left + 5.2;
    const photoW = 18;
    const photoH = 11.5;
    const xDes = left + 28;
    const xType = left + 72;
    const xQte = left + 96;
    const xMontant = right - 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("PHOTO", xPhoto + photoW / 2, tableTop, { align: "center" });
    doc.text("DÉSIGNATION", xDes, tableTop);
    doc.text("TYPE", xType, tableTop, { align: "center" });
    doc.text("QTÉ", xQte, tableTop, { align: "center" });
    if (!isCadeau) doc.text("MONTANT", xMontant, tableTop, { align: "right" });
    doc.setDrawColor(211, 168, 90);
    doc.setLineWidth(0.25);
    doc.line(left + 4, tableTop + 1.5, right - 4, tableTop + 1.5);

    const rowStep = 9.4;
    let y = tableTop + 5.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (let rowIndex = 0; rowIndex < shown.length; rowIndex++) {
        const it = shown[rowIndex];
        drawThumbInCell(
            doc,
            it.image_base64,
            it.image_display_w,
            it.image_display_h,
            xPhoto,
            y - 3.7,
            photoW,
            photoH
        );
        doc.text(String(it.designation || "—").slice(0, 34), xDes, y);
        doc.text(receiptLineTypeLabel(it), xType, y, { align: "center" });
        doc.text(Number.isFinite(Number(it.quantite)) ? String(Number(it.quantite)) : "—", xQte, y, { align: "center" });
        if (!isCadeau) {
            const displayed = displayedLineAmounts[rowIndex];
            doc.text(displayed != null ? formatPrice(displayed) : "—", xMontant, y, { align: "right" });
        }
        y += rowStep;
    }

    const recapY = y + 6;
    if (!isCadeau) {
        doc.setDrawColor(200, 200, 200);
        doc.line(left + 4, recapY - 3, right - 4, recapY - 3);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        const totalTtc = normalizeMoneyForDisplay(
            Number(data.prix_total ?? data.montant ?? 0)
        );
        let totalHt = normalizeMoneyForDisplay(Number(data.montant_ht) || 0);
        let totalTva = normalizeMoneyForDisplay(Number(data.montant_tva) || 0);
        if (totalHt <= 0 && totalTtc > 0 && totalTva > 0) {
            totalHt = normalizeMoneyForDisplay(totalTtc - totalTva);
        } else if (totalHt > 0 && totalTva <= 0 && totalTtc > totalHt) {
            totalTva = normalizeMoneyForDisplay(totalTtc - totalHt);
        } else if (totalHt <= 0 && totalTva <= 0 && totalTtc > 0) {
            const sumLines = normalizeMoneyForDisplay(
                displayedLineAmounts.reduce((acc: number, v) => acc + (v ?? 0), 0)
            );
            if (sumLines > 0 && sumLines < totalTtc) {
                totalHt = sumLines;
                totalTva = normalizeMoneyForDisplay(totalTtc - totalHt);
            }
        }

        let recapLineY = recapY;
        doc.text("TOTAL HT :", left + 6, recapLineY);
        doc.text(formatPrice(totalHt), right - 6, recapLineY, { align: "right" });
        recapLineY += 4.5;
        doc.text("TVA :", left + 6, recapLineY);
        doc.text(formatPrice(totalTva), right - 6, recapLineY, { align: "right" });
        recapLineY += 4.5;
        doc.text("TOTAL TTC :", left + 6, recapLineY);
        doc.text(formatPrice(totalTtc), right - 6, recapLineY, { align: "right" });
    }

};

export const drawSingleReceipt = (
    doc: jsPDF,
    pdv: PdvInfo | null,
    data: RecuPaiementData,
    offsetY: number
): { endPage: number; endY: number } => {
    const isCadeau = Boolean(data.is_cadeau);
    const pageWidth = doc.internal.pageSize.getWidth();

    // Cadre léger (en-tête seulement — la suite tient avec les CGV sur la même page)
    doc.setDrawColor(180, 160, 120);
    doc.setLineWidth(0.35);
    doc.roundedRect(10, 10 + offsetY, pageWidth - 20, 62, 3, 3);

    // Logo et nom du point de vente
    if (pdv?.logoUrl) {
        try {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.src = pdv.logoUrl;
            doc.addImage(image, "PNG", 18, 18 + offsetY, 28, 28);
        } catch {
            // ignore erreurs de logo
        }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text(pdv?.sous_societe_nom || pdv?.nom || "Bijouterie", pageWidth / 2, 30 + offsetY, {
        align: "center",
    });

    // Bloc "Imprimé le" + heure en haut à droite
    const printedDate = new Date();
    const printedStr = printedDate.toLocaleDateString("fr-FR");
    const printedTime = printedDate.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
    });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Imprimé le : ${printedStr}`, pageWidth - 25, 18 + offsetY, {
        align: "right",
    });
    doc.text(printedTime, pageWidth - 25, 22 + offsetY, { align: "right" });

    // Informations reçu à gauche : Ref reçu / Ref facture ou commande / Date
    const recuY = 52 + offsetY;
    const dateRegStr = new Date(data.date_reglement).toLocaleString("fr-FR");
    const refDocLabel = data.document_type === "facture" ? "Ref facture :" : "Ref commande :";
    const refDocValue = (data.document_numero && data.document_numero.trim()) ? data.document_numero : "—";

    const refRecu = data.numero_recu != null ? String(data.numero_recu) : String(data.id);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Ref reçu :", 18, recuY);
    doc.setFont("helvetica", "normal");
    doc.text(refRecu, 42, recuY);

    doc.setFont("helvetica", "bold");
    doc.text(refDocLabel, 18, recuY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(refDocValue, 56, recuY + 6);

    doc.setFont("helvetica", "bold");
    doc.text("Date :", 18, recuY + 12);
    doc.setFont("helvetica", "normal");
    doc.text(dateRegStr, 42, recuY + 12);

    // Bloc client à droite
    const clientBoxX = pageWidth - 70;
    const clientBoxY = 46 + offsetY;
    const clientBoxW = 50;
    const clientBoxH = 22;
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.3);
    doc.roundedRect(clientBoxX, clientBoxY, clientBoxW, clientBoxH, 2, 2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(isCadeau ? "CADEAU" : data.client_nom || "Client", clientBoxX + clientBoxW / 2, clientBoxY + 8, {
        align: "center",
    });

    if (!isCadeau && data.client_code) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(
            `Code client(e) : ${data.client_code}`,
            clientBoxX + clientBoxW / 2,
            clientBoxY + 15,
            { align: "center" }
        );
    }

    // Tableau PHOTO / DÉSIGNATION / TYPE / QTÉ / MONTANT — pagination auto
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 18;
    const marginRight = 18;
    const photoColW = 18;
    const photoX = marginX;
    const descX = photoX + photoColW + 3;
    const descMaxW = 50;
    const typeColW = 16;
    const typeColX = 88;
    const typeCenterX = typeColX + typeColW / 2;
    const qteX = 108;

    const lignes: RecuPaiementLigne[] =
        data.items && data.items.length > 0
            ? data.items
            : [
                  {
                      designation: data.designation || "—",
                      montant_ht: undefined,
                      image_base64: data.image_base64 ?? null,
                  },
              ];

    const ligneCount = lignes.length;
    const bodyFontSize = ligneCount > 24 ? 7 : ligneCount > 14 ? 7.5 : 8.5;
    const lineStepMm = bodyFontSize * 0.52 + 0.35;

    const drawTableHeader = (y: number) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(55, 55, 55);
        doc.text("PHOTO", photoX + photoColW / 2, y, { align: "center" });
        doc.text("DÉSIGNATION", descX, y);
        doc.text("TYPE", typeCenterX, y, { align: "center" });
        doc.text("QTÉ", qteX, y, { align: "center" });
        doc.text(isCadeau ? "" : "MONTANT", pageWidth - marginRight, y, { align: "right" });
        doc.setDrawColor(170, 170, 170);
        doc.setLineWidth(0.25);
        doc.line(marginX, y + 1.8, pageWidth - marginX, y + 1.8);
        doc.setTextColor(40, 40, 40);
    };

    let currentY = 80 + offsetY;
    drawTableHeader(currentY);
    currentY += 6;

    const pageBreakReserve = 12;
    /** Bas de page réservé uniquement au récapitulatif. */
    const getMaxYBeforeBreak = () => pageH - pageBreakReserve - 48;

    for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(bodyFontSize);
        const designationLines = doc.splitTextToSize(ligne.designation || "—", descMaxW);
        const numTxtLines = Math.max(1, (designationLines as string[]).length);
        const txtH = numTxtLines * lineStepMm + 3;
        const rowH = Math.max(14.5, txtH);

        if (currentY + rowH > getMaxYBeforeBreak()) {
            doc.addPage();
            currentY = 20 + offsetY;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(90, 90, 90);
            doc.text(`Reçu n°${refRecu} — suite (${i + 1}/${lignes.length})`, marginX, currentY);
            currentY += 5;
            drawTableHeader(currentY);
            currentY += 6;
            doc.setTextColor(40, 40, 40);
        }

        const rowTop = currentY;
        drawThumbInCell(
            doc,
            ligne.image_base64,
            ligne.image_display_w,
            ligne.image_display_h,
            photoX,
            rowTop,
            photoColW,
            rowH
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(40, 40, 40);
        doc.text(designationLines as string[], descX, rowTop + 3.5);
        doc.text(receiptLineTypeLabel(ligne), typeCenterX, rowTop + 3.5, { align: "center" });
        doc.text(
            Number.isFinite(Number(ligne.quantite)) && Number(ligne.quantite) > 0
                ? String(Number(ligne.quantite))
                : "—",
            qteX,
            rowTop + 3.5,
            { align: "center" }
        );
        const lignePrixStr = isCadeau
            ? "—"
            : ligne.montant_ht !== undefined && ligne.montant_ht !== null
                ? formatPrice(ligne.montant_ht)
                : "—";
        doc.text(lignePrixStr, pageWidth - marginRight, rowTop + 3.5, { align: "right" });

        currentY = rowTop + rowH + 1.2;
        doc.setDrawColor(238, 238, 238);
        doc.setLineWidth(0.1);
        doc.line(marginX, currentY - 0.3, pageWidth - marginX, currentY - 0.3);
    }

    const RECAP_BLOCK_H = 44;
    if (currentY + RECAP_BLOCK_H > getMaxYBeforeBreak()) {
        doc.addPage();
        currentY = 24 + offsetY;
    } else {
        currentY += 5;
    }

    // Totaux document HT / TVA / TTC
    if (!isCadeau && data.prix_total !== undefined && data.prix_total !== null) {
        if (currentY + 22 > getMaxYBeforeBreak()) {
            doc.addPage();
            currentY = 24 + offsetY;
        }
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(marginX, currentY, pageWidth - marginX, currentY);
        currentY += 5;
        const totalTtc = normalizeMoneyForDisplay(Number(data.prix_total) || 0);
        let totalHt = normalizeMoneyForDisplay(Number(data.montant_ht) || 0);
        let totalTva = normalizeMoneyForDisplay(Number(data.montant_tva) || 0);
        if (totalHt <= 0 && totalTtc > 0 && totalTva > 0) {
            totalHt = normalizeMoneyForDisplay(totalTtc - totalTva);
        } else if (totalHt > 0 && totalTva <= 0 && totalTtc > totalHt) {
            totalTva = normalizeMoneyForDisplay(totalTtc - totalHt);
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("TOTAL HT", marginX, currentY);
        doc.text(formatPrice(totalHt), pageWidth - marginRight, currentY, { align: "right" });
        currentY += 6;
        doc.text("TVA", marginX, currentY);
        doc.text(formatPrice(totalTva), pageWidth - marginRight, currentY, { align: "right" });
        currentY += 6;
        doc.text("TOTAL TTC", marginX, currentY);
        doc.text(formatPrice(totalTtc), pageWidth - marginRight, currentY, { align: "right" });
        doc.setFont("helvetica", "normal");
        currentY += 8;
    }

    // Récapitulatif paiement (pleine largeur)
    currentY += 4;
    if (currentY + RECAP_BLOCK_H > getMaxYBeforeBreak()) {
        doc.addPage();
        currentY = 24 + offsetY;
    }

    const infoY = currentY + 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("Mode de paiement :", marginX, infoY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(data.mode_paiement || "—", 50, infoY);
    const finalY = infoY;
    return { endPage: doc.getNumberOfPages(), endY: finalY };
};

export const generateRecuPaiementPdf = async (
    data: RecuPaiementData,
    options?: { output?: "save" | "blob"; filename?: string }
): Promise<Blob | void> => {
    /** Chaque ligne produit : photo chargée en parallèle (CORS), image redimensionnée pour PDF léger */
    let itemsWithImages: RecuPaiementLigne[] = [];

    if (data.items && data.items.length > 0) {
        itemsWithImages = await Promise.all(
            data.items.map(async (it) => {
                const url = it.image_url?.trim();
                if (!url) {
                    return { ...it, image_base64: it.image_base64 ?? null };
                }
                const loaded = await loadImageAsDataUrl(url);
                if (!loaded) {
                    return { ...it, image_base64: null };
                }
                return {
                    ...it,
                    image_base64: loaded.dataUrl,
                    image_display_w: loaded.w,
                    image_display_h: loaded.h,
                };
            })
        );
    } else if (data.designation || data.image_url || data.image_base64) {
        let b64: string | null = data.image_base64 ?? null;
        let iw: number | undefined;
        let ih: number | undefined;
        if (data.image_url?.trim()) {
            const loaded = await loadImageAsDataUrl(data.image_url.trim());
            if (loaded) {
                b64 = loaded.dataUrl;
                iw = loaded.w;
                ih = loaded.h;
            }
        }
        itemsWithImages = [
            {
                designation: data.designation || "—",
                montant_ht: undefined,
                image_base64: b64,
                image_display_w: iw,
                image_display_h: ih,
            },
        ];
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pdv = await loadPdvInfo();

    const payload: RecuPaiementData = {
        ...data,
        items: itemsWithImages.length > 0 ? itemsWithImages : undefined,
        image_url: undefined,
        image_base64: undefined,
        designation: itemsWithImages.length > 0 ? undefined : data.designation,
    };

    const sousSocieteFromNumero = await resolveSousSocieteNameFromNumero(payload.document_numero);
    const headerTitle =
        sousSocieteFromNumero ||
        String(pdv?.sous_societe_nom || "").trim() ||
        pdv?.nom ||
        "Bijouterie";

    // Un seul reçu (sans duplication), sur une seule page.
    drawCompactDuplicateReceiptBlock(doc, pdv, payload, 10, 277, headerTitle);

    const safeName = (data.client_nom || "client").replace(/[^a-zA-Z0-9-_]/g, "_");
    const filename = options?.filename ?? `Recu_paiement_${safeName}_${data.id}.pdf`;

    if (options?.output === "blob") {
        // Let the caller decide what to do (download, print, email, ...).
        return doc.output("blob") as Blob;
    }

    doc.save(filename);
};

