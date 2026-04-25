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
    /** Or / Silver (dérivé du type produit), affiché sur le reçu. */
    type_or_silver?: string | null;
    quantite?: number;
    poids?: string;
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
    poids?: string;
    image_url?: string | null;
    image_base64?: string | null;
    prix_total?: number;
    reste_a_payer?: number;
    /** Mode cadeau: masque nom client et totaux */
    is_cadeau?: boolean;
}

const formatPrice = (val: number | undefined): string => {
    if (val === undefined || val === null) return "—";
    // Using a standard space (ASCII 32) instead of non-breaking space to avoid "5 / 000" rendering issues
    return val.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " Dhs";
};

/** Charge une image (CORS) et la compresse pour intégration PDF */
const loadImageAsDataUrl = (url: string): Promise<{ dataUrl: string; w: number; h: number } | null> =>
    new Promise((res) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                const maxSide = 420;
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                if (w <= 0 || h <= 0) {
                    res(null);
                    return;
                }
                const scale = Math.min(1, maxSide / Math.max(w, h));
                w = Math.round(w * scale);
                h = Math.round(h * scale);
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    res(null);
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                res({ dataUrl: canvas.toDataURL("image/jpeg", 0.72), w, h });
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
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.15);
    doc.rect(x, y, boxW, boxH);
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

/** Espace réservé en bas : récap + CGV sur la même page A4. */
const RESERVE_RECAP_AND_CGV_MM = 90;

const CGV_SECTIONS: { title: string; body: string }[] = [
    {
        title: "Retours et échanges",
        body: "Les retours d’articles sont acceptés à titre exceptionnel, dans un délai strict de 48 heures maximum après l’achat. Au-delà de ce délai, aucun retour, échange ou remboursement ne pourra être accepté.",
    },
    {
        title: "Acomptes et commandes",
        body: "Toute commande nécessite un acompte d’au moins 50 % et un délai de préparation d’au moins 15 jours ouvrables. Les acomptes versés ne sont pas remboursables en cas d’annulation du client.",
    },
    {
        title: "Commandes d’articles en or",
        body: "Pour les commandes spéciales d’articles en or, le client s’engage à régler l’intégralité du prix lors de la livraison. Le prix final sera calculé sur la base du poids et du cours de l’or en vigueur le jour de la livraison.",
    },
    {
        title: "Pierres et Swarovski",
        body: "Les pierres Swarovski et les pierres serties sur un bijou ne peuvent pas être échangées après livraison. Toute réclamation doit être formulée lors de la réception de l’article.",
    },
    {
        title: "Réservations d’articles",
        body: "Un article peut être réservé pour une durée maximale d’un mois. Passé ce délai, sans règlement complet, la bijouterie se réserve le droit de remettre l’article en vente.",
    },
    {
        title: "Réparations",
        body: "Toute réparation doit être accompagnée de son bon de dépôt. Toute réparation impliquant un ajout de matière précieuse fera l’objet d’une facturation supplémentaire calculée au cours en vigueur le jour de la réparation.",
    },
];

/** Conditions générales compactes (2 colonnes), même page que le reçu. */
export const drawConditionsGeneralesCompactInline = (doc: jsPDF, startY: number) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const gap = 2;
    const colW = (pageWidth - marginX * 2 - gap) / 2;
    const leftX = marginX;
    const rightX = marginX + colW + gap;
    const bottomLimit = pageHeight - 2;

    let y = startY + 1.5;
    if (y > bottomLimit - 8) y = Math.max(120, startY);

    doc.setDrawColor(170, 160, 140);
    doc.setLineWidth(0.2);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 2.8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(45, 45, 45);
    doc.text("CONDITIONS GÉNÉRALES DE VENTE", pageWidth / 2, y, { align: "center" });
    y += 3.2;

    const titleFs = 5;
    const bodyFs = 4.5;
    const lineGap = 1.48;
    const afterSection = 1.35;

    const drawColumn = (x: number, startColY: number, indices: number[]): number => {
        let cy = startColY;
        for (const idx of indices) {
            const s = CGV_SECTIONS[idx];
            if (!s || cy > bottomLimit - 4) break;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(titleFs);
            doc.setTextColor(35, 35, 35);
            doc.text(s.title, x, cy);
            cy += 1.85;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(bodyFs);
            doc.setTextColor(55, 55, 55);
            const lines = doc.splitTextToSize(s.body, colW - 0.5);
            const arr = lines as string[];
            for (let li = 0; li < arr.length; li++) {
                if (cy > bottomLimit) return cy;
                doc.text(arr[li], x, cy);
                cy += lineGap;
            }
            cy += afterSection;
        }
        return cy;
    };

    // Répartition gauche / droite pour limiter la hauteur
    drawColumn(leftX, y, [0, 2, 4]);
    drawColumn(rightX, y, [1, 3, 5]);
    doc.setTextColor(40, 40, 40);
};

