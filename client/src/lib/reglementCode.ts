export type ReglementCodeType = "client" | "client_gros" | "fournisseur";

export function buildReglementCode(
    type: ReglementCodeType,
    id: number | string,
    date?: string | null,
    sequence?: number | string | null,
    sousSocieteName?: string | null,
    linkedDocumentNumber?: string | null
) {
    const dt = date ? new Date(date) : null;
    const year =
        dt && !Number.isNaN(dt.getTime())
            ? dt.getFullYear()
            : new Date().getFullYear();
    const month =
        dt && !Number.isNaN(dt.getTime())
            ? String(dt.getMonth() + 1).padStart(2, "0")
            : String(new Date().getMonth() + 1).padStart(2, "0");

    const numericId = Number(sequence ?? id) || 0;
    const prefix = type === "client" ? "RCL" : type === "client_gros" ? "RCG" : "RFO";

    // Priority 1: inherit sous-societe letter from linked document number (FA/CO/DE/AV-L-...)
    const linked = String(linkedDocumentNumber || "").trim();
    const linkedMatch = linked.match(/^[A-Z]{2}-([A-Z0-9])-/i);
    const linkedLetter = linkedMatch?.[1]?.toUpperCase() || "";

    // Priority 2: derive from sous-societe name
    const raw = String(sousSocieteName || "").trim();
    const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const first = linkedLetter || normalized.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() || "";
    const scope = (type === "client" || type === "client_gros") && first ? `-${first}` : "";
    return `${prefix}${scope}-${year}/${month}/${String(numericId).padStart(6, "0")}`;
}
