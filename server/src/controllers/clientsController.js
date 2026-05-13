const db = require("../config/db").promise();

const CLIENT_IMPORT_EXCLUDED_COLUMNS = new Set([
    "id",
]);

const toNullableString = (value) => {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    return str === "" ? null : str;
};

const getClientsTableColumnsMeta = async () => {
    const [rows] = await db.execute("SHOW COLUMNS FROM clients");
    return rows;
};

exports.getClientsImportTemplateColumns = async (_req, res) => {
    try {
        const columns = await getClientsTableColumnsMeta();
        const columnNames = columns
            .map((c) => c.Field)
            .filter((field) => !CLIENT_IMPORT_EXCLUDED_COLUMNS.has(field));
        return res.status(200).json({ columns: columnNames });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

exports.getAllClients = async (req, res) => {
    try {
        const [clients] = await db.execute("SELECT * FROM clients");
        res.json(clients);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

exports.sendNewsletterCampaign = async (req, res) => {
    const { subject, html, text, target = "all", client_ids = [] } = req.body || {};

    const cleanSubject = String(subject || "").trim();
    const cleanHtml = String(html || "").trim();
    const cleanText = String(text || "").trim();

    if (!cleanSubject) {
        return res.status(400).json({ message: "Sujet requis" });
    }
    if (!cleanHtml && !cleanText) {
        return res.status(400).json({ message: "Contenu requis (HTML ou texte)" });
    }

    try {
        let recipients = [];
        if (target === "specific") {
            const ids = Array.isArray(client_ids)
                ? client_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
                : [];
            if (ids.length === 0) {
                return res.status(400).json({ message: "Sélectionnez au moins un client" });
            }

            const placeholders = ids.map(() => "?").join(",");
            const [rows] = await db.execute(
                `SELECT id, nom_complet, email FROM clients WHERE id IN (${placeholders})`,
                ids
            );
            recipients = rows || [];
        } else {
            const [rows] = await db.execute(
                "SELECT id, nom_complet, email FROM clients WHERE email IS NOT NULL AND email <> ''"
            );
            recipients = rows || [];
        }

        const validEmails = [
            ...new Set(
                recipients
                    .map((c) => String(c.email || "").trim())
                    .filter((email) => email.length > 3 && email.includes("@"))
            ),
        ];

        if (validEmails.length === 0) {
            return res.status(400).json({ message: "Aucun email client valide trouvé" });
        }

        const { sendMail } = require("../services/emailService");
        const plainText =
            cleanText ||
            cleanHtml
                .replace(/<style[\s\S]*?<\/style>/gi, " ")
                .replace(/<script[\s\S]*?<\/script>/gi, " ")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        await sendMail(validEmails.join(","), cleanSubject, plainText || cleanSubject, [], cleanHtml || null);

        return res.status(200).json({
            message: "Campagne envoyée",
            sent_count: validEmails.length,
        });
    } catch (error) {
        console.error("Error sending newsletter campaign:", error);
        return res.status(500).json({ message: "Erreur lors de l'envoi de la campagne" });
    }
};


exports.createClient = async (req, res) => {
    const { nom_complet, type, ice, telephone, email, adresse } = req.body;
    try {
        if (!nom_complet) {
            return res.status(400).json({
                message: "Nom complet du client est requis"
            })
        }
        const [result] = await db.execute(
            "INSERT INTO clients (nom_complet, `type`, ice, telephone, email, adresse) VALUES (?, ?, ?, ?, ?, ?)",
            [nom_complet, type || 'particulier', ice || null, telephone || null, email || null, adresse || null]
        )
        res.status(201).json({
            message: "Client created successfully",
            id: result.insertId
        });

    } catch (err) {
        console.error(err);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
                message: "Cet email est déjà utilisé pour un autre client."
            });
        }
        res.status(500).json({
            message: "Internal server error"
        });
    }


}

exports.deleteClient = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute("DELETE FROM clients WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Client not found"
            });
        }
        res.json({
            message: "Client deleted successfully"
        });
    } catch (error) {
        console.error(error);
        // Cas où le client est référencé dans d'autres tables (devis, factures, commandes, avoirs...)
        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(400).json({
                message: "Impossible de supprimer ce client car il est associé à des documents (devis, factures, commandes, avoirs)."
            });
        }
        res.status(500).json({
            message: "Internal server error"
        });
    }
}

exports.updateClient = async (req, res) => {
    const { id } = req.params;
    const { nom_complet, type, ice, telephone, email, adresse } = req.body;
    try {
        if (!nom_complet) {
            return res.status(400).json({
                message: "Nom complet du client est requis"
            });
        }
        const [result] = await db.execute(
            "UPDATE clients SET nom_complet = ?, `type` = ?, ice = ?, telephone = ?, email = ?, adresse = ? WHERE id = ?",
            [nom_complet, type || 'particulier', ice || null, telephone || null, email || null, adresse || null, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Client not found"
            });
        }
        res.json({
            message: "Client updated successfully"
        });
    } catch (error) {
        console.error(error);
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
                message: "Cet email est déjà utilisé pour un autre client."
            });
        }
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

