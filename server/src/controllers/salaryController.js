const db = require("../config/db").promise();
exports.createSalary = async (req, res) => {
    const {
        employee_id,
        point_de_vente_id,
        mois,
        annee,
        salaire_base,
        primes = 0,
        commission = 0,
        heures_supp = 0,
        deductions = 0,
        cnss = 0,
        ir = 0
    } = req.body;

    try {
        // Vérifier s'il existe déjà une fiche de paie pour cet employé / mois / année
        const [existing] = await db.execute(
            `SELECT id FROM salaries WHERE employee_id = ? AND mois = ? AND annee = ? LIMIT 1`,
            [employee_id, mois, annee]
        );
        if (Array.isArray(existing) && existing.length > 0) {
            return res.status(400).json({
                message: "Une fiche de paie existe déjà pour cet employé sur ce mois et cette année."
            });
        }

        const salaire_brut =
            parseFloat(salaire_base) +
            parseFloat(primes) +
            parseFloat(commission || 0) +
            parseFloat(heures_supp) -
            parseFloat(deductions);

        const salaire_net =
            salaire_brut -
            parseFloat(cnss) -
            parseFloat(ir);

        const query = `
            INSERT INTO salaries 
            (employee_id, point_de_vente_id, mois, annee,
             salaire_base, primes, commission, heures_supp, deductions,
             salaire_brut, cnss, ir, salaire_net)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.execute(query, [
            employee_id,
            point_de_vente_id,
            mois,
            annee,
            salaire_base,
            primes,
            commission || 0,
            heures_supp,
            deductions,
            salaire_brut,
            cnss,
            ir,
            salaire_net
        ]);

        res.status(201).json({
            message: "Salaire créé",
            id: result.insertId
        });

    } catch (err) {
        console.log(err);
        // Identifier un éventuel doublon renvoyé par une contrainte SQL
        if (err && err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
                message: "Une fiche de paie existe déjà pour cet employé sur ce mois et cette année."
            });
        }
        res.status(500).json({ message: "Erreur interne lors de la création du salaire." });
    }
};

exports.getAllSalaries = async (req, res) => {
    try {
        const query = `
            SELECT 
                s.*,
                e.first_name AS prenom,
                e.last_name AS nom,
                p.nom AS pv_name
            FROM salaries s
            LEFT JOIN employees e ON s.employee_id = e.id
            LEFT JOIN point_de_vente p ON s.point_de_vente_id = p.id
            ORDER BY s.annee DESC, s.mois DESC, s.id DESC
        `;

        const [rows] = await db.execute(query);

        res.status(200).json(rows);

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getSalaryById = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT * FROM salaries WHERE id = ?
        `;

        const [rows] = await db.execute(query, [id]);

        res.status(200).json(rows[0]);

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.updateSalary = async (req, res) => {
    const { id } = req.params;
    const {
        salaire_base = 0,
        primes = 0,
        commission = 0,
        heures_supp = 0,
        deductions = 0,
        cnss = 0,
        ir = 0,
        statut,
        date_paiement = null,
    } = req.body || {};

    try {
        const base = Number(salaire_base) || 0;
        const p = Number(primes) || 0;
        const com = Number(commission) || 0;
        const hs = Number(heures_supp) || 0;
        const ded = Number(deductions) || 0;
        const cnssVal = Number(cnss) || 0;
        const irVal = Number(ir) || 0;

        const salaire_brut = base + p + com + hs - ded;
        const salaire_net = salaire_brut - cnssVal - irVal;

        const query = `
            UPDATE salaries
            SET salaire_base = ?,
                primes = ?,
                commission = ?,
                heures_supp = ?,
                deductions = ?,
                salaire_brut = ?,
                cnss = ?,
                ir = ?,
                salaire_net = ?,
                statut = COALESCE(?, statut),
                date_paiement = ?
            WHERE id = ?
        `;

        await db.execute(query, [
            base,
            p,
            com,
            hs,
            ded,
            salaire_brut,
            cnssVal,
            irVal,
            salaire_net,
            statut ?? null,
            date_paiement || null,
            id,
        ]);

        res.status(200).json({ message: "Salaire mis à jour" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.deleteSalary = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            DELETE FROM salaries WHERE id = ?
        `;

        await db.execute(query, [id]);

        res.status(200).json({ message: "Salaire supprimé" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
};
