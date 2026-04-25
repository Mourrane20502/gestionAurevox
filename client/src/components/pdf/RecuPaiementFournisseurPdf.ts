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

export interface RecuPaiementFournisseurData {
    id: number;
    fournisseur_nom: string;
    achat_designation?: string | null;
    montant: number;
    date_reglement: string;
    mode_paiement: string;
    banque_nom?: string | null;
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

const drawSingleFournisseurReceipt = (
    doc: jsPDF,
    pdv: PdvInfo | null,
    data: RecuPaiementFournisseurData,
    offsetY: number
) => {
    const pageWidth = doc.internal.pageSize.getWidth();

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
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text("REÇU DE PAIEMENT FOURNISSEUR", pageWidth / 2, offsetY + 30, {
        align: "center",
    });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    const formattedDate = new Date(data.date_reglement).toLocaleString("fr-FR");
    doc.text(
        `Reçu N° ${data.id.toString().padStart(5, "0")} - ${formattedDate}`,
        pageWidth / 2,
        offsetY + 36,
        { align: "center" }
    );

    let currentY = offsetY + 46;

    doc.setFont("helvetica", "bold");
    doc.text("Fournisseur", 15, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(data.fournisseur_nom || "—", 40, currentY);
    currentY += 6;

    doc.setFont("helvetica", "bold");
    doc.text("Achat / bon de commande", 15, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(data.achat_designation || "—", 60, currentY);
    currentY += 6;

    doc.setFont("helvetica", "bold");
    doc.text("Mode de paiement", 15, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(data.mode_paiement || "—", 55, currentY);
    currentY += 6;

    if (data.banque_nom) {
        doc.setFont("helvetica", "bold");
        doc.text("Banque", 15, currentY);
        doc.setFont("helvetica", "normal");
        doc.text(data.banque_nom, 40, currentY);
        currentY += 6;
    }

    currentY += 4;
    doc.setDrawColor(220, 223, 230);
    doc.setFillColor(248, 249, 252);
    doc.roundedRect(15, currentY, pageWidth - 30, 18, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("Montant réglé", 20, currentY + 7);
    doc.setFontSize(11);
    const montantStr = `${data.montant.toFixed(2).replace(".", ",")} DH`;
    doc.text(montantStr, pageWidth - 20, currentY + 11, { align: "right" });

    currentY += 26;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.text(
        "Ce reçu atteste de la bonne réception du paiement mentionné ci-dessus.",
        15,
        currentY
    );
};

export const generateRecuPaiementFournisseurPdf = async (
    data: RecuPaiementFournisseurData
) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pdv = await loadPdvInfo();

    const pageHeight = doc.internal.pageSize.getHeight();
    const halfHeight = pageHeight / 2;

    // Premier exemplaire (haut de page)
    drawSingleFournisseurReceipt(doc, pdv, data, 0);

    // Séparateur horizontal au milieu
    doc.setDrawColor(200, 200, 200);
    doc.line(10, halfHeight, doc.internal.pageSize.getWidth() - 10, halfHeight);

    // Deuxième exemplaire (bas de page)
    drawSingleFournisseurReceipt(doc, pdv, data, halfHeight);

    const safeName = (data.fournisseur_nom || "fournisseur").replace(/[^a-zA-Z0-9-_]/g, "_");
    doc.save(`Recu_paiement_fournisseur_${safeName}_${data.id}.pdf`);
};

