const db = require("../config/db").promise();

let pointageSchemaReady = false;

const TYPE_JOURNEE = new Set(["normal", "demi_journee", "absent", "conge", "ferie"]);
const STATUT = new Set(["present", "absent", "retard", "conge", "mission"]);

/**
 * Schéma pointage (aligné prod) :
 * employe_id, date_pointage, heure_entree, heure_sortie,
 * type_journee, statut, retard_minutes, heures_sup, note, valide_par, created_at, updated_at
 */
const ensurePointageSchema = async () => {
    if (pointageSchemaReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS pointage (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employe_id INT NOT NULL,
            date_pointage DATE NOT NULL,
            heure_entree TIME NULL,
            heure_sortie TIME NULL,
            type_journee ENUM('normal','demi_journee','absent','conge','ferie') NULL DEFAULT 'normal',
            statut ENUM('present','absent','retard','conge','mission') NULL DEFAULT 'present',
            retard_minutes INT NULL DEFAULT 0,
            heures_sup DECIMAL(4,2) NULL DEFAULT 0,
            note TEXT NULL,
            valide_par INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_pointage_employe (employe_id),
            KEY idx_pointage_date (date_pointage)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    pointageSchemaReady = true;
};

/** Expose employee_id / commentaire / pause_minutes pour le front existant. */
const mapPointageRowForApi = (row) => {
    if (!row || typeof row !== "object") return row;
    const employeeId =
        row.employee_id != null && row.employee_id !== ""
            ? row.employee_id
            : row.employe_id != null && row.employe_id !== ""
              ? row.employe_id
              : null;
    const n = employeeId != null ? Number(employeeId) : null;
    const retard = row.retard_minutes != null ? Number(row.retard_minutes) : 0;
    return {
        ...row,
        employee_id: Number.isFinite(n) ? n : null,
        commentaire: row.commentaire != null ? row.commentaire : row.note != null ? row.note : null,
        pause_minutes: Number.isFinite(retard) ? Math.max(0, Math.round(retard)) : 0,
        point_de_vente_id: row.point_de_vente_id ?? null,
        pv_name: row.pv_name ?? null,
    };
};

const normalizeTime = (v) => {
    if (v == null || String(v).trim() === "") return null;
    const s = String(v).trim();
    if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
    return s;
};

const pickEnum = (value, allowed, fallback) => {
    const s = value != null ? String(value).trim().toLowerCase() : "";
    return allowed.has(s) ? s : fallback;
};

/** valide_par FK → employees.id : on résout via employees.user_id = compte connecté. */
const resolveValideParEmployeId = async (userId) => {
    const uid = userId != null ? Number(userId) : NaN;
    if (!Number.isFinite(uid) || uid <= 0) return null;
    try {
        const [rows] = await db.query(
            "SELECT id FROM employees WHERE user_id = ? LIMIT 1",
            [uid]
        );
        if (Array.isArray(rows) && rows.length > 0) {
            const eid = Number(rows[0].id);
            return Number.isFinite(eid) && eid > 0 ? eid : null;
        }
    } catch (e) {
        console.warn("pointage valide_par: impossible de résoudre employees.user_id", e.message);
    }
    return null;
};

exports.getPointageLookups = async (_req, res) => {
    try {
        await ensurePointageSchema();
        const [employees] = await db.query(
            `SELECT id, first_name AS prenom, last_name AS nom, point_de_vente_id AS id_point_de_vente
             FROM employees
             ORDER BY last_name ASC, first_name ASC`
        );
        res.status(200).json({ employees });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.createPointage = async (req, res) => {
    try {
        await ensurePointageSchema();
        const {
            employee_id,
            date_pointage,
            heure_entree,
            heure_sortie,
            pause_minutes,
            commentaire,
            type_journee,
            statut,
            heures_sup,
        } = req.body || {};

        const empId = Number(employee_id);
        if (!Number.isFinite(empId) || empId <= 0) {
            return res.status(400).json({ message: "Employé invalide" });
        }
        const dateStr = date_pointage ? String(date_pointage).slice(0, 10) : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return res.status(400).json({ message: "Date de pointage invalide (AAAA-MM-JJ)" });
        }

        const retard = Math.max(0, Math.min(24 * 60, Math.round(Number(pause_minutes) || 0)));
        const note = commentaire != null ? String(commentaire).slice(0, 65000) : null;
        const tj = pickEnum(type_journee, TYPE_JOURNEE, "normal");
        const st = pickEnum(statut, STATUT, "present");
        const hs = Math.max(0, Math.min(99.99, Number(heures_sup) || 0));
        const validePar = await resolveValideParEmployeId(req.user?.id);

        const [result] = await db.query(
            `INSERT INTO pointage
                (employe_id, date_pointage, heure_entree, heure_sortie, type_journee, statut, retard_minutes, heures_sup, note, valide_par)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                empId,
                dateStr,
                normalizeTime(heure_entree),
                normalizeTime(heure_sortie),
                tj,
                st,
                retard,
                hs,
                note,
                validePar,
            ]
        );

        res.status(201).json({ message: "Pointage enregistré", id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.getAllPointages = async (_req, res) => {
    try {
        await ensurePointageSchema();
        const [rows] = await db.query(`
            SELECT
                p.*,
                e.first_name AS prenom,
                e.last_name AS nom
            FROM pointage p
            LEFT JOIN employees e ON p.employe_id = e.id
            ORDER BY p.date_pointage DESC, p.id DESC
        `);
        res.status(200).json(rows.map(mapPointageRowForApi));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.getPointageById = async (req, res) => {
    try {
        await ensurePointageSchema();
        const { id } = req.params;
        const [rows] = await db.query(
            `
            SELECT p.*, e.first_name AS prenom, e.last_name AS nom
            FROM pointage p
            LEFT JOIN employees e ON p.employe_id = e.id
            WHERE p.id = ?
            LIMIT 1
        `,
            [id]
        );
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({ message: "Pointage introuvable" });
        }
        res.status(200).json(mapPointageRowForApi(rows[0]));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.updatePointage = async (req, res) => {
    try {
        await ensurePointageSchema();
        const { id } = req.params;
        const {
            employee_id,
            date_pointage,
            heure_entree,
            heure_sortie,
            pause_minutes,
            commentaire,
            type_journee,
            statut,
            heures_sup,
        } = req.body || {};

        const [existingRows] = await db.query(
            `SELECT type_journee, statut, heures_sup FROM pointage WHERE id = ? LIMIT 1`,
            [id]
        );
        if (!Array.isArray(existingRows) || existingRows.length === 0) {
            return res.status(404).json({ message: "Pointage introuvable" });
        }
        const ex = existingRows[0];

        const empId = Number(employee_id);
        if (!Number.isFinite(empId) || empId <= 0) {
            return res.status(400).json({ message: "Employé invalide" });
        }
        const dateStr = date_pointage ? String(date_pointage).slice(0, 10) : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return res.status(400).json({ message: "Date de pointage invalide" });
        }
        const retard = Math.max(0, Math.min(24 * 60, Math.round(Number(pause_minutes) || 0)));
        const note = commentaire != null ? String(commentaire).slice(0, 65000) : null;
        const tj =
            type_journee != null && String(type_journee).trim() !== ""
                ? pickEnum(type_journee, TYPE_JOURNEE, ex.type_journee || "normal")
                : ex.type_journee || "normal";
        const st =
            statut != null && String(statut).trim() !== ""
                ? pickEnum(statut, STATUT, ex.statut || "present")
                : ex.statut || "present";
        const hs =
            heures_sup != null && String(heures_sup).trim() !== ""
                ? Math.max(0, Math.min(99.99, Number(heures_sup) || 0))
                : Number(ex.heures_sup) || 0;

        const [result] = await db.query(
            `UPDATE pointage SET
                employe_id = ?,
                date_pointage = ?,
                heure_entree = ?,
                heure_sortie = ?,
                type_journee = ?,
                statut = ?,
                retard_minutes = ?,
                heures_sup = ?,
                note = ?
             WHERE id = ?`,
            [
                empId,
                dateStr,
                normalizeTime(heure_entree),
                normalizeTime(heure_sortie),
                tj,
                st,
                retard,
                hs,
                note,
                id,
            ]
        );
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Pointage introuvable" });
        }
        res.status(200).json({ message: "Pointage mis à jour" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.deletePointage = async (req, res) => {
    try {
        await ensurePointageSchema();
        const { id } = req.params;
        const [result] = await db.query("DELETE FROM pointage WHERE id = ?", [id]);
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Pointage introuvable" });
        }
        res.status(200).json({ message: "Pointage supprimé" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur serveur" });
    }
};
