import jsPDF from "jspdf";

interface PdvInfo {
    nom: string;
    logoUrl: string | null;
    email: string | null;
    telephone: string | null;
    if: string | null;
    ice: string | null;
    patente: string | null;
}

export interface RecuRemboursementData {
    id: number;
    client_nom: string;
    numero_commande: string;
    montant: number;
    motif: string;
    created_at: string;
    valide_par_nom?: string | null;
    valide_par_prenom?: string | null;
    commande_montant_ttc?: number;
    commande_total_regle?: number;
}

const formatDh = (v: number) => {
    const num = Number(v || 0);
    const formatted = num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${formatted} DH`;
};

const loadPdvInfo = async (): Promise<PdvInfo | null> => {
    try {
        const token = localStorage.getItem("token");
        const gestionnaireRes = await fetch("/api/gestionnaires", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (gestionnaireRes.ok) {
            const data = await gestionnaireRes.json();
            const first = Array.isArray(data) ? data[0] : null;
            if (first) {
                const logoUrl = first.logo
                    ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${first.logo}`
                    : null;
                const nom = String(first.nom || "").trim();
                return {
                    nom: nom || "Gestionnaire",
                    logoUrl,
                    email: first.email || null,
                    telephone: first.telephone || null,
                    if: first.identifiant_fiscale || null,
                    ice: first.ice || null,
                    patente: first.patente || null,
                };
            }
        }

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
            if: pdv.if || null,
            ice: pdv.ice || null,
            patente: pdv.patente || null,
        };
    } catch {
        return null;
    }
};

const drawSingleRemboursementReceipt = (
    doc: jsPDF,
    pdv: PdvInfo | null,
    data: RecuRemboursementData,
    offsetY: number
) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const leftX = 15;
    const rightX = pageWidth - 15;
    const contentW = pageWidth - 30;

    if (pdv?.logoUrl) {
        try {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.src = pdv.logoUrl;
            doc.addImage(image, "PNG", 15, offsetY + 8, 22, 22);
        } catch {
            // ignore
        }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.text(pdv?.nom || "Point de vente", pageWidth - 15, offsetY + 12, {
        align: "right",
    });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    let headerY = offsetY + 17;
    if (pdv?.email) {
        doc.text(`Email : ${pdv.email}`, pageWidth - 15, headerY, { align: "right" });
        headerY += 4;
    }
    if (pdv?.telephone) {
        doc.text(`Tél : ${pdv.telephone}`, pageWidth - 15, headerY, {
            align: "right",
        });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text("REÇU DE REMBOURSEMENT COMMANDE", pageWidth / 2, offsetY + 32, {
        align: "center",
    });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.text(
        "Ce document atteste du remboursement effectué au client pour la commande indiquée ci-dessous.",
        pageWidth / 2,
        offsetY + 38,
        { align: "center" }
    );

    doc.setFontSize(8.5);
    const formattedDate = new Date(data.created_at).toLocaleString("fr-FR");
    doc.text(
        `Reçu remboursement N° ${data.id.toString().padStart(5, "0")} - ${formattedDate}`,
        pageWidth / 2,
        offsetY + 44,
        { align: "center" }
    );

    // INFO BOX — client / commande / validé par
    let currentY = offsetY + 53;
    const hasValideur = !!(data.valide_par_nom || data.valide_par_prenom);
    const infoBoxH = hasValideur ? 30 : 22;
    const labelX = leftX + 6;
    const valueX = leftX + 38;

    doc.setDrawColor(225, 228, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(leftX, currentY, contentW, infoBoxH, 2, 2, "S");

    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "bold");
    doc.text("Client", labelX, currentY + 8);
    doc.text("Commande", labelX, currentY + 16);
    if (hasValideur) {
        doc.text("Validé par", labelX, currentY + 24);
    }

    doc.setFont("helvetica", "normal");
    doc.text(data.client_nom || "—", valueX, currentY + 8);
    doc.text(data.numero_commande || "—", valueX, currentY + 16);
    if (hasValideur) {
        doc.text(
            [data.valide_par_prenom, data.valide_par_nom].filter(Boolean).join(" ") || "—",
            valueX,
            currentY + 24
        );
    }

    currentY += infoBoxH + 6;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("Motif du remboursement", leftX, currentY);
    currentY += 2;
    doc.setDrawColor(225, 228, 235);
    doc.setFillColor(250, 251, 253);
    const motifX = leftX;
    const motifW = contentW;
    const motifLines = doc.splitTextToSize((data.motif || "—").trim(), motifW - 8);
    const motifH = Math.max(11, motifLines.length * 4 + 7);
    doc.roundedRect(motifX, currentY, motifW, motifH, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    doc.text(motifLines, motifX + 4, currentY + 5);
    currentY += motifH + 5;

    currentY += 4;
    const totalCommande = Number(data.commande_montant_ttc || 0);
    const dejaRegle = Number(data.commande_total_regle || 0);
    const montantRembourse = Number(data.montant || 0);
    const regleNetApresRemboursement = Math.max(dejaRegle - montantRembourse, 0);
    const resteDuApresReglementNet = Math.max(totalCommande - regleNetApresRemboursement, 0);
    // Remboursement couvrant tout le TTC commande → solde nul (ex. 600 DH remboursés sur 600 DH)
    const resteApresRemboursement =
        montantRembourse >= totalCommande - 0.01
            ? 0
            : resteDuApresReglementNet;

    const boxY = currentY;
    doc.setDrawColor(220, 223, 230);
    doc.setFillColor(248, 249, 252);
    doc.roundedRect(leftX, boxY, contentW, 36, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text("Récapitulatif financier", leftX + 5, boxY + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text("Montant total commande", leftX + 5, boxY + 14);
    doc.text(formatDh(totalCommande), rightX - 5, boxY + 14, { align: "right" });
    doc.text("Montant déjà réglé", leftX + 5, boxY + 20);
    doc.text(formatDh(dejaRegle), rightX - 5, boxY + 20, { align: "right" });
    doc.text("Montant remboursé", leftX + 5, boxY + 26);
    doc.text(formatDh(montantRembourse), rightX - 5, boxY + 26, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text("Reste après remboursement", leftX + 5, boxY + 32);
    doc.text(formatDh(resteApresRemboursement), rightX - 5, boxY + 32, { align: "right" });

    currentY = boxY + 41;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    const note = doc.splitTextToSize(
        "Ce reçu de remboursement atteste que le montant ci-dessus a été remboursé au client pour la commande concernée.",
        contentW
    );
    doc.text(note, leftX, currentY);
};

export const generateRecuRemboursementPdf = async (
    data: RecuRemboursementData
) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pdv = await loadPdvInfo();

    const pageHeight = doc.internal.pageSize.getHeight();
    const halfHeight = pageHeight / 2;

    drawSingleRemboursementReceipt(doc, pdv, data, 0);

    doc.setDrawColor(200, 200, 200);
    doc.line(10, halfHeight, doc.internal.pageSize.getWidth() - 10, halfHeight);

    drawSingleRemboursementReceipt(doc, pdv, data, halfHeight);

    const safeName = (data.client_nom || "client").replace(/[^a-zA-Z0-9-_]/g, "_");
    doc.save(`Recu_remboursement_${safeName}_${data.numero_commande || data.id}.pdf`);
};