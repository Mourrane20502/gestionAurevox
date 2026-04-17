import jsPDF from "jspdf";

interface AvoirPdfItem {
    designation: string;
    quantite: number;
    prix_unitaire: number;
    tva: number;
    reduction?: number;
    montant_ht: number;
}

interface AvoirPdfData {
    id: number;
    numero_avoir: string;
    date_avoir: string;
    client_nom?: string;
    client_type?: string;
    client_telephone?: string;
    client_ice?: string;
    client_email?: string;
    client_adresse?: string;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    status?: string;
    statut?: string;
    facture_id?: number | null;
    /** Numéro métier facture (ex. FA/…) — fourni par l’API après jointure */
    numero_facture?: string | null;
    reduction?: number;
    total_reduction?: number;
    sous_societe_nom?: string | null;
    point_de_vente_id?: number | null;
    point_de_vente_logo?: string | null;
    items?: AvoirPdfItem[];
}

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
            console.warn("[AvoirPdf] public logo fetch failed", { url: candidate, status: resPublic.status });

            if (token) {
                const resAuth = await fetch(candidate, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });
                if (resAuth.ok) return await toDataUrl(resAuth);
                console.warn("[AvoirPdf] auth logo fetch failed", { url: candidate, status: resAuth.status });
            }
        }
    } catch (error) {
        console.warn("[AvoirPdf] logo load exception", { url, error });
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

export const generateAvoirPdf = async (avoir: AvoirPdfData) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 20;

    // HEADER AVEC LOGO + IDENTITÉ DU POINT DE VENTE
    const pdv = await loadPdvInfo(
        avoir.point_de_vente_id ?? undefined,
        avoir.sous_societe_nom ?? null,
        avoir.numero_avoir
    );
    const forcedLogoUrl = toLogoUrl(avoir.point_de_vente_logo) || null;
    if (forcedLogoUrl) {
        const logoDataUrl = await loadImageAsPngDataUrl(forcedLogoUrl);
        if (logoDataUrl) doc.addImage(logoDataUrl, inferImageFormat(logoDataUrl), 20, 12, 28, 28);
    }

    const sousSocieteName =
        String(avoir.sous_societe_nom || "").trim() ||
        (await resolveSousSocieteNameFromNumero(avoir.numero_avoir)) ||
        String(pdv?.sous_societe_nom || "").trim() ||
        pdv?.nom ||
        "Point de vente";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text(sousSocieteName, pageWidth - 20, 18, { align: "right" });

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

    // TITRE AVOIR
    currentY = 50;
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("AVOIR", 20, currentY);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    const rawStatut = String(avoir.statut ?? avoir.status ?? "").trim();
    const statutLabel = rawStatut ? rawStatut.replace(/_/g, " ") : "Validé";
    doc.text(`Statut : ${statutLabel}`, pageWidth - 20, currentY, { align: "right" });

    // INFOS AVOIR + CLIENT
    currentY += 12;
    const formattedDate = avoir.date_avoir
        ? new Date(avoir.date_avoir).toLocaleDateString("fr-FR")
        : "";

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Informations Avoir", 20, currentY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    currentY += 7;
    doc.text(`Numéro : ${avoir.numero_avoir}`, 20, currentY);
    currentY += 6;
    if (formattedDate) {
        doc.text(`Date : ${formattedDate}`, 20, currentY);
        currentY += 6;
    }
    if (avoir.facture_id || avoir.numero_facture) {
        const ref =
            (avoir.numero_facture && String(avoir.numero_facture).trim()) ||
            (avoir.facture_id ? `ID facture ${avoir.facture_id}` : "");
        if (ref) {
            doc.setFont("helvetica", "normal");
            const labelLine = `Référence facture associée : ${ref}`;
            const wrapped = doc.splitTextToSize(labelLine, pageWidth / 2 - 8);
            doc.text(wrapped as string[], 20, currentY);
            currentY += Math.max(6, (wrapped as string[]).length * 5 + 1);
        }
    }

    const clientBlockY = 64;
    const clientBlockX = pageWidth / 2 + 12;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Client", clientBlockX, clientBlockY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    currentY = clientBlockY + 7;
    doc.text(avoir.client_nom || "Client non renseigné", clientBlockX, currentY);
    if (avoir.client_type === "societe") {
        if (avoir.client_email) {
            currentY += 5;
            doc.text(`Email : ${avoir.client_email}`, clientBlockX, currentY);
        }
        if (avoir.client_telephone) {
            currentY += 5;
            doc.text(`Tél : ${avoir.client_telephone}`, clientBlockX, currentY);
        }
        if (avoir.client_ice) {
            currentY += 5;
            doc.text(`ICE : ${avoir.client_ice}`, clientBlockX, currentY);
        }
        if (avoir.client_adresse) {
            currentY += 5;
            const addrLines = doc.splitTextToSize(`Adresse : ${avoir.client_adresse}`, pageWidth / 2 - 24);
            doc.text(addrLines as string[], clientBlockX, currentY);
            currentY += 4 * ((addrLines as string[]).length - 1);
        }
    }

    // ESPACE AVANT TABLEAU D'ARTICLES
    currentY = Math.max(currentY + 15, 90);

    // TABLEAU DES LIGNES
    const startTableY = currentY;
    const colX = {
        designation: 20,
        quantite: 108,
        prixUnitaire: 125,
        reduction: 148,
        tva: 168,
        total: pageWidth - 20,
    };

    doc.setFillColor(255, 247, 237); // Light orange background for header
    doc.setDrawColor(254, 215, 170);
    doc.rect(20, startTableY, pageWidth - 40, 8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(154, 52, 18); // Dark orange text

    doc.text("Désignation", colX.designation, startTableY + 5);
    doc.text("Qté", colX.quantite, startTableY + 5, { align: "right" });
    doc.text("PU HT", colX.prixUnitaire, startTableY + 5, { align: "right" });
    doc.text("Reduction", colX.reduction, startTableY + 5, { align: "right" });
    doc.text("TVA %", colX.tva, startTableY + 5, { align: "right" });
    doc.text("Total HT", colX.total, startTableY + 5, { align: "right" });

    currentY = startTableY + 10;

    const items = (avoir.items || []) as AvoirPdfItem[];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);

    if (items.length === 0) {
        doc.text("Aucune ligne d'article pour cet avoir.", 22, currentY + 4);
        currentY += 10;
    } else {
        const maxYBeforeFooter = 250;

        items.forEach((item) => {
            if (currentY > maxYBeforeFooter) {
                doc.addPage();
                currentY = startTableY;
            }

            const lineBrutHT = (item.quantite || 0) * (item.prix_unitaire || 0);
            const totalHTLigne = item.montant_ht ?? lineBrutHT;
            const lineReductionAmount = Math.max(0, lineBrutHT - totalHTLigne);

            const designation = item.designation || "";
            const designationLines = doc.splitTextToSize(designation, colX.quantite - colX.designation - 6);

            doc.text(designationLines as string[], colX.designation, currentY + 4);

            const lineHeight = 4 * (designationLines as string[]).length;
            const rowMidY = currentY + 4;

            doc.text(String(item.quantite ?? 0), colX.quantite, rowMidY, { align: "right" });
            doc.text(
                (item.prix_unitaire ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                colX.prixUnitaire,
                rowMidY,
                { align: "right" }
            );
            const reductionCell =
                lineReductionAmount > 0
                    ? `- (${lineReductionAmount.toLocaleString("fr-FR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                      })})`
                    : (0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            doc.text(reductionCell, colX.reduction, rowMidY, { align: "right" });
            doc.text(
                (item.tva ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
                colX.tva,
                rowMidY,
                { align: "right" }
            );
            doc.text(
                totalHTLigne.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                colX.total,
                rowMidY,
                { align: "right" }
            );

            const rowBottomY = currentY + lineHeight + 4;
            doc.setDrawColor(240, 240, 240);
            doc.line(20, rowBottomY + 0.5, pageWidth - 20, rowBottomY + 0.5);
            currentY = rowBottomY + 3;
        });
    }

    // CALCUL DES TOTAUX (montant_ht est déjà net après réduction en base)
    const computedHT =
        avoir.montant_ht ??
        items.reduce((sum, item) => sum + (item.montant_ht ?? (item.quantite || 0) * (item.prix_unitaire || 0)), 0);
    const computedTVA = avoir.montant_tva ?? 0;
    const computedRemise = Number(avoir.total_reduction) || 0;
    const computedTTC = avoir.montant_ttc ?? (computedHT + computedTVA);

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
        "Montant HT :",
        `${computedHT.toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })} DH`
    );
    line(
        "Réduction :",
        computedRemise > 0
            ? `- ${computedRemise.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
              })} DH`
            : `${(0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`
    );
    line(
        "TVA :",
        `${computedTVA.toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })} DH`
    );

    doc.setFont("helvetica", "bold");
    doc.setTextColor(249, 115, 22); // Orange for total
    line(
        "Total TTC Avoir :",
        `${computedTTC.toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })} DH`
    );

    // PIED DE PAGE
    const footerY = 285;
    doc.setDrawColor(230, 230, 230);
    doc.line(20, footerY - 6, pageWidth - 20, footerY - 6);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(
        "Cet avoir est à valoir sur vos prochaines factures ou peut faire l'objet d'un remboursement selon les conditions en vigueur.",
        20,
        footerY
    );
    if (pdv?.ice || pdv?.if || pdv?.patente) {
        const fiscalParts: string[] = [];
        if (pdv.ice) fiscalParts.push(`ICE : ${pdv.ice}`);
        if (pdv.if) fiscalParts.push(`IF : ${pdv.if}`);
        if (pdv.patente) fiscalParts.push(`Patente : ${pdv.patente}`);
        const fiscalText = `Informations fiscales PDV - ${fiscalParts.join(" | ")}`;
        doc.text(fiscalText, pageWidth / 2, footerY + 5, { align: "center" });
    }

    doc.save(`Avoir-${avoir.numero_avoir}.pdf`);
};
