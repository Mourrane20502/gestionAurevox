const db = require("../config/db").promise();

exports.getBilan = async (req, res) => {
    const { dateFrom, dateTo, pdvId, societeId, userId, clientId, fournisseurId } = req.query;
    const societeByPdvFilter = " IN (SELECT id FROM point_de_vente WHERE id_sous_gestionnaire = ?)";
    const debugSociete = Boolean(societeId && societeId !== "all");

    // Build params for Devis (no PDV)
    const devisParams = [];
    let devisConds = "";
    if (societeId && societeId !== "all") {
        devisConds += ` AND COALESCE(
            (
                SELECT pv_cmd.id_sous_gestionnaire
                FROM commandes co
                INNER JOIN point_de_vente pv_cmd ON pv_cmd.id = co.point_de_vente_id
                WHERE co.devis_id = devis.id
                LIMIT 1
            ),
            (
                SELECT pv_items.id_sous_gestionnaire
                FROM devis_items di
                INNER JOIN products p ON di.produit_id = p.id
                INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                WHERE di.devis_id = devis.id
                  AND p.id_point_de_vente IS NOT NULL
                ORDER BY di.id
                LIMIT 1
            )
        ) = ?`;
        devisParams.push(societeId);
    }
    if (userId && userId !== "all") { devisConds += " AND user_id = ?"; devisParams.push(userId); }
    if (dateFrom) { devisConds += " AND date_devis >= ?"; devisParams.push(dateFrom); }
    if (dateTo) { devisConds += " AND date_devis <= ?"; devisParams.push(dateTo); }

    // Build params for Commandes
    const cmdParams = [];
    let cmdConds = "";
    if (pdvId && pdvId !== "all") { cmdConds += " AND point_de_vente_id = ?"; cmdParams.push(pdvId); }
    if (societeId && societeId !== "all") {
        cmdConds += ` AND (
            COALESCE(
                NULLIF(point_de_vente_id, 0),
                (
                    SELECT p.id_point_de_vente
                    FROM commande_items ci
                    INNER JOIN products p ON ci.produit_id = p.id
                    WHERE ci.commande_id = commandes.id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY ci.id
                    LIMIT 1
                ),
                (
                    SELECT p.id_point_de_vente
                    FROM devis_items di
                    INNER JOIN products p ON di.produit_id = p.id
                    WHERE di.devis_id = commandes.devis_id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY di.id
                    LIMIT 1
                )
            )${societeByPdvFilter}
            OR EXISTS (
                SELECT 1
                FROM reglements_clients rc
                LEFT JOIN factures rf ON rc.facture_id = rf.id
                WHERE rc.statut = 'approuve'
                  AND (rc.commande_id = commandes.id OR rf.commande_id = commandes.id)
                  AND COALESCE(
                      NULLIF(rf.point_de_vente_id, 0),
                      (
                          SELECT p.id_point_de_vente
                          FROM facture_items fi
                          INNER JOIN products p ON p.id = fi.produit_id
                          WHERE fi.facture_id = rf.id AND p.id_point_de_vente IS NOT NULL
                          ORDER BY fi.id
                          LIMIT 1
                      ),
                      (
                          SELECT p.id_point_de_vente
                          FROM commande_items ci
                          INNER JOIN products p ON p.id = ci.produit_id
                          WHERE ci.commande_id = commandes.id AND p.id_point_de_vente IS NOT NULL
                          ORDER BY ci.id
                          LIMIT 1
                      ),
                      NULLIF(commandes.point_de_vente_id, 0)
                  ) IN (SELECT id FROM point_de_vente WHERE id_sous_gestionnaire = ?)
            )
        )`;
        cmdParams.push(societeId);
        cmdParams.push(societeId);
    }
    if (userId && userId !== "all") { cmdConds += " AND user_id = ?"; cmdParams.push(userId); }
    if (dateFrom) { cmdConds += " AND date_commande >= ?"; cmdParams.push(dateFrom); }
    if (dateTo) { cmdConds += " AND date_commande <= ?"; cmdParams.push(dateTo); }

    // Build params for Factures
    const facParams = [];
    let facConds = "";
    if (pdvId && pdvId !== "all") { facConds += " AND point_de_vente_id = ?"; facParams.push(pdvId); }
    if (societeId && societeId !== "all") {
        facConds += ` AND (
            COALESCE(
                NULLIF(point_de_vente_id, 0),
                (
                    SELECT p.id_point_de_vente
                    FROM facture_items fi
                    INNER JOIN products p ON fi.produit_id = p.id
                    WHERE fi.facture_id = factures.id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY fi.id
                    LIMIT 1
                ),
                (
                    SELECT co.point_de_vente_id
                    FROM commandes co
                    WHERE co.id = factures.commande_id
                    LIMIT 1
                ),
                (
                    SELECT p.id_point_de_vente
                    FROM commande_items ci
                    INNER JOIN products p ON ci.produit_id = p.id
                    WHERE ci.commande_id = factures.commande_id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY ci.id
                    LIMIT 1
                ),
                (
                    SELECT p.id_point_de_vente
                    FROM devis_items di
                    INNER JOIN products p ON di.produit_id = p.id
                    WHERE di.devis_id = factures.devis_id
                      AND p.id_point_de_vente IS NOT NULL
                    ORDER BY di.id
                    LIMIT 1
                )
            )${societeByPdvFilter}
            OR EXISTS (
                SELECT 1
                FROM reglements_clients rc
                LEFT JOIN factures rf ON rc.facture_id = rf.id
                LEFT JOIN commandes rcmd ON rc.commande_id = rcmd.id
                WHERE rc.statut = 'approuve'
                  AND (rc.facture_id = factures.id OR (factures.commande_id IS NOT NULL AND rc.commande_id = factures.commande_id))
                  AND COALESCE(
                      NULLIF(rf.point_de_vente_id, 0),
                      (
                          SELECT p.id_point_de_vente
                          FROM facture_items fi
                          INNER JOIN products p ON p.id = fi.produit_id
                          WHERE fi.facture_id = rf.id AND p.id_point_de_vente IS NOT NULL
                          ORDER BY fi.id
                          LIMIT 1
                      ),
                      (
                          SELECT p.id_point_de_vente
                          FROM commande_items ci
                          INNER JOIN products p ON p.id = ci.produit_id
                          WHERE ci.commande_id = COALESCE(rcmd.id, rf.commande_id) AND p.id_point_de_vente IS NOT NULL
                          ORDER BY ci.id
                          LIMIT 1
                      ),
                      NULLIF(rcmd.point_de_vente_id, 0)
                  ) IN (SELECT id FROM point_de_vente WHERE id_sous_gestionnaire = ?)
            )
        )`;
        facParams.push(societeId);
        facParams.push(societeId);
    }
    if (userId && userId !== "all") { facConds += " AND user_id = ?"; facParams.push(userId); }
    if (dateFrom) { facConds += " AND date_facture >= ?"; facParams.push(dateFrom); }
    if (dateTo) { facConds += " AND date_facture <= ?"; facParams.push(dateTo); }

    // Build params for Reglements Clients
    const rcParams = [];
    let rcConds = "";
    if (pdvId && pdvId !== "all") {
        rcConds += ` AND COALESCE(
            NULLIF(f.point_de_vente_id, 0),
            (
                SELECT p.id_point_de_vente
                FROM facture_items fi
                INNER JOIN products p ON p.id = fi.produit_id
                WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                ORDER BY fi.id
                LIMIT 1
            ),
            (
                SELECT p.id_point_de_vente
                FROM commande_items ci
                INNER JOIN products p ON p.id = ci.produit_id
                WHERE ci.commande_id = COALESCE(cmd.id, f.commande_id) AND p.id_point_de_vente IS NOT NULL
                ORDER BY ci.id
                LIMIT 1
            ),
            NULLIF(cmd.point_de_vente_id, 0)
        ) = ?`;
        rcParams.push(pdvId);
    }
    if (societeId && societeId !== "all") {
        rcConds += ` AND COALESCE(
            NULLIF(f.point_de_vente_id, 0),
            (
                SELECT p.id_point_de_vente
                FROM facture_items fi
                INNER JOIN products p ON p.id = fi.produit_id
                WHERE fi.facture_id = f.id AND p.id_point_de_vente IS NOT NULL
                ORDER BY fi.id
                LIMIT 1
            ),
            (
                SELECT p.id_point_de_vente
                FROM commande_items ci
                INNER JOIN products p ON p.id = ci.produit_id
                WHERE ci.commande_id = COALESCE(cmd.id, f.commande_id) AND p.id_point_de_vente IS NOT NULL
                ORDER BY ci.id
                LIMIT 1
            ),
            NULLIF(cmd.point_de_vente_id, 0)
        ) IN (SELECT id FROM point_de_vente WHERE id_sous_gestionnaire = ?)`;
        rcParams.push(societeId);
    }
    if (userId && userId !== "all") { rcConds += " AND COALESCE(f.user_id, cmd.user_id) = ?"; rcParams.push(userId); }
    if (dateFrom) { rcConds += " AND COALESCE(f.date_facture, cmd.date_commande) >= ?"; rcParams.push(dateFrom); }
    if (dateTo) { rcConds += " AND COALESCE(f.date_facture, cmd.date_commande) <= ?"; rcParams.push(dateTo); }
    if (dateFrom) { rcConds += " AND rc.date_reglement >= ?"; rcParams.push(dateFrom); }
    if (dateTo) { rcConds += " AND rc.date_reglement <= ?"; rcParams.push(dateTo); }

    // Build params for Devis Gros (no PDV)
    const devisGrosParams = [];
    let devisGrosConds = "";
    if (societeId && societeId !== "all") {
        devisGrosConds += ` AND COALESCE(
            (
                SELECT pv_cmd.id_sous_gestionnaire
                FROM commandes_gros cg
                INNER JOIN point_de_vente pv_cmd ON pv_cmd.id = cg.point_de_vente_id
                WHERE cg.devis_gros_id = devis_gros.id
                LIMIT 1
            ),
            (
                SELECT pv_items.id_sous_gestionnaire
                FROM devis_gros_items dgi
                INNER JOIN products p ON dgi.produit_id = p.id
                INNER JOIN point_de_vente pv_items ON pv_items.id = p.id_point_de_vente
                WHERE dgi.devis_gros_id = devis_gros.id
                  AND p.id_point_de_vente IS NOT NULL
                ORDER BY dgi.id
                LIMIT 1
            )
        ) = ?`;
        devisGrosParams.push(societeId);
    }
    if (userId && userId !== "all") { devisGrosConds += " AND user_id = ?"; devisGrosParams.push(userId); }
    if (dateFrom) { devisGrosConds += " AND date_devis >= ?"; devisGrosParams.push(dateFrom); }
    if (dateTo) { devisGrosConds += " AND date_devis <= ?"; devisGrosParams.push(dateTo); }

    // Build params for Commandes Gros
    const cmdGrosParams = [];
    let cmdGrosConds = "";
    if (pdvId && pdvId !== "all") { cmdGrosConds += " AND point_de_vente_id = ?"; cmdGrosParams.push(pdvId); }
    if (societeId && societeId !== "all") {
        cmdGrosConds += ` AND COALESCE(
            NULLIF(point_de_vente_id, 0),
            (
                SELECT p.id_point_de_vente
                FROM commandes_gros_items cgi
                INNER JOIN products p ON cgi.produit_id = p.id
                WHERE cgi.commande_gros_id = commandes_gros.id
                  AND p.id_point_de_vente IS NOT NULL
                ORDER BY cgi.id
                LIMIT 1
            ),
            (
                SELECT p.id_point_de_vente
                FROM devis_gros_items dgi
                INNER JOIN products p ON dgi.produit_id = p.id
                WHERE dgi.devis_gros_id = commandes_gros.devis_gros_id
                  AND p.id_point_de_vente IS NOT NULL
                ORDER BY dgi.id
                LIMIT 1
            )
        )${societeByPdvFilter}`;
        cmdGrosParams.push(societeId);
    }
    if (userId && userId !== "all") { cmdGrosConds += " AND user_id = ?"; cmdGrosParams.push(userId); }
    if (dateFrom) { cmdGrosConds += " AND date_commande >= ?"; cmdGrosParams.push(dateFrom); }
    if (dateTo) { cmdGrosConds += " AND date_commande <= ?"; cmdGrosParams.push(dateTo); }

    // Build params for Factures Gros
    const facGrosParams = [];
    let facGrosConds = "";
    if (pdvId && pdvId !== "all") { facGrosConds += " AND point_de_vente_id = ?"; facGrosParams.push(pdvId); }
    if (societeId && societeId !== "all") {
        facGrosConds += ` AND COALESCE(
            NULLIF(point_de_vente_id, 0),
            (
                SELECT p.id_point_de_vente
                FROM factures_gros_items fgi
                INNER JOIN products p ON fgi.produit_id = p.id
                WHERE fgi.facture_gros_id = factures_gros.id
                  AND p.id_point_de_vente IS NOT NULL
                ORDER BY fgi.id
                LIMIT 1
            ),
            (
                SELECT cg.point_de_vente_id
                FROM commandes_gros cg
                WHERE cg.id = factures_gros.commande_gros_id
                LIMIT 1
            ),
            (
                SELECT p.id_point_de_vente
                FROM commandes_gros_items cgi
                INNER JOIN products p ON cgi.produit_id = p.id
                WHERE cgi.commande_gros_id = factures_gros.commande_gros_id
                  AND p.id_point_de_vente IS NOT NULL
                ORDER BY cgi.id
                LIMIT 1
            ),
            (
                SELECT p.id_point_de_vente
                FROM devis_gros_items dgi
                INNER JOIN products p ON dgi.produit_id = p.id
                WHERE dgi.devis_gros_id = factures_gros.devis_gros_id
                  AND p.id_point_de_vente IS NOT NULL
                ORDER BY dgi.id
                LIMIT 1
            )
        )${societeByPdvFilter}`;
        facGrosParams.push(societeId);
    }
    if (userId && userId !== "all") { facGrosConds += " AND user_id = ?"; facGrosParams.push(userId); }
    if (dateFrom) { facGrosConds += " AND date_facture >= ?"; facGrosParams.push(dateFrom); }
    if (dateTo) { facGrosConds += " AND date_facture <= ?"; facGrosParams.push(dateTo); }

    // Build params for Reglements Clients Gros
    const rcgParams = [];
    let rcgConds = "";
    if (pdvId && pdvId !== "all") {
        rcgConds += ` AND COALESCE(
            NULLIF(fg.point_de_vente_id, 0),
            (
                SELECT p.id_point_de_vente
                FROM factures_gros_items fgi
                INNER JOIN products p ON p.id = fgi.produit_id
                WHERE fgi.facture_gros_id = fg.id AND p.id_point_de_vente IS NOT NULL
                ORDER BY fgi.id
                LIMIT 1
            ),
            (
                SELECT p.id_point_de_vente
                FROM commandes_gros_items cgi
                INNER JOIN products p ON p.id = cgi.produit_id
                WHERE cgi.commande_gros_id = COALESCE(cg.id, fg.commande_gros_id) AND p.id_point_de_vente IS NOT NULL
                ORDER BY cgi.id
                LIMIT 1
            ),
            NULLIF(cg.point_de_vente_id, 0)
        ) = ?`;
        rcgParams.push(pdvId);
    }
    if (societeId && societeId !== "all") {
        rcgConds += ` AND COALESCE(
            NULLIF(fg.point_de_vente_id, 0),
            (
                SELECT p.id_point_de_vente
                FROM factures_gros_items fgi
                INNER JOIN products p ON p.id = fgi.produit_id
                WHERE fgi.facture_gros_id = fg.id AND p.id_point_de_vente IS NOT NULL
                ORDER BY fgi.id
                LIMIT 1
            ),
            (
                SELECT p.id_point_de_vente
                FROM commandes_gros_items cgi
                INNER JOIN products p ON p.id = cgi.produit_id
                WHERE cgi.commande_gros_id = COALESCE(cg.id, fg.commande_gros_id) AND p.id_point_de_vente IS NOT NULL
                ORDER BY cgi.id
                LIMIT 1
            ),
            NULLIF(cg.point_de_vente_id, 0)
        ) IN (SELECT id FROM point_de_vente WHERE id_sous_gestionnaire = ?)`;
        rcgParams.push(societeId);
    }
    if (userId && userId !== "all") { rcgConds += " AND fg.user_id = ?"; rcgParams.push(userId); }
    if (dateFrom) { rcgConds += " AND fg.date_facture >= ?"; rcgParams.push(dateFrom); }
    if (dateTo) { rcgConds += " AND fg.date_facture <= ?"; rcgParams.push(dateTo); }
    if (dateFrom) { rcgConds += " AND rcg.date_reglement >= ?"; rcgParams.push(dateFrom); }
    if (dateTo) { rcgConds += " AND rcg.date_reglement <= ?"; rcgParams.push(dateTo); }

    let cWhere = "";
    const cParams = [];
    if (clientId && clientId !== "all") {
        cWhere += " AND c.id = ?";
        cParams.push(clientId);
    }

    const clientQueryParams = [
        ...devisParams, ...devisGrosParams,
        ...cmdParams, ...cmdGrosParams,
        ...facParams, ...facGrosParams,
        ...rcParams, ...rcgParams,
        ...cParams
    ];
    const clientQuery = `
        SELECT 
            c.id AS client_id,
            c.nom_complet AS client_nom,
            (
                (SELECT COALESCE(SUM(montant_ttc), 0) FROM devis WHERE client_id = c.id AND statuts_devis != 'Refusé' ${devisConds})
                +
                (SELECT COALESCE(SUM(montant_ttc), 0) FROM devis_gros WHERE client_id = c.id AND statuts_devis != 'refuse' ${devisGrosConds})
            ) AS montant_devis,
            (
                (SELECT COALESCE(SUM(montant_ttc), 0) FROM commandes WHERE client_id = c.id AND statut != 'annullee' ${cmdConds})
                +
                (SELECT COALESCE(SUM(montant_ttc), 0) FROM commandes_gros WHERE client_id = c.id AND statut != 'annulee' ${cmdGrosConds})
            ) AS montant_commande,
            (
                (SELECT COALESCE(SUM(montant_ttc), 0) FROM factures WHERE client_id = c.id AND statut != 'annulle' ${facConds})
                +
                (SELECT COALESCE(SUM(montant_ttc), 0) FROM factures_gros WHERE client_id = c.id AND statut != 'annulle' ${facGrosConds})
            ) AS montant_facture,
            (
                (
                    SELECT COALESCE(SUM(rc.montant), 0)
                    FROM reglements_clients rc
                    LEFT JOIN factures f ON rc.facture_id = f.id
                    LEFT JOIN commandes cmd ON rc.commande_id = cmd.id
                    WHERE COALESCE(f.client_id, cmd.client_id) = c.id
                      AND rc.statut = 'approuve'
                      ${rcConds}
                )
                +
                (
                    SELECT COALESCE(SUM(rcg.montant), 0)
                    FROM reglements_clients_gros rcg
                    LEFT JOIN factures_gros fg ON rcg.facture_gros_id = fg.id
                    LEFT JOIN commandes_gros cg ON rcg.commande_gros_id = cg.id
                    WHERE COALESCE(fg.client_id, cg.client_id) = c.id
                      AND rcg.statut = 'approuve'
                      ${rcgConds}
                )
            ) AS montant_regle
        FROM clients c
        WHERE 1=1 ${cWhere}
        HAVING montant_devis > 0 OR montant_commande > 0 OR montant_facture > 0 OR montant_regle > 0
    `;

    // Achats (Fournisseurs)
    const aParams = [];
    let aConds = "";
    if (userId && userId !== "all") { aConds += " AND gestionnaire_id = ?"; aParams.push(userId); }
    if (dateFrom) { aConds += " AND date_achat >= ?"; aParams.push(dateFrom); }
    if (dateTo) { aConds += " AND date_achat <= ?"; aParams.push(dateTo); }

    // Reglements Fournisseurs
    const rfParams = [];
    let rfConds = "";
    if (userId && userId !== "all") { rfConds += " AND af.gestionnaire_id = ?"; rfParams.push(userId); }
    if (dateFrom) { rfConds += " AND af.date_achat >= ?"; rfParams.push(dateFrom); }
    if (dateTo) { rfConds += " AND af.date_achat <= ?"; rfParams.push(dateTo); }
    if (dateFrom) { rfConds += " AND rf.date_reglement >= ?"; rfParams.push(dateFrom); }
    if (dateTo) { rfConds += " AND rf.date_reglement <= ?"; rfParams.push(dateTo); }

    let fourWhere = "";
    const fourParams = [];
    if (fournisseurId && fournisseurId !== "all") {
        fourWhere += " AND f.id = ?";
        fourParams.push(fournisseurId);
    }

    const fournisseurQueryParams = [...aParams, ...rfParams, ...fourParams];
    const fournisseurQuery = `
        SELECT 
            f.id AS fournisseur_id,
            f.nom AS fournisseur_nom,
            (SELECT COALESCE(SUM(quantite * prix_unitaire * (1 + COALESCE(tva, 0)/100)), 0) FROM achats_fournisseurs WHERE fournisseur_id = f.id ${aConds}) AS montant_achats,
            (SELECT COALESCE(SUM(rf.montant), 0) FROM reglements_fournisseurs rf JOIN achats_fournisseurs af ON rf.achat_id = af.id WHERE af.fournisseur_id = f.id AND rf.statut = 'approuve' ${rfConds}) AS montant_regle
        FROM fournisseur f
        WHERE 1=1 ${fourWhere}
        HAVING montant_achats > 0 OR montant_regle > 0
    `;

    try {
        if (debugSociete) {
            console.log("[BILAN][DEBUG][SOCIETE] Incoming filters:", {
                dateFrom: dateFrom || null,
                dateTo: dateTo || null,
                pdvId: pdvId || "all",
                societeId,
                userId: userId || "all",
                clientId: clientId || "all",
                fournisseurId: fournisseurId || "all",
            });
            console.log("[BILAN][DEBUG][SOCIETE] SQL filter blocks:", {
                devisConds,
                devisGrosConds,
                cmdConds,
                cmdGrosConds,
                facConds,
                facGrosConds,
                rcConds,
                rcgConds,
            });
            console.log("[BILAN][DEBUG][SOCIETE] SQL params:", {
                devisParams,
                devisGrosParams,
                cmdParams,
                cmdGrosParams,
                facParams,
                facGrosParams,
                rcParams,
                rcgParams,
                cParams,
                fourParams,
            });
        }

        const [clientsRows] = await db.execute(clientQuery, clientQueryParams);

        // Client Details
        for (let row of clientsRows) {
            row.reste_a_encaisser = Math.max(0, row.montant_facture - row.montant_regle);

            const [factures] = await db.execute(`SELECT id, numero_facture as numero, date_facture as date, montant_ttc as montant, 'facture' as type FROM factures WHERE client_id = ? AND statut != 'annulle' ${facConds}`, [row.client_id, ...facParams]);
            const [facturesGros] = await db.execute(`SELECT id, numero_facture as numero, date_facture as date, montant_ttc as montant, 'facture_gros' as type FROM factures_gros WHERE client_id = ? AND statut != 'annulle' ${facGrosConds}`, [row.client_id, ...facGrosParams]);
            const [commandes] = await db.execute(`SELECT id, numero_commande as numero, date_commande as date, montant_ttc as montant, 'commande' as type, (SELECT numero_facture FROM factures WHERE commande_id = commandes.id LIMIT 1) as facture_numero FROM commandes WHERE client_id = ? AND statut != 'annullee' ${cmdConds}`, [row.client_id, ...cmdParams]);
            const [commandesGros] = await db.execute(`SELECT id, numero_commande as numero, date_commande as date, montant_ttc as montant, 'commande_gros' as type, (SELECT numero_facture FROM factures_gros WHERE commande_gros_id = commandes_gros.id LIMIT 1) as facture_numero FROM commandes_gros WHERE client_id = ? AND statut != 'annulee' ${cmdGrosConds}`, [row.client_id, ...cmdGrosParams]);
            const [devis] = await db.execute(`SELECT id, numero_devis as numero, date_devis as date, montant_ttc as montant, 'devis' as type FROM devis WHERE client_id = ? AND statuts_devis != 'Refusé' ${devisConds}`, [row.client_id, ...devisParams]);
            const [devisGros] = await db.execute(`SELECT id, numero_devis as numero, date_devis as date, montant_ttc as montant, 'devis_gros' as type FROM devis_gros WHERE client_id = ? AND statuts_devis != 'refuse' ${devisGrosConds}`, [row.client_id, ...devisGrosParams]);
            
            const [reglements] = await db.execute(
                `SELECT
                    rc.id,
                    rc.montant,
                    rc.date_reglement as date,
                    'reglement' as type,
                    COALESCE(f.numero_facture, cmd.numero_commande) AS numero_facture
                 FROM reglements_clients rc
                 LEFT JOIN factures f ON rc.facture_id = f.id
                 LEFT JOIN commandes cmd ON rc.commande_id = cmd.id
                 LEFT JOIN point_de_vente pdvf ON pdvf.id = f.point_de_vente_id
                 LEFT JOIN point_de_vente pdvc ON pdvc.id = cmd.point_de_vente_id
                 WHERE COALESCE(f.client_id, cmd.client_id) = ?
                   AND rc.statut = 'approuve'
                   ${rcConds}`,
                [row.client_id, ...rcParams]
            );
            const [reglementsGros] = await db.execute(
                `SELECT
                    rcg.id,
                    rcg.montant,
                    rcg.date_reglement as date,
                    'reglement_gros' as type,
                    COALESCE(fg.numero_facture, cg.numero_commande) AS numero_facture
                 FROM reglements_clients_gros rcg
                 LEFT JOIN factures_gros fg ON rcg.facture_gros_id = fg.id
                 LEFT JOIN commandes_gros cg ON rcg.commande_gros_id = cg.id
                 WHERE COALESCE(fg.client_id, cg.client_id) = ?
                   AND rcg.statut = 'approuve'
                   ${rcgConds}`,
                [row.client_id, ...rcgParams]
            );
            
            row.details = [...factures, ...facturesGros, ...commandes, ...commandesGros, ...devis, ...devisGros, ...reglements, ...reglementsGros].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        const [fournisseursRows] = await db.execute(fournisseurQuery, fournisseurQueryParams);

        if (debugSociete) {
            const totals = clientsRows.reduce(
                (acc, row) => {
                    acc.devis += Number(row.montant_devis) || 0;
                    acc.commande += Number(row.montant_commande) || 0;
                    acc.facture += Number(row.montant_facture) || 0;
                    acc.regle += Number(row.montant_regle) || 0;
                    return acc;
                },
                { devis: 0, commande: 0, facture: 0, regle: 0 }
            );

            console.log("[BILAN][DEBUG][SOCIETE] Result summary:", {
                clientsCount: clientsRows.length,
                fournisseursCount: fournisseursRows.length,
                totals,
            });
            console.log(
                "[BILAN][DEBUG][SOCIETE] Top clients snapshot:",
                clientsRows.slice(0, 10).map((r) => ({
                    client_id: r.client_id,
                    client_nom: r.client_nom,
                    montant_devis: r.montant_devis,
                    montant_commande: r.montant_commande,
                    montant_facture: r.montant_facture,
                    montant_regle: r.montant_regle,
                }))
            );
        }

        // Fournisseur Details
        for (let row of fournisseursRows) {
            row.reste_a_payer = Math.max(0, row.montant_achats - row.montant_regle);

            const [achats] = await db.execute(`
                SELECT 
                    af.numero, 
                    af.date_achat as date, 
                    SUM(af.quantite * af.prix_unitaire * (1 + COALESCE(af.tva, 0)/100)) as montant, 
                    'achat' as type,
                    (SELECT COALESCE(SUM(rf.montant), 0) FROM reglements_fournisseurs rf WHERE rf.achat_id IN (SELECT id FROM achats_fournisseurs WHERE numero = af.numero) AND rf.statut = 'approuve') as montant_paye
                FROM achats_fournisseurs af 
                WHERE af.fournisseur_id = ? ${aConds}
                GROUP BY af.numero, af.date_achat
            `, [row.fournisseur_id, ...aParams]);
            
            const [reglements] = await db.execute(`
                SELECT rf.id, rf.montant, rf.date_reglement as date, 'reglement' as type, af.numero as achat_numero
                FROM reglements_fournisseurs rf
                JOIN achats_fournisseurs af ON rf.achat_id = af.id
                WHERE af.fournisseur_id = ? AND rf.statut = 'approuve' ${rfConds}
            `, [row.fournisseur_id, ...rfParams]);
            row.details = [...achats, ...reglements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        const [pdvs] = await db.execute("SELECT id, nom FROM point_de_vente ORDER BY nom ASC");
        const [societes] = await db.execute("SELECT ID AS id, NOM_SOUS_SOCIETE AS nom FROM sous_societe ORDER BY NOM_SOUS_SOCIETE ASC");
        const [users] = await db.execute("SELECT id, CONCAT(prenom, ' ', nom) AS nom FROM users ORDER BY nom ASC");
        const [clients] = await db.execute("SELECT id, nom_complet AS nom FROM clients ORDER BY nom_complet ASC");
        const [fournisseurs] = await db.execute("SELECT id, nom FROM fournisseur ORDER BY nom ASC");

        res.json({
            clients: clientsRows,
            fournisseurs: fournisseursRows,
            filters: {
                pdvs,
                societes,
                users,
                clients,
                fournisseurs,
            },
        });
    } catch (err) {
        console.error("Error fetching bilan:", err);
        res.status(500).json({ message: "Erreur interne lors du calcul du bilan" });
    }
};
