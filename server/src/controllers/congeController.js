const db = require("../config/db").promise();


/* ===============================
   CREATE CONGE
================================= */
exports.createConge = async (req, res) => {
    const {
        employee_id,
        point_de_vente_id,
        type,
        date_debut,
        date_fin,
        nombre_jours,
        motif
    } = req.body;

    try {
        const query = `
            INSERT INTO conges 
            (employee_id, point_de_vente_id, \`type\`, date_debut, date_fin, nombre_jours, motif, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente')
        `;

        const [result] = await db.execute(query, [
            employee_id,
            point_de_vente_id,
            type,
            date_debut,
            date_fin,
            nombre_jours,
            motif
        ]);

        res.status(201).json({ message: "Congé créé", id: result.insertId });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};


/* ===============================
   GET ALL CONGES
================================= */
exports.getAllConges = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.*,
                e.first_name AS prenom,
                e.last_name AS nom,
                p.nom AS pv_name
            FROM conges c
            LEFT JOIN employees e ON c.employee_id = e.id
            LEFT JOIN point_de_vente p ON c.point_de_vente_id = p.id
            ORDER BY c.created_at DESC
        `;

        const [rows] = await db.execute(query);
        res.status(200).json(rows);

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};


/* ===============================
   GET CONGE BY ID
================================= */
exports.getCongeById = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT * FROM conges WHERE id = ?
        `;

        const [rows] = await db.execute(query, [id]);
        res.status(200).json(rows);

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};


/* ===============================
   UPDATE CONGE
================================= */
exports.updateConge = async (req, res) => {
    const { id } = req.params;
    const {
        type,
        date_debut,
        date_fin,
        nombre_jours,
        motif,
        status
    } = req.body;

    try {
        const query = `
            UPDATE conges
            SET \`type\` = ?, 
                date_debut = ?, 
                date_fin = ?, 
                nombre_jours = ?, 
                motif = ?, 
                status = ?
            WHERE id = ?
        `;

        await db.execute(query, [
            type,
            date_debut,
            date_fin,
            nombre_jours,
            motif,
            status,
            id
        ]);

        res.status(200).json({ message: "Congé mis à jour" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};


/* ===============================
   APPROVE CONGE
================================= */
exports.approveConge = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            UPDATE conges
            SET status = 'approuve'
            WHERE id = ?
        `;

        await db.execute(query, [id]);

        res.status(200).json({ message: "Congé approuvé" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};


/* ===============================
   REFUSE CONGE
================================= */
exports.refuseConge = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            UPDATE conges
            SET status = 'refuse'
            WHERE id = ?
        `;

        await db.execute(query, [id]);

        res.status(200).json({ message: "Congé refusé" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};


/* ===============================
   DELETE CONGE
================================= */
exports.deleteConge = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            DELETE FROM conges WHERE id = ?
        `;

        await db.execute(query, [id]);

        res.status(200).json({ message: "Congé supprimé" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};
