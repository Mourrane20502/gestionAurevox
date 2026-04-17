const db = require("../config/db").promise();

/**
 * Volume de vente (TTC) réalisé par un commercial sur une période (mois/année).
 * L'employé doit avoir un user_id (lien vers le compte utilisateur qui crée les factures).
 */
exports.getVolumeVente = async (req, res) => {
    const { employee_id, mois, annee } = req.query;
    if (!employee_id || !mois || !annee) {
        return res.status(400).json({ message: "employee_id, mois et annee sont requis" });
    }
    try {
        const [empRows] = await db.execute(
            "SELECT user_id FROM employees WHERE id = ?",
            [employee_id]
        );
        if (!empRows.length) {
            return res.status(404).json({ message: "Employé non trouvé" });
        }
        const user_id = empRows[0].user_id;
        if (user_id == null) {
            return res.status(200).json({
                volume_ttc: 0,
                volume_ht: 0,
                message: "Cet employé n'est pas lié à un compte commercial (user_id). Saisie manuelle de la commission."
            });
        }

        const [rows] = await db.execute(
            `SELECT 
                COALESCE(SUM(f.montant_ttc), 0) AS volume_ttc,
                COALESCE(SUM(f.montant_ht), 0) AS volume_ht
             FROM factures f
             WHERE f.user_id = ?
               AND MONTH(f.date_facture) = ?
               AND YEAR(f.date_facture) = ?`,
            [user_id, mois, annee]
        );

        res.status(200).json({
            volume_ttc: Number(rows[0]?.volume_ttc ?? 0),
            volume_ht: Number(rows[0]?.volume_ht ?? 0)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};
