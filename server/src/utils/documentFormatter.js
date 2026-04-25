const toSousSocieteTag = (label) => {
    const raw = String(label || "").trim();
    if (!raw) return "";
    const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const first = normalized.match(/[A-Za-z0-9]/)?.[0] || "";
    return first ? String(first).toUpperCase() : "";
};

const formatDocumentNumber = (type, id, date = new Date(), options = {}) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const paddedId = String(id).padStart(6, '0');

    // Formats:
    // DE-YYYY/MM/XXXXXX (Devis)
    // CO-YYYY/MM/XXXXXX (Commande)
    // FA-YYYY/MM/XXXXXX (Facture)
    // AV-YYYY/MM/XXXXXX (Avoir)

    let prefix = '';
    switch (type.toUpperCase()) {
        case 'DEVIS':
        case 'DE':
            prefix = 'DE';
            break;
        case 'COMMANDE':
        case 'CO':
            prefix = 'CO';
            break;
        case 'FACTURE':
        case 'FA':
            prefix = 'FA';
            break;
        case 'AVOIR':
        case 'AV':
            prefix = 'AV';
            break;
        case 'DG':
        case 'DEVIS_GROS':
            prefix = 'DG';
            break;
        case 'CG':
        case 'COMMANDE_GROS':
            prefix = 'CG';
            break;
        case 'FG':
        case 'FACTURE_GROS':
            prefix = 'FG';
            break;
        default:
            prefix = type.toUpperCase();
    }

    const ssTag = toSousSocieteTag(options?.sousSocieteNom);
    const middle = ssTag ? `-${ssTag}` : "";
    return `${prefix}${middle}-${year}/${month}/${paddedId}`;
};

const extractSequenceFromDocumentNumber = (numero) => {
    const raw = String(numero || "").trim();
    if (!raw) return null;
    const tail = raw.includes("/") ? raw.split("/").pop() : raw;
    const digits = String(tail || "").replace(/[^\d]/g, "");
    const value = Number.parseInt(digits, 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
};

module.exports = {
    formatDocumentNumber,
    extractSequenceFromDocumentNumber
};
