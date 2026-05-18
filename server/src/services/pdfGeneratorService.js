const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const APP_ROOT_DIR = path.resolve(__dirname, '..', '..');
const UPLOADS_DIR = path.join(APP_ROOT_DIR, 'uploads');

function resolveUploadPath(filename) {
    if (!filename) return null;
    const raw = String(filename).trim();
    if (!raw) return null;
    const normalized = raw.replace(/\\/g, '/').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
    const safeName = path.basename(normalized);
    const candidates = [
        path.join(UPLOADS_DIR, safeName),
        path.join(APP_ROOT_DIR, normalized),
        path.join(APP_ROOT_DIR, raw),
    ];
    console.log("[PDF][logo] resolveUploadPath input", { raw, normalized, safeName, candidates });
    for (const candidate of candidates) {
        try {
            if (candidate && fs.existsSync(candidate)) {
                console.log("[PDF][logo] resolveUploadPath matched", { candidate });
                return candidate;
            }
        } catch {
            // ignore and continue
        }
    }
    console.log("[PDF][logo] resolveUploadPath fallback", { fallback: path.join(UPLOADS_DIR, safeName) });
    return path.join(UPLOADS_DIR, safeName);
}

const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const formatQtyBl = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return Math.round(n).toLocaleString("fr-FR");
};

