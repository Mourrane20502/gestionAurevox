const db = require("../config/db").promise();

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

exports.getMargeSummary = async (_req, res) => {
    try {
        const [commandesDetailsRows] = await db.execute(
            `
            SELECT
                c.id,
                c.numero_commande AS code,
                c.date_commande AS date_document,
                COALESCE(MAX(c.montant_ttc), 0) AS total_vente,
                COALESCE(SUM(COALESCE(p.prix_achat, 0) * COALESCE(ci.quantite, 0)), 0) AS total_cout
            FROM commandes c
            LEFT JOIN commande_items ci ON ci.commande_id = c.id
            LEFT JOIN products p ON p.id = ci.produit_id
            WHERE LOWER(COALESCE(c.statut, '')) IN ('validee', 'paye', 'payee', 'reglee')
            GROUP BY c.id, c.numero_commande, c.date_commande
            ORDER BY c.date_commande DESC, c.id DESC
            `
        );

        const [facturesDetailsRows] = await db.execute(
            `
            SELECT
                f.id,
                f.numero_facture AS code,
                f.date_facture AS date_document,
                COALESCE(MAX(f.montant_ttc), 0) AS total_vente,
                COALESCE(SUM(COALESCE(p.prix_achat, 0) * COALESCE(fi.quantite, 0)), 0) AS total_cout
            FROM factures f
            LEFT JOIN facture_items fi ON fi.facture_id = f.id
            LEFT JOIN products p ON p.id = fi.produit_id
            WHERE LOWER(COALESCE(f.statut, '')) NOT IN ('annulle', 'annulee', 'annullee', 'annule', 'annulé')
            GROUP BY f.id, f.numero_facture, f.date_facture
            ORDER BY f.date_facture DESC, f.id DESC
            `
        );

        const [[commandesRow]] = await db.execute(
            `
            SELECT
                COUNT(DISTINCT c.id) AS total_docs,
                COALESCE(SUM(c.montant_ttc), 0) AS total_vente,
                COALESCE(SUM(COALESCE(p.prix_achat, 0) * COALESCE(ci.quantite, 0)), 0) AS total_cout
            FROM commandes c
            LEFT JOIN commande_items ci ON ci.commande_id = c.id
            LEFT JOIN products p ON p.id = ci.produit_id
            WHERE LOWER(COALESCE(c.statut, '')) IN ('validee', 'paye', 'payee', 'reglee')
            `
        );

        const [[facturesRow]] = await db.execute(
            `
            SELECT
                COUNT(DISTINCT f.id) AS total_docs,
                COALESCE(SUM(f.montant_ttc), 0) AS total_vente,
                COALESCE(SUM(COALESCE(p.prix_achat, 0) * COALESCE(fi.quantite, 0)), 0) AS total_cout
            FROM factures f
            LEFT JOIN facture_items fi ON fi.facture_id = f.id
            LEFT JOIN products p ON p.id = fi.produit_id
            WHERE LOWER(COALESCE(f.statut, '')) NOT IN ('annulle', 'annulee', 'annullee', 'annule', 'annulé')
            `
        );

        const commandes = {
            total_docs: toNumber(commandesRow?.total_docs),
            total_vente: toNumber(commandesRow?.total_vente),
            total_cout: toNumber(commandesRow?.total_cout),
        };
        const factures = {
            total_docs: toNumber(facturesRow?.total_docs),
            total_vente: toNumber(facturesRow?.total_vente),
            total_cout: toNumber(facturesRow?.total_cout),
        };

        const commandesMarge = commandes.total_vente - commandes.total_cout;
        const facturesMarge = factures.total_vente - factures.total_cout;

        const global = {
            total_docs: commandes.total_docs + factures.total_docs,
            total_vente: commandes.total_vente + factures.total_vente,
            total_cout: commandes.total_cout + factures.total_cout,
            total_marge: commandesMarge + facturesMarge,
        };

        const commandes_details = (Array.isArray(commandesDetailsRows) ? commandesDetailsRows : []).map((row) => {
            const totalVente = toNumber(row.total_vente);
            const totalCout = toNumber(row.total_cout);
            return {
                id: toNumber(row.id),
                code: row.code || "",
                date_document: row.date_document || null,
                total_vente: totalVente,
                total_cout: totalCout,
                total_marge: totalVente - totalCout,
                type: "commande",
            };
        });

        const factures_details = (Array.isArray(facturesDetailsRows) ? facturesDetailsRows : []).map((row) => {
            const totalVente = toNumber(row.total_vente);
            const totalCout = toNumber(row.total_cout);
            return {
                id: toNumber(row.id),
                code: row.code || "",
                date_document: row.date_document || null,
                total_vente: totalVente,
                total_cout: totalCout,
                total_marge: totalVente - totalCout,
                type: "facture",
            };
        });

        res.json({
            commandes: { ...commandes, total_marge: commandesMarge },
            factures: { ...factures, total_marge: facturesMarge },
            global,
            commandes_details,
            factures_details,
        });
    } catch (error) {
        console.error("Error fetching marge summary:", error);
        res.status(500).json({ message: "Erreur serveur lors du calcul de la marge" });
    }
};
