import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { syncGestionnaireFavicon } from "@/lib/gestionnaireFavicon";

/**
 * Favicon = logo du gestionnaire (dernier enregistrement, colonne `logo`), comme sur la fiche produits.
 * Sans token : favicon par défaut (`/favicon.png`).
 */
export default function GestionnaireFaviconSync() {
    const { pathname } = useLocation();

    useEffect(() => {
        void syncGestionnaireFavicon();
    }, [pathname]);

    return null;
}