const generateBonLivraisonHtmlTemplate = (docData, items, pdv, config) => {
    let statutLabel = config.defaultStatus || "En attente";
    if (docData[config.statusField]) {
        statutLabel = String(docData[config.statusField]).replace(/_/g, " ");
        statutLabel = statutLabel.charAt(0).toUpperCase() + statutLabel.slice(1);
    }

    let formattedDate = "";
    if (docData[config.dateField]) {
        const d = new Date(docData[config.dateField]);
        formattedDate = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    }

    const pdvNom = pdv?.nom || "Point de vente";
    const companyDisplayName = (docData.sous_societe_nom || "").trim() || pdvNom;
    const pdvEmail = pdv?.email ? `Contact : ${pdv.email}` : "";
    const pdvTel = pdv?.telephone ? `Tél : ${pdv.telephone}` : "";
    const logoHtml = pdv?.logoBase64 ? `<img src="${pdv.logoBase64}" style="max-height: 80px;" />` : "";

    const fiscalParts = [];
    if (pdv?.ice) fiscalParts.push(`ICE : ${pdv.ice}`);
    if (pdv?.if) fiscalParts.push(`IF : ${pdv.if}`);
    if (pdv?.patente) fiscalParts.push(`Patente : ${pdv.patente}`);
    const fiscalText = fiscalParts.length > 0 ? fiscalParts.join(" | ") : "";

    let clientInfoHtml = `<div>${escapeHtml(docData.client_nom || "Client non renseigné")}</div>`;
    if (docData.client_email) clientInfoHtml += `<div>Email : ${escapeHtml(docData.client_email)}</div>`;
    if (docData.client_telephone) clientInfoHtml += `<div>Tél : ${escapeHtml(docData.client_telephone)}</div>`;
    if (docData.client_ice) clientInfoHtml += `<div>ICE : ${escapeHtml(docData.client_ice)}</div>`;
    if (docData.client_adresse) clientInfoHtml += `<div>Adresse : ${escapeHtml(docData.client_adresse)}</div>`;

    const itemsHtml =
        items.length > 0
            ? items
                  .map(
                      (item) => `
            <tr>
                <td>${escapeHtml(item.reference || "—")}</td>
                <td>${escapeHtml(item.designation || "—")}</td>
                <td class="num">${formatQtyBl(item.quantite_commandee)}</td>
                <td class="num">${formatQtyBl(item.quantite_livree ?? item.quantite)}</td>
            </tr>`
                  )
                  .join("")
            : `<tr><td colspan="4" class="empty">Aucune ligne article.</td></tr>`;

    const commandeRef = docData.numero_commande
        ? `<div>Commande : ${escapeHtml(docData.numero_commande)}</div>`
        : "";

    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { margin: 16mm; }
            body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.45; margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }
            .company { text-align: right; font-size: 10px; color: #505050; }
            .company-name { font-size: 16px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
            .title-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
            .doc-title { font-size: 22px; font-weight: bold; margin: 0; color: #282828; }
            .doc-status { font-size: 12px; color: #666; }
            .details { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 16px; }
            .block { width: 48%; }
            .block-title { font-weight: bold; margin-bottom: 6px; color: #282828; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
            .items-table th, .items-table td { border: 1px solid #333; padding: 8px 10px; vertical-align: top; }
            .items-table th { background: #d9d9d9; font-weight: bold; text-align: center; }
            .items-table td.num { text-align: right; }
            .items-table td.empty { text-align: center; color: #888; padding: 16px; }
            .reception { margin-top: 8px; min-height: 100px; page-break-inside: avoid; }
            .reception-label { font-weight: bold; margin-bottom: 48px; }
            .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 9px; color: #787878; }
        </style>
    </head>
    <body>
        <div class="header">
            <div>${logoHtml}</div>
            <div class="company">
                <div class="company-name">${escapeHtml(companyDisplayName)}</div>
                ${pdvEmail ? `<div>${escapeHtml(pdvEmail)}</div>` : ""}
                ${pdvTel ? `<div>${escapeHtml(pdvTel)}</div>` : ""}
            </div>
        </div>

        <div class="title-row">
            <h1 class="doc-title">${config.title}</h1>
            <div class="doc-status">Statut : ${escapeHtml(statutLabel)}</div>
        </div>

        <div class="details">
            <div class="block">
                <div class="block-title">Informations ${config.infoTitle}</div>
                <div>
                    <div>Numéro : ${escapeHtml(docData[config.numberField])}</div>
                    ${formattedDate ? `<div>Date : ${formattedDate}</div>` : ""}
                    ${commandeRef}
                </div>
            </div>
            <div class="block">
                <div class="block-title">Client</div>
                <div>${clientInfoHtml}</div>
            </div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th style="width:18%;">Référence</th>
                    <th style="width:46%;">Description</th>
                    <th style="width:18%;">Quantités commandées</th>
                    <th style="width:18%;">Quantités livrées</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>



        <div class="footer">
            ${escapeHtml(config.footerLeft || "")}${fiscalText ? ` | ${escapeHtml(fiscalText)}` : ""}
        </div>
    </body>
    </html>
    `;
};

const generateHtmlTemplate = (docData, items, pdv, config) => {

    const formatter = (value) => {
        if (value == null || isNaN(value)) return "0.00";
        return Number(value).toFixed(2);
    };
    
    // Fallback totals if not provided
    const computedHT = docData.montant_ht ?? items.reduce((sum, item) => sum + (item.montant_ht ?? (item.quantite || 0) * (item.prix_unitaire || 0)), 0);
    const computedTVA = docData.montant_tva ?? (docData.taux_tva != null ? (computedHT * docData.taux_tva) / 100 : 0);
    
    // Some documents save reduction as a percentage and calculate it dynamically, some as a total
    let computedRemise = 0;
    if (config.type === 'FACTURE') {
        computedRemise = docData.reduction != null ? (computedHT * Number(docData.reduction)) / 100 : 0;
    } else {
        computedRemise = docData.reduction != null ? (computedHT * docData.reduction) / 100 : 0;
    }

    const computedTTC = docData.montant_ttc ?? computedHT - computedRemise + computedTVA;

    const twoDigitsToWordsFr = (n) => {
        const units = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
        const tens = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];
        if (n < 17) return units[n];
        if (n < 20) return `dix-${units[n - 10]}`;
        if (n < 70) {
            const t = Math.floor(n / 10);
            const u = n % 10;
            if (u === 0) return tens[t];
            if (u === 1) return `${tens[t]} et un`;
            return `${tens[t]}-${units[u]}`;
        }
        if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${twoDigitsToWordsFr(n - 60)}`;
        if (n === 80) return "quatre-vingts";
        return `quatre-vingt-${twoDigitsToWordsFr(n - 80)}`;
    };
    const threeDigitsToWordsFr = (n) => {
        if (n < 100) return twoDigitsToWordsFr(n);
        const h = Math.floor(n / 100);
        const r = n % 100;
        if (h === 1) return r === 0 ? "cent" : `cent ${twoDigitsToWordsFr(r)}`;
        if (r === 0) return `${twoDigitsToWordsFr(h)} cents`;
        return `${twoDigitsToWordsFr(h)} cent ${twoDigitsToWordsFr(r)}`;
    };
    const integerToWordsFr = (n) => {
        if (!Number.isFinite(n) || n <= 0) return "zero";
        const parts = [];
        const millions = Math.floor(n / 1_000_000);
        const thousands = Math.floor((n % 1_000_000) / 1000);
        const rest = n % 1000;
        if (millions > 0) parts.push(millions === 1 ? "un million" : `${threeDigitsToWordsFr(millions)} millions`);
        if (thousands > 0) parts.push(thousands === 1 ? "mille" : `${threeDigitsToWordsFr(thousands)} mille`);
        if (rest > 0) parts.push(threeDigitsToWordsFr(rest));
        return parts.join(" ").replace(/\s+/g, " ").trim();
    };
    const amountToWordsFrDh = (amount) => {
        const safe = Number.isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0;
        const rounded = Math.round(safe * 100) / 100;
        const dirhams = Math.floor(rounded);
        const centimes = Math.round((rounded - dirhams) * 100);
        const dirhamsWords = `${integerToWordsFr(dirhams)} ${dirhams > 1 ? "dirhams" : "dirham"}`;
        if (centimes === 0) return dirhamsWords.toUpperCase();
        const centimesWords = `${integerToWordsFr(centimes)} ${centimes > 1 ? "centimes" : "centime"}`;
        return `${dirhamsWords} et ${centimesWords}`.toUpperCase();
    };

    let statutLabel = config.defaultStatus || "En attente";
    if (docData[config.statusField]) {
        statutLabel = docData[config.statusField].replace(/_/g, " ");
        statutLabel = statutLabel.charAt(0).toUpperCase() + statutLabel.slice(1);
    }
    
    // Convert date string properly like "12/03/2026"
    let formattedDate = "";
    if (docData[config.dateField]) {
        const d = new Date(docData[config.dateField]);
        formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    let formattedEcheance = "";
    if (config.type === 'FACTURE' && docData.date_echeance) {
        const d = new Date(docData.date_echeance);
        formattedEcheance = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    // Point de vente defaults
    const pdvNom = pdv?.nom || "Point de vente";
    const companyDisplayName = (docData.sous_societe_nom || "").trim() || pdvNom;
    const pdvEmail = pdv?.email ? `Contact : ${pdv.email}` : "";
    const pdvTel = pdv?.telephone ? `Tél : ${pdv.telephone}` : "";
    const logoHtml = pdv?.logoBase64 ? `<img src="${pdv.logoBase64}" style="max-height: 80px;" />` : "";

    // Fiscal info
    const fiscalParts = [];
    if (pdv?.ice) fiscalParts.push(`ICE : ${pdv.ice}`);
    if (pdv?.if) fiscalParts.push(`IF : ${pdv.if}`);
    if (pdv?.patente) fiscalParts.push(`Patente : ${pdv.patente}`);
    const fiscalText = fiscalParts.length > 0 ? `Informations fiscales PDV - ${fiscalParts.join(" | ")}` : "";

    // Client info block
    let clientInfoHtml = `<div>${docData.client_nom || "Client non renseigné"}</div>`;
    if (docData.client_type === "societe" || docData.client_email || docData.client_telephone || docData.client_ice || docData.client_adresse) {
        if (docData.client_email) clientInfoHtml += `<div>Email : ${docData.client_email}</div>`;
        if (docData.client_telephone) clientInfoHtml += `<div>Tél : ${docData.client_telephone}</div>`;
        if (docData.client_ice) clientInfoHtml += `<div>ICE : ${docData.client_ice}</div>`;
        if (docData.client_adresse) clientInfoHtml += `<div>Adresse : ${docData.client_adresse}</div>`;
    }

    const itemsHtml = items.map(item => {
        const totalHTLigne = item.montant_ht ?? (item.quantite || 0) * (item.prix_unitaire || 0);
        return `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0;">${item.designation || ""}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: right;">${formatter(item.quantite)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: right;">${formatter(item.prix_unitaire)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: right;">${formatter(item.reduction)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: right;">${formatter(item.tva)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: right;">${formatter(totalHTLigne)}</td>
            </tr>
        `;
    }).join("");

    const reglements = Array.isArray(docData.reglements) ? docData.reglements : [];
    const reglementsRowsHtml = reglements.length
        ? reglements.slice(0, 6).map((r) => {
              const d = r.date_reglement || r.created_at;
              const dd = d ? new Date(d) : null;
              const ds = dd && !Number.isNaN(dd.getTime())
                  ? `${String(dd.getDate()).padStart(2, "0")}/${String(dd.getMonth() + 1).padStart(2, "0")}/${dd.getFullYear()}`
                  : "—";
              return `<tr>
                <td>${ds}</td>
                <td style="text-transform: lowercase;">${String(r.mode_paiement || "—").replace(/_/g, " ")}</td>
                <td style="text-align:right;">${formatter(r.montant)} DH</td>
              </tr>`;
          }).join("")
        : `<tr><td colspan="3" style="text-align:center;color:#8b8b8b;">Aucun règlement</td></tr>`;

    if (config.type === 'FACTURE') {
        return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { margin: 16mm; }
            body { font-family: Helvetica, Arial, sans-serif; color:#2f2f2f; font-size:11px; }
            .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
            .company{text-align:right;font-size:10px}
            .company-name{font-size:28px;font-weight:800;letter-spacing:.4px}
            .title{font-size:28px;font-weight:800;margin:8px 0 4px}
            .info{display:flex;justify-content:space-between;margin:8px 0 14px}
            .block{width:48%}
            .block .t{font-size:11px;font-weight:800;margin-bottom:4px}
            table{width:100%;border-collapse:collapse}
            th{background:#f8f9fc;border-top:1px solid #dcdfe6;border-bottom:1px solid #dcdfe6;padding:7px 8px;text-align:right;font-size:11px}
            th:first-child, td:first-child{text-align:left}
            td{padding:8px;border-bottom:1px solid #ededed;text-align:right}
            .totals{display:flex;justify-content:flex-end;margin-top:10px}
            .totals-box{width:280px}
            .totals-row{display:flex;justify-content:space-between;margin-bottom:6px}
            .grand{font-weight:800;color:#10b981}
            .words-title{font-weight:800;text-decoration:underline;margin-top:10px}
            .reg-title{margin-top:12px;background:#f8f9fc;border:1px solid #dcdfe6;padding:6px 8px;font-weight:800}
            .reg-table th,.reg-table td{font-size:10px;padding:6px}
            .reg-table th{background:white;border-top:0}
            .footer{position:fixed;left:0;right:0;bottom:0;border-top:1px solid #e6e6e6;padding-top:7px;font-size:9px;color:#757575;text-align:center}
        </style>
    </head>
    <body>
        <div class="header">
            <div>${logoHtml}</div>
            <div class="company">
                <div class="company-name">${companyDisplayName}</div>
                ${pdvEmail ? `<div>${pdvEmail}</div>` : ''}
                ${pdvTel ? `<div>${pdvTel}</div>` : ''}
            </div>
        </div>
        <div class="title">FACTURE</div>
        <div class="info">
            <div class="block">
                <div class="t">Informations Facture</div>
                <div>Numéro : ${docData.numero_facture || ""}</div>
                ${formattedDate ? `<div>Date : ${formattedDate}</div>` : ''}
                ${formattedEcheance ? `<div>Échéance : ${formattedEcheance}</div>` : ''}
            </div>
            <div class="block">
                <div class="t">Client</div>
                ${clientInfoHtml}
            </div>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="text-align:left;">Désignation</th>
                    <th>Qté</th>
                    <th>PU</th>
                    <th>Reduction</th>
                    <th>TVA %</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${items.length > 0 ? items.map((item) => {
                    const totalHTLigne = item.montant_ht ?? (item.quantite || 0) * (item.prix_unitaire || 0);
                    const designation = item.designation || "";
                    const reference = String(item.reference || "").trim();
                    const designationWithRef = reference ? `${designation} (${reference})` : designation;
                    return `<tr>
                        <td style="text-align:left;">${designationWithRef}</td>
                        <td>${formatQtyBl(item.quantite || 0)}</td>
                        <td>${formatter(item.prix_unitaire || 0)}</td>
                        <td>${formatter(item.reduction || 0)}</td>
                        <td>${formatter(item.tva || 0)}</td>
                        <td>${formatter(totalHTLigne)}</td>
                    </tr>`;
                }).join("") : `<tr><td colspan="6" style="text-align:center;color:#888;">Aucune ligne d'article.</td></tr>`}
            </tbody>
        </table>
        <div class="totals">
            <div class="totals-box">
                <div style="font-weight:800;margin-bottom:6px;">Récapitulatif</div>
                <div class="totals-row"><span>Montant :</span><span>${formatter(computedHT)} DH</span></div>
                <div class="totals-row"><span>TVA :</span><span>${formatter(computedTVA)} DH</span></div>
                <div class="totals-row"><span>Réduction :</span><span>${(Number(docData.reduction) || 0) > 0 ? `- ${formatter(docData.reduction)} %` : '0.00'}</span></div>
                <div class="totals-row grand"><span>Total :</span><span>${formatter(computedTTC)} DH</span></div>
            </div>
        </div>
        <div class="words-title">Arrêtée la présente facture à la somme de :</div>
        <div>${amountToWordsFrDh(computedTTC)}</div>
        <div class="reg-title">Historique des règlements</div>
        <table class="reg-table">
            <thead><tr><th style="text-align:left;">Date</th><th style="text-align:left;">Mode</th><th style="text-align:right;">Montant</th></tr></thead>
            <tbody>${reglementsRowsHtml}</tbody>
        </table>
        <div class="footer">${config.footerLeft} ${fiscalText ? `| ${fiscalText}` : ""}</div>
    </body>
    </html>
    `;
    }

    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { margin: 20mm; }
            body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 11px; color: #444; line-height: 1.5; margin: 0; padding: 0; padding-bottom: 50px; -webkit-print-color-adjust: exact; position: relative; min-height: 100%; }
            .header-info { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
            .logo-container { width: 100px; height: 100px; display: flex; justify-content: flex-start; align-items: flex-start; }
            .company-info { text-align: right; font-size: 11px; color: #505050; }
            .company-name { font-size: 16px; font-weight: bold; color: #1a1a1a; margin-bottom: 5px; }
            
            .title-section { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; }
            .doc-title { font-size: 24px; font-weight: bold; color: #282828; margin: 0; }
            .doc-status { font-size: 13px; color: #5a5a5a; }

            .details-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .info-block { width: 45%; }
            .block-title { font-size: 12px; font-weight: bold; color: #282828; margin-bottom: 5px; }
            .block-content { color: #464646; font-size: 11px; }

            .table-container { margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background-color: #f8f9fc; color: #3c3c3c; font-weight: bold; text-align: right; padding: 10px; border-bottom: 1px solid #dcdfe6; border-top: 1px solid #dcdfe6; }
            th:first-child { text-align: left; }
            td { padding: 8px 10px; border-bottom: 1px solid #ededed; color: #323232; }

            .totals-section { display: flex; justify-content: flex-end; page-break-inside: avoid; margin-bottom: 30px; }
            .totals-box { width: 250px; }
            .totals-title { font-size: 12px; font-weight: bold; color: #282828; margin-bottom: 10px; }
            .totals-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; color: #505050; }
            .totals-row.grand-total { font-weight: bold; color: #5850ec; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e1e1e1; font-size: 12px; }

            .footer-section { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #e6e6e6; padding-top: 10px; font-size: 9px; color: #787878; display: flex; justify-content: space-between; width: 100%; background: white; }
            .footer-left { flex: 1; text-align: left; }
            .footer-center { flex: 1; text-align: center; }
            .footer-right { flex: 1; text-align: right; }
        </style>
    </head>
    <body style="zoom: 0.95;">
        <div class="header-info">
            <div class="logo-container">
                ${logoHtml}
            </div>
            <div class="company-info">
                <div class="company-name">${pdvNom}</div>
                ${pdvEmail ? `<div>${pdvEmail}</div>` : ''}
                ${pdvTel ? `<div>${pdvTel}</div>` : ''}
            </div>
        </div>

      

        <div class="details-section">
            <div class="info-block">
                <div class="block-title">Informations ${config.infoTitle}</div>
                <div class="block-content">
                    <div>Numéro : ${docData[config.numberField]}</div>
                    ${formattedDate ? `<div>Date : ${formattedDate}</div>` : ''}
                    ${formattedEcheance ? `<div>Échéance : ${formattedEcheance}</div>` : ''}
                    ${config.type === 'AVOIR' && (docData.numero_facture || docData.facture_id)
                        ? `<div>Référence facture associée : ${String(docData.numero_facture || '').trim() || `ID facture ${docData.facture_id}`}</div>`
                        : ''}
                </div>
            </div>
            <div class="info-block">
                <div class="block-title">Client</div>
                <div class="block-content">
                    ${clientInfoHtml}
                </div>
            </div>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="padding: 10px; text-align: left;">Désignation</th>
                        <th style="padding: 10px; text-align: right;">Qté</th>
                        <th style="padding: 10px; text-align: right;">PU</th>
                        <th style="padding: 10px; text-align: right;">Rem. %</th>
                        <th style="padding: 10px; text-align: right;">TVA %</th>
                        <th style="padding: 10px; text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.length > 0 ? itemsHtml : `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #888;">Aucune ligne d'article pour ce(tte) ${config.infoTitle.toLowerCase()}.</td></tr>`}
                </tbody>
            </table>
        </div>

        <div class="totals-section">
            <div class="totals-box">
                <div class="totals-title">Récapitulatif</div>
                <div class="totals-row">
                    <span>Montant :</span>
                    <span>${formatter(computedHT)} DH</span>
                </div>
                <div class="totals-row">
                    <span>TVA :</span>
                    <span>${formatter(computedTVA)} DH</span>
                </div>
                <div class="totals-row">
                    <span>Réduction :</span>
                    <span>${config.type === 'FACTURE' ? (Number(docData.reduction) || 0) > 0 ? `- ${formatter(docData.reduction)} %` : '—' : `${formatter(computedRemise)} DH`}</span>
                </div>
                <div class="totals-row grand-total" ${config.type === 'FACTURE' ? 'style="color: #10b981;"' : ''}>
                    <span>Total TTC :</span>
                    <span>${formatter(computedTTC)} DH</span>
                </div>
            </div>
        </div>

        <div class="footer-section">
            <div class="footer-left">${config.footerLeft}</div>
            <div class="footer-center">${fiscalText}</div>
            <div class="footer-right">Merci pour votre confiance.</div>
        </div>
    </body>
    </html>
    `;
};

const generateReglementHtmlTemplate = (regData, pdv) => {
    const formatter = (value) => {
        if (value == null || isNaN(value)) return "0.00";
        return Number(value).toFixed(2);
    };

    const formattedDate = regData.date_reglement ? 
        new Date(regData.date_reglement).toLocaleDateString('fr-FR') : "";
    
    const pdvNom = pdv?.nom || "Bijouterie";
    const pdvEmail = pdv?.email ? `Contact : ${pdv.email}` : "";
    const pdvTel = pdv?.telephone ? `Tél : ${pdv.telephone}` : "";
    const logoHtml = pdv?.logoBase64 ? `<img src="${pdv.logoBase64}" style="max-height: 80px;" />` : "";

    const fiscalParts = [];
    if (pdv?.ice) fiscalParts.push(`ICE : ${pdv.ice}`);
    if (pdv?.if) fiscalParts.push(`IF : ${pdv.if}`);
    const fiscalText = fiscalParts.join(" | ");

    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { margin: 15mm; }
            body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 11px; color: #333; line-height: 1.4; margin: 0; padding: 0; background: #fff; }
            .receipt-container { border: 1px solid #dcdfe6; border-radius: 8px; padding: 20px; position: relative; }
            .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .logo { width: 80px; }
            .company-info { text-align: right; }
            .title { text-align: center; font-size: 18px; font-weight: bold; margin: 20px 0; color: #1a1a1a; text-transform: uppercase; border-bottom: 2px solid #5850ec; padding-bottom: 5px; }
            .meta-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .info-box { border: 1px solid #eee; padding: 10px; border-radius: 4px; width: 45%; }
            .info-title { font-weight: bold; font-size: 10px; color: #888; text-transform: uppercase; margin-bottom: 5px; }
            .amount-box { background: #f8f9fc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; text-align: center; margin: 30px 0; }
            .amount-label { font-size: 12px; color: #64748b; margin-bottom: 5px; }
            .amount-value { font-size: 24px; font-weight: bold; color: #5850ec; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .detail-item { font-size: 11px; }
            .detail-label { font-weight: bold; color: #444; }
            .footer { margin-top: 50px; font-size: 9px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="receipt-container">
            <div class="header">
                <div class="logo">${logoHtml}</div>
                <div class="company-info">
                    <div style="font-weight: bold; font-size: 14px;">${pdvNom}</div>
                    <div>${pdvEmail}</div>
                    <div>${pdvTel}</div>
                </div>
            </div>

            <div class="title">Reçu de Paiement</div>

            <div class="meta-info">
                <div class="info-box">
                    <div class="info-title">Référence</div>
                    <div>Ref reçu : <b>${regData.numero_recu != null ? regData.numero_recu : regData.id}</b></div>
                    <div>Date : <b>${formattedDate}</b></div>
                </div>
                <div class="info-box">
                    <div class="info-title">Client</div>
                    <div><b>${regData.client_nom || "Client"}</b></div>
                    ${regData.client_ice ? `<div>ICE : ${regData.client_ice}</div>` : ""}
                    ${regData.document_numero ? `<div>${regData.document_type === 'facture' ? 'Facture' : 'Commande'} : ${regData.document_numero}</div>` : ""}
                </div>
            </div>

            <div class="amount-box">
                <div class="amount-label">Montant Total Reçu</div>
                <div class="amount-value">${formatter(regData.montant)} DH</div>
            </div>

            <div class="details-grid">
                <div class="detail-item">
                    <span class="detail-label">Mode de paiement :</span>
                    <span style="text-transform: capitalize;">${regData.mode_paiement || "—"}</span>
                </div>
                ${regData.banque_nom ? `
                <div class="detail-item">
                    <span class="detail-label">Banque :</span>
                    <span>${regData.banque_nom}</span>
                </div>` : ""}
              
            </div>

            ${regData.commentaire ? `
            <div style="margin-top: 20px;">
                <div class="info-title">Observations</div>
                <div style="font-style: italic; color: #666;">${regData.commentaire}</div>
            </div>` : ""}

            <div class="footer">
                <div>${pdvNom} | ${fiscalText}</div>
                <div style="margin-top: 5px;">Merci de votre confiance. Ce document sert de preuve de paiement.</div>
            </div>
        </div>
    </body>
    </html>
    `;
};

async function loadPdvInfoForServer(point_de_vente_id, fallbackLogo = null) {
    const db = require('../config/db').promise();
    try {
        let rows;
        if (point_de_vente_id) {
            [rows] = await db.execute('SELECT * FROM point_de_vente WHERE id = ?', [point_de_vente_id]);
        } else {
            [rows] = await db.execute('SELECT * FROM point_de_vente LIMIT 1');
        }

        if (!rows || rows.length === 0) return null;
        const pdv = rows[0];
        
        let logoBase64 = null;
        const logoSource = pdv.logo || fallbackLogo;
        console.log("[PDF][logo] loadPdvInfoForServer source", {
            point_de_vente_id,
            pdv_logo: pdv.logo || null,
            fallbackLogo: fallbackLogo || null,
            selectedLogoSource: logoSource || null,
        });
        if (logoSource) {
            const logoPath = resolveUploadPath(logoSource);
            try {
                if (logoPath && fs.existsSync(logoPath)) {
                    const ext = path.extname(logoPath).replace('.', '') || 'png';
                    const fileData = fs.readFileSync(logoPath);
                    logoBase64 = `data:image/${ext};base64,${fileData.toString('base64')}`;
                    console.log("[PDF][logo] loaded", {
                        logoPath,
                        ext,
                        size: Buffer.byteLength(fileData),
                    });
                } else {
                    console.warn("[PDF][logo] file not found", { logoPath, logoSource });
                }
            } catch (err) {
                console.error("Could not load PDV logo for PDF:", err.message);
            }
        } else {
            console.warn("[PDF][logo] no logo source available", {
                point_de_vente_id,
                pdv_logo: pdv.logo || null,
                fallbackLogo: fallbackLogo || null,
            });
        }
        
        return {
            nom: pdv.nom || "Point de vente",
            logoBase64,
            email: pdv.email || null,
            telephone: pdv.telephone || null,
            if: pdv.if || null,
            ice: pdv.ice || null,
            patente: pdv.patente || null,
        };
    } catch (e) {
        console.error("Error loading PDV for PDF:", e);
        return null;
    }
}

async function buildGenericPdf(docData, items = [], config) {
    const pdv = await loadPdvInfoForServer(docData.point_de_vente_id, docData.point_de_vente_logo || null);
    const htmlContent =
        config.type === "BON_LIVRAISON"
            ? generateBonLivraisonHtmlTemplate(docData, items, pdv, config)
            : generateHtmlTemplate(docData, items, pdv, config);

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        });
        const page = await browser.newPage();
        
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 0 });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20mm',
                right: '20mm',
                bottom: '20mm',
                left: '20mm'
            }
        });

        return pdfBuffer;
    } catch (error) {
        console.error("Error generating Puppeteer PDF:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function buildReglementPdf(regData) {
    const pdv = await loadPdvInfoForServer(regData.point_de_vente_id);
    const htmlContent = generateReglementHtmlTemplate(regData, pdv);

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 0 });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }
        });

        return pdfBuffer;
    } catch (error) {
        console.error("Error generating Reglement PDF:", error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { buildGenericPdf, buildReglementPdf };
