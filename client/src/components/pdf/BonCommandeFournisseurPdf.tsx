import jsPDF from "jspdf";

export interface BonCommandeFournisseurItem {
    produit_nom: string;
    quantite: number;
    prix_unitaire: number | null;
    tva: number | null;
    montant_ht?: number;
}

export interface BonCommandeFournisseurPdfData {
    id?: number;
    numero?: string;
    fournisseur_nom: string;
    gestionnaire_nom: string;
    date_commande?: string;
    statut?: string;
    items: BonCommandeFournisseurItem[];
    taux_ras?: number;
    montant_ras?: number;
    net_fournisseur?: number;
    montant_ttc?: number;
}

interface PdvInfo {
    nom: string;
    logoUrl: string | null;
    email: string | null;
    telephone: string | null;
    if: string | null;
    ice: string | null;
    patente: string | null;
}

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
        const logoUrl = pdv.logo
            ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${pdv.logo}`
            : null;
        return {
            nom: pdv.nom || "Point de vente",
            logoUrl,
            email: pdv.email || null,
            telephone: pdv.telephone || null,
            if: pdv.if || null,
            ice: pdv.ice || null,
            patente: pdv.patente || null,
        };
    } catch {
        return null;
    }
};

export const generateBonCommandeFournisseurPdf = async (bon: BonCommandeFournisseurPdfData) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 20;

    const formatMontant = (value: number) =>
        value.toFixed(2).replace(".", ",");

    const pdv = await loadPdvInfo();
    if (pdv?.logoUrl) {
        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new Image();
                image.crossOrigin = "anonymous";
                image.src = pdv.logoUrl!;
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error("Logo introuvable"));
            });
            doc.addImage(img, "PNG", 20, 12, 28, 28);
        } catch {
            // ignore
        }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text(pdv?.nom || "Point de vente", pageWidth - 20, 18, { align: "right" });
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
    }

    // Titre
    currentY = 50;
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("BON DE COMMANDE FOURNISSEUR", 20, currentY);
    if (bon.numero) {
        currentY += 8;
        doc.setFontSize(12);
        doc.setTextColor(60, 60, 60);
        doc.text(`N° ${bon.numero}`, 20, currentY);
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    const statutLabel = bon.statut ? bon.statut.replace(/_/g, " ") : "En attente";
    doc.text(`Statut : ${statutLabel}`, pageWidth - 20, currentY, { align: "right" });

    currentY += 14;
    const formattedDate = bon.date_commande
        ? new Date(bon.date_commande).toLocaleDateString("fr-FR")
        : new Date().toLocaleDateString("fr-FR");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text("Fournisseur", 20, currentY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    currentY += 7;
    doc.text(bon.fournisseur_nom || "—", 20, currentY);
    currentY += 8;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Gestionnaire", 20, currentY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    currentY += 7;
    doc.text(bon.gestionnaire_nom || "—", 20, currentY);
    currentY += 8;

    doc.setFont("helvetica", "normal");
    doc.text(`Date : ${formattedDate}`, 20, currentY);
    currentY += 15;

    // Tableau
    const startTableY = currentY;
    const colX = {
        designation: 20,
        quantite: 115,
        prixUnitaire: 140,
        tva: 165,
        total: pageWidth - 25,
    };

    doc.setFillColor(248, 249, 252);
    doc.setDrawColor(220, 223, 230);
    doc.rect(20, startTableY, pageWidth - 40, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text("Désignation", colX.designation, startTableY + 5);
    doc.text("Qté", colX.quantite, startTableY + 5, { align: "right" });
    doc.text("P.U. HT", colX.prixUnitaire, startTableY + 5, { align: "right" });
    doc.text("TVA %", colX.tva, startTableY + 5, { align: "right" });
    doc.text("Total", colX.total, startTableY + 5, { align: "right" });

    currentY = startTableY + 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);

    const items = bon.items || [];
    let totalGeneral = 0;

    if (items.length === 0) {
        doc.text("Aucune ligne.", 22, currentY + 4);
        currentY += 10;
    } else {
        items.forEach((item) => {
            const pu = item.prix_unitaire ?? 0;
            const qte = item.quantite ?? 0;
            const montantHt = item.montant_ht ?? pu * qte;
            totalGeneral += montantHt;

            const designation = item.produit_nom || "—";
            const lines = doc.splitTextToSize(designation, colX.quantite - colX.designation - 6);
            doc.text(lines as string[], colX.designation, currentY + 4);
            const lineCount = (lines as string[]).length;
            const rowMidY = currentY + 4;

            doc.text(String(qte), colX.quantite, rowMidY, { align: "right" });
            doc.text(formatMontant(pu), colX.prixUnitaire, rowMidY, {
                align: "right",
            });
            doc.text(
                formatMontant(item.tva ?? 0),
                colX.tva,
                rowMidY,
                { align: "right" }
            );
            doc.text(formatMontant(montantHt), colX.total, rowMidY, {
                align: "right",
            });

            currentY += 4 * lineCount + 6;
        });
    }

    currentY += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    
    // Total HT
    doc.text("Total", pageWidth - 70, currentY);
    doc.text(`${formatMontant(totalGeneral)} DH`, pageWidth - 20, currentY, {
        align: "right",
    });

    // Total TVA
    currentY += 8;
    const totalTva = items.reduce((acc, it) => {
        const pu = it.prix_unitaire ?? 0;
        const qte = it.quantite ?? 0;
        const tvaRate = it.tva ?? 0;
        return acc + (pu * qte * (tvaRate / 100));
    }, 0);
    doc.text("Total TVA", pageWidth - 70, currentY);
    doc.text(`${formatMontant(totalTva)} DH`, pageWidth - 20, currentY, {
        align: "right",
    });

    // Total TTC
    currentY += 8;
    const totalTtc = bon.montant_ttc ?? (totalGeneral + totalTva);
    doc.setFontSize(12);
    doc.setTextColor(63, 81, 181); // Indigo color for TTC
    doc.text("Total TTC", pageWidth - 70, currentY);
    doc.text(`${formatMontant(totalTtc)} DH`, pageWidth - 20, currentY, {
        align: "right",
    });

    // Taux RAS
    currentY += 8;
    const tauxRas = bon.taux_ras ?? 100;
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text("Taux RAS", pageWidth - 70, currentY);
    doc.text(`${formatMontant(tauxRas)} %`, pageWidth - 20, currentY, {
        align: "right",
    });

    // Montant RAS
    currentY += 8;
    const montantRas = bon.montant_ras ?? (totalTtc - (totalTtc * (tauxRas / 100)));
    doc.text("Montant RAS", pageWidth - 70, currentY);
    doc.text(`${formatMontant(montantRas)} DH`, pageWidth - 20, currentY, {
        align: "right",
    });

    // Net fournisseur
    currentY += 8;
    const netFournisseur = bon.net_fournisseur ?? (totalTtc * (tauxRas / 100));
    doc.setFontSize(12);
    doc.setTextColor(16, 124, 65);
    doc.text("Net fournisseur", pageWidth - 70, currentY);
    doc.text(`${formatMontant(netFournisseur)} DH`, pageWidth - 20, currentY, {
        align: "right",
    });

    const footerY = 285;
    doc.setDrawColor(230, 230, 230);
    doc.line(20, footerY - 6, pageWidth - 20, footerY - 6);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text("Bon de commande fournisseur - Document généré le " + new Date().toLocaleDateString("fr-FR"), 20, footerY);

    const safeName = (bon.fournisseur_nom || "fournisseur").replace(/[^a-zA-Z0-9-_]/g, "_");
    const safeNumero = (bon.numero || "new").replace(/[^a-zA-Z0-9-_]/g, "_");
    doc.save(`Bon_commande_fournisseur_${safeNumero}_${safeName}.pdf`);
};
