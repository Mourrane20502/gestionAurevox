const db = require("../config/db").promise();

exports.getAllProductTypes = async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM product_types ORDER BY name ASC");
        res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.createProductType = async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    try {
        const [result] = await db.execute(
            "INSERT INTO product_types (name, description) VALUES (?, ?)",
            [name, description || null]
        );
        res.status(201).json({ id: result.insertId, name, description });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ message: "Product type already exists" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateProductType = async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    try {
        const [result] = await db.execute(
            "UPDATE product_types SET name = ?, description = ? WHERE id = ?",
            [name, description || null, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: "Product type not found" });
        res.status(200).json({ message: "Product type updated" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ message: "Product type name already exists" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.deleteProductType = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute("DELETE FROM product_types WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: "Product type not found" });
        res.status(200).json({ message: "Product type deleted" });
    } catch (err) {
        if (err.code === "ER_ROW_IS_REFERENCED" || err.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(400).json({ message: "Cannot delete product type linked to products" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
};
