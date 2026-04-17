import jsPDF from "jspdf";

interface CommandePdfItem {
    designation: string;
    quantite: number;
    prix_unitaire: number;
    tva: number;
    reduction: number;
    montant_ht: number;
}

interface CommandePdfData {
    id: number;
    numero_commande: string;
    date_commande: string;
    client_nom?: string;
    client_type?: string;
    client_telephone?: string;
    client_ice?: string;
    client_email?: string;
    client_adresse?: string;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    statut?: string;
    reduction?: number;
    total_reduction?: number;
    items?: CommandePdfItem[];
    sous_societe_nom?: string | null;
    point_de_vente_id?: number | null;
    point_de_vente_logo?: string | null;
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
            console.warn("[CommandePdf] public logo fetch failed", { url: candidate, status: resPublic.status });

            if (token) {
                const resAuth = await fetch(candidate, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });
                if (resAuth.ok) return await toDataUrl(resAuth);
                console.warn("[CommandePdf] auth logo fetch failed", { url: candidate, status: resAuth.status });
            }
        }
    } catch (error) {
        console.warn("[CommandePdf] logo load exception", { url, error });
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

export const generateCommandePdf = async (commande: CommandePdfData) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 20;

    // HEADER AVEC LOGO + IDENTITÉ DU POINT DE VENTE
    const pdv = await loadPdvInfo(
        commande.point_de_vente_id ?? undefined,
        commande.sous_societe_nom ?? null,
        commande.numero_commande
    );
    const forcedLogoUrl = toLogoUrl(commande.point_de_vente_logo) || null;
    if (forcedLogoUrl) {
        const logoDataUrl = await loadImageAsPngDataUrl(forcedLogoUrl);
        if (logoDataUrl) doc.addImage(logoDataUrl, inferImageFormat(logoDataUrl), 20, 12, 28, 28);
    }

    const sousSocieteName =
        String(commande.sous_societe_nom || "").trim() ||
        (await resolveSousSocieteNameFromNumero(commande.numero_commande)) ||
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

    // TITRE COMMANDE
    currentY = 50;
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("COMMANDE CLIENT", 20, currentY);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    const statutLabel = commande.statut
        ? commande.statut.replace(/_/g, " ")
        : "En attente";
    doc.text(`Statut : ${statutLabel}`, pageWidth - 20, currentY, { align: "right" });

    // INFOS COMMANDE + CLIENT
    currentY += 12;
    const formattedDate = commande.date_commande
        ? new Date(commande.date_commande).toLocaleDateString("fr-FR")
        : "";

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Informations Commande", 20, currentY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    currentY += 7;
    doc.text(`Numéro : ${commande.numero_commande}`, 20, currentY);
    currentY += 6;
    if (formattedDate) {
        doc.text(`Date : ${formattedDate}`, 20, currentY);
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
    doc.text(commande.client_nom || "Client non renseigné", clientBlockX, currentY);
    if (commande.client_type === "societe") {
        if (commande.client_email) {
            currentY += 5;
            doc.text(`Email : ${commande.client_email}`, clientBlockX, currentY);
        }
        if (commande.client_telephone) {
            currentY += 5;
            doc.text(`Tél : ${commande.client_telephone}`, clientBlockX, currentY);
        }
        if (commande.client_ice) {
            currentY += 5;
            doc.text(`ICE : ${commande.client_ice}`, clientBlockX, currentY);
        }
        if (commande.client_adresse) {
            currentY += 5;
            const addrLines = doc.splitTextToSize(`Adresse : ${commande.client_adresse}`, pageWidth / 2 - 24);
            doc.text(addrLines as string[], clientBlockX, currentY);
            currentY += 4 * ((addrLines as string[]).length - 1);
        }
    }

    // ESPACE AVANT TABLEAU D'ARTICLES
    currentY += 15;

    // TABLEAU DES LIGNES
    const startTableY = currentY;
    const colX = {
        designation: 20,
        quantite: 110,
        prixUnitaire: 130,
        reduction: 155,
        tva: 175,
        total: pageWidth - 20,
    };

    doc.setFillColor(248, 249, 252);
    doc.setDrawColor(220, 223, 230);
    doc.rect(20, startTableY, pageWidth - 40, 8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);

    doc.text("Désignation", colX.designation, startTableY + 5);
    doc.text("Qté", colX.quantite, startTableY + 5, { align: "right" });
    doc.text("PU", colX.prixUnitaire, startTableY + 5, { align: "right" });
    doc.text("Reduction", colX.reduction, startTableY + 5, { align: "right" });
    doc.text("TVA %", colX.tva, startTableY + 5, { align: "right" });
    doc.text("Total", colX.total, startTableY + 5, { align: "right" });

    currentY = startTableY + 10;

    const items = (commande.items || []) as CommandePdfItem[];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);

    if (items.length === 0) {
        doc.text("Aucune ligne d'article pour cette commande.", 22, currentY + 4);
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
        commande.montant_ht ??
        items.reduce((sum, item) => sum + (item.montant_ht ?? (item.quantite || 0) * (item.prix_unitaire || 0)), 0);
    const computedTVA = commande.montant_tva ?? 0;
    const computedRemise =
        items.length > 0
            ? items.reduce((sum, item) => {
                  const brute = (Number(item.quantite) || 0) * (Number(item.prix_unitaire) || 0);
                  const redPct = Number(item.reduction) || 0;
                  return sum + (brute * redPct) / 100;
              }, 0)
            : Number(commande.total_reduction) || 0;
    const computedTTC =
        commande.montant_ttc ?? computedHT + computedTVA;

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
        `${computedHT.toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })} DH`
    );
    line(
        "TVA :",
        `${computedTVA.toLocaleString("fr-FR", {
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

    doc.setFont("helvetica", "bold");
    doc.setTextColor(88, 80, 236);
    line(
        "Total :",
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
        "Commande générée via Aurevox. Merci pour votre confiance.",
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

    doc.save(`Commande-${commande.numero_commande}.pdf`);
};

