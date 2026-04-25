const db = require("../config/db");

exports.createCategory = async (req, res) => {
    const { name } = req.body;
    try {
        if (!name) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        const query = "INSERT INTO category (nom) VALUES (?)";
        db.query(query, [name], (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: "Internal server error" });
            }
            return res.status(200).json({ message: "Category created successfully" });
        })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}


exports.getAllCategories = async (req, res) => {
    try {
        const query = "SELECT * FROM category";
        db.query(query, (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: "Internal server error" });
            }
            return res.status(200).json(result);
        })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}


exports.getCategoryById = async (req, res) => {
    const { id } = req.params;

    try {
        const query = "SELECT * FROM category WHERE id = ?";

        db.query(query, [id], (err, result) => {

            if (err) {
                console.error(err);
                return res.status(500).json({ message: "Internal server error" });
            }

            if (result.length === 0) {
                return res.status(404).json({ message: "Category not found" });
            }

            return res.status(200).json(result[0]);
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateCategory = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ message: "Name is required" });
    }

    try {

        db.query(
            "SELECT id FROM category WHERE id = ?",
            [id],
            (err, result) => {

                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: "Internal server error" });
                }

                if (result.length === 0) {
                    return res.status(404).json({ message: "Category not found" });
                }

                db.query(
                    "UPDATE category SET nom = ? WHERE id = ?",
                    [name, id],
                    (err2) => {
                        if (err2) {
                            console.error(err2);
                            return res.status(500).json({ message: "Internal server error" });
                        }

                        return res.status(200).json({
                            message: "Category updated successfully"
                        });
                    }
                );
            }
        );

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.deleteCategory = async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM category WHERE id = ?";
        db.query(query, [id], (err, result) => {
            if (err) {
                console.error(err);
                if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                    return res.status(400).json({ message: "Cannot delete category associated with products" });
                }
                return res.status(500).json({ message: "Internal server error" });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Category not found" });
            }

            return res.status(200).json({ message: "Category deleted successfully" });
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
