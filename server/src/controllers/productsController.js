const db = require("../config/db").promise();
const fs = require("fs");
const path = require("path");
const { logProductMovement } = require("../utils/productMovementLogger");

const IMPORT_EXCLUDED_COLUMNS = new Set([
    "id",
    "user_id",
    "product_type_id",
    "description",
    "etat",
    "disponible",
    "code_barre",
]);

const toNullableNumber = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const normalized =
        typeof value === "string" ? value.trim().replace(/\s+/g, "").replace(",", ".") : value;
    const n = Number(normalized);
    return Number.isNaN(n) ? null : n;
};

const toNullableString = (value) => {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    return str === "" ? null : str;
};

const toBooleanTinyInt = (value) => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "oui", "yes"].includes(normalized)) return 1;
    if (["0", "false", "non", "no"].includes(normalized)) return 0;
    const n = Number(value);
    if (!Number.isNaN(n)) return n > 0 ? 1 : 0;
    return null;
};

/** ENUM côté base : Detail | Gros (accepte encore Gro en entrée pour compatibilité) */
const normalizeNatureProduit = (value) => {
    const v = String(value ?? "Detail").trim();
    if (v === "Gro" || v === "Gros") return "Gros";
    return "Detail";
};

const parseDisponibleBody = (value) => {
    if (value === undefined || value === null || value === "") return 1;
    const n = toBooleanTinyInt(value);
    return n === null ? 1 : n;
};

const getProductsTableColumnsMeta = async () => {
    const [rows] = await db.execute("SHOW COLUMNS FROM products");
    return rows;
};

let ensuredProductPricingColumns = false;
const ensureProductPricingColumns = async () => {
    if (ensuredProductPricingColumns) return;
    const [metalCols] = await db.execute("SHOW COLUMNS FROM products LIKE 'pricing_metal'");
    if (!Array.isArray(metalCols) || metalCols.length === 0) {
        await db.execute("ALTER TABLE products ADD COLUMN pricing_metal VARCHAR(16) NULL");
    }
    const [variantCols] = await db.execute("SHOW COLUMNS FROM products LIKE 'pricing_variant'");
    if (!Array.isArray(variantCols) || variantCols.length === 0) {
        await db.execute("ALTER TABLE products ADD COLUMN pricing_variant VARCHAR(24) NULL");
    }
    ensuredProductPricingColumns = true;
};

let ensuredNatureProduitColumn = false;
const ensureNatureProduitColumn = async () => {
    if (ensuredNatureProduitColumn) return;
    const [cols] = await db.execute("SHOW COLUMNS FROM products LIKE 'nature_produit'");
    if (!Array.isArray(cols) || cols.length === 0) {
        await db.execute(
            "ALTER TABLE products ADD COLUMN nature_produit ENUM('Detail','Gros') NOT NULL DEFAULT 'Detail'"
        );
    }
    ensuredNatureProduitColumn = true;
};

