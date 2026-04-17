const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const APP_ROOT_DIR = path.resolve(__dirname, '..', '..');
const UPLOADS_DIR = path.join(APP_ROOT_DIR, 'uploads');

function resolveUploadPath(filename) {
    if (!filename) return null;
    const safeName = path.basename(String(filename));
    return path.join(UPLOADS_DIR, safeName);
}

const generateHtmlTemplate = (devis, items, pdv) => {

    const formatter = (value) => {
        if (value == null || isNaN(value)) return "0.00";
        return Number(value).toFixed(2);
    };
    
    // Fallback totals if not provided
    const computedHT = devis.montant_ht ?? items.reduce((sum, item) => sum + (item.montant_ht ?? (item.quantite || 0) * (item.prix_unitaire || 0)), 0);
    const computedTVA = devis.montant_tva ?? (devis.taux_tva != null ? (computedHT * devis.taux_tva) / 100 : 0);
    const computedRemise = devis.reduction != null ? (computedHT * devis.reduction) / 100 : 0;
    const computedTTC = devis.montant_ttc ?? computedHT - computedRemise + computedTVA;

    const statutLabel = devis.statuts_devis ? devis.statuts_devis.charAt(0).toUpperCase() + devis.statuts_devis.slice(1) : "En attente";
    
    // Convert date string properly like "12/03/2026"
    let formattedDate = "";
    if (devis.date_devis) {
        const d = new Date(devis.date_devis);
        formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    // Point de vente defaults
    const pdvNom = pdv?.nom || "Point de vente";
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
    let clientInfoHtml = `<div>${devis.client_nom || "Client non renseigné"}</div>`;
    if (devis.client_type === "societe" || devis.client_email || devis.client_telephone || devis.client_ice || devis.client_adresse) {
        if (devis.client_email) clientInfoHtml += `<div>Email : ${devis.client_email}</div>`;
        if (devis.client_telephone) clientInfoHtml += `<div>Tél : ${devis.client_telephone}</div>`;
        if (devis.client_ice) clientInfoHtml += `<div>ICE : ${devis.client_ice}</div>`;
        if (devis.client_adresse) clientInfoHtml += `<div>Adresse : ${devis.client_adresse}</div>`;
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

        <div class="title-section">
            <h1 class="doc-title">DEVIS</h1>
            <div class="doc-status">Statut : ${statutLabel}</div>
        </div>

        <div class="details-section">
            <div class="info-block">
                <div class="block-title">Informations Devis</div>
                <div class="block-content">
                    <div>Numéro : ${devis.numero_devis}</div>
                    ${formattedDate ? `<div>Date : ${formattedDate}</div>` : ''}
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
                        <th style="padding: 10px; text-align: right;">PU HT</th>
                        <th style="padding: 10px; text-align: right;">Rem. %</th>
                        <th style="padding: 10px; text-align: right;">TVA %</th>
                        <th style="padding: 10px; text-align: right;">Total HT</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.length > 0 ? itemsHtml : `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #888;">Aucune ligne d'article pour ce devis.</td></tr>`}
                </tbody>
            </table>
        </div>

        <div class="totals-section">
            <div class="totals-box">
                <div class="totals-title">Récapitulatif</div>
                <div class="totals-row">
                    <span>Montant HT :</span>
                    <span>${formatter(computedHT)} DH</span>
                </div>
                <div class="totals-row">
                    <span>TVA :</span>
                    <span>${formatter(computedTVA)} DH</span>
                </div>
                <div class="totals-row">
                    <span>Réduction :</span>
                    <span>${formatter(computedRemise)} DH</span>
                </div>
                <div class="totals-row grand-total">
                    <span>Total TTC :</span>
                    <span>${formatter(computedTTC)} DH</span>
                </div>
            </div>
        </div>

        <div class="footer-section">
            <div class="footer-left">Ce devis est valable 30 jours à compter de sa date d'émission.</div>
            <div class="footer-center">${fiscalText}</div>
            <div class="footer-right">Merci pour votre confiance.</div>
        </div>
    </body>
    </html>
    `;
};

async function loadPdvInfoForServer(point_de_vente_id) {
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
        if (pdv.logo) {
            // Read logo from local file system directly and convert to base64
            // so Puppeteer doesn't need to do a network request on localhost
            const logoPath = resolveUploadPath(pdv.logo);
            try {
                if (logoPath && fs.existsSync(logoPath)) {
                    const ext = path.extname(logoPath).replace('.', '') || 'png';
                    const fileData = fs.readFileSync(logoPath);
                    logoBase64 = `data:image/${ext};base64,${fileData.toString('base64')}`;
                }
            } catch (err) {
                console.error("Could not load PDV logo for PDF:", err.message);
            }
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

/**
 * Build a PDF buffer for a devis (with items) using Puppeteer matching exactly the frontend react-pdf implementation.
 * @param {Object} devis - devis row
 * @param {Array} items - devis_items
 * @returns {Promise<Buffer>}
 */
async function buildDevisPdf(devis, items = []) {
    const pdv = await loadPdvInfoForServer(devis.point_de_vente_id);
    const htmlContent = generateHtmlTemplate(devis, items, pdv);

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        });
        const page = await browser.newPage();
        
        // Use setContent to load the HTML
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        // Generate PDF
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

module.exports = { buildDevisPdf };
