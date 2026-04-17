/** Filtre liste par nom de sous-société (aligné sur la page Factures). */
export function matchesSousSocieteListFilter(
    filterSousSociete: string,
    sousSocieteNom: string | null | undefined,
    numeroDocument: string | null | undefined
): boolean {
    if (filterSousSociete === "all") return true;
    const currentName = String(sousSocieteNom || "").trim().toLowerCase();
    const wantedName = String(filterSousSociete || "").trim().toLowerCase();
    const selectedTag =
        String(filterSousSociete || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .match(/[A-Za-z0-9]/)?.[0]
            ?.toUpperCase() || "";
    const codeHasTag = selectedTag
        ? String(numeroDocument || "").toUpperCase().includes(`-${selectedTag}-`)
        : false;
    return currentName === wantedName || codeHasTag;
}
