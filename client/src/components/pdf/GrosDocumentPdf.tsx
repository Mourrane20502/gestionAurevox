import jsPDF from "jspdf";

export interface GrosPdfLineItem {
    designation?: string;
    produit_nom?: string;
    grammage?: number;
    prix_unitaire?: number;
    reduction?: number;
    taux_tva?: number;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
}

export interface GrosPdfPayload {
    kind: "devis" | "commande" | "facture" | "avoir";
    numero: string;
    dateDoc: string;
    dateEcheance?: string | null;
    client_nom?: string;
    client_ice?: string | null;
    client_adresse?: string | null;
    statut?: string;
    grammage?: number;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    reduction?: number;
    taux_tva?: number;
    mode_paiement?: string | null;
    banque_nom?: string | null;
    items?: GrosPdfLineItem[];
    point_de_vente_id?: number | null;
    sous_societe_nom?: string | null;
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
        return await new Promise<string | null>((resolve) => {
            // État "original": pas de redimensionnement ni compression du logo.
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    };
    const candidates = [url];
    try {
        const pathname = new URL(url, window.location.origin).pathname;
        if (pathname.startsWith("/uploads/") && !candidates.includes(pathname)) candidates.push(pathname);
    } catch {
        /* ignore */
    }
    try {
        const token = localStorage.getItem("token");
        for (const candidate of candidates) {
            const resPublic = await fetch(candidate, { cache: "no-store" });
            if (resPublic.ok) return await toDataUrl(resPublic);
            if (token) {
                const resAuth = await fetch(candidate, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });
                if (resAuth.ok) return await toDataUrl(resAuth);
            }
        }
    } catch {
        return null;
    }
    return null;
};

const inferImageFormat = (dataUrl: string): "PNG" | "JPEG" => {
    return dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg") ? "JPEG" : "PNG";
};

const drawImageContain = (
    doc: jsPDF,
    dataUrl: string,
    x: number,
    y: number,
    boxW: number,
    boxH: number
) => {
    try {
        const props = doc.getImageProperties(dataUrl);
        const iw = Number(props?.width) || boxW;
        const ih = Number(props?.height) || boxH;
        const scale = Math.min(boxW / iw, boxH / ih);
        const w = Math.max(1, iw * scale);
        const h = Math.max(1, ih * scale);
        const dx = x + (boxW - w) / 2;
        const dy = y + (boxH - h) / 2;
        doc.addImage(dataUrl, inferImageFormat(dataUrl), dx, dy, w, h);
    } catch {
        doc.addImage(dataUrl, inferImageFormat(dataUrl), x, y, boxW, boxH);
    }
};