exports.getProductsImportTemplateColumns = async (_req, res) => {
    try {
        const columns = await getProductsTableColumnsMeta();
        const columnNames = columns
            .map((c) => c.Field)
            .filter((field) => !IMPORT_EXCLUDED_COLUMNS.has(field));
        return res.status(200).json({ columns: columnNames });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.createProduct = async (req, res) => {
    const {
        id_point_de_vente,
        nom,
        id_categorie,
        description,
        prix,
        stock,
        code_barre,
        stock_alert,
        reference,
        etat,
        disponible,
        grammage,
        product_type_id,
        pricing_metal,
        pricing_variant,
        nature_produit: natureProduitRaw
    } = req.body;

    const nature_produit = normalizeNatureProduit(natureProduitRaw);
    const isGro = nature_produit === "Gros";
    const photo = !isGro && req.file ? req.file.filename : null;

    const prixMissing =
        prix === undefined || prix === null || String(prix).trim() === "";
    if (!nom || (!isGro && prixMissing)) {
        return res.status(400).json({ message: "Name and price are required" });
    }

    try {
        await ensureProductPricingColumns();
        await ensureNatureProduitColumn();

        const stockVal = isGro ? 0 : stock ? Number(stock) : 0;
        const stockAlertVal = isGro ? 0 : stock_alert ? Number(stock_alert) : 1;
        const disponibleVal = isGro
            ? parseDisponibleBody(disponible)
            : Number(stock || 0) > 0 ? 1 : 0;
        const parsedPrix = toNullableNumber(prix);
        const prixVal = parsedPrix == null ? 0 : parsedPrix;

        const query = `
            INSERT INTO products
            (id_point_de_vente, nom, id_categorie, photo, description, prix, grammage, stock, code_barre, stock_alert, reference, etat, disponible, user_id, product_type_id, pricing_metal, pricing_variant, nature_produit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.execute(query, [
            id_point_de_vente || null,
            nom,
            id_categorie || null,
            photo,
            description || null,
            prixVal,
            grammage ? Number(grammage) : 0,
            stockVal,
            code_barre || null,
            stockAlertVal,
            reference || null,
            etat ?? 1,
            disponibleVal,
            req.user.id,
            product_type_id || null,
            toNullableString(pricing_metal),
            toNullableString(pricing_variant),
            nature_produit
        ]);

        // Log mouvement creation
        await logProductMovement({
            productId: result.insertId,
            type: "create",
            quantityBefore: 0,
            quantityAfter: stockVal,
            description: "Création de produit",
            userId: req.user.id
        });

        res.status(201).json({
            message: "Product created",
            id: result.insertId
        });

    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            if (err.sqlMessage.includes('unique_reference')) {
                return res.status(400).json({ message: "Un produit avec cette référence existe déjà" });
            }
            if (err.sqlMessage.includes('unique_code_barre')) {
                return res.status(400).json({ message: "Un produit avec ce code-barre existe déjà" });
            }
            return res.status(400).json({ message: "Un doublon existe déjà (référence ou code-barre)" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getAllProducts = async (req, res) => {
    try {

        const query = `
            SELECT p.*, c.nom AS category_name, pdv.nom AS point_de_vente_name, u.nom AS creator_name, u.prenom AS creator_prenom, pt.name AS product_type_name,
                   EXISTS(SELECT 1 FROM devis_items di WHERE di.produit_id = p.id LIMIT 1) AS has_devis_link,
                   EXISTS(SELECT 1 FROM commande_items ci WHERE ci.produit_id = p.id LIMIT 1) AS has_commande_link,
                   EXISTS(SELECT 1 FROM facture_items fi WHERE fi.produit_id = p.id LIMIT 1) AS has_facture_link
            FROM products p
            LEFT JOIN category c ON p.id_categorie = c.id
            LEFT JOIN point_de_vente pdv ON p.id_point_de_vente = pdv.id
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN product_types pt ON p.product_type_id = pt.id
        `;

        const [rows] = await db.execute(query);

        res.status(200).json(rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};


exports.getProductById = async (req, res) => {
    const { id } = req.params;

    try {

        const [rows] = await db.execute(`
            SELECT p.*, c.nom AS category_name, pdv.nom AS point_de_vente_name, u.nom AS creator_name, u.prenom AS creator_prenom, pt.name AS product_type_name
            FROM products p
            LEFT JOIN category c ON p.id_categorie = c.id
            LEFT JOIN point_de_vente pdv ON p.id_point_de_vente = pdv.id
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN product_types pt ON p.product_type_id = pt.id
            WHERE p.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.status(200).json(rows[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};



exports.updateProduct = async (req, res) => {
    const { id } = req.params;

    const {
        id_point_de_vente,
        nom,
        id_categorie,
        description,
        prix,
        stock,
        code_barre,
        stock_alert,
        reference,
        etat,
        disponible,
        grammage,
        product_type_id,
        pricing_metal,
        pricing_variant,
        nature_produit: natureProduitRaw
    } = req.body;

    const newPhoto = req.file ? req.file.filename : null;

    try {
        await ensureProductPricingColumns();
        await ensureNatureProduitColumn();

        // Check if exists
        const [existing] = await db.execute(
            "SELECT photo, stock, nature_produit FROM products WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Product not found" });
        }

        const nature_produit = normalizeNatureProduit(
            natureProduitRaw !== undefined ? natureProduitRaw : existing[0].nature_produit
        );
        const isGro = nature_produit === "Gros";

        let finalPhoto = existing[0].photo;
        if (isGro) {
            if (existing[0].photo) {
                const oldPath = path.join("uploads", existing[0].photo);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            finalPhoto = null;
        } else if (newPhoto) {
            if (existing[0].photo) {
                const oldPath = path.join("uploads", existing[0].photo);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            finalPhoto = newPhoto;
        }

        const stockVal = isGro ? 0 : stock ? Number(stock) : 0;
        const stockAlertVal = isGro ? 0 : stock_alert ? Number(stock_alert) : 1;
        const disponibleVal = isGro
            ? parseDisponibleBody(disponible)
            : Number(stock || 0) > 0 ? 1 : 0;
        const parsedPrix = toNullableNumber(prix);
        const prixVal = parsedPrix == null ? 0 : parsedPrix;

        const query = `
            UPDATE products SET
            id_point_de_vente = ?,
            nom = ?,
            id_categorie = ?,
            photo = ?,
            description = ?,
            prix = ?,
            grammage = ?,
            stock = ?,
            code_barre = ?,
            stock_alert = ?,
            reference = ?,
            etat = ?,
            disponible = ?,
            product_type_id = ?,
            pricing_metal = ?,
            pricing_variant = ?,
            nature_produit = ?
            WHERE id = ?
        `;

        await db.execute(query, [
            id_point_de_vente || null,
            nom,
            id_categorie || null,
            finalPhoto,
            description || null,
            prixVal,
            grammage ? Number(grammage) : 0,
            stockVal,
            code_barre || null,
            stockAlertVal,
            reference || null,
            etat ?? 1,
            disponibleVal,
            product_type_id || null,
            toNullableString(pricing_metal),
            toNullableString(pricing_variant),
            nature_produit,
            id
        ]);

        // Log mouvement update (en particulier changement de stock)
        const before = existing[0].stock;
        const after = stockVal;
        await logProductMovement({
            productId: Number(id),
            type: "update",
            quantityBefore: before,
            quantityAfter: after,
            description: "Mise à jour du produit",
            userId: req.user.id
        });

        res.status(200).json({ message: "Product updated" });

    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            if (err.sqlMessage.includes('unique_reference')) {
                return res.status(400).json({ message: "Un produit avec cette référence existe déjà" });
            }
            if (err.sqlMessage.includes('unique_code_barre')) {
                return res.status(400).json({ message: "Un produit avec ce code-barre existe déjà" });
            }
            return res.status(400).json({ message: "Un doublon existe déjà (référence ou code-barre)" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
};



exports.deleteProduct = async (req, res) => {
    const { id } = req.params;

    try {

        const [existing] = await db.execute(
            "SELECT photo, stock, nom FROM products WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Product not found" });
        }

        // Delete image
        if (existing[0].photo) {
            const filePath = path.join("uploads", existing[0].photo);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        const [deleteResult] = await db.execute(
            "DELETE FROM products WHERE id = ?",
            [id]
        );

        if (deleteResult.affectedRows === 0) {
            return res.status(404).json({ message: "Product not found or already deleted" });
        }

        // Log mouvement delete
        await logProductMovement({
            productId: Number(id),
            type: "delete",
            quantityBefore: existing[0].stock,
            quantityAfter: 0,
            description: `Suppression du produit ${existing[0].nom}`,
            userId: req.user.id
        });

        res.status(200).json({ message: "Product deleted" });

    } catch (err) {
        console.error('Error deleting product:', err);
        // Check if it's a foreign key constraint error
        if (err.code === 'ER_ROW_IS_REFERENCED' || err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ message: "Cannot delete product that is referenced by other records" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.importProducts = async (req, res) => {
    const rows = Array.isArray(req.body?.products) ? req.body.products : [];

    if (rows.length === 0) {
        return res.status(400).json({ message: "Aucune ligne à importer" });
    }

    try {
        const columnsMeta = await getProductsTableColumnsMeta();
        const tableColumns = columnsMeta.map((c) => c.Field);
        const nonInsertable = new Set(
            columnsMeta
                .filter((c) => String(c.Extra || "").includes("auto_increment"))
                .map((c) => c.Field)
        );

        const insertableColumns = tableColumns.filter(
            (col) => !nonInsertable.has(col) && !IMPORT_EXCLUDED_COLUMNS.has(col)
        );

        let createdCount = 0;
        let skippedCount = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i] || {};

            const nom = toNullableString(row.nom);
            const prix = toNullableNumber(row.prix);

            if (!nom || prix === null) {
                skippedCount += 1;
                errors.push(`Ligne ${i + 2}: champs obligatoires manquants (nom, prix)`);
                continue;
            }

            const stock = toNullableNumber(row.stock) ?? 0;

            const normalized = {
                nom,
                prix,
                grammage: toNullableNumber(row.grammage) ?? 0,
                stock,
                stock_alert: toNullableNumber(row.stock_alert) ?? 1,
                reference: toNullableString(row.reference),
                user_id: req.user.id,
            };

            const cols = [];
            const vals = [];

            for (const col of insertableColumns) {
                const rawValue = normalized[col] !== undefined ? normalized[col] : row[col];
                const value = rawValue === "" ? null : rawValue;
                if (value !== undefined) {
                    cols.push(col);
                    vals.push(value);
                }
            }

            try {
                const placeholders = cols.map(() => "?").join(", ");
                const sql = `INSERT INTO products (${cols.join(", ")}) VALUES (${placeholders})`;
                const [result] = await db.execute(sql, vals);

                await logProductMovement({
                    productId: result.insertId,
                    type: "create",
                    quantityBefore: 0,
                    quantityAfter: stock,
                    description: "Import de produit",
                    userId: req.user.id
                });

                createdCount += 1;
            } catch (err) {
                skippedCount += 1;
                if (err.code === "ER_DUP_ENTRY") {
                    errors.push(`Ligne ${i + 2}: doublon (référence ou code-barre déjà existant)`);
                } else {
                    errors.push(`Ligne ${i + 2}: ${err.message}`);
                }
            }
        }

        return res.status(200).json({
            message: "Import terminé",
            createdCount,
            skippedCount,
            totalRows: rows.length,
            errors: errors.slice(0, 20)
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
