const db = require("../config/db").promise();


exports.askIA = async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ message: "Le prompt est requis" });
    }

    const lowPrompt = prompt.toLowerCase();

    try {
        let response = "";
        let foundData = false;

        // --- 0. SCHÉMA & TABLES ---
        if (
            lowPrompt.includes("tables") ||
            lowPrompt.includes("schema") ||
            lowPrompt.includes("structure de la base") ||
            lowPrompt.includes("structure bdd")
        ) {
            const [dbRow] = await db.execute("SELECT DATABASE() as dbName");
            const dbName = dbRow[0]?.dbName;

            if (dbName) {
                const [tables] = await db.execute(
                    `
                    SELECT table_name, table_rows
                    FROM information_schema.tables
                    WHERE table_schema = ?
                    ORDER BY table_name
                `,
                    [dbName]
                );

                if (tables.length > 0) {
                    response =
                        "🗄️ **Tables disponibles dans la base Aurevox :**\n" +
                        tables
                            .map(
                                (t) =>
                                    `- \`${t.table_name}\` (environ ${t.table_rows ?? 0} enregistrements)`
                            )
                            .join("\n");
                    foundData = true;
                }
            }
        }

        // --- 0.b DÉTAIL D'UNE TABLE (ACCÈS GÉNÉRIQUE AUX DONNÉES) ---
        // Exemples: "montre table clients", "affiche table factures"
        if (!foundData && (lowPrompt.includes("table ") || lowPrompt.startsWith("table"))) {
            const words = lowPrompt.split(/\s+/);
            const idx = words.lastIndexOf("table");
            const tableNameCandidate = words[idx + 1];

            if (tableNameCandidate && /^[a-zA-Z0-9_]+$/.test(tableNameCandidate)) {
                try {
                    const [columns] = await db.execute(
                        `
                        SELECT COLUMN_NAME 
                        FROM information_schema.COLUMNS 
                        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                        ORDER BY ORDINAL_POSITION
                    `,
                        [tableNameCandidate]
                    );

                    if (columns.length === 0) {
                        response =
                            `Aucune table nommée \`${tableNameCandidate}\` trouvée dans la base. Vérifiez le nom (ex: clients, factures, commandes, produits...).`;
                    } else {
                        const colNames = columns.map((c) => c.COLUMN_NAME);
                        // ATTENTION: interpolation sécurisée car on a validé le nom par regex ci-dessus
                        const [rows] = await db.query(
                            `SELECT * FROM \`${tableNameCandidate}\` ORDER BY 1 DESC LIMIT 20`
                        );

                        if (rows.length === 0) {
                            response = `La table \`${tableNameCandidate}\` existe mais ne contient encore aucune donnée.`;
                        } else {
                            const preview = rows
                                .map((r) =>
                                    colNames
                                        .map((col) => `${col}=${r[col] ?? "NULL"}`)
                                        .join(", ")
                                )
                                .join(" | ");

                            response =
                                `📊 **Aperçu de la table \`${tableNameCandidate}\` (20 lignes max) :**\n` +
                                preview;
                        }
                    }
                    foundData = true;
                } catch (e) {
                    console.error("AI table introspection error:", e);
                }
            }
        }

        // --- 1. PRODUITS & STOCK ---
        if (lowPrompt.includes("produit") || lowPrompt.includes("stock") || lowPrompt.includes("article") || lowPrompt.includes("bijou")) {
            if (lowPrompt.includes("alerte") || lowPrompt.includes("bas") || lowPrompt.includes("manque") || lowPrompt.includes("seuil")) {
                const [rows] = await db.execute("SELECT nom, stock, stock_alert FROM products WHERE stock <= stock_alert");
                if (rows.length > 0) {
                    response = `⚠️ **Alertes de stock :** ` + rows.map(r => `${r.nom} (Reste: ${r.stock}, Seuil: ${r.stock_alert})`).join(" | ");
                } else {
                    response = "✅ Tous les produits sont en stock suffisant par rapport aux seuils d'alerte.";
                }
                foundData = true;
            } else if (lowPrompt.includes("liste") || lowPrompt.includes("combien") || lowPrompt.includes("quels sont")) {
                const [rows] = await db.execute("SELECT nom, reference, stock, prix FROM products LIMIT 15");
                response = `📦 **Catalogue :** ` + rows.map(r => `**${r.nom}** (${r.prix} DH, Stock: ${r.stock})`).join(", ") + ".";
                foundData = true;
            } else {
                const searchItem = prompt.split(' ').pop();
                const [rows] = await db.execute("SELECT * FROM products WHERE nom LIKE ? OR reference LIKE ? LIMIT 1", [`%${searchItem}%`, `%${searchItem}%`]);
                if (rows.length > 0) {
                    const p = rows[0];
                    response = `🔍 **Produit trouvé :** **${p.nom}**\n- Réf: ${p.reference || 'N/A'}\n- Prix: ${p.prix} DH\n- Stock: ${p.stock}\n- Description: ${p.description || 'N/A'}`;
                    foundData = true;
                }
            }
        }

        // --- 2. CLIENTS ---
        if (lowPrompt.includes("client")) {
            if (lowPrompt.includes("liste") || lowPrompt.includes("combien")) {
                const [rows] = await db.execute("SELECT nom_complet FROM clients LIMIT 20");
                const [countRow] = await db.execute("SELECT COUNT(*) as total FROM clients");
                response = `${response ? response + "\n" : ""}👤 **Clients (${countRow[0].total}) :** ` + rows.map(r => r.nom_complet).join(", ") + (countRow[0].total > 20 ? "..." : ".");
                foundData = true;
            } else {
                const searchName = prompt.split(' ').pop();
                const [rows] = await db.execute("SELECT * FROM clients WHERE nom_complet LIKE ? LIMIT 1", [`%${searchName}%`]);
                if (rows.length > 0) {
                    response = `${response ? response + "\n" : ""}✅ **Client trouvé :** ${rows[0].nom_complet} (ID: ${rows[0].id})`;
                    foundData = true;
                }
            }
        }

        // --- 2.b FOURNISSEURS ---
        if (lowPrompt.includes("fournisseur")) {
            if (lowPrompt.includes("liste") || lowPrompt.includes("combien")) {
                const [rows] = await db.execute("SELECT nom, ice, telephone FROM fournisseur ORDER BY id DESC LIMIT 20");
                const [countRow] = await db.execute("SELECT COUNT(*) as total FROM fournisseur");
                const list = rows
                    .map((r) => `${r.nom}${r.ice ? ` (ICE: ${r.ice})` : ""}`)
                    .join(", ");
                response =
                    `${response ? response + "\n" : ""}📦 **Fournisseurs (${countRow[0].total}) :** ` +
                    (rows.length > 0 ? list + (countRow[0].total > 20 ? "..." : ".") : "aucun fournisseur enregistré.");
                foundData = true;
            } else {
                const searchName = prompt.split(" ").pop();
                const [rows] = await db.execute(
                    "SELECT * FROM fournisseur WHERE nom LIKE ? OR ice LIKE ? LIMIT 1",
                    [`%${searchName}%`, `%${searchName}%`]
                );
                if (rows.length > 0) {
                    const f = rows[0];
                    response =
                        `${response ? response + "\n" : ""}✅ **Fournisseur trouvé :** ${f.nom}` +
                        `${f.ice ? ` (ICE: ${f.ice})` : ""}${f.telephone ? `, Tél: ${f.telephone}` : ""}`;
                    foundData = true;
                }
            }
        }

        // --- 2.c CATÉGORIES PRODUITS ---
        if (
            lowPrompt.includes("categorie") ||
            lowPrompt.includes("catégorie") ||
            lowPrompt.includes("famille")
        ) {
            try {
                if (lowPrompt.includes("liste") || lowPrompt.includes("combien") || lowPrompt.includes("toutes")) {
                    const [rows] = await db.execute(
                        "SELECT id, nom FROM category ORDER BY nom ASC"
                    );
                    const [countRow] = await db.execute(
                        "SELECT COUNT(*) as total FROM category"
                    );

                    if (rows.length > 0) {
                        const list = rows.map((c) => c.nom).join(" | ");

                        response =
                            `${response ? response + "\n" : ""}🏷️ **Catégories (${countRow[0].total}) :** ` +
                            list;
                    } else {
                        response =
                            `${response ? response + "\n" : ""}🏷️ Aucune catégorie n'est encore définie dans le catalogue.`;
                    }
                    foundData = true;
                } else if (lowPrompt.includes("produits") || lowPrompt.includes("associes") || lowPrompt.includes("associés")) {
                    // Ex: "produits dans la catégorie BAGUES"
                    const words = prompt.split(/\s+/);
                    const lastWord = words[words.length - 1];
                    const [catRows] = await db.execute(
                        "SELECT id, nom FROM category WHERE nom LIKE ? LIMIT 1",
                        [`%${lastWord}%`]
                    );
                    if (catRows.length === 0) {
                        response =
                            `${response ? response + "\n" : ""}Je ne trouve pas de catégorie correspondant à "${lastWord}".`;
                    } else {
                        const cat = catRows[0];
                        const [prodRows] = await db.execute(
                            "SELECT nom, reference, stock FROM products WHERE id_categorie = ? LIMIT 30",
                            [cat.id]
                        );
                        if (prodRows.length === 0) {
                            response =
                                `${response ? response + "\n" : ""}La catégorie **${cat.nom}** n'a pas encore de produits associés.`;
                        } else {
                            const list = prodRows
                                .map(
                                    (p) =>
                                        `${p.nom} (${p.reference || "N/A"}, Stock: ${p.stock})`
                                )
                                .join(" | ");
                            response =
                                `${response ? response + "\n" : ""}🏷️ **Produits de la catégorie ${cat.nom} :** ` +
                                list;
                        }
                    }
                    foundData = true;
                }
            } catch (err) {
                if (err && err.code === "ER_NO_SUCH_TABLE") {
                    response =
                        `${response ? response + "\n" : ""}🏷️ Les catégories ne sont pas encore configurées dans cette base (table \`category\` manquante).`;
                    foundData = true;
                } else {
                    throw err;
                }
            }
        }

        // --- 2.d GESTIONNAIRES (sociétés de gestion) ---
        if (lowPrompt.includes("gestionnaire")) {
            if (lowPrompt.includes("liste") || lowPrompt.includes("combien")) {
                const [rows] = await db.execute(
                    "SELECT nom, type_entreprise, responsable FROM gestionnaire ORDER BY id DESC LIMIT 20"
                );
                const [countRow] = await db.execute("SELECT COUNT(*) as total FROM gestionnaire");
                const list = rows
                    .map(
                        (r) =>
                            `${r.nom}${r.type_entreprise ? ` (${r.type_entreprise})` : ""}${
                                r.responsable ? ` - Resp: ${r.responsable}` : ""
                            }`
                    )
                    .join(", ");
                response =
                    `${response ? response + "\n" : ""}🏢 **Gestionnaires (${countRow[0].total}) :** ` +
                    (rows.length > 0 ? list + (countRow[0].total > 20 ? "..." : ".") : "aucun gestionnaire enregistré.");
                foundData = true;
            } else {
                const searchName = prompt.split(" ").pop();
                const [rows] = await db.execute(
                    "SELECT * FROM gestionnaire WHERE nom LIKE ? OR email LIKE ? LIMIT 1",
                    [`%${searchName}%`, `%${searchName}%`]
                );
                if (rows.length > 0) {
                    const g = rows[0];
                    response =
                        `${response ? response + "\n" : ""}✅ **Gestionnaire trouvé :** ${g.nom}` +
                        `${g.type_entreprise ? ` (${g.type_entreprise})` : ""}${
                            g.responsable ? ` - Resp: ${g.responsable}` : ""
                        }`;
                    foundData = true;
                }
            }
        }

        // --- 3. COMMERCIAL (FACTURES, COMMANDES, DEVIS, REVENU / CA, RÈGLEMENTS, BILAN) ---
        if (
            lowPrompt.includes("facture") ||
            lowPrompt.includes("chiffre") ||
            lowPrompt.includes("argent") ||
            lowPrompt.includes("vente") ||
            lowPrompt.includes("revenu") ||
            lowPrompt.includes("ca") ||
            lowPrompt.includes("chiffre d'affaires") ||
            lowPrompt.includes("chiffre d affaires")
        ) {
            // Période demandée : aujourd'hui / ce mois / cette année / global
            let whereClauseReg = "";
            let whereClauseFac = "";
            if (lowPrompt.includes("aujourd") || lowPrompt.includes("ce jour")) {
                whereClauseReg = "WHERE DATE(date_reglement) = CURRENT_DATE()";
                whereClauseFac = "WHERE DATE(date_facture) = CURRENT_DATE()";
            } else if (lowPrompt.includes("mois") || lowPrompt.includes("ce mois")) {
                whereClauseReg = "WHERE YEAR(date_reglement) = YEAR(CURRENT_DATE()) AND MONTH(date_reglement) = MONTH(CURRENT_DATE())";
                whereClauseFac = "WHERE YEAR(date_facture) = YEAR(CURRENT_DATE()) AND MONTH(date_facture) = MONTH(CURRENT_DATE())";
            } else if (lowPrompt.includes("année") || lowPrompt.includes("cette année")) {
                whereClauseReg = "WHERE YEAR(date_reglement) = YEAR(CURRENT_DATE())";
                whereClauseFac = "WHERE YEAR(date_facture) = YEAR(CURRENT_DATE())";
            }

            const [r] = await db.execute(
                `SELECT SUM(montant) as total_paid FROM reglements_clients ${whereClauseReg} ${whereClauseReg ? "AND" : "WHERE"} statut = 'approuve'`
            );
            const [f] = await db.execute(
                `SELECT SUM(montant_ttc) as total_factured FROM factures ${whereClauseFac}`
            );

            const total = Number(r[0].total_paid || 0);
            const totalFactured = Number(f[0].total_factured || 0);
            const impaye = Math.max(totalFactured - total, 0);

            const scopeLabel = whereClauseFac.includes("CURRENT_DATE()")
                ? "aujourd'hui"
                : whereClauseFac.includes("MONTH")
                ? "ce mois"
                : whereClauseFac.includes("YEAR")
                ? "cette année"
                : "global";

            response =
                `${response ? response + "\n" : ""}` +
                `💰 **Chiffre d'affaires réglé (${scopeLabel}) :** ` +
                `Total réglé: **${total.toLocaleString()} DH**, ` +
                `Total facturé: **${totalFactured.toLocaleString()} DH**, ` +
                `reste à encaisser: **${impaye.toLocaleString()} DH**.`;

            // Top clients si demandé
            if (lowPrompt.includes("client") || lowPrompt.includes("top") || lowPrompt.includes("meilleurs")) {
                const [topClients] = await db.execute(`
                    SELECT c.nom_complet AS client_nom, SUM(f.montant_ttc) AS total_ttc
                    FROM factures f
                    LEFT JOIN clients c ON f.client_id = c.id
                    GROUP BY f.client_id, c.nom_complet
                    ORDER BY total_ttc DESC
                    LIMIT 5
                `);

                if (topClients.length > 0) {
                    const topList = topClients
                        .map(
                            (row, idx) =>
                                `${idx + 1}. ${row.client_nom || "Client sans nom"} (${Number(
                                    row.total_ttc || 0
                                ).toLocaleString()} DH)`
                        )
                        .join(" | ");
                    response += `\n👑 **Top clients par CA :** ${topList}`;
                }
            }

            foundData = true;
        }

        if (lowPrompt.includes("commande")) {
            const [c] = await db.execute("SELECT statut, COUNT(*) as count FROM commandes GROUP BY statut");
            const stats = c.map(s => `${s.statut}: ${s.count}`).join(" | ");
            response = `${response ? response + "\n" : ""}🛒 **Commandes :** ${stats || "Aucune commande enregistrée."}`;
            foundData = true;
        }

        if (lowPrompt.includes("devis")) {
            const [d] = await db.execute("SELECT statuts_devis, COUNT(*) as count FROM devis GROUP BY statuts_devis");
            const stats = d.map(s => `${s.statuts_devis}: ${s.count}`).join(" | ");
            response = `${response ? response + "\n" : ""}📝 **Devis :** ${stats || "Aucun devis enregistré."}`;
            foundData = true;
        }

        // --- 3.b RÈGLEMENTS & SITUATION CLIENT / FOURNISSEUR ---
        if (lowPrompt.includes("règlement") || lowPrompt.includes("reglement")) {
            if (lowPrompt.includes("client")) {
                const [rows] = await db.execute(`
                    SELECT c.nom_complet AS client_nom,
                           SUM(f.montant_ttc) AS montant_ttc,
                           COALESCE(SUM(rc.montant), 0) AS total_regle,
                           GREATEST(SUM(f.montant_ttc) - COALESCE(SUM(rc.montant), 0), 0) AS reste
                    FROM factures f
                    LEFT JOIN clients c ON f.client_id = c.id
                    LEFT JOIN reglements_clients rc ON rc.facture_id = f.id AND rc.statut = 'approuve'
                    GROUP BY f.client_id, c.nom_complet
                    ORDER BY reste DESC
                    LIMIT 5
                `);
                if (rows.length > 0) {
                    const top = rows
                        .map(
                            (r) =>
                                `${r.client_nom || "Client"} — Facturé: ${Number(
                                    r.montant_ttc || 0
                                ).toLocaleString()} DH, Réglé: ${Number(
                                    r.total_regle || 0
                                ).toLocaleString()} DH, Reste: ${Number(r.reste || 0).toLocaleString()} DH`
                        )
                        .join(" | ");
                    response =
                        `${response ? response + "\n" : ""}💳 **Situation règlements clients (Top 5 restes à encaisser) :** ${top}`;
                } else {
                    response = `${response ? response + "\n" : ""}💳 Aucun règlement client enregistré.`;
                }
                foundData = true;
            } else if (lowPrompt.includes("fournisseur")) {
                const [rows] = await db.execute(`
                    SELECT f.nom AS fournisseur_nom,
                           SUM(af.quantite * af.prix_unitaire) AS montant_achats,
                           COALESCE(SUM(rf.montant), 0) AS total_regle,
                           GREATEST(SUM(af.quantite * af.prix_unitaire) - COALESCE(SUM(rf.montant), 0), 0) AS reste
                    FROM fournisseur f
                    LEFT JOIN achats_fournisseurs af ON af.fournisseur_id = f.id
                    LEFT JOIN reglements_fournisseurs rf ON rf.achat_id = af.id AND rf.statut = 'approuve'
                    GROUP BY f.id, f.nom
                    ORDER BY reste DESC
                    LIMIT 5
                `);
                if (rows.length > 0) {
                    const top = rows
                        .map(
                            (r) =>
                                `${r.fournisseur_nom || "Fournisseur"} — Achats: ${Number(
                                    r.montant_achats || 0
                                ).toLocaleString()} DH, Réglé: ${Number(
                                    r.total_regle || 0
                                ).toLocaleString()} DH, Reste: ${Number(r.reste || 0).toLocaleString()} DH`
                        )
                        .join(" | ");
                    response =
                        `${response ? response + "\n" : ""}🏦 **Situation règlements fournisseurs (Top 5 restes à payer) :** ${top}`;
                } else {
                    response = `${response ? response + "\n" : ""}🏦 Aucun règlement fournisseur enregistré.`;
                }
                foundData = true;
            }
        }

        if (lowPrompt.includes("bilan") || lowPrompt.includes("rapprochement")) {
            const [clientsRows] = await db.execute(`
                SELECT 
                    COALESCE(SUM(f.montant_ttc), 0) AS montant_facture,
                    COALESCE(SUM(rc.montant), 0) AS montant_regle
                FROM factures f
                LEFT JOIN reglements_clients rc ON rc.facture_id = f.id AND rc.statut = 'approuve'
            `);
            const [fournRows] = await db.execute(`
                SELECT 
                    COALESCE(SUM(af.quantite * af.prix_unitaire), 0) AS montant_achats,
                    COALESCE(SUM(rf.montant), 0) AS montant_regle
                FROM achats_fournisseurs af
                LEFT JOIN reglements_fournisseurs rf ON rf.achat_id = af.id AND rf.statut = 'approuve'
            `);
            const c = clientsRows[0] || {};
            const f = fournRows[0] || {};
            const resteClients = Number(c.montant_facture || 0) - Number(c.montant_regle || 0);
            const resteFourn = Number(f.montant_achats || 0) - Number(f.montant_regle || 0);

            response =
                `${response ? response + "\n" : ""}📊 **Bilan global (rapprochement clients / fournisseurs) :**\n` +
                `- Clients : facturé ${Number(c.montant_facture || 0).toLocaleString()} DH, réglé ${Number(
                    c.montant_regle || 0
                ).toLocaleString()} DH, reste à encaisser ${resteClients.toLocaleString()} DH.\n` +
                `- Fournisseurs : achats ${Number(f.montant_achats || 0).toLocaleString()} DH, réglé ${Number(
                    f.montant_regle || 0
                ).toLocaleString()} DH, reste à payer ${resteFourn.toLocaleString()} DH.`;

            foundData = true;
        }

        // --- 4. RH (EMPLOYÉS, SALAIRES, CONGÉS) ---
        if (lowPrompt.includes("employé") || lowPrompt.includes("salarié") || lowPrompt.includes("personnel") || lowPrompt.includes("rh")) {
            const [rows] = await db.execute("SELECT first_name, last_name, role FROM employees");
            response = `${response ? response + "\n" : ""}👥 **Personnel :** ` + rows.map(r => `${r.first_name} ${r.last_name} (${r.role})`).join(", ") + ".";
            foundData = true;
        }

        if (lowPrompt.includes("salaire") || lowPrompt.includes("paye")) {
            const [s] = await db.execute("SELECT SUM(salaire_net) as total FROM salaries WHERE mois = MONTH(CURRENT_DATE()) AND annee = YEAR(CURRENT_DATE())");
            response = `${response ? response + "\n" : ""}💸 **Masse salariale (mois actuel) :** ${(s[0].total || 0).toLocaleString()} DH.`;
            foundData = true;
        }

        if (lowPrompt.includes("congé") || lowPrompt.includes("absence")) {
            const [rows] = await db.execute(`
                SELECT e.first_name, e.last_name, c.nombre_jours, c.\`type\` 
                FROM conges c 
                JOIN employees e ON c.employee_id = e.id 
                WHERE c.status = 'approuvé' AND CURRENT_DATE() BETWEEN c.date_debut AND c.date_fin
            `);
            if (rows.length > 0) {
                response = `${response ? response + "\n" : ""}📅 **En congé aujourd'hui :** ` + rows.map(r => `${r.first_name} ${r.last_name} (${r.type})`).join(", ");
            } else {
                response = `${response ? response + "\n" : ""}📅 Aucun employé en congé aujourd'hui.`;
            }
            foundData = true;
        }

        // --- 5. INFRASTRUCTURE & FINANCE (BANQUE, CAISSE, POINTS DE VENTE) ---
        if (lowPrompt.includes("boutique") || lowPrompt.includes("magasin") || lowPrompt.includes("point de vente")) {
            const [rows] = await db.execute("SELECT nom, ville FROM point_de_vente");
            response = `${response ? response + "\n" : ""}🏢 **Points de vente :** ` + rows.map(p => `${p.nom} (${p.ville || 'Défaut'})`).join(" | ");
            foundData = true;
        }

        if (lowPrompt.includes("banque") || lowPrompt.includes("compte bancaire") || lowPrompt.includes("rib")) {
            const [rows] = await db.execute(
                "SELECT nom_banque, nom_compte, numero_compte, devise, solde_actuel FROM banques ORDER BY nom_banque"
            );
            if (rows.length > 0) {
                const list = rows
                    .map(
                        (b) =>
                            `${b.nom_banque} - ${b.nom_compte} (${b.devise || "MAD"}) : ${Number(
                                b.solde_actuel || 0
                            ).toLocaleString()}`
                    )
                    .join(" | ");
                response = `${response ? response + "\n" : ""}🏦 **Comptes bancaires :** ${list}`;
            } else {
                response = `${response ? response + "\n" : ""}🏦 Aucun compte bancaire enregistré.`;
            }
            foundData = true;
        }

        if (lowPrompt.includes("caisse") || lowPrompt.includes("encaissement") || lowPrompt.includes("decaissement")) {
            const [rows] = await db.execute(
                `
                SELECT \`type\`, montant, nom_banque, created_at
                FROM caisse c
                LEFT JOIN banques b ON c.id_banque = b.id
                ORDER BY c.created_at DESC
                LIMIT 20
            `
            );
            if (rows.length > 0) {
                const resume = rows
                    .map(
                        (m) =>
                            `${m.type.toUpperCase()}: ${Number(m.montant || 0).toLocaleString()} DH` +
                            `${m.nom_banque ? ` via ${m.nom_banque}` : ""}`
                    )
                    .join(" | ");

                const [totals] = await db.execute(
                    `
                    SELECT 
                        SUM(CASE WHEN \`type\` = 'entree' THEN montant ELSE 0 END) as total_entrees,
                        SUM(CASE WHEN \`type\` = 'sortie' THEN montant ELSE 0 END) as total_sorties
                    FROM caisse
                `
                );

                response =
                    `${response ? response + "\n" : ""}💼 **Mouvements de caisse récents :** ${resume}\n` +
                    `📊 Total entrées: ${Number(totals[0].total_entrees || 0).toLocaleString()} DH, ` +
                    `Total sorties: ${Number(totals[0].total_sorties || 0).toLocaleString()} DH.`;
            } else {
                response = `${response ? response + "\n" : ""}💼 Aucun mouvement de caisse enregistré.`;
            }
            foundData = true;
        }

        // --- FALLBACK ---
        if (!foundData) {
            response =
                "Désolé, je n'ai pas compris exactement votre demande.\n\n" +
                "Je peux vous aider sur :\n" +
                "- 📦 Produits & stock (alertes, liste, recherche produit)\n" +
                "- 👤 Clients / 🧾 Devis / 🛒 Commandes / 📄 Factures (statuts, chiffres)\n" +
                "- 💳 Règlements clients & fournisseurs, reste à payer / encaisser\n" +
                "- 📊 Bilan global clients / fournisseurs\n" +
                "- 🏢 Points de vente, 🏦 Banques, 💼 Caisse\n" +
                "- 👥 Employés, salaires et congés\n\n" +
                "Exemples :\n" +
                '- "Donne-moi le bilan des règlements clients"\n' +
                '- "Quel est le chiffre d\'affaires de ce mois ?"\n' +
                '- "Quels sont les fournisseurs les plus dus ?"\n' +
                '- "Montre-moi les produits en alerte stock".';
        }

        res.json({
            success: true,
            answer: response
        });

    } catch (error) {
        console.error("AI Controller Error:", error);
        res.status(500).json({ success: false, message: "Erreur lors de la récupération des données" });
    }
};
