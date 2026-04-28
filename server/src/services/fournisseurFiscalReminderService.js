const db = require("../config/db").promise();
const { sendMail } = require("./emailService");

let reminderJobHandle = null;

async function ensureReminderColumn() {
    const [rows] = await db.query("SHOW COLUMNS FROM regularite_fiscale_details LIKE 'reminder_sent_at'");
    if (!Array.isArray(rows) || rows.length === 0) {
        await db.query(
            "ALTER TABLE regularite_fiscale_details ADD COLUMN reminder_sent_at DATETIME NULL AFTER date_expiration"
        );
    }
}

async function sendFournisseurFiscalReminders() {
    try {
        await ensureReminderColumn();
        const [rows] = await db.query(
            `
            SELECT f.id,
                   f.nom,
                   f.email,
                   rfd.id AS detail_id,
                   rfd.date_expiration
            FROM fournisseur f
            INNER JOIN regularite_fiscale_details rfd ON rfd.fournisseur_id = f.id
            WHERE COALESCE(f.regularite_fiscale, 0) = 1
              AND f.email IS NOT NULL
              AND f.email <> ''
              AND rfd.date_expiration IS NOT NULL
              AND rfd.date_expiration <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
              AND rfd.date_expiration >= CURDATE()
              AND rfd.reminder_sent_at IS NULL
            `
        );

        for (const row of rows || []) {
            const expDate = row.date_expiration
                ? new Date(row.date_expiration).toLocaleDateString("fr-FR")
                : "non renseignée";
            const subject = "Rappel - expiration prochaine de votre régularité fiscale";
            const text = `Bonjour ${row.nom || "partenaire"},\n\nVotre document de régularité fiscale expire le ${expDate}.\nMerci de nous transmettre un document à jour afin d'éviter toute interruption de traitement.\n\nCordialement.`;
            await sendMail(row.email, subject, text);
            await db.query(
                "UPDATE regularite_fiscale_details SET reminder_sent_at = NOW() WHERE id = ?",
                [row.detail_id]
            );
        }
    } catch (error) {
        console.error("[FiscalReminder] Error while sending reminders:", error.message);
    }
}

function bootstrapFournisseurFiscalReminders() {
    if (reminderJobHandle) return;
    sendFournisseurFiscalReminders();
    reminderJobHandle = setInterval(sendFournisseurFiscalReminders, 24 * 60 * 60 * 1000);
}

module.exports = {
    bootstrapFournisseurFiscalReminders,
};

