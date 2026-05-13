const { getAllNumberingSettings, updateNumberingSettingsInDb } = require("../utils/numberingSettings");
const { getPaymentModes, addPaymentMode, deletePaymentMode } = require("../utils/paymentSettings");
const {
    getApprovalConfigs,
    updateApprovalConfigs,
    getAutoApprovalHour,
    setAutoApprovalHour,
    getAutoApprovalEnabled,
    setAutoApprovalEnabled,
} = require("../utils/approvalSettings");
const { getDashboardWidgetsVisibility, updateDashboardWidgetsVisibility } = require("../utils/dashboardSettings");
const { getFacebookSettingsFromDb, updateFacebookSettingsInDb } = require("../utils/facebookSettings");
const { getMetalPricing, mergeMetalPricing } = require("../utils/metalPricingSettings");
const { getProductActionConfig, saveProductActionConfig } = require("../utils/productActionSettings");
const db = require("../config/db").promise();
const normalizeClientTypeValue = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
const clientTypeLabelFromValue = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
};
const parseEnumValuesFromColumnType = (columnType) => {
    const raw = String(columnType || "");
    const match = raw.match(/^enum\((.*)\)$/i);
    if (!match) return [];
    const inside = match[1];
    return inside
        .split(",")
        .map((p) => p.trim())
        .map((p) => p.replace(/^'(.*)'$/, "$1"))
        .map((p) => p.replace(/\\'/g, "'"))
        .map((p) => normalizeClientTypeValue(p))
        .filter(Boolean);
};
const sqlQuote = (value) => `'${String(value || "").replace(/'/g, "''")}'`;
const getClientsTypeColumnMeta = async () => {
    const [rows] = await db.execute("SHOW COLUMNS FROM clients LIKE 'type'");
    return rows[0] || null;
};

exports.getNumberingSettings = async (req, res) => {
    try {
        const sousSocieteId = Number(req.query?.sousSocieteId);
        const safeSousSocieteId = Number.isFinite(sousSocieteId) && sousSocieteId > 0 ? sousSocieteId : null;
        console.log("[API][settings/numbering][GET] incoming", {
            rawSousSocieteId: req.query?.sousSocieteId,
            sousSocieteId: safeSousSocieteId,
        });
        if (!safeSousSocieteId) {
            return res.status(400).json({ message: "sousSocieteId est obligatoire" });
        }
        const map = await getAllNumberingSettings({
            sousSocieteId: safeSousSocieteId,
        });
        console.log("[API][settings/numbering][GET] resolved", { map });
        res.json({
            invoiceStartOffset: map.FA || 0,
            devisStartOffset: map.DE || 0,
            commandeStartOffset: map.CO || 0,
            avoirStartOffset: map.AV || 0,
            recuClientStartOffset: map.RC || 0,
        });
    } catch (err) {
        console.error("Error fetching numbering settings:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateNumberingSettings = async (req, res) => {
    try {
        const sousSocieteId = Number(req.query?.sousSocieteId);
        const safeSousSocieteId = Number.isFinite(sousSocieteId) && sousSocieteId > 0 ? sousSocieteId : null;
        const {
            invoiceStartOffset,
            devisStartOffset,
            commandeStartOffset,
            avoirStartOffset,
            recuClientStartOffset,
        } = req.body || {};

        const updates = {};
        if (invoiceStartOffset != null) updates.FA = invoiceStartOffset;
        if (devisStartOffset != null) updates.DE = devisStartOffset;
        if (commandeStartOffset != null) updates.CO = commandeStartOffset;
        if (avoirStartOffset != null) updates.AV = avoirStartOffset;
        if (recuClientStartOffset != null) updates.RC = recuClientStartOffset;

        console.log("[API][settings/numbering][PUT] incoming", {
            rawSousSocieteId: req.query?.sousSocieteId,
            sousSocieteId: safeSousSocieteId,
            body: req.body,
            updates,
        });
        if (!safeSousSocieteId) {
            return res.status(400).json({ message: "sousSocieteId est obligatoire" });
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "Aucune valeur fournie" });
        }

        await updateNumberingSettingsInDb(updates, {
            sousSocieteId: safeSousSocieteId,
        });
        const map = await getAllNumberingSettings({
            sousSocieteId: safeSousSocieteId,
        });
        console.log("[API][settings/numbering][PUT] saved", { map });
        res.json({ message: "Paramètres de numérotation mis à jour" });
    } catch (err) {
        console.error("Error updating numbering settings:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getPaymentModes = async (req, res) => {
    try {
        const modes = await getPaymentModes();
        res.json(modes);
    } catch (err) {
        console.error("Error fetching payment modes:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.addPaymentMode = async (req, res) => {
    try {
        const { label, value } = req.body;
        if (!label || !value) {
            return res.status(400).json({ message: "Label and value are required" });
        }
        await addPaymentMode(label, value);
        res.json({ message: "Mode de paiement ajouté" });
    } catch (err) {
        console.error("Error adding payment mode:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.deletePaymentMode = async (req, res) => {
    try {
        const { id } = req.params;
        await deletePaymentMode(id);
        res.json({ message: "Mode de paiement supprimé" });
    } catch (err) {
        console.error("Error deleting payment mode:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getClientTypes = async (_req, res) => {
    try {
        const colMeta = await getClientsTypeColumnMeta();
        const enumValues = parseEnumValuesFromColumnType(colMeta?.Type);
        const [rows] = await db.execute(
            "SELECT DISTINCT TRIM(`type`) AS value FROM clients WHERE `type` IS NOT NULL AND TRIM(`type`) <> ''"
        );
        const defaults = ["particulier", "revendeur", "societe"];
        const fromClients = rows
            .map((r) => normalizeClientTypeValue(r.value))
            .filter(Boolean);
        const merged = Array.from(new Set([...defaults, ...enumValues, ...fromClients])).sort((a, b) =>
            a.localeCompare(b, "fr", { sensitivity: "base" })
        );
        const payload = merged.map((value, idx) => ({
            id: idx + 1,
            value,
            label: clientTypeLabelFromValue(value),
        }));
        return res.json(payload);
    } catch (err) {
        console.error("Error fetching client types:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.addClientType = async (req, res) => {
    try {
        const value = normalizeClientTypeValue(req.body?.value || req.body?.label);
        if (!value) return res.status(400).json({ message: "Type client requis" });

        const colMeta = await getClientsTypeColumnMeta();
        const enumValues = parseEnumValuesFromColumnType(colMeta?.Type);
        const [exists] = await db.execute(
            "SELECT 1 FROM clients WHERE LOWER(TRIM(`type`)) = ? LIMIT 1",
            [value]
        );
        if (exists.length > 0 || enumValues.includes(value)) {
            return res.status(200).json({ message: "Type déjà existant" });
        }

        if (enumValues.length > 0) {
            const nextEnum = [...enumValues, value];
            const enumSql = nextEnum.map(sqlQuote).join(", ");
            const nullableSql = String(colMeta?.Null || "").toUpperCase() === "YES" ? "NULL" : "NOT NULL";
            const defaultSql =
                colMeta?.Default == null
                    ? ""
                    : ` DEFAULT ${sqlQuote(normalizeClientTypeValue(colMeta.Default))}`;
            await db.execute(
                `ALTER TABLE clients MODIFY COLUMN \`type\` ENUM(${enumSql}) ${nullableSql}${defaultSql}`
            );
        }

        return res.status(201).json({ message: "Type client ajouté" });
    } catch (err) {
        console.error("Error adding client type:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateClientType = async (req, res) => {
    try {
        const fromValue = normalizeClientTypeValue(req.params?.value);
        const toValue = normalizeClientTypeValue(req.body?.value || req.body?.label);
        if (!fromValue || !toValue) {
            return res.status(400).json({ message: "Type source et destination requis" });
        }
        const colMeta = await getClientsTypeColumnMeta();
        const enumValues = parseEnumValuesFromColumnType(colMeta?.Type);
        if (enumValues.length > 0 && !enumValues.includes(toValue)) {
            const nextEnum = [...enumValues, toValue];
            const enumSql = nextEnum.map(sqlQuote).join(", ");
            const nullableSql = String(colMeta?.Null || "").toUpperCase() === "YES" ? "NULL" : "NOT NULL";
            const defaultSql =
                colMeta?.Default == null
                    ? ""
                    : ` DEFAULT ${sqlQuote(normalizeClientTypeValue(colMeta.Default))}`;
            await db.execute(
                `ALTER TABLE clients MODIFY COLUMN \`type\` ENUM(${enumSql}) ${nullableSql}${defaultSql}`
            );
        }
        const [result] = await db.execute(
            "UPDATE clients SET `type` = ? WHERE LOWER(TRIM(`type`)) = ?",
            [toValue, fromValue]
        );
        return res.json({ message: "Type client mis à jour", affectedRows: result.affectedRows || 0 });
    } catch (err) {
        console.error("Error updating client type:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.deleteClientType = async (req, res) => {
    try {
        const value = normalizeClientTypeValue(req.params?.value);
        if (!value) return res.status(400).json({ message: "Type client requis" });
        if (value === "particulier") {
            return res.status(400).json({ message: "Le type 'particulier' ne peut pas être supprimé" });
        }
        const [result] = await db.execute(
            "UPDATE clients SET `type` = 'particulier' WHERE LOWER(TRIM(`type`)) = ?",
            [value]
        );
        return res.json({ message: "Type client supprimé", affectedRows: result.affectedRows || 0 });
    } catch (err) {
        console.error("Error deleting client type:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};


exports.getApprovalConfigs = async (req, res) => {
    try {
        const configs = await getApprovalConfigs();
        // Group by document type for easier frontend use
        const grouped = configs.reduce((acc, curr) => {
            if (!acc[curr.document_type]) acc[curr.document_type] = [];
            acc[curr.document_type].push(curr.role_name);
            return acc;
        }, {});
        res.json(grouped);
    } catch (err) {
        console.error("Error fetching approval configs:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateApprovalConfigs = async (req, res) => {
    try {
        const configs = req.body; // Expecting { devis: ['admin', ...], ... }
        await updateApprovalConfigs(configs);
        res.json({ message: "Configurations d'approbation mises à jour" });
    } catch (err) {
        console.error("Error updating approval configs:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getMyApprovalRights = async (req, res) => {
    try {
        const userRole = (req.user.role || "").toString().toLowerCase();
        const configs = await getApprovalConfigs();

        if (userRole === 'superadmin') {
            return res.json(['devis', 'facture', 'commande', 'avoir', 'inventaire', 'achats_fournisseurs', 'reglements', 'remboursements']);
        }
        if (userRole === 'admin') {
            return res.json(['devis', 'facture', 'commande', 'avoir', 'inventaire', 'achats_fournisseurs', 'reglements', 'remboursements']);
        }

        const myRights = configs
            .filter(c => (c.role_name || "").toString().toLowerCase() === userRole)
            .map(c => c.document_type);

        res.json(myRights);
    } catch (err) {
        console.error("Error fetching my approval rights:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getAutoApprovalSetting = async (req, res) => {
    try {
        const hour = await getAutoApprovalHour();
        const auto_approval_enabled = await getAutoApprovalEnabled();
        res.json({ auto_approval_hour: hour, auto_approval_enabled });
    } catch (err) {
        console.error("Error fetching auto-approval settings:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateAutoApprovalSetting = async (req, res) => {
    try {
        const { auto_approval_hour, auto_approval_enabled } = req.body;
        if (auto_approval_enabled !== undefined && auto_approval_enabled !== null) {
            await setAutoApprovalEnabled(Boolean(auto_approval_enabled));
        }
        if (auto_approval_hour !== undefined) {
            await setAutoApprovalHour(auto_approval_hour);
        }
        res.json({ message: "Paramètre de validation automatique mis à jour" });
    } catch (err) {
        console.error("Error updating auto-approval settings:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getDashboardVisibility = async (req, res) => {
    try {
        const visibility = await getDashboardWidgetsVisibility();
        res.json(visibility);
    } catch (err) {
        console.error("Error fetching dashboard visibility:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateDashboardVisibility = async (req, res) => {
    try {
        const visibility = req.body;
        await updateDashboardWidgetsVisibility(visibility);
        res.json({ message: "Visibilité du tableau de bord mise à jour" });
    } catch (err) {
        console.error("Error updating dashboard visibility:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getFacebookSettings = async (_req, res) => {
    try {
        const data = await getFacebookSettingsFromDb();
        res.json({
            fbPageId: data.pageId || "",
            fbApiVersion: data.apiVersion || "v20.0",
            fbApiUrl: data.apiUrl || "https://graph.facebook.com",
            hasAccessToken: Boolean(data.pageAccessToken),
        });
    } catch (err) {
        console.error("Error fetching Facebook settings:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateFacebookSettings = async (req, res) => {
    try {
        const {
            fbPageId,
            fbPageAccessToken,
            fbApiVersion,
            fbApiUrl,
        } = req.body || {};

        await updateFacebookSettingsInDb({
            pageId: fbPageId != null ? String(fbPageId).trim() : undefined,
            pageAccessToken: fbPageAccessToken != null ? String(fbPageAccessToken).trim() : undefined,
            apiVersion: fbApiVersion != null ? String(fbApiVersion).trim() : undefined,
            apiUrl: fbApiUrl != null ? String(fbApiUrl).trim() : undefined,
        });

        res.json({ message: "Paramètres Facebook mis à jour" });
    } catch (err) {
        console.error("Error updating Facebook settings:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/** Tarifs métaux (DH/g) — partagés pour tous les utilisateurs */
exports.getMetalPricing = async (_req, res) => {
    try {
        const data = await getMetalPricing();
        res.json(data);
    } catch (err) {
        console.error("Error fetching metal pricing:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateMetalPricing = async (req, res) => {
    try {
        const patch = req.body || {};
        const merged = await mergeMetalPricing(patch);
        res.json({ message: "Tarifs mis à jour", ...merged });
    } catch (err) {
        console.error("Error updating metal pricing:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getProductActions = async (_req, res) => {
    try {
        const data = await getProductActionConfig();
        res.json(data);
    } catch (err) {
        console.error("Error fetching product actions:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateProductActions = async (req, res) => {
    try {
        const next = await saveProductActionConfig(req.body || {});
        res.json({ message: "Actions produits mises à jour", ...next });
    } catch (err) {
        console.error("Error updating product actions:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getSousSocietes = async (_req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT
                ss.ID AS id,
                ss.ID_GESTIONNAIRE AS gestionnaire_id,
                ss.NOM_SOUS_SOCIETE AS nom_sous_societe,
                g.nom AS gestionnaire_nom
            FROM sous_societe ss
            LEFT JOIN gestionnaire g ON g.id = ss.ID_GESTIONNAIRE
            ORDER BY ss.ID DESC
            `
        );
        res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        console.error("Error fetching sous societes:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.addSousSociete = async (req, res) => {
    try {
        const { nom_sous_societe, gestionnaire_id } = req.body || {};
        const nom = String(nom_sous_societe || "").trim();
        const gid = Number(gestionnaire_id);

        if (!nom) {
            return res.status(400).json({ message: "Le nom de la sous-société est requis" });
        }
        if (!Number.isFinite(gid) || gid <= 0) {
            return res.status(400).json({ message: "Gestionnaire invalide" });
        }

        const [gRows] = await db.query("SELECT id FROM gestionnaire WHERE id = ? LIMIT 1", [gid]);
        if (!Array.isArray(gRows) || gRows.length === 0) {
            return res.status(400).json({ message: "Gestionnaire introuvable" });
        }

        const [exists] = await db.query(
            "SELECT ID FROM sous_societe WHERE ID_GESTIONNAIRE = ? AND UPPER(TRIM(NOM_SOUS_SOCIETE)) = UPPER(TRIM(?)) LIMIT 1",
            [gid, nom]
        );
        if (Array.isArray(exists) && exists.length > 0) {
            return res.status(409).json({ message: "Cette sous-société existe déjà pour ce gestionnaire" });
        }

        const [result] = await db.query(
            "INSERT INTO sous_societe (ID_GESTIONNAIRE, NOM_SOUS_SOCIETE) VALUES (?, ?)",
            [gid, nom]
        );

        res.status(201).json({ message: "Sous-société ajoutée", id: result.insertId });
    } catch (err) {
        console.error("Error adding sous societe:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateSousSociete = async (req, res) => {
    try {
        const id = Number(req.params?.id);
        const { nom_sous_societe, gestionnaire_id } = req.body || {};
        const nom = String(nom_sous_societe || "").trim();
        const gid = Number(gestionnaire_id);

        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "Sous-société invalide" });
        }
        if (!nom) {
            return res.status(400).json({ message: "Le nom de la sous-société est requis" });
        }
        if (!Number.isFinite(gid) || gid <= 0) {
            return res.status(400).json({ message: "Gestionnaire invalide" });
        }

        const [existing] = await db.query("SELECT ID FROM sous_societe WHERE ID = ? LIMIT 1", [id]);
        if (!Array.isArray(existing) || existing.length === 0) {
            return res.status(404).json({ message: "Sous-société introuvable" });
        }

        const [gRows] = await db.query("SELECT id FROM gestionnaire WHERE id = ? LIMIT 1", [gid]);
        if (!Array.isArray(gRows) || gRows.length === 0) {
            return res.status(400).json({ message: "Gestionnaire introuvable" });
        }

        const [dup] = await db.query(
            "SELECT ID FROM sous_societe WHERE ID <> ? AND ID_GESTIONNAIRE = ? AND UPPER(TRIM(NOM_SOUS_SOCIETE)) = UPPER(TRIM(?)) LIMIT 1",
            [id, gid, nom]
        );
        if (Array.isArray(dup) && dup.length > 0) {
            return res.status(409).json({ message: "Cette sous-société existe déjà pour ce gestionnaire" });
        }

        await db.query(
            "UPDATE sous_societe SET ID_GESTIONNAIRE = ?, NOM_SOUS_SOCIETE = ? WHERE ID = ?",
            [gid, nom, id]
        );

        res.json({ message: "Sous-société mise à jour" });
    } catch (err) {
        console.error("Error updating sous societe:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.deleteSousSociete = async (req, res) => {
    try {
        const id = Number(req.params?.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "Sous-société invalide" });
        }

        const [inUseRows] = await db.query(
            "SELECT id FROM point_de_vente WHERE id_sous_gestionnaire = ? LIMIT 1",
            [id]
        );
        if (Array.isArray(inUseRows) && inUseRows.length > 0) {
            return res.status(409).json({
                message: "Impossible de supprimer: cette sous-société est utilisée par un point de vente.",
            });
        }

        const [result] = await db.query("DELETE FROM sous_societe WHERE ID = ? LIMIT 1", [id]);
        if (!result?.affectedRows) {
            return res.status(404).json({ message: "Sous-société introuvable" });
        }

        res.json({ message: "Sous-société supprimée" });
    } catch (err) {
        console.error("Error deleting sous societe:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};
