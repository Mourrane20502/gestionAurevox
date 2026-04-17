import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    ShoppingBag,
    Store,
    ListOrdered,
    LogOut,
    FileText,
    Users,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ShoppingCart,
    Banknote,
    Settings,
    Shield,
    Truck,
    Ticket,
    RotateCcw,
    CheckSquare,
    Megaphone,
    Send,
    CircleDollarSign,
    CreditCard,
    Award,
    Receipt,
    Mail,
    Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/common/ui/button";
import SousLogoAurevox from "@/assets/aurevox_logo.png";
import { useState, useEffect, useRef, useCallback } from "react";

interface SidebarItem {
    name: string;
    href?: string;
    icon: any;
    hasDropDown?: boolean;
    permission?: string;
    subItems?: Array<{
        name: string;
        href: string;
        icon: any;
        permission?: string;
        /** Regroupe visuellement les entrées (ex. Vente classique vs vente gros) */
        section?: string;
    }>;
}

const sidebarItems: SidebarItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: 'dashboard_view' },
    { name: "Centre d'approbation", href: "/dashboard/approvals", icon: CheckSquare, permission: 'approvals_view' },

    {
        name: "Produits",
        icon: ShoppingBag,
        hasDropDown: true,
        subItems: [
            { name: "Liste Produits", href: "/dashboard/products", icon: ShoppingBag, permission: 'products_view' },
            { name: "Inventaire", href: "/dashboard/inventaire", icon: ListOrdered, permission: 'products_inventory_view' },
            { name: "Mouvements", href: "/dashboard/mouvements", icon: RotateCcw, permission: 'products_movements_view' },
        ]
    },
    { name: "Point de Vente", href: "/dashboard/pdv", icon: Store, permission: 'pdv_view' },
    { name: "Catégories", href: "/dashboard/categories", icon: ListOrdered, permission: 'categories_view' },
    {
        name: "Clients",
        icon: Users,
        hasDropDown: true,
        permission: 'clients_view',
        subItems: [
            { name: "Liste Clients", href: "/dashboard/clients", icon: Users, permission: 'clients_view' },
            { name: "Situation client", href: "/dashboard/clients/situation", icon: ShoppingBag, permission: 'clients_view' },
            { name: "Point fidélité", href: "/dashboard/clients/fidelite", icon: Award, permission: 'clients_view' },
        ]
    },
    {
        name: "Fournisseurs",
        icon: Truck,
        hasDropDown: true,
        permission: 'fournisseurs_view',
        subItems: [
            { name: "Liste Fournisseurs", href: "/dashboard/fournisseurs", icon: Truck, permission: 'fournisseurs_view' },
            { name: "Situation fournisseurs", href: "/dashboard/fournisseurs/situation", icon: FileText, permission: 'fournisseurs_view' },
            { name: "Facture fournisseur", href: "/dashboard/fournisseurs/factures", icon: Receipt, permission: 'fournisseurs_view' },
        ]
    },
    { name: "Achats", href: "/dashboard/achats", icon: CircleDollarSign, permission: 'fournisseurs_view' },

    {
        name: "Vente",
        icon: ShoppingCart,
        hasDropDown: true,
        subItems: [
            { name: "Devis", href: "/dashboard/devis", icon: FileText, permission: "devis_view", section: "Vente classique" },
            { name: "Commandes", href: "/dashboard/commandes", icon: FileText, permission: "commandes_view", section: "Vente classique" },
            { name: "Factures", href: "/dashboard/factures", icon: FileText, permission: "factures_view", section: "Vente classique" },
            { name: "Reçus", href: "/dashboard/recus", icon: FileText, permission: "reglements_view", section: "Vente classique" },
            { name: "Avoirs", href: "/dashboard/avoirs", icon: RotateCcw, permission: "avoirs_view", section: "Vente classique" },
            { name: "Remboursement", href: "/dashboard/remboursements", icon: Banknote, permission: "commandes_view", section: "Vente classique" },

            { name: "Devis gros", href: "/dashboard/devis-gros", icon: Scale, permission: "devis_gros_view", section: "Vente au gros" },
            { name: "Commandes gros", href: "/dashboard/commandes-gros", icon: ListOrdered, permission: "commandes_gros_view", section: "Vente au gros" },
            { name: "Factures gros", href: "/dashboard/factures-gros", icon: Receipt, permission: "factures_gros_view", section: "Vente au gros" },
            { name: "Avoirs gros", href: "/dashboard/avoirs-gros", icon: RotateCcw, permission: "avoirs_gros_view", section: "Vente au gros" },
        ]
    },
    {
        name: "Finances",
        icon: CreditCard,
        hasDropDown: true,
        subItems: [
            { name: "Règlements Clients", href: "/dashboard/reglements", icon: FileText, permission: 'reglements_view', section: "Finance classique" },
            { name: "Règlements Fournisseurs", href: "/dashboard/fournisseurs/reglements", icon: Truck, permission: 'fournisseurs_view', section: "Finance classique" },
            { name: "Règlements Clients Gros", href: "/dashboard/reglements-gros", icon: Receipt, permission: 'reglements_view', section: "Finance gros" },
            { name: "Bilan", href: "/dashboard/bilan", icon: FileText, permission: 'bilan_view' },
        ]
    },
    {
        name: "Réseaux Sociaux",
        icon: Send,
        hasDropDown: true,
        subItems: [
            { name: "Posts", href: "/dashboard/autoposts", icon: Send },
            { name: "Promotions", href: "/dashboard/promotions", icon: Megaphone, permission: "settings_view" },
        ],
    },
    { name: "Email Marketing", href: "/dashboard/email-marketing", icon: Mail },
    {
        name: "Trésorerie",
        icon: Banknote,
        hasDropDown: true,
        subItems: [
            { name: "Banque", href: "/dashboard/banque", icon: FileText, permission: 'banque_view' },
            { name: "Caisse", href: "/dashboard/caisse", icon: FileText, permission: 'caisse_view' },
        ]
    },
    {
        name: "Ressources Humaines",
        icon: Users,
        hasDropDown: true,
        subItems: [
            { name: "Employés", href: "/dashboard/employes", icon: FileText, permission: 'employees_view' },
            { name: "Congés", href: "/dashboard/conges", icon: FileText, permission: 'conges_view' },
            { name: "Salaires", href: "/dashboard/salaires", icon: FileText, permission: 'salaries_view' },
            { name: "Paie", href: "/dashboard/paiement", icon: FileText, permission: 'paie_view' },
        ]
    },
    { name: "Tickets", href: "/dashboard/tickets", icon: Ticket, permission: 'tickets_view' },
    { name: "Déclaration Impôt", href: "/dashboard/impots", icon: FileText, permission: 'factures_view' },
    { name: "Journal de connexion", href: "/dashboard/login-journal", icon: FileText, permission: 'login_journal_view' },

    {
        name: "Paramètres",
        icon: Settings,
        hasDropDown: true,
        subItems: [
            { name: "Utilisateurs", href: "/dashboard/users", icon: Users, permission: 'users_view' },
            { name: "Permissions", href: "/dashboard/settings/permissions", icon: Shield, permission: 'settings_view' },
        ]
    },
];

