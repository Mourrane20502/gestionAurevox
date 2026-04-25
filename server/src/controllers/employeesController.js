const db = require("../config/db").promise();


exports.createEmployee = async (req, res) => {
    const { nom, prenom, email, phone, role, salary, hire_date, adresse, status, id_point_de_vente } = req.body;
    try {
        const query = `
            INSERT INTO employees (first_name, last_name, email, phone, role, salary, hire_date, adresse, status, point_de_vente_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [prenom, nom, email, phone, role, salary, hire_date, adresse, status, id_point_de_vente]);
        res.status(201).json({ message: "Employee created", id: result.insertId });


    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

exports.getAllEmployees = async (req, res) => {
    try {
        const query = `
            SELECT 
                e.*, 
                e.first_name AS prenom, 
                e.last_name AS nom, 
                e.point_de_vente_id AS id_point_de_vente,
                p.nom AS pv_name 
            FROM employees e
            LEFT JOIN point_de_vente p ON e.point_de_vente_id = p.id
        `;
        const [rows] = await db.execute(query);
        res.status(200).json(rows);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

exports.getEmployeeById = async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT *, first_name AS prenom, last_name AS nom, point_de_vente_id AS id_point_de_vente FROM employees WHERE id = ?
        `;
        const [rows] = await db.execute(query, [id]);
        res.status(200).json(rows);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

exports.updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { nom, prenom, email, phone, role, salary, hire_date, adresse, status, id_point_de_vente } = req.body;
    try {
        const query = `
            UPDATE employees 
            SET first_name = ?, last_name = ?, email = ?, phone = ?, role = ?, salary = ?, hire_date = ?, adresse = ?, status = ?, point_de_vente_id = ? 
            WHERE id = ?
        `;
        const [result] = await db.execute(query, [prenom, nom, email, phone, role, salary, hire_date, adresse, status, id_point_de_vente, id]);
        res.status(200).json({ message: "Employee updated" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

exports.deleteEmployee = async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            DELETE FROM employees WHERE id = ?
        `;
        const [result] = await db.execute(query, [id]);
        res.status(200).json({ message: "Employee deleted" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
}
