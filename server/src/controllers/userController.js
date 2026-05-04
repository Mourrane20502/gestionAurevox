const bcrypt = require("bcrypt");
const db = require("../config/db");

exports.getCurrentUser = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = "SELECT id, nom, prenom, email, role FROM users WHERE id = ?";
        db.query(query, [userId], (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: "Internal server error" });
            }
            if (result.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }
            return res.status(200).json(result[0]);
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Mot de passe actuel et nouveau requis" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Le nouveau mot de passe doit contenir au moins 6 caractères" });
        }
        const [rows] = await db.promise().query("SELECT password FROM users WHERE id = ?", [userId]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ message: "Utilisateur non trouvé" });
        }
        const match = await bcrypt.compare(currentPassword, rows[0].password);
        if (!match) {
            return res.status(401).json({ message: "Mot de passe actuel incorrect" });
        }
        const hashed = await bcrypt.hash(newPassword, 10);
        await db.promise().query("UPDATE users SET password = ? WHERE id = ?", [hashed, userId]);
        return res.status(200).json({ message: "Mot de passe mis à jour avec succès" });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Erreur serveur" });
    }
};

exports.updateCurrentUser = async (req, res) => {
    try {
        const userId = req.user.id;
        const { nom, prenom, email, password } = req.body;

        // Build dynamic update
        const fields = [];
        const values = [];

        if (nom !== undefined) {
            fields.push("nom = ?");
            values.push(nom);
        }
        if (prenom !== undefined) {
            fields.push("prenom = ?");
            values.push(prenom);
        }
        if (email !== undefined) {
            fields.push("email = ?");
            values.push(email);
        }
        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            fields.push("password = ?");
            values.push(hashed);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: "No fields to update" });
        }

        const query = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;
        values.push(userId);

        db.query(query, values, (err) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: "Internal server error" });
            }
            return res.status(200).json({ message: "Profile updated successfully" });
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.createUser = async (req, res) => {
    const { nom, prenom, email, password, role } = req.body;

    if (!nom || !prenom || !email || !password || !role) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
      INSERT INTO users (nom, prenom, email, password, role)
      VALUES (?, ?, ?, ?, ?)
    `;

        db.query(
            sql,
            [nom, prenom, email, hashedPassword, role],
            (err, result) => {
                if (err) {
                    console.log(err);
                    return res.status(500).json({ message: "Internal server error" });
                }

                return res.status(201).json({
                    message: "User created successfully",
                    user: result
                });
            }
        );

    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};


exports.getAllUsers = async (req, res) => {
    try {
        const query = "SELECT * FROM users";
        db.query(query, (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: "Internal server error" });
            }
            return res.status(200).json({ message: "Users fetched successfully", users: result });
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });

    }
}

exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }
        const query = "SELECT * FROM users WHERE id = ?";
        db.query(query, [parsedId], (err, result) => {
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


exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, prenom, email, password, role } = req.body;
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }
        let passwordToStore = null;
        const hasNewPassword = String(password || "").trim().length > 0;
        if (hasNewPassword) {
            passwordToStore = await bcrypt.hash(String(password), 10);
        } else {
            const [rows] = await db.promise().query("SELECT password FROM users WHERE id = ?", [parsedId]);
            if (!rows || rows.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }
            passwordToStore = rows[0].password;
        }

        const query = "UPDATE users SET nom = ?, prenom = ?, email = ?, password = ?, role = ? WHERE id = ?";
        db.query(query, [nom, prenom, email, passwordToStore, role, parsedId], (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: "Internal server error" });
            }
            return res.status(200).json({ message: "User updated successfully" });
        })

    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }
        const query = "DELETE FROM users WHERE id = ?";
        db.query(query, [parsedId], (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: "Internal server error" });
            }
            return res.status(200).json({ message: "User deleted successfully" });
        })

    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}
