const db = require("../config/db").promise();

const resolveValidateurEmployeeId = async (userId) => {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const [rows] = await db.query("SELECT id FROM employees WHERE id = ? LIMIT 1", [id]);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return Number(rows[0].id) || null;
};

exports.getAllPointages = async (_req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT p.*,
                   e.first_name AS employe_prenom,
                   e.last_name AS employe_nom
            FROM pointage p
            LEFT JOIN employees e ON e.id = p.employe_id
            ORDER BY p.date_pointage DESC, p.id DESC
            `
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error("Error fetching pointages:", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.createPointage = async (req, res) => {
    const {
        employe_id,
        date_pointage,
        heure_entree = null,
        heure_sortie = null,
        type_journee = "normal",
        statut = "present",
        retard_minutes = 0,
        heures_sup = 0,
        note = null,
    } = req.body || {};

    if (!employe_id || !date_pointage) {
        return res.status(400).json({ message: "employe_id et date_pointage sont obligatoires" });
    }

    try {
        const validateurId = await resolveValidateurEmployeeId(req.user?.id);
        const [result] = await db.query(
            `
            INSERT INTO pointage (
                employe_id,
                date_pointage,
                heure_entree,
                heure_sortie,
                type_journee,
                statut,
                retard_minutes,
                heures_sup,
                note,
                valide_par
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                Number(employe_id),
                String(date_pointage).slice(0, 10),
                heure_entree ? String(heure_entree).slice(0, 8) : null,
                heure_sortie ? String(heure_sortie).slice(0, 8) : null,
                String(type_journee || "normal"),
                String(statut || "present"),
                Number(retard_minutes) || 0,
                Number(heures_sup) || 0,
                note ? String(note) : null,
                validateurId,
            ]
        );
        res.status(201).json({ message: "Pointage créé", id: result.insertId });
    } catch (error) {
        console.error("Error creating pointage:", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.updatePointage = async (req, res) => {
    const { id } = req.params;
    const {
        employe_id,
        date_pointage,
        heure_entree = null,
        heure_sortie = null,
        type_journee = "normal",
        statut = "present",
        retard_minutes = 0,
        heures_sup = 0,
        note = null,
    } = req.body || {};

    if (!employe_id || !date_pointage) {
        return res.status(400).json({ message: "employe_id et date_pointage sont obligatoires" });
    }

    try {
        const validateurId = await resolveValidateurEmployeeId(req.user?.id);
        const [result] = await db.query(
            `
            UPDATE pointage
            SET employe_id = ?,
                date_pointage = ?,
                heure_entree = ?,
                heure_sortie = ?,
                type_journee = ?,
                statut = ?,
                retard_minutes = ?,
                heures_sup = ?,
                note = ?,
                valide_par = ?
            WHERE id = ?
            `,
            [
                Number(employe_id),
                String(date_pointage).slice(0, 10),
                heure_entree ? String(heure_entree).slice(0, 8) : null,
                heure_sortie ? String(heure_sortie).slice(0, 8) : null,
                String(type_journee || "normal"),
                String(statut || "present"),
                Number(retard_minutes) || 0,
                Number(heures_sup) || 0,
                note ? String(note) : null,
                validateurId,
                Number(id),
            ]
        );
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Pointage introuvable" });
        }
        res.status(200).json({ message: "Pointage mis à jour" });
    } catch (error) {
        console.error("Error updating pointage:", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.deletePointage = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query("DELETE FROM pointage WHERE id = ?", [Number(id)]);
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Pointage introuvable" });
        }
        res.status(200).json({ message: "Pointage supprimé" });
    } catch (error) {
        console.error("Error deleting pointage:", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
};
