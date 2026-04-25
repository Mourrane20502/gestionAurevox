const db = require("../config/db");

async function ensurePdvEmailIsNotUnique() {
    const query = (sql, params = []) =>
        new Promise((resolve, reject) => {
            db.query(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

    const indexes = await query("SHOW INDEX FROM point_de_vente WHERE Column_name = 'email'");
    const uniqueKeys = (Array.isArray(indexes) ? indexes : [])
        .filter((idx) => Number(idx.Non_unique) === 0 && idx.Key_name && idx.Key_name !== "PRIMARY")
        .map((idx) => String(idx.Key_name));

    const uniqueDistinct = Array.from(new Set(uniqueKeys));
    for (const keyName of uniqueDistinct) {
        await query(`ALTER TABLE point_de_vente DROP INDEX \`${keyName}\``);
    }
}

function mapDuplicateEntryMessage(err) {
    const msg = String(err?.sqlMessage || "");
    const match = msg.match(/for key '([^']+)'/i);
    const keyName = match?.[1] ? ` (${match[1]})` : "";
    return `Contrainte d'unicité en base détectée${keyName}.`;
}

exports.createPdv = async (req, res) => {
    const {
        name,
        email,
        telephone,
        num_tel,
        id_sous_gestionnaire,
        if: ifNumber,
        ice,
        patente,
        cnss,
        adresse,
        rc,
    } = req.body;

    try {
        await ensurePdvEmailIsNotUnique();
        if (!name) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        const query = `
            INSERT INTO point_de_vente (nom, logo, email, telephone, num_tel, id_sous_gestionnaire, \`if\`, ice, patente, cnss, adresse, rc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(
            query,
            [
                name,
                req.file ? req.file.filename : null,
                email || null,
                telephone || null,
                num_tel || null,
                id_sous_gestionnaire ? Number(id_sous_gestionnaire) : null,
                ifNumber || null,
                ice || null,
                patente || null,
                cnss || null,
                adresse || null,
                rc || null,
            ],
            (err, result) => {
                if (err) {
                    console.log(err);
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(400).json({ message: mapDuplicateEntryMessage(err) });
                    }
                    return res.status(500).json({ message: "Internal server error" });
                }
                return res.status(201).json({ message: "Point de vente created successfully" });
            }
        );


    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.getAllPdv = async (req, res) => {
    try {
        const query = `
            SELECT p.*, ss.NOM_SOUS_SOCIETE AS sous_societe_nom
            FROM point_de_vente p
            LEFT JOIN sous_societe ss ON ss.ID = p.id_sous_gestionnaire
            ORDER BY p.id DESC
        `;
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

exports.getPdvById = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT p.*, ss.NOM_SOUS_SOCIETE AS sous_societe_nom
            FROM point_de_vente p
            LEFT JOIN sous_societe ss ON ss.ID = p.id_sous_gestionnaire
            WHERE p.id = ?
        `;

        db.query(query, [id], (err, result) => {

            if (err) {
                console.error(err);
                return res.status(500).json({ message: "Internal server error" });
            }

            if (result.length === 0) {
                return res.status(404).json({ message: "Point de vente not found" });
            }

            return res.status(200).json(result[0]);
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.updatePdv = async (req, res) => {
    const { id } = req.params;
    const {
        name,
        email,
        telephone,
        num_tel,
        id_sous_gestionnaire,
        if: ifNumber,
        ice,
        patente,
        cnss,
        adresse,
        rc,
    } = req.body;

    const normalizeNullable = (value) => {
        if (value === undefined || value === null) return null;
        const v = String(value).trim();
        return v === "" ? null : v;
    };

    try {
        await ensurePdvEmailIsNotUnique();
        if (!name) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Conserver le logo existant si aucun nouveau fichier n'est fourni.
        const existingQuery = "SELECT logo FROM point_de_vente WHERE id = ?";
        db.query(existingQuery, [id], (existingErr, existingRows) => {
            if (existingErr) {
                console.log(existingErr);
                return res.status(500).json({ message: "Internal server error" });
            }
            if (!existingRows || existingRows.length === 0) {
                return res.status(404).json({ message: "Point of sale not found" });
            }

            const nextLogo = req.file ? req.file.filename : (existingRows[0].logo || null);

        const query = `
            UPDATE point_de_vente
            SET nom = ?, logo = ?, email = ?, telephone = ?, num_tel = ?, id_sous_gestionnaire = ?, \`if\` = ?, ice = ?, patente = ?, cnss = ?, adresse = ?, rc = ?
            WHERE id = ?
        `;
        db.query(
            query,
            [
                name,
                nextLogo,
                normalizeNullable(email),
                normalizeNullable(telephone),
                normalizeNullable(num_tel),
                id_sous_gestionnaire ? Number(id_sous_gestionnaire) : null,
                normalizeNullable(ifNumber),
                normalizeNullable(ice),
                normalizeNullable(patente),
                normalizeNullable(cnss),
                normalizeNullable(adresse),
                normalizeNullable(rc),
                id,
            ],
            (err, result) => {
                if (err) {
                    console.log(err);
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(400).json({ message: mapDuplicateEntryMessage(err) });
                    }
                    return res.status(500).json({ message: "Internal server error" });
                }
                return res.status(200).json({ message: "Point de vente updated successfully" });
            }
        );
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.deletePdv = async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM point_de_vente WHERE id = ?";
        db.query(query, [id], (err, result) => {
            if (err) {
                console.log(err);
                if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                    return res.status(400).json({ message: "Cannot delete point of sale associated with products" });
                }
                return res.status(500).json({ message: "Internal server error" });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Point of sale not found" });
            }
            return res.status(200).json({ message: "Point de vente deleted successfully" });
        })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.getProductsByPdv = async (req, res) => {
    const { id } = req.params;
    try {
        // On renvoie les produits du PDV avec, en plus, la quantité totale vendue.
        // Important:
        // - on ne se base pas uniquement sur factures.point_de_vente_id (peut être incohérent/migrant),
        // - on agrège par produit du PDV,
        // - fallback par désignation quand facture_items.produit_id est NULL.
        const query = `
            SELECT 
                p.*,
                c.nom AS category_name,
                pdv.nom AS point_de_vente_name,
                COALESCE(v.total_vendue, 0) AS quantite_vendue
            FROM products p
            LEFT JOIN category c ON p.id_categorie = c.id
            LEFT JOIN point_de_vente pdv ON p.id_point_de_vente = pdv.id
            LEFT JOIN (
                SELECT sales.product_id, SUM(sales.qty) AS total_vendue
                FROM (
                    -- Cas normal: lien direct produit_id
                    SELECT
                        fi.produit_id AS product_id,
                        SUM(fi.quantite) AS qty
                    FROM facture_items fi
                    INNER JOIN factures f ON fi.facture_id = f.id
                    INNER JOIN products p_ref ON p_ref.id = fi.produit_id
                    WHERE p_ref.id_point_de_vente = ?
                      AND COALESCE(f.statut, '') NOT IN ('annulee', 'annullee', 'brouillon')
                    GROUP BY fi.produit_id

                    UNION ALL

                    -- Fallback legacy: produit_id absent, on rapproche par désignation
                    SELECT
                        p_match.id AS product_id,
                        SUM(fi2.quantite) AS qty
                    FROM facture_items fi2
                    INNER JOIN factures f2 ON fi2.facture_id = f2.id
                    INNER JOIN products p_match
                        ON p_match.id_point_de_vente = ?
                       AND LOWER(TRIM(p_match.nom)) = LOWER(TRIM(fi2.designation))
                    WHERE (fi2.produit_id IS NULL OR fi2.produit_id = 0)
                      AND COALESCE(f2.statut, '') NOT IN ('annulee', 'annullee', 'brouillon')
                    GROUP BY p_match.id
                ) sales
                GROUP BY sales.product_id
            ) v ON v.product_id = p.id
            WHERE p.id_point_de_vente = ?
        `;

        db.query(query, [id, id, id], (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: "Internal server error" });
            }
            return res.status(200).json(result);
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