exports.getClientProducts = async (req, res) => {
    const { id } = req.params;
    try {
        // Produits achetés par client avec informations sur le dernier document associé (facture / devis / commande)
        const [rows] = await db.execute(`
            SELECT 
                p.id AS product_id,
                p.nom AS product_name,
                p.reference,
                p.photo,
                p.prix AS current_price,
                p.grammage,
                c.nom AS category_name,
                pdv.nom AS point_de_vente_name,
                SUM(x.total_quantity) AS total_quantity,
                SUM(x.total_spent) AS total_spent,
                MAX(x.last_purchase_date) AS last_purchase_date,
                SUM(x.nb_docs) AS nb_factures,
                -- Dernier document (facture / devis / commande) pour ce produit
                SUBSTRING_INDEX(
                    GROUP_CONCAT(
                        CONCAT_WS(
                            '|',
                            x.last_purchase_date,
                            x.doc_type,
                            x.doc_id,
                            x.doc_number
                        )
                        ORDER BY x.last_purchase_date DESC
                        SEPARATOR ';;'
                    ),
                    ';;',
                    1
                ) AS last_doc_info
            FROM (
                -- Factures
                SELECT 
                    fi.produit_id AS product_id,
                    SUM(fi.quantite) AS total_quantity,
                    SUM(fi.montant_ht) AS total_spent,
                    MAX(f.date_facture) AS last_purchase_date,
                    COUNT(DISTINCT f.id) AS nb_docs,
                    'facture' AS doc_type,
                    MAX(f.id) AS doc_id,
                    MAX(f.numero_facture) AS doc_number
                FROM facture_items fi
                INNER JOIN factures f ON fi.facture_id = f.id
                WHERE f.client_id = ? AND fi.produit_id IS NOT NULL
                GROUP BY fi.produit_id

                UNION ALL

                -- Devis non transformés en facture
                SELECT 
                    di.produit_id AS product_id,
                    SUM(di.quantite) AS total_quantity,
                    SUM(di.montant_ht) AS total_spent,
                    MAX(d.date_devis) AS last_purchase_date,
                    COUNT(DISTINCT d.id) AS nb_docs,
                    'devis' AS doc_type,
                    MAX(d.id) AS doc_id,
                    MAX(d.numero_devis) AS doc_number
                FROM devis_items di
                INNER JOIN devis d ON di.devis_id = d.id
                WHERE d.client_id = ? AND di.produit_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM factures f2 
                    INNER JOIN facture_items fi2 ON f2.id = fi2.facture_id
                    WHERE f2.client_id = d.client_id 
                    AND fi2.produit_id = di.produit_id
                    AND f2.devis_id = d.id
                )
                GROUP BY di.produit_id
            ) x
            LEFT JOIN products p ON x.product_id = p.id
            LEFT JOIN category c ON p.id_categorie = c.id
            LEFT JOIN point_de_vente pdv ON p.id_point_de_vente = pdv.id
            GROUP BY 
                p.id, p.nom, p.reference, p.photo, p.prix, p.grammage, c.nom, pdv.nom
        `, [id, id]);

        // On renvoie les lignes telles quelles ; le front décodera last_doc_info
        res.json(rows);
    } catch (error) {
        console.error("Error fetching client products:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.importClients = async (req, res) => {
    const rows = Array.isArray(req.body?.clients) ? req.body.clients : [];

    if (rows.length === 0) {
        return res.status(400).json({ message: "Aucune ligne à importer" });
    }

    try {
        const columnsMeta = await getClientsTableColumnsMeta();
        const tableColumns = columnsMeta.map((c) => c.Field);
        const nonInsertable = new Set(
            columnsMeta
                .filter((c) => String(c.Extra || "").includes("auto_increment"))
                .map((c) => c.Field)
        );

        const insertableColumns = tableColumns.filter(
            (col) => !nonInsertable.has(col) && !CLIENT_IMPORT_EXCLUDED_COLUMNS.has(col)
        );

        let createdCount = 0;
        let skippedCount = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i] || {};
            const nomComplet = toNullableString(row.nom_complet);

            if (!nomComplet) {
                skippedCount += 1;
                errors.push(`Ligne ${i + 2}: champ obligatoire manquant (nom_complet)`);
                continue;
            }

            const normalized = {
                nom_complet: nomComplet,
                type: toNullableString(row.type) || "particulier",
                ice: toNullableString(row.ice),
                telephone: toNullableString(row.telephone),
                email: toNullableString(row.email),
                adresse: toNullableString(row.adresse),
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
                const sql = `INSERT INTO clients (${cols.join(", ")}) VALUES (${placeholders})`;
                await db.execute(sql, vals);
                createdCount += 1;
            } catch (error) {
                skippedCount += 1;
                if (error.code === "ER_DUP_ENTRY") {
                    errors.push(`Ligne ${i + 2}: doublon (email déjà utilisé)`);
                } else {
                    errors.push(`Ligne ${i + 2}: ${error.message}`);
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
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
