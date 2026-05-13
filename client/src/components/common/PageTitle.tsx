import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const routeTitles: Record<string, string> = {
    "/": "Accueil",
    "/signin": "Connexion",
    "/dashboard": "Tableau de Bord",
    "/dashboard/products": "Produits",
    "/dashboard/inventaire": "Inventaire",
    "/dashboard/mouvements": "Mouvements Stock",
    "/dashboard/clients": "Clients",
    "/dashboard/clients/situation": "Situation Client",
    "/dashboard/clients/contrats": "Contrats Clients",
    "/dashboard/pdv": "Point de Vente",
    "/dashboard/categories": "Catégories",
    "/dashboard/devis": "Devis",
    "/dashboard/devis-gros": "Devis gros",
    "/dashboard/commandes-gros": "Commandes gros",
    "/dashboard/factures-gros": "Factures gros",
    "/dashboard/commandes": "Commandes",
    "/dashboard/achats": "Achats",
    "/dashboard/factures": "Factures",
    "/dashboard/avoirs": "Avoirs",
    "/dashboard/remboursements": "Remboursements",
    "/dashboard/reglements": "Règlements Clients",
    "/dashboard/fournisseurs": "Fournisseurs",
    "/dashboard/fournisseurs/situation": "Situation Fournisseur",
    "/dashboard/fournisseurs/factures": "Factures Fournisseurs",
    "/dashboard/fournisseurs/reglements": "Règlements Fournisseurs",
    "/dashboard/employes": "Employés",
    "/dashboard/conges": "Congés",
    "/dashboard/pointage": "Pointage",
    "/dashboard/salaires": "Salaires",
    "/dashboard/paiement": "Paie",
    "/dashboard/users": "Utilisateurs",
    "/dashboard/tickets": "Support",
    "/dashboard/login-journal": "Journal de connexion",
    "/dashboard/banque": "Banque",
    "/dashboard/caisse": "Caisse",
    "/dashboard/bilan": "Bilan Financier",
    "/dashboard/approvals": "Approbations",
    "/dashboard/promotions": "Promotions",
    "/dashboard/email-marketing": "Email Marketing",
    "/dashboard/alerts": "Alertes et Notifications",
    "/dashboard/settings": "Paramètres",
    "/dashboard/settings/profile": "Mon Profil",
    "/dashboard/settings/account": "Compte",
    "/dashboard/settings/notifications": "Notifications",
    "/dashboard/settings/permissions": "Permissions",
    "/dashboard/settings/social-media": "Reseaux sociaux",
};

export default function PageTitle() {
    const location = useLocation();

    useEffect(() => {
        const path = location.pathname;
        let title = "Gestion ERP";

        // Try exact match
        if (routeTitles[path]) {
            title = `${routeTitles[path]} | Gestion ERP `;
        } else {
            // Try prefix match for dynamic routes like /dashboard/devis/123
            const parts = path.split("/");
            if (parts.length > 3) {
                const base = `/${parts[1]}/${parts[2]}`;
                if (routeTitles[base]) {
                    title = `${routeTitles[base]} | Gestion ERP`;
                }
            }
        }

        document.title = title;
    }, [location]);

    return null;
}
