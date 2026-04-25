const db = require("../config/db").promise();

// Liste simple des produits fournisseurs pour alimenter le formulaire d'achats
exports.getAllProduitsFournisseurs = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, nom FROM produits_fournisseurs ORDER BY nom ASC"
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching produits_fournisseurs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

