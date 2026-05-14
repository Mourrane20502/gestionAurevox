const DEFAULT_FAVICON = "/favicon.png";

function apiBase(): string {
    return String(import.meta.env.VITE_API_BASE_URL || "").trim() || "http://localhost:4000";
}

function guessMimeFromFilename(name: string): string {
    const lower = name.toLowerCase();
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "image/png";
}

/** Met à jour le favicon : logo uploadé gestionnaire ou défaut. */
export function setDocumentFaviconFromLogoFilename(filename: string | null | undefined): void {
    const name = filename != null ? String(filename).trim() : "";
    const href = name ? `${apiBase()}/uploads/${encodeURIComponent(name)}` : DEFAULT_FAVICON;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.type = name ? guessMimeFromFilename(name) : "image/png";
    link.href = `${href}${name ? `?v=${encodeURIComponent(name)}` : ""}`;
}

/** Après connexion ou changement de route : logo gestionnaire (table `gestionnaire`, colonne `logo`). */
export async function syncGestionnaireFavicon(): Promise<void> {
    const token = localStorage.getItem("token");
    if (!token) {
        setDocumentFaviconFromLogoFilename(null);
        return;
    }
    try {
        const res = await fetch("/api/gestionnaires/branding/logo", {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            setDocumentFaviconFromLogoFilename(null);
            return;
        }
        const data = (await res.json()) as { logo?: string | null };
        setDocumentFaviconFromLogoFilename(data.logo ?? null);
    } catch {
        setDocumentFaviconFromLogoFilename(null);
    }
}