const loadPdvInfo = async (
    point_de_vente_id?: number | null,
    preferredSousSocieteName?: string | null,
    docNumero?: string | null
) => {
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
            ? data.find((p: { sous_societe_nom?: string }) => normalize(p?.sous_societe_nom) === wantedSousSociete)
            : null;
        const byNumeroTag = numeroTag
            ? data.find((p: { sous_societe_nom?: string }) => {
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
            sous_societe_nom: pdv.sous_societe_nom || null,
            ice: pdv.ice || null,
            if: pdv.if || null,
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
        const match = data.find((s: { nom_sous_societe?: string }) => {
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

const titleForKind = (k: GrosPdfPayload["kind"]): string => {
    if (k === "devis") return "DEVIS";
    if (k === "commande") return "COMMANDE";
    if (k === "avoir") return "AVOIR";
    return "FACTURE";
};

const filePrefix = (k: GrosPdfPayload["kind"]): string => {
    if (k === "devis") return "DevisGros";
    if (k === "commande") return "CommandeGros";
    if (k === "avoir") return "AvoirGros";
    return "FactureGros";
};

const units = [
    "zero",
    "un",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "six",
    "sept",
    "huit",
    "neuf",
    "dix",
    "onze",
    "douze",
    "treize",
    "quatorze",
    "quinze",
    "seize",
];

const tens = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

const twoDigitsToWordsFr = (n: number): string => {
    if (n < 17) return units[n];
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
    if (centimes === 0) return dirhamsWords;
    const centimesWords = `${integerToWordsFr(centimes)} ${centimes > 1 ? "centimes" : "centime"}`;
    return `${dirhamsWords} et ${centimesWords}`;
};

export async function generateGrosDocumentPdf(payload: GrosPdfPayload): Promise<void> {
    // Aligner tous les documents gros sur le format classique (portrait A4).
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = 18;

    const pdv = await loadPdvInfo(
        payload.point_de_vente_id ?? undefined,
        payload.sous_societe_nom ?? null,
        payload.numero
    );
    if (pdv?.logoUrl) {
        const logoDataUrl = await loadImageAsPngDataUrl(pdv.logoUrl);
        if (logoDataUrl) {
            const logoBoxX = 15;
            const logoBoxY = 8;
            const logoBoxW = 34;
            const logoBoxH = 34;
            drawImageContain(doc, logoDataUrl, logoBoxX, logoBoxY, logoBoxW, logoBoxH);
        }
    }

    const sousSocieteName =
        String(payload.sous_societe_nom || "").trim() ||
        (await resolveSousSocieteNameFromNumero(payload.numero)) ||
        String(pdv?.sous_societe_nom || "").trim() ||
        pdv?.nom ||
        "Point de vente";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.text(sousSocieteName, pageWidth - 15, 16, { align: "right" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    let hy = 22;
    if (pdv?.email) {
        doc.text(`Contact : ${pdv.email}`, pageWidth - 15, hy, { align: "right" });
        hy += 4;
    }
    if (pdv?.telephone) {
        doc.text(`Tél : ${pdv.telephone}`, pageWidth - 15, hy, { align: "right" });
        hy += 4;
    }

    currentY = 52;
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text(titleForKind(payload.kind), 15, currentY);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);

    currentY += 10;
    const dateStr = payload.dateDoc ? new Date(payload.dateDoc).toLocaleDateString("fr-FR") : "";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("Document", 15, currentY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    let infoY = currentY + 5;
    doc.text(`N° : ${payload.numero}`, 15, infoY);
    infoY += 5;
    if (dateStr) {
        doc.text(`Date : ${dateStr}`, 15, infoY);
        infoY += 5;
    }
    if (payload.kind === "facture" && payload.dateEcheance) {
        doc.text(
            `Échéance : ${new Date(payload.dateEcheance).toLocaleDateString("fr-FR")}`,
            15,
            infoY
        );
        infoY += 5;
    }
    const clientX = pageWidth / 2 + 5;
    let cy = currentY;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Client", clientX, cy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    cy += 5;
    doc.text(payload.client_nom || "—", clientX, cy);
    cy += 5;
    if (payload.kind === "facture") {
        const clientIce = String(payload.client_ice || "").trim();
        const clientAdresse = String(payload.client_adresse || "").trim();
        if (clientIce) {
            doc.text(`ICE : ${clientIce}`, clientX, cy);
            cy += 5;
        }
        if (clientAdresse) {
            const addrLines = doc.splitTextToSize(`Adresse : ${clientAdresse}`, pageWidth / 2 - 20);
            doc.text(addrLines as string[], clientX, cy);
            cy += (Array.isArray(addrLines) ? addrLines.length : 1) * 4 + 1;
        }
    }

    currentY = Math.max(infoY, cy) + 8;

    const col = {
        des: 15,
        g: 130,
        net: 175,
    };

    doc.setFillColor(248, 249, 252);
    doc.setDrawColor(220, 223, 230);
    doc.rect(15, currentY, pageWidth - 30, 7, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(55, 55, 55);
    const headY = currentY + 4.5;
    doc.text("Désignation", col.des, headY);
    doc.text("Poids (Grammes)", col.g, headY, { align: "right" });
    doc.text("Prix Net", col.net, headY, { align: "right" });

    currentY += 9;
    const items = Array.isArray(payload.items) ? payload.items : [];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(45, 45, 45);

    // Keep numbers compact in PDF (no thousands grouping) to avoid spaced digits rendering.
    const fmt = (n: number, dec = 2) => {
        const safe = Number.isFinite(Number(n)) ? Number(n) : 0;
        return safe.toFixed(dec).replace(".", ",");
    };

    const maxY = pageHeight - 35;
    if (items.length === 0) {
        doc.text("Aucune ligne.", 17, currentY + 3);
        currentY += 8;
    } else {
        items.forEach((it) => {
            if (currentY > maxY) {
                doc.addPage();
                currentY = 18;
            }
            const label = String(it.designation || it.produit_nom || "—").trim();
            const lines = doc.splitTextToSize(label, col.g - col.des - 4);
            const lh = Math.max(3.5, 3.2 * (lines as string[]).length);
            const midY = currentY + 3;
            doc.text(lines as string[], col.des, midY);
            doc.text(fmt(Number(it.grammage) || 0, 2), col.g, midY, { align: "right" });
            doc.text(fmt(Number(it.montant_ttc) || 0, 2), col.net, midY, { align: "right" });
            currentY += lh + 1;
            doc.setDrawColor(240, 240, 240);
            doc.line(15, currentY, pageWidth - 15, currentY);
            currentY += 1;
        });
    }

    if (currentY > pageHeight - 32) {
        doc.addPage();
        currentY = 20;
    }

    const totalsX = pageWidth - 75;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text("Totaux", totalsX, currentY + 4);
    let ty = currentY + 10;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 75, 75);
    const line = (a: string, b: string) => {
        doc.text(a, totalsX, ty);
        doc.text(b, pageWidth - 15, ty, { align: "right" });
        ty += 5;
    };
    const net = Number(payload.montant_ttc) || 0;
    const totalGrammage =
        Array.isArray(items) && items.length > 0
            ? items.reduce((sum, it) => sum + (Number(it.grammage) || 0), 0)
            : Number(payload.grammage) || 0;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(88, 80, 236);
    line("Prix Net :", `${fmt(net, 2)} DH`);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 75, 75);
    line("Total grammage :", `${fmt(totalGrammage, 2)} g`);

    if (payload.kind === "facture") {
        let wordsY = ty + 2;
        if (wordsY > pageHeight - 18) {
            doc.addPage();
            wordsY = 20;
        }
        const amountWords = amountToWordsFrDh(net).toUpperCase();
        const introText = "Arrêtée la présente facture à la somme de :";
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(55, 55, 55);
        doc.text(introText, 15, wordsY);
        doc.setDrawColor(55, 55, 55);
        const introWidth = doc.getTextWidth(introText);
        doc.line(15, wordsY + 0.8, 15 + introWidth, wordsY + 0.8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(70, 70, 70);
        const wordsLines = doc.splitTextToSize(amountWords, pageWidth - 30);
        doc.text(wordsLines as string[], 15, wordsY + 5);
        const linesCount = Array.isArray(wordsLines) ? wordsLines.length : 1;
        const modeLabel = String(payload.mode_paiement || "").trim();
        if (modeLabel) {
            const modeY = wordsY + 5 + linesCount * 4 + 2;
            doc.setFont("helvetica", "bold");
            doc.setTextColor(55, 55, 55);
            doc.text("Mode de paiement :", 15, modeY);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(70, 70, 70);
            doc.text(modeLabel, 48, modeY);
        }
    }

    const foot = pageHeight - 8;
    doc.setDrawColor(230, 230, 230);
    doc.line(15, foot - 4, pageWidth - 15, foot - 4);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(
        "Document au grammage — vente en gros. Les montants sont exprimés en dirhams (DH).",
        pageWidth / 2,
        foot,
        { align: "center" }
    );
    if (pdv?.ice || pdv?.if || pdv?.patente) {
        const parts: string[] = [];
        if (pdv.ice) parts.push(`ICE : ${pdv.ice}`);
        if (pdv.if) parts.push(`IF : ${pdv.if}`);
        if (pdv.patente) parts.push(`Patente : ${pdv.patente}`);
        doc.text(parts.join(" | "), pageWidth / 2, foot + 4, { align: "center" });
    }

    doc.save(`${filePrefix(payload.kind)}-${payload.numero.replace(/\s+/g, "_")}.pdf`);
}

function mapApiToPayload(
    kind: GrosPdfPayload["kind"],
    raw: Record<string, unknown>
): GrosPdfPayload {
    const numero =
        kind === "devis"
            ? String(raw.numero_devis || raw.numero || "")
            : kind === "commande"
              ? String(raw.numero_commande || raw.numero || "")
              : kind === "avoir"
                ? String(raw.numero_avoir || raw.numero || "")
              : String(raw.numero_facture || raw.numero || "");
    const dateDoc =
        kind === "devis"
            ? String(raw.date_devis || "")
            : kind === "commande"
              ? String(raw.date_commande || "")
              : kind === "avoir"
                ? String(raw.date_avoir || "")
              : String(raw.date_facture || "");
    const statut =
        kind === "devis"
            ? String(raw.statuts_devis || raw.statut || "")
            : String(raw.statut || "");

    const items = Array.isArray(raw.items)
        ? (raw.items as Record<string, unknown>[]).map((it) => ({
              designation: it.designation != null ? String(it.designation) : undefined,
              produit_nom: it.produit_nom != null ? String(it.produit_nom) : undefined,
              grammage: Number(it.grammage) || 0,
              prix_unitaire: Number(it.prix_unitaire) || 0,
              reduction: Number(it.reduction) || 0,
              taux_tva: Number(it.taux_tva) || 0,
              montant_ht: Number(it.montant_ht) || 0,
              montant_tva: Number(it.montant_tva) || 0,
              montant_ttc: Number(it.montant_ttc) || 0,
          }))
        : [];

    return {
        kind,
        numero,
        dateDoc,
        dateEcheance: kind === "facture" && raw.date_echeance ? String(raw.date_echeance) : null,
        client_nom: raw.client_nom != null ? String(raw.client_nom) : undefined,
        client_ice: kind === "facture" && raw.client_ice != null ? String(raw.client_ice) : null,
        client_adresse: kind === "facture" && raw.client_adresse != null ? String(raw.client_adresse) : null,
        statut,
        grammage: raw.grammage != null ? Number(raw.grammage) : undefined,
        montant_ht: raw.montant_ht != null ? Number(raw.montant_ht) : undefined,
        montant_tva: raw.montant_tva != null ? Number(raw.montant_tva) : undefined,
        montant_ttc: raw.montant_ttc != null ? Number(raw.montant_ttc) : undefined,
        reduction: raw.reduction != null ? Number(raw.reduction) : undefined,
        taux_tva: raw.taux_tva != null ? Number(raw.taux_tva) : undefined,
        mode_paiement:
            kind === "facture" && raw.mode_paiement != null ? String(raw.mode_paiement) : null,
        banque_nom:
            kind === "facture" && raw.banque_nom != null ? String(raw.banque_nom) : null,
        items,
        point_de_vente_id:
            raw.point_de_vente_id != null ? Number(raw.point_de_vente_id) : null,
        sous_societe_nom: raw.sous_societe_nom != null ? String(raw.sous_societe_nom) : null,
    };
}

async function enrichFactureClientInfo(raw: Record<string, unknown>): Promise<Record<string, unknown>> {
    const clientId = Number(raw.client_id);
    if (!Number.isFinite(clientId) || clientId <= 0) return raw;
    if (raw.client_ice != null || raw.client_adresse != null) return raw;
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/clients", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return raw;
        const clients = await res.json();
        if (!Array.isArray(clients)) return raw;
        const client = clients.find((c: any) => Number(c?.id) === clientId);
        if (!client) return raw;
        return {
            ...raw,
            client_ice: client?.ice ?? null,
            client_adresse: client?.adresse ?? null,
        };
    } catch {
        return raw;
    }
}

export async function generateDevisGrosPdfFromApiRow(raw: Record<string, unknown>): Promise<void> {
    await generateGrosDocumentPdf(mapApiToPayload("devis", raw));
}

export async function generateCommandeGrosPdfFromApiRow(raw: Record<string, unknown>): Promise<void> {
    await generateGrosDocumentPdf(mapApiToPayload("commande", raw));
}

export async function generateFactureGrosPdfFromApiRow(raw: Record<string, unknown>): Promise<void> {
    const enriched = await enrichFactureClientInfo(raw);
    await generateGrosDocumentPdf(mapApiToPayload("facture", enriched));
}

export async function generateAvoirGrosPdfFromApiRow(raw: Record<string, unknown>): Promise<void> {
    await generateGrosDocumentPdf(mapApiToPayload("avoir", raw));
}
