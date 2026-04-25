const nodemailer = require("nodemailer");

const TEST_EMAIL = "mourranemohamed2020@gmail.com";

function getTransporter() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === "true";
    if (!host || !user || !pass) {
        return null;
    }
    return nodemailer.createTransport({
        host,
        port: Number(port),
        secure,
        auth: { user, pass },
    });
}

/**
 * Send a simple email. No-op if SMTP is not configured.
 * @param {string} to - recipient
 * @param {string} subject
 * @param {string} text - plain body
 * @param {Array<{ filename: string, content: Buffer }>} [attachments]
 * @param {string | null} [html]
 */
async function sendMail(to, subject, text, attachments = [], html = null) {
    const transport = getTransporter();
    const from = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@bijouterie.com";
    if (!transport) {
        console.warn("[Email] SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS). Skip send.");
        return;
    }
    try {
        const options = {
            from,
            to,
            subject,
            text,
            ...(html ? { html } : {}),
            attachments: attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType || (a.filename.endsWith(".pdf") ? "application/pdf" : undefined),
            })),
        };
        await transport.sendMail(options);
        console.log("[Email] Sent to", to, subject);
    } catch (err) {
        console.error("[Email] Send failed:", err.message);
    }
}

/**
 * Notify when a new devis is created (generated).
 */
async function sendDevisCreated(numeroDevis, devisId) {
    // Disabled for now as requested
    /*
    const to = process.env.DEVIS_NOTIFY_EMAIL || TEST_EMAIL;
    const subject = `[Devis] Nouveau devis créé - ${numeroDevis}`;
    const text = `Un nouveau devis a été généré.\n\nNuméro: ${numeroDevis}\nID: ${devisId}\nDate: ${new Date().toISOString()}`;
    await sendMail(to, subject, text);
    */
}

/**
 * Send devis PDF by email when devis is validated (accepté). To test address.
 */
async function sendDevisValidatedPdf(numeroDevis, pdfBuffer) {
    // Disabled for now as requested
    /*
    const to = TEST_EMAIL;
    const subject = `[Devis validé] ${numeroDevis} - PDF`;
    const text = `Le devis ${numeroDevis} a été validé. Veuillez trouver le PDF en pièce jointe.`;
    await sendMail(to, subject, text, [
        { filename: `Devis_${numeroDevis}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
    ]);
    */
}

module.exports = {
    sendMail,
    sendDevisCreated,
    sendDevisValidatedPdf,
    TEST_EMAIL,
};