const MIN_WIDTH = 70;
const MAX_WIDTH = 450;
const COLLAPSE_THRESHOLD = 120;

export default function Sidebar({ onNavigate, onToggle }: {
    onNavigate?: () => void;
    onToggle?: () => void;
}) {
    const location = useLocation();
    const navigate = useNavigate();
    const storedRole = localStorage.getItem("role") || "user";
    const roleLower = storedRole.toLowerCase();
    const role = roleLower === "user" ? "Commercial" : (storedRole.charAt(0).toUpperCase() + storedRole.slice(1).toLowerCase());
    const isSuperAdmin = roleLower === "superadmin";
    const userPermissions: string[] = JSON.parse(localStorage.getItem("permissions") || "[]");
    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
    const [pendingTickets, setPendingTickets] = useState<number>(0);
    const [pendingApprovals, setPendingApprovals] = useState<number>(0);
    const [myApprovalRights, setMyApprovalRights] = useState<string[]>([]);
    const [gestionnaireName, setGestionnaireName] = useState<string | null>(null);
    const [gestionnaireLogo, setGestionnaireLogo] = useState<string | null>(null);

    // Width Management
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem("sidebarWidth");
        return saved ? parseInt(saved) : 260;
    });
    const isResizing = useRef(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const isCollapsed = sidebarWidth < COLLAPSE_THRESHOLD;

    const toggleMenu = (name: string) => {
        setOpenMenus(prev => ({ [name]: !prev[name] }));
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        sessionStorage.removeItem("token");
        navigate("/signin");
    };

    // Resize Handlers
    const startResizing = useCallback(() => {
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const stopResizing = useCallback(() => {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
        localStorage.setItem("sidebarWidth", sidebarWidth.toString());
    }, [sidebarWidth]);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing.current) {
            let newWidth = e.clientX;
            if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
            if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;
            setSidebarWidth(newWidth);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    const handleToggle = () => {
        if (isCollapsed) {
            setSidebarWidth(260);
            localStorage.setItem("sidebarWidth", "260");
        } else {
            setSidebarWidth(MIN_WIDTH);
            localStorage.setItem("sidebarWidth", MIN_WIDTH.toString());
        }
        if (onToggle) onToggle();
    };

    // Fetch pending tickets count for admin
    useEffect(() => {
        const fetchPendingTickets = async () => {
            try {
                const token = localStorage.getItem("token");
                const res = await fetch("/api/tickets", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) return;
                const data = await res.json();
                const count = Array.isArray(data)
                    ? data.filter((t: any) => t.statut === "ouvert" || t.statut === "en_cours").length
                    : 0;
                setPendingTickets(count);
            } catch {
                // ignore sidebar errors
            }
        };

        if (roleLower === "admin") {
            fetchPendingTickets();
        }
    }, [roleLower]);

    // Fetch pending approvals count (devis + commandes + factures + avoirs en attente)
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) return;

        const fetchPendingApprovals = async () => {
            try {
                // 1. Fetch rights first if not already fetched
                let rights = myApprovalRights;
                if (rights.length === 0 && roleLower !== "superadmin") {
                    const rightsRes = await fetch("/api/settings/my-approval-rights", {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (rightsRes.ok) {
                        rights = await rightsRes.json();
                        setMyApprovalRights(rights);
                    }
                }

                // If no rights, no permission, and not a management role, total is 0
                const hasApprovalsView = userPermissions.includes('approvals_view');
                if (roleLower !== "admin" && roleLower !== "responsable" && roleLower !== "directeur" && roleLower !== "superadmin" && !hasApprovalsView && rights.length === 0) {
                    setPendingApprovals(0);
                    return;
                }

                const [devisRes, devisGrosRes, cmdRes, cmdGrosRes, facRes, facGrosRes, avRes, avGrosRes, invRes, achatsRes, regCliRes, regCliGrosRes, regFourRes, rembRes] = await Promise.all([
                    fetch("/api/devis", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/devis-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/commandes", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/commandes-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/factures", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/factures-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/avoirs", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/avoirs-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/inventory-verifications", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/achats-fournisseurs", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/reglements-clients", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/reglements-clients-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/reglements-fournisseurs", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/remboursements", { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                let total = 0;

                const canApproveEverything = roleLower === "superadmin" || roleLower === "admin";

                const canSeeInventory = canApproveEverything || rights.includes('inventaire');
                const canSeeAchats = canApproveEverything || rights.includes('achats_fournisseurs');
                const canSeeReglements = canApproveEverything || rights.includes('reglements');
                const canSeeRemboursements = canApproveEverything || rights.includes('remboursements');

                if (devisRes.ok && (canApproveEverything || rights.includes('devis'))) {
                    const data = await devisRes.json();
                    total += Array.isArray(data) ? data.filter((d: any) => d.statuts_devis === "en attente").length : 0;
                }
                if (devisGrosRes.ok && (canApproveEverything || rights.includes('devis'))) {
                    const data = await devisGrosRes.json();
                    total += Array.isArray(data) ? data.filter((d: any) => d.statuts_devis === "en attente").length : 0;
                }
                if (cmdRes.ok && (canApproveEverything || rights.includes('commande'))) {
                    const data = await cmdRes.json();
                    total += Array.isArray(data) ? data.filter((c: any) => c.statut === "en_attente").length : 0;
                }
                if (cmdGrosRes.ok && (canApproveEverything || rights.includes('commande'))) {
                    const data = await cmdGrosRes.json();
                    total += Array.isArray(data) ? data.filter((c: any) => c.statut === "en_attente").length : 0;
                }
                if (facRes.ok && (canApproveEverything || rights.includes('facture'))) {
                    const data = await facRes.json();
                    total += Array.isArray(data) ? data.filter((f: any) => f.statut === "en_attente").length : 0;
                }
                if (facGrosRes.ok && (canApproveEverything || rights.includes('facture'))) {
                    const data = await facGrosRes.json();
                    total += Array.isArray(data) ? data.filter((f: any) => f.statut === "en_attente").length : 0;
                }
                if (avRes.ok && (canApproveEverything || rights.includes('avoir'))) {
                    const data = await avRes.json();
                    total += Array.isArray(data) ? data.filter((a: any) => a.statut === "en_attente").length : 0;
                }
                if (avGrosRes.ok && (canApproveEverything || rights.includes('avoir'))) {
                    const data = await avGrosRes.json();
                    total += Array.isArray(data) ? data.filter((a: any) => a.statut === "en_attente").length : 0;
                }
                if (invRes.ok && canSeeInventory) {
                    const data = await invRes.json();
                    total += Array.isArray(data) ? data.length : 0;
                }
                if (achatsRes.ok && canSeeAchats) {
                    const data = await achatsRes.json();
                    total += Array.isArray(data) ? data.filter((a: any) => !a.statut || a.statut === "en_attente").length : 0;
                }
                if (regCliRes.ok && canSeeReglements) {
                    const data = await regCliRes.json();
                    total += Array.isArray(data) ? data.filter((r: any) => r.statut === "en_attente").length : 0;
                }
                if (regCliGrosRes.ok && canSeeReglements) {
                    const data = await regCliGrosRes.json();
                    total += Array.isArray(data) ? data.filter((r: any) => r.statut === "en_attente").length : 0;
                }
                if (regFourRes.ok && canSeeReglements) {
                    const data = await regFourRes.json();
                    total += Array.isArray(data) ? data.filter((r: any) => r.statut === "en_attente").length : 0;
                }
                if (rembRes.ok && canSeeRemboursements) {
                    const data = await rembRes.json();
                    total += Array.isArray(data) ? data.filter((r: any) => r.statut === "en_attente").length : 0;
                }
                setPendingApprovals(total);
            } catch {
                // ignore
            }
        };

        fetchPendingApprovals();

        const listener = () => {
            fetchPendingApprovals();
        };
        window.addEventListener("approvals-updated", listener as EventListener);
        return () => {
            window.removeEventListener("approvals-updated", listener as EventListener);
        };
    }, [roleLower]);

    // Fetch company (gestionnaire) info for logo + name in sidebar header
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) return;

        const fetchGestionnaire = async () => {
            try {
                const res = await fetch("/api/gestionnaires", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    setGestionnaireName(data[0].nom || null);
                    setGestionnaireLogo(data[0].logo || null);
                }
            } catch {
                // ignore sidebar logo errors
            }
        };

        fetchGestionnaire();
    }, []);

    // Dynamic Icon Scaling Factor
    const iconScale = Math.min(1.2, Math.max(0.8, sidebarWidth / 260));

    return (
        <div
            ref={sidebarRef}
            className={cn(
                "flex h-full flex-col bg-sidebar text-sidebar-foreground shadow-2xl border-r border-sidebar-border transition-shadow duration-300 relative group/sidebar",
                isCollapsed ? "items-center" : ""
            )}
            style={{ width: `${sidebarWidth}px`, transition: isResizing.current ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
            {/* Resize Handle */}
            <div
                onMouseDown={startResizing}
                className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/30 active:bg-indigo-500 transition-colors z-50 group-hover/sidebar:opacity-100 opacity-0"
            />

            {/* HEADER - LOGO + BRAND */}
            <div
                className={cn(
                    "relative border-b border-sidebar-border/70 bg-sidebar px-4",
                    isCollapsed ? "h-20 flex items-center justify-center" : "h-[88px] flex items-center justify-between"
                )}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className={cn(
                            "relative flex items-center justify-center rounded-full overflow-hidden shrink-0 transition-all duration-300",
                            isCollapsed ? "h-10 w-10" : "h-11 w-11"
                        )}
                    >
                        <img
                            src={gestionnaireLogo ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${gestionnaireLogo}` : SousLogoAurevox}
                            alt={gestionnaireName || "Logo"}
                            className="h-full w-full object-cover"
                        />
                    </div>

                    {!isCollapsed && (
                        <div className="flex flex-col min-w-0 animate-in fade-in duration-300">
                            <span className="text-[15px] font-semibold text-sidebar-foreground truncate leading-tight">
                                {gestionnaireName || "Aurevox"}
                            </span>
                            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/65">
                                <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                {role}
                            </span>
                        </div>
                    )}
                </div>

                {!isCollapsed && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleToggle}
                        className="h-8 w-8 rounded-full border border-sidebar-border/60 text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/70 transition-all"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                )}

                {isCollapsed && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleToggle}
                        className="absolute -bottom-2 h-7 w-7 rounded-full border border-sidebar-border/80 bg-sidebar-accent/90 shadow-md text-sidebar-foreground/70 hover:text-indigo-600 transition-all"
                    >
                        <ChevronRight className="h-3 w-3" />
                    </Button>
                )}
            </div>

            {/* MENU */}
            <div className="flex-1 overflow-y-auto py-6 px-3 custom-scrollbar">
                {!isCollapsed && sidebarWidth > 180 && (
                    <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 animate-in fade-in">
                        Navigation
                    </div>
                )}

                <nav className="space-y-1">
                    {sidebarItems
                        .filter(item => {
                            // Super administrateur : accès seulement à ces 3 entrées
                            if (isSuperAdmin) {
                                return ["Point de Vente", "Clients", "Journal de connexion"].includes(item.name);
                            }
                            if (item.hasDropDown) {
                                // Check if any sub-item is allowed
                                return item.subItems?.some(sub =>
                                    !sub.permission || userPermissions.includes(sub.permission)
                                );
                            }
                            if (item.name === "Centre d'approbation") {
                                // Superadmin: always show
                                if (isSuperAdmin) return true;
                                // Admin, directeur, responsable: always show
                                if (roleLower === "admin" || roleLower === "directeur" || roleLower === "responsable") return true;
                                // Check for explicit permission in RBAC table
                                if (userPermissions.includes('approvals_view')) return true;
                                // Otherwise check if they have specific approval rights (e.g., from approval_configs)
                                return myApprovalRights && myApprovalRights.length > 0;
                            }
                            if (item.name === "Journal de connexion" && roleLower === "admin") {
                                return true;
                            }
                            return !item.permission || userPermissions.includes(item.permission);
                        })
                        .map((item) => {
                            const hasSubItems = item.hasDropDown && item.subItems;
                            const isMenuOpen = openMenus[item.name];

                            const filteredSubItems = item.subItems?.filter(sub => {
                                // Super administrateur : voit tous les sous-menus pour "Clients"
                                if (isSuperAdmin && item.name === "Clients") return true;
                                return !sub.permission || userPermissions.includes(sub.permission);
                            });

                            if (hasSubItems) {
                                if (!filteredSubItems || filteredSubItems.length === 0) return null;
                                return (
                                    <div key={item.name} className="space-y-1">
                                        <button
                                            onClick={() => {
                                                const firstSub = filteredSubItems && filteredSubItems[0];
                                                if (isCollapsed && firstSub?.href) {
                                                    navigate(firstSub.href);
                                                    if (onNavigate) onNavigate();
                                                } else {
                                                    toggleMenu(item.name);
                                                }
                                            }}
                                            className={cn(
                                                "w-full group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                                isCollapsed ? "justify-center px-1" : "justify-between"
                                            )}
                                        >
                                            <div className="flex items-center">
                                                <item.icon
                                                    className={cn(
                                                        "h-5 w-5 transition-all duration-200 text-sidebar-foreground/60 group-hover:text-sidebar-foreground group-hover:scale-110",
                                                        isCollapsed ? "" : "mr-3"
                                                    )}
                                                    style={{ transform: `scale(${iconScale})` }}
                                                />
                                                {!isCollapsed && sidebarWidth > 140 && <span className="truncate">{item.name}</span>}
                                            </div>
                                            {!isCollapsed && sidebarWidth > 200 && (
                                                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isMenuOpen ? "rotate-180" : "")} />
                                            )}
                                        </button>

                                        {isMenuOpen && !isCollapsed && sidebarWidth > 160 && (
                                            <div className="ml-4 pl-4 border-l border-sidebar-border space-y-1 animate-in slide-in-from-top-2 duration-200">
                                                {filteredSubItems?.map((sub, subIdx) => {
                                                    const prevSub = subIdx > 0 ? filteredSubItems[subIdx - 1] : null;
                                                    const showSection =
                                                        sub.section &&
                                                        (!prevSub || prevSub.section !== sub.section);
                                                    const isSubActive =
                                                        location.pathname === sub.href ||
                                                        (sub.href !== "/dashboard" &&
                                                            location.pathname.startsWith(sub.href + "/"));
                                                    return (
                                                        <div key={sub.href} className="space-y-1">
                                                            {showSection && (
                                                                <div
                                                                    className={cn(
                                                                        "px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45",
                                                                        subIdx === 0 && "pt-0"
                                                                    )}
                                                                >
                                                                    {sub.section}
                                                                </div>
                                                            )}
                                                            <Link
                                                                to={sub.href}
                                                                onClick={onNavigate}
                                                                className={cn(
                                                                    "group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                                                                    isSubActive
                                                                        ? "bg-[#14322D]/10 text-[#14322D] font-semibold"
                                                                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                                                                )}
                                                            >
                                                                <sub.icon
                                                                    className={cn(
                                                                        "h-4 w-4 mr-2.5",
                                                                        isSubActive
                                                                            ? "text-[#14322D]"
                                                                            : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60"
                                                                    )}
                                                                />
                                                                {sidebarWidth > 180 && (
                                                                    <span className="truncate">{sub.name}</span>
                                                                )}
                                                            </Link>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            const isActive = location.pathname === item.href;

                            return (
                                <Link
                                    key={item.name}
                                    to={item.href || "#"}
                                    onClick={onNavigate}
                                    className={cn(
                                        "group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                        isCollapsed ? "justify-center px-1" : "",
                                        isActive
                                            ? "bg-[#14322D] text-white shadow-md"
                                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                    )}
                                    title={isCollapsed ? item.name : undefined}
                                >
                                    <div className={cn("relative flex items-center", isCollapsed ? "" : "mr-3")}>
                                        <item.icon
                                            className={cn(
                                                "h-5 w-5 transition-all duration-200",
                                                isActive
                                                    ? "text-white"
                                                    : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground group-hover:scale-110"
                                            )}
                                            style={{ transform: `scale(${iconScale})` }}
                                        />
                                        {item.name === "Support" && pendingTickets > 0 && (
                                            <span className="absolute -top-1 -right-2 min-h-[16px] min-w-[16px] px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                                                {pendingTickets > 9 ? "9+" : pendingTickets}
                                            </span>
                                        )}
                                        {item.name === "Centre d'approbation" && pendingApprovals > 0 && (
                                            <span className="absolute -top-1 -right-2 min-h-[16px] min-w-[16px] px-1 rounded-full bg-amber-500 text-[9px] font-bold text-white flex items-center justify-center">
                                                {pendingApprovals > 9 ? "9+" : pendingApprovals}
                                            </span>
                                        )}
                                    </div>
                                    {!isCollapsed && sidebarWidth > 140 && (
                                        <span className="truncate">
                                            {item.name}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                </nav>
            </div>

            <Button
                variant="ghost"
                className={cn(
                    "w-full cursor-pointer py-8 justify-start text-sidebar-foreground/70 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200",
                    isCollapsed ? "justify-center px-1" : ""
                )}
                onClick={handleLogout}
                title={isCollapsed ? "Déconnexion" : undefined}
            >
                <LogOut
                    className={cn("h-5 w-5", isCollapsed ? "" : "mr-3")}
                    style={{ transform: `scale(${iconScale})` }}
                />
                {!isCollapsed && sidebarWidth > 140 && "Déconnexion"}
            </Button>
        </div>
    );
}