const drawMiniConditionsInBlock = (
    doc: jsPDF,
    startY: number,
    bottomY: number
) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const gap = 5;
    const colW = (pageWidth - marginX * 2 - gap) / 2;
    const leftX = marginX;
    const rightX = leftX + colW + gap;

    let y = startY;
    if (y >= bottomY - 2) return;

    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.15);
    doc.line(marginX, y, pageWidth - marginX, y);
    // Add a little top padding between the separator line and the heading.
    y += 3.1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    doc.text("CONDITIONS GÉNÉRALES DE VENTE", pageWidth / 2, y, { align: "center" });
    y += 2.1;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.6);
    doc.setTextColor(70, 70, 70);
    y += 2.1;

    const drawColumn = (x: number, indices: number[]) => {
        let cy = y;
        for (const idx of indices) {
            if (cy > bottomY - 1.5) break;
            const s = CGV_SECTIONS[idx];
            if (!s) continue;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.text(s.title, x, cy);
            cy += 2.15;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6);
            doc.setTextColor(45, 45, 45);
            const lines = doc.splitTextToSize(s.body, colW - 0.4) as string[];
            for (const line of lines) {
                if (cy > bottomY - 0.8) break;
                doc.text(line, x, cy);
                cy += 1.55;
            }
            // Clearer separation between sections.
            cy += 1.25;
        }
    };

    drawColumn(leftX, [0, 2, 4]);
    drawColumn(rightX, [1, 3, 5]);
    doc.setTextColor(40, 40, 40);
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
    const bottom = startY + blockHeight;
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
        : [{ designation: data.designation || "—", type_or_silver: null, quantite: undefined, poids: data.poids, montant_ht: undefined }];
    // Show more product lines in compact receipt (better usage of vertical space)
    const maxLines = 7;
    const shown = items.slice(0, maxLines);
    const tableTop = startY + 33;
    const xPhoto = left + 5.2;
    const photoW = 14;
    const photoH = 9.2;
    const xDes = left + 28;
    const xType = left + 72;
    const xQte = left + 86;
    const xPoids = left + 98;
    const xMontant = right - 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("PHOTO", xPhoto + photoW / 2, tableTop, { align: "center" });
    doc.text("DÉSIGNATION", xDes, tableTop);
    doc.text("TYPE", xType, tableTop, { align: "center" });
    doc.text("QTÉ", xQte, tableTop, { align: "center" });
    if (!isCadeau) doc.text("POIDS", xPoids, tableTop, { align: "center" });
    if (!isCadeau) doc.text("MONTANT", xMontant, tableTop, { align: "right" });
    doc.setDrawColor(211, 168, 90);
    doc.setLineWidth(0.25);
    doc.line(left + 4, tableTop + 1.5, right - 4, tableTop + 1.5);

    const rowStep = 9.4;
    let y = tableTop + 5.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (const it of shown) {
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
        doc.text((it.type_or_silver === "Or" || it.type_or_silver === "Silver") ? it.type_or_silver : "—", xType, y, { align: "center" });
        doc.text(Number.isFinite(Number(it.quantite)) ? String(Number(it.quantite)) : "—", xQte, y, { align: "center" });
        if (!isCadeau) doc.text(it.poids ? String(it.poids) : "—", xPoids, y, { align: "center" });
        if (!isCadeau) doc.text(it.montant_ht != null ? formatPrice(Number(it.montant_ht)) : "—", xMontant, y, { align: "right" });
        y += rowStep;
    }

    const recapY = y + 6;
    if (!isCadeau) {
        doc.setDrawColor(200, 200, 200);
        doc.line(left + 4, recapY - 3, right - 4, recapY - 3);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.text("ACOMPTE :", left + 6, recapY);
        doc.text(formatPrice(data.montant), right - 6, recapY, { align: "right" });
        if (data.reste_a_payer !== undefined) {
            doc.text("RESTE :", left + 6, recapY + 4.5);
            doc.text(formatPrice(data.reste_a_payer), right - 6, recapY + 4.5, { align: "right" });
        }
    }

    const condBottom = bottom - 2;
    // Keep conditions low while allowing a larger product section above.
    const condStart = Math.max(recapY + 6, condBottom - 28);
    drawMiniConditionsInBlock(doc, condStart, condBottom);
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

    // Tableau PHOTO / DÉSIGNATION / QTÉ / POIDS / MONTANT HT — toutes les lignes + vignettes, pagination auto
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 18;
    const marginRight = 18;
    const photoColW = 14;
    const photoX = marginX;
    const descX = photoX + photoColW + 3;
    const descMaxW = 50;
    const typeColW = 16;
    const typeColX = 88;
    const typeCenterX = typeColX + typeColW / 2;
    const qteX = 108;
    const poidsX = 126;

    const lignes: RecuPaiementLigne[] =
        data.items && data.items.length > 0
            ? data.items
            : [
                  {
                      designation: data.designation || "—",
                      poids: data.poids,
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
        if (!isCadeau) {
            doc.text("POIDS", poidsX, y, { align: "center" });
        }
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
    /** Toujours garder le bas de page pour récap + CGV sur la même feuille que la fin du tableau. */
    const getMaxYBeforeBreak = () => pageH - pageBreakReserve - RESERVE_RECAP_AND_CGV_MM;

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
        const typeLabel =
            ligne.type_or_silver === "Or" || ligne.type_or_silver === "Silver"
                ? ligne.type_or_silver
                : "—";
        doc.text(typeLabel, typeCenterX, rowTop + 3.5, { align: "center" });
        doc.text(
            Number.isFinite(Number(ligne.quantite)) && Number(ligne.quantite) > 0
                ? String(Number(ligne.quantite))
                : "—",
            qteX,
            rowTop + 3.5,
            { align: "center" }
        );
        if (!isCadeau) {
            doc.text(ligne.poids != null && String(ligne.poids).trim() !== "" ? String(ligne.poids) : "—", poidsX, rowTop + 3.5, {
                align: "center",
            });
        }
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

    // Ligne total document (TTC)
    if (!isCadeau && data.prix_total !== undefined && data.prix_total !== null) {
        if (currentY + 14 > getMaxYBeforeBreak()) {
            doc.addPage();
            currentY = 24 + offsetY;
        }
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(marginX, currentY, pageWidth - marginX, currentY);
        currentY += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("TOTAL", marginX, currentY);
        doc.text(formatPrice(data.prix_total), pageWidth - marginRight, currentY, { align: "right" });
        doc.setFont("helvetica", "normal");
        currentY += 8;
    }

    // Récapitulatif paiement (pleine largeur)
    currentY += 4;
    if (currentY + RECAP_BLOCK_H > getMaxYBeforeBreak()) {
        doc.addPage();
        currentY = 24 + offsetY;
    }

    const recapX = marginX;
    let recapY = currentY;

    if (!isCadeau) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(40, 40, 40);
        doc.text("ACOMPTE DU JOUR :", recapX, recapY);
        doc.text(formatPrice(data.montant), pageWidth - marginRight, recapY, { align: "right" });

        if (data.reste_a_payer !== undefined) {
            recapY += 7.5;
            doc.setTextColor(180, 0, 0);
            doc.text("RESTE À PAYER :", recapX, recapY);
            doc.text(formatPrice(data.reste_a_payer), pageWidth - marginRight, recapY, { align: "right" });
            doc.setTextColor(40, 40, 40);
        }
    }

    const infoY = recapY + 9;
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
    } else if (data.designation || data.poids || data.image_url || data.image_base64) {
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
                poids: data.poids,
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
        poids: itemsWithImages.length > 0 ? undefined : data.poids,
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

