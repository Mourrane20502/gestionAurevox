import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { exportToExcel } from "@/utils/exportExcel";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/common/ui/tabs";
import {
    Package,
    Plus,
    Search,
    ShoppingCart,
    Calendar,
    Store,
    FileText,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    CheckCircle2,
    ArrowUpRight,
    BarChart3,
    Filter,
    FileSpreadsheet,
    User,
    Clock,
    XCircle,
    DollarSign,
    MoreVertical,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { matchesSousSocieteListFilter } from "@/utils/sousSocieteListFilter";
import { ViewSvgIcon } from "@/components/icons/actionSvgIcons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type BonLivraisonRow = {
    id: number;
    user_id?: number | null;
    numero_bon_livraison?: string;
    date_bon_livraison?: string;
    commande_id?: number;
    numero_commande?: string;
    client_nom?: string;
    user_nom?: string;
    point_de_vente_nom?: string;
    sous_societe_nom?: string | null;
    statut?: string;
    montant_ttc?: number;
};

type CommandeOption = {
    id: number;
    numero_commande: string;
    client_nom?: string;
    bon_livraison_id?: number | null;
};

type CommandeItemPreview = {
    id?: number;
    designation?: string;
    quantite?: number;
    prix_unitaire?: number;
    tva?: number;
    reduction?: number;
    montant_ht?: number;
};

type CommandeDetailsPreview = {
    id: number;
    numero_commande?: string;
    date_commande?: string;
    statut?: string;
    client_nom?: string;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    reduction?: number;
    point_de_vente_nom?: string;
    sous_societe_nom?: string;
    items?: CommandeItemPreview[];
};

const fmtMoney = (v: number | string | null | undefined) =>
    Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rawStatut = (s: string | null | undefined) => String(s || "").toLowerCase().trim();

const isAnnule = (s: string | null | undefined) => {
    const r = rawStatut(s);
    return r === "annulé" || r === "annulée" || r === "annulee" || r === "annule";
};

const isLivree = (s: string | null | undefined) => {
    const r = rawStatut(s);
    return r === "livré" || r === "livree" || r === "livre" || r === "validee" || r === "validée";
};

/** En attente d’approbation ou brouillon (hors livré et annulé). */
const isBlPending = (s: string | null | undefined) => {
    if (isLivree(s) || isAnnule(s)) return false;
    const r = rawStatut(s).replace(/\s+/g, "_");
    return r === "en_attente" || r === "brouillon" || r === "";
};

const getBlStatusBadge = (statut?: string) => {
    if (isLivree(statut)) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Livré
            </span>
        );
    }
    if (isAnnule(statut)) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <XCircle className="h-3 w-3" /> Annulé
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            <Clock className="h-3 w-3" /> En attente
        </span>
    );
};

const blStatusLabel = (statut?: string) => {
    if (isLivree(statut)) return "Livré";
    if (isAnnule(statut)) return "Annulé";
    return "En attente";
};

const years = Array.from({ length: 6 }, (_, i) => (new Date().getFullYear() - i).toString());
const months = [
    { val: "1", label: "Janvier" },
    { val: "2", label: "Février" },
    { val: "3", label: "Mars" },
    { val: "4", label: "Avril" },
    { val: "5", label: "Mai" },
    { val: "6", label: "Juin" },
    { val: "7", label: "Juillet" },
    { val: "8", label: "Août" },
    { val: "9", label: "Septembre" },
    { val: "10", label: "Octobre" },
    { val: "11", label: "Novembre" },
    { val: "12", label: "Décembre" },
];

export default function BonsLivraison() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [activeTab, setActiveTab] = useState("list");
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<BonLivraisonRow[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [filterMonth, setFilterMonth] = useState("all");
    const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterUser, setFilterUser] = useState("all");
    const [filterSousSociete, setFilterSousSociete] = useState("all");
    const [filterPointDeVente, setFilterPointDeVente] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [users, setUsers] = useState<{ id: number; username?: string; nom?: string }[]>([]);
    const [allSousSocieteNames, setAllSousSocieteNames] = useState<string[]>([]);
    const [showReportDialog, setShowReportDialog] = useState(false);

    const [commandesForCreate, setCommandesForCreate] = useState<CommandeOption[]>([]);
    const [loadingCommandes, setLoadingCommandes] = useState(false);
    const [commandeSearch, setCommandeSearch] = useState("");
    const [showCommandeDropdown, setShowCommandeDropdown] = useState(false);
    const [selectedCommande, setSelectedCommande] = useState<CommandeOption | null>(null);
    const [commandeDetails, setCommandeDetails] = useState<CommandeDetailsPreview | null>(null);
    const [loadingCommandeDetails, setLoadingCommandeDetails] = useState(false);
    const [creating, setCreating] = useState(false);

    const loadBons = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/bons-livraison", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Impossible de charger les bons de livraison.");
            const data = await res.json();
            setRows(Array.isArray(data) ? data : []);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Erreur");
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadBons();
    }, [loadBons]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await fetch("/api/users/all-users", { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) return;
                const data = await res.json();
                setUsers(data.users || []);
            } catch {
                /* silencieux */
            }
        };
        const fetchSousSocietes = async () => {
            try {
                const res = await fetch("/api/settings/sous-societes", { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) return;
                const data = await res.json();
                const names = Array.isArray(data)
                    ? data.map((row: { nom_sous_societe?: string }) => String(row?.nom_sous_societe || "").trim()).filter(Boolean)
                    : [];
                setAllSousSocieteNames(names);
            } catch {
                /* silencieux */
            }
        };
        fetchUsers();
        fetchSousSocietes();
    }, [token]);

    const loadCommandesForCreate = useCallback(async () => {
        setLoadingCommandes(true);
        try {
            const res = await fetch("/api/commandes", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error();
            const data = await res.json();
            const list = (Array.isArray(data) ? data : []).map(
                (c: { id: number; numero_commande?: string; client_nom?: string; bon_livraison_id?: number | null }) => ({
                    id: Number(c.id),
                    numero_commande: String(c.numero_commande || ""),
                    client_nom: c.client_nom,
                    bon_livraison_id:
                        c.bon_livraison_id != null && Number(c.bon_livraison_id) > 0 ? Number(c.bon_livraison_id) : null,
                })
            );
            // Éligible BL = commande sans bon de livraison actif déjà rattaché.
            setCommandesForCreate(
                list.filter(
                    (c) =>
                        Number.isFinite(c.id) &&
                        c.id > 0 &&
                        (c.bon_livraison_id == null || Number(c.bon_livraison_id) <= 0)
                )
            );
        } catch {
            toast.error("Impossible de charger les commandes.");
            setCommandesForCreate([]);
        } finally {
            setLoadingCommandes(false);
        }
    }, [token]);

    useEffect(() => {
        if (activeTab === "form") {
            loadCommandesForCreate();
            setCommandeSearch("");
            setSelectedCommande(null);
            setCommandeDetails(null);
        }
    }, [activeTab, loadCommandesForCreate]);

    useEffect(() => {
        if (!selectedCommande?.id) {
            setCommandeDetails(null);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoadingCommandeDetails(true);
            try {
                const res = await fetch(`/api/commandes/${selectedCommande.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("fetch");
                const data = (await res.json()) as CommandeDetailsPreview;
                if (!cancelled) setCommandeDetails(data);
            } catch {
                if (!cancelled) {
                    toast.error("Impossible de charger le détail de la commande.");
                    setCommandeDetails(null);
                }
            } finally {
                if (!cancelled) setLoadingCommandeDetails(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedCommande?.id, token]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterMonth, filterYear, filterStatus, filterUser, filterSousSociete, filterPointDeVente]);

    const pointDeVenteOptions = useMemo(
        () =>
            Array.from(
                new Set(rows.map((r) => String(r.point_de_vente_nom || "").trim()).filter(Boolean))
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [rows]
    );

    const filteredRows = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return rows.filter((r) => {
            if (q) {
                const ok =
                    String(r.numero_bon_livraison || "").toLowerCase().includes(q) ||
                    String(r.numero_commande || "").toLowerCase().includes(q) ||
                    String(r.client_nom || "").toLowerCase().includes(q);
                if (!ok) return false;
            }
            if (filterStatus === "livree" && !isLivree(r.statut)) return false;
            if (filterStatus === "en_attente" && !isBlPending(r.statut)) return false;
            if (filterStatus === "annule" && !isAnnule(r.statut)) return false;

            if (filterUser !== "all" && String(r.user_id ?? "") !== filterUser) return false;

            if (
                !matchesSousSocieteListFilter(filterSousSociete, r.sous_societe_nom, r.numero_bon_livraison)
            ) {
                return false;
            }

            if (filterPointDeVente !== "all") {
                const nom = String(r.point_de_vente_nom || "").trim().toLowerCase();
                if (nom !== filterPointDeVente.toLowerCase()) return false;
            }

            const d = r.date_bon_livraison ? new Date(String(r.date_bon_livraison).slice(0, 10)) : null;
            if (filterYear !== "all" && d && !Number.isNaN(d.getTime())) {
                if (String(d.getFullYear()) !== filterYear) return false;
            }
            if (filterMonth !== "all" && d && !Number.isNaN(d.getTime())) {
                if (String(d.getMonth() + 1) !== filterMonth) return false;
            }

            return true;
        });
    }, [rows, searchTerm, filterMonth, filterYear, filterStatus, filterUser, filterSousSociete, filterPointDeVente]);

    const reportData = useMemo(
        () => ({
            totalTTC: filteredRows.reduce((acc, r) => acc + (Number(r.montant_ttc) || 0), 0),
            pending: filteredRows.filter((r) => isBlPending(r.statut)).length,
            livree: filteredRows.filter((r) => isLivree(r.statut)).length,
            annule: filteredRows.filter((r) => isAnnule(r.statut)).length,
        }),
        [filteredRows]
    );

    const stats = useMemo(
        () => ({
            total: rows.length,
            pending: rows.filter((r) => isBlPending(r.statut)).length,
            livree: rows.filter((r) => isLivree(r.statut)).length,
            annule: rows.filter((r) => isAnnule(r.statut)).length,
        }),
        [rows]
    );

    const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;
    const paginatedRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const filteredCommandesPick = useMemo(() => {
        const q = commandeSearch.trim().toLowerCase();
        if (!q) return commandesForCreate;
        return commandesForCreate.filter(
            (c) =>
                String(c.numero_commande || "").toLowerCase().includes(q) ||
                String(c.client_nom || "").toLowerCase().includes(q)
        );
    }, [commandesForCreate, commandeSearch]);

    const handleCreate = async () => {
        if (!selectedCommande) {
            toast.error("Choisissez une commande.");
            return;
        }
        setCreating(true);
        try {
            const res = await fetch(`/api/bons-livraison/from-commande/${selectedCommande.id}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 400 && data?.id) {
                toast.message(data.message || "BL déjà existant", { description: "Ouverture du bon existant." });
                navigate(`/dashboard/bons-livraison/${data.id}`);
                return;
            }
            if (!res.ok) throw new Error(data.message || "Création impossible.");
            toast.success("Bon de livraison créé");
            await loadBons();
            setActiveTab("list");
            if (data.id) navigate(`/dashboard/bons-livraison/${data.id}`);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Erreur");
        } finally {
            setCreating(false);
        }
    };

    const exportToXLS = () => {
        const headers = ["N° BL", "Date", "Commande", "Client", "Montant TTC", "Statut", "Utilisateur", "PDV", "Société"];
        const rows = filteredRows.map((r) => [
            r.numero_bon_livraison ?? "",
            r.date_bon_livraison ? String(r.date_bon_livraison).slice(0, 10) : "",
            r.numero_commande ?? "",
            r.client_nom ?? "",
            Number(r.montant_ttc) || 0,
            blStatusLabel(r.statut),
            r.user_nom ?? "",
            r.point_de_vente_nom ?? "",
            r.sous_societe_nom ?? "",
        ]);
        exportToExcel({
            headers,
            rows,
            fileName: `bons_livraison_${new Date().toISOString().slice(0, 10)}`,
            sheetName: "Bons de livraison",
        });
        toast.success("Export Excel généré");
    };

    const exportToPDF = () => {
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(14);
        doc.text("Bons de livraison", 14, 16);
        autoTable(doc, {
            startY: 22,
            head: [["N° BL", "Date", "Commande", "Client", "TTC", "Statut", "Utilisateur", "PDV"]],
            body: filteredRows.map((r) => [
                r.numero_bon_livraison || "—",
                r.date_bon_livraison ? String(r.date_bon_livraison).slice(0, 10) : "—",
                r.numero_commande || "—",
                r.client_nom || "—",
                `${fmtMoney(r.montant_ttc)} DH`,
                blStatusLabel(r.statut),
                r.user_nom || "—",
                r.point_de_vente_nom || "—",
            ]),
            styles: { fontSize: 8 },
            headStyles: { fillColor: [79, 70, 229] },
        });
        doc.save(`bons_livraison_${new Date().toISOString().slice(0, 10)}.pdf`);
        toast.success("PDF généré");
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Package className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Bons de livraison
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Historique possible : un BL annulé ne bloque pas une nouvelle création pour la même commande.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    {
                        label: "Total BL",
                        val: stats.total,
                        icon: Package,
                        color: "text-indigo-600 dark:text-indigo-400",
                        bg: "bg-indigo-50 dark:bg-indigo-900/20",
                    },
                    {
                        label: "Montant TTC (filtré)",
                        val: `${reportData.totalTTC.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`,
                        icon: DollarSign,
                        color: "text-emerald-600 dark:text-emerald-400",
                        bg: "bg-emerald-50 dark:bg-emerald-900/20",
                    },
                    {
                        label: "En attente",
                        val: stats.pending,
                        icon: Clock,
                        color: "text-amber-500",
                        bg: "bg-amber-50 dark:bg-amber-900/20",
                    },
                    {
                        label: "Livrés",
                        val: stats.livree,
                        icon: CheckCircle2,
                        color: "text-emerald-600 dark:text-emerald-400",
                        bg: "bg-emerald-50 dark:bg-emerald-900/20",
                    },
                    {
                        label: "Annulés",
                        val: stats.annule,
                        icon: XCircle,
                        color: "text-slate-600 dark:text-slate-400",
                        bg: "bg-slate-100 dark:bg-slate-800/40",
                    },
                ].map((s, idx) => (
                    <div key={idx} className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", s.bg, s.color)}>
                            <s.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{s.label}</p>
                            <p className="text-xl font-bold text-foreground truncate">{s.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger
                        value="list"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        Liste des bons de livraison
                    </TabsTrigger>
                    <TabsTrigger
                        value="form"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        Nouveau bon de livraison
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-wrap justify-between items-center gap-4 backdrop-blur-sm">
                            <div className="relative w-full max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="N° BL, commande ou client…"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-11 border-transparent bg-muted focus:bg-card focus:border-indigo-500 border rounded-xl"
                                />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "h-11 px-4 rounded-xl gap-2",
                                        showFilters && "bg-indigo-50 border-indigo-200 text-indigo-600"
                                    )}
                                    onClick={() => setShowFilters(!showFilters)}
                                >
                                    <Filter className="h-4 w-4" />
                                    Filtres
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 px-4 rounded-xl gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-all"
                                    onClick={exportToXLS}
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    <span className="hidden sm:inline">Excel</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 px-4 rounded-xl gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all"
                                    onClick={exportToPDF}
                                >
                                    <FileText className="h-4 w-4" />
                                    <span className="hidden sm:inline">PDF</span>
                                </Button>
                                <Button
                                    className="h-11 px-6 rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 dark:shadow-none transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    onClick={() => setShowReportDialog(true)}
                                >
                                    <BarChart3 className="h-4 w-4" />
                                    Rapport
                                </Button>
                            </div>
                        </div>

                        {showFilters && (
                            <div className="bg-muted/30 p-4 rounded-[1.5rem] border border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Mois</Label>
                                    <Select value={filterMonth} onValueChange={setFilterMonth}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous les mois" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les mois</SelectItem>
                                            {months.map((m) => (
                                                <SelectItem key={m.val} value={m.val}>
                                                    {m.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Année</Label>
                                    <Select value={filterYear} onValueChange={setFilterYear}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Toutes" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Toutes les années</SelectItem>
                                            {years.map((y) => (
                                                <SelectItem key={y} value={y}>
                                                    {y}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Statut BL</Label>
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les statuts</SelectItem>
                                            <SelectItem value="en_attente">En attente</SelectItem>
                                            <SelectItem value="livree">Livré</SelectItem>
                                            <SelectItem value="annule">Annulé</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Utilisateur</Label>
                                    <Select value={filterUser} onValueChange={setFilterUser}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les utilisateurs</SelectItem>
                                            {users.map((u) => (
                                                <SelectItem key={u.id} value={String(u.id)}>
                                                    {u.username || u.nom || "Utilisateur"}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Société</Label>
                                    <Select value={filterSousSociete} onValueChange={setFilterSousSociete}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Toutes" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Toutes les sociétés</SelectItem>
                                            {allSousSocieteNames.map((name) => (
                                                <SelectItem key={name} value={name}>
                                                    {name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Point de vente</Label>
                                    <Select value={filterPointDeVente} onValueChange={setFilterPointDeVente}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous les PDV" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les points de vente</SelectItem>
                                            {pointDeVenteOptions.map((name) => (
                                                <SelectItem key={name} value={name.toLowerCase()}>
                                                    {name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 border-b border-border">
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 px-6">N° BL</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Commande</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Client</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right">TTC</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-center">Date</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-center">Statut</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Utilisateur</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right px-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i} className="animate-pulse border-b border-border">
                                                <TableCell colSpan={8} className="h-14 bg-muted/20" />
                                            </TableRow>
                                        ))
                                    ) : filteredRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-20">
                                                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                                                <p className="text-muted-foreground font-medium">Aucun bon de livraison</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedRows.map((r) => (
                                            <TableRow
                                                key={r.id}
                                                className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0 text-sm"
                                            >
                                                <TableCell className="px-6 py-4">
                                                    <div className="flex items-center gap-1">
                                                        <Link
                                                            to={`/dashboard/bons-livraison/${r.id}`}
                                                            className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                        >
                                                            {r.numero_bon_livraison || "—"}
                                                        </Link>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 text-muted-foreground hover:text-indigo-600"
                                                            onClick={() => window.open(`/dashboard/bons-livraison/${r.id}`, "_blank", "noopener")}
                                                            title="Ouvrir dans un nouvel onglet"
                                                        >
                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground mt-1">
                                                        <span className="font-medium">Société :</span>{" "}
                                                        {String(r.sous_societe_nom || "").trim() || "—"}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="font-semibold">
                                                    {r.commande_id ? (
                                                        <Link
                                                            className="text-indigo-600 hover:underline"
                                                            to={`/dashboard/commandes/${r.commande_id}`}
                                                        >
                                                            {r.numero_commande || `#${r.commande_id}`}
                                                        </Link>
                                                    ) : (
                                                        "—"
                                                    )}
                                                    <p className="text-[11px] text-muted-foreground font-normal mt-0.5">
                                                        PDV : {r.point_de_vente_nom || "—"}
                                                    </p>
                                                </TableCell>
                                                <TableCell>{r.client_nom || "—"}</TableCell>
                                                <TableCell className="text-right font-bold tabular-nums">
                                                    {fmtMoney(r.montant_ttc)} DH
                                                </TableCell>
                                                <TableCell className="text-center text-muted-foreground">
                                                    {r.date_bon_livraison
                                                        ? new Date(String(r.date_bon_livraison).slice(0, 10)).toLocaleDateString("fr-FR")
                                                        : "—"}
                                                </TableCell>
                                                <TableCell className="text-center">{getBlStatusBadge(r.statut)}</TableCell>
                                                <TableCell>
                                                    {r.user_nom ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <User className="h-3 w-3" />
                                                            <span className="font-medium text-foreground">{r.user_nom}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-6 py-4 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                                                aria-label="Actions"
                                                            >
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-56">
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link to={`/dashboard/bons-livraison/${r.id}`}>
                                                                    <ViewSvgIcon className="h-4 w-4" />
                                                                    Voir le détail
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            {r.commande_id ? (
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link to={`/dashboard/commandes/${r.commande_id}`}>
                                                                        <ArrowUpRight className="h-4 w-4" />
                                                                        Voir la commande
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            ) : null}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-2 py-4 bg-card border border-border rounded-2xl shadow-sm">
                                <div className="text-xs text-muted-foreground font-medium hidden sm:block">
                                    <span className="text-foreground font-bold">{(currentPage - 1) * itemsPerPage + 1}</span>-
                                    <span className="text-foreground font-bold">
                                        {Math.min(currentPage * itemsPerPage, filteredRows.length)}
                                    </span>{" "}
                                    sur<span className="text-foreground font-bold"> {filteredRows.length}</span>
                                </div>
                                <div className="flex items-center gap-1 sm:gap-2 ml-auto sm:ml-0">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronsLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <div className="flex items-center gap-1 mx-1">
                                        {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                                            let pageNum: number;
                                            if (totalPages <= 3) pageNum = i + 1;
                                            else if (currentPage <= 2) pageNum = i + 1;
                                            else if (currentPage >= totalPages - 1) pageNum = totalPages - 2 + i;
                                            else pageNum = currentPage - 1 + i;
                                            return (
                                                <Button
                                                    key={pageNum}
                                                    variant={currentPage === pageNum ? "default" : "outline"}
                                                    size="icon"
                                                    className={cn(
                                                        "h-8 w-8 text-xs",
                                                        currentPage === pageNum &&
                                                            "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md font-bold"
                                                    )}
                                                    onClick={() => setCurrentPage(pageNum)}
                                                >
                                                    {pageNum}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                    >
                                        <ChevronsRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="form">
                    <Card className="border border-border shadow-2xl bg-card animate-in fade-in zoom-in-95 duration-300 overflow-visible">
                        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-t-2xl" />
                        <CardHeader className="pb-4">
                            <CardTitle className="text-xl flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                                    <Plus className="h-5 w-5" />
                                </div>
                                Création d&apos;un bon de livraison
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            <div className="space-y-8 max-w-5xl">
                                <p className="text-sm text-muted-foreground">
                                    Sélectionnez une commande sans bon de livraison existant. Les lignes et montants seront copiés depuis la
                                    commande.
                                </p>
                                <div className="space-y-1.5 relative">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Commande</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            value={commandeSearch}
                                            onChange={(e) => {
                                                setCommandeSearch(e.target.value);
                                                setShowCommandeDropdown(true);
                                                if (!e.target.value.trim()) {
                                                    setSelectedCommande(null);
                                                    setCommandeDetails(null);
                                                }
                                            }}
                                            onFocus={() => setShowCommandeDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowCommandeDropdown(false), 200)}
                                            placeholder={loadingCommandes ? "Chargement…" : "Rechercher par n° ou client…"}
                                            disabled={loadingCommandes}
                                            className={cn(
                                                "h-11 pl-10 border-border",
                                                selectedCommande && "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-900/10"
                                            )}
                                        />
                                        {selectedCommande && (
                                            <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-indigo-500" />
                                        )}
                                    </div>
                                    {showCommandeDropdown && !loadingCommandes && (
                                        <div className="absolute z-50 w-full max-w-2xl mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                            {filteredCommandesPick.length === 0 ? (
                                                <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                                                    Aucune commande éligible (déjà un BL ou aucune donnée).
                                                </div>
                                            ) : (
                                                filteredCommandesPick.map((c) => (
                                                    <div
                                                        key={c.id}
                                                        onMouseDown={() => {
                                                            setSelectedCommande(c);
                                                            setCommandeSearch(`${c.numero_commande} — ${c.client_nom || "Client"}`);
                                                            setShowCommandeDropdown(false);
                                                        }}
                                                        className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group border-b border-border last:border-0"
                                                    >
                                                        <span>
                                                            <span className="font-bold text-indigo-600">{c.numero_commande}</span>{" "}
                                                            <span className="text-muted-foreground">— {c.client_nom || "—"}</span>
                                                        </span>
                                                        <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-indigo-500" />
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

                                {selectedCommande && (
                                    <Card className="border border-border shadow-md rounded-2xl overflow-hidden bg-card">
                                        <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />
                                        <CardHeader className="pb-2 pt-5 px-6 border-b border-border/80 bg-muted/20">
                                            <CardTitle className="text-base flex items-center gap-2 font-bold tracking-tight">
                                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                                                    <ShoppingCart className="h-5 w-5" />
                                                </div>
                                                <span>Aperçu de la commande importée</span>
                                            </CardTitle>
                                            <p className="text-xs text-muted-foreground pl-11 -mt-1">
                                                Ces informations seront reprises sur le bon de livraison.
                                            </p>
                                        </CardHeader>
                                        <CardContent className="p-6 space-y-6">
                                        {loadingCommandeDetails ? (
                                            <div className="rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
                                                Chargement du détail de la commande…
                                            </div>
                                        ) : commandeDetails ? (
                                            <>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                    {[
                                                        {
                                                            label: "N° commande",
                                                            value: commandeDetails.numero_commande || "—",
                                                            mono: true,
                                                        },
                                                        {
                                                            label: "Date",
                                                            value: commandeDetails.date_commande
                                                                ? new Date(
                                                                      String(commandeDetails.date_commande).slice(0, 10)
                                                                  ).toLocaleDateString("fr-FR")
                                                                : "—",
                                                            icon: <Calendar className="h-3.5 w-3.5 opacity-70" />,
                                                        },
                                                        {
                                                            label: "Client",
                                                            value: commandeDetails.client_nom || "—",
                                                        },
                                                        {
                                                            label: "Statut",
                                                            value: String(commandeDetails.statut || "—")
                                                                .replace(/_/g, " ")
                                                                .replace(/\b\w/g, (l) => l.toUpperCase()),
                                                        },
                                                    ].map((cell) => (
                                                        <div
                                                            key={cell.label}
                                                            className="rounded-xl border border-border bg-background/80 px-4 py-3 shadow-sm"
                                                        >
                                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                                                                {cell.icon}
                                                                {cell.label}
                                                            </p>
                                                            <p
                                                                className={cn(
                                                                    "text-sm font-semibold text-foreground leading-snug",
                                                                    (cell as { mono?: boolean }).mono && "font-mono text-[13px]"
                                                                )}
                                                            >
                                                                {cell.value}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="rounded-xl border border-border bg-background/80 px-4 py-3 shadow-sm flex gap-3">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                                                            <Store className="h-5 w-5" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                                Point de vente
                                                            </p>
                                                            <p className="text-sm font-semibold text-foreground mt-0.5 break-words">
                                                                {commandeDetails.point_de_vente_nom?.trim() || "—"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl border border-border bg-background/80 px-4 py-3 shadow-sm">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                            Sous-société
                                                        </p>
                                                        <p className="text-sm font-semibold text-foreground mt-0.5 break-words">
                                                            {String(commandeDetails.sous_societe_nom || "").trim() || "—"}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/80 to-card dark:from-indigo-950/20 px-5 py-4 flex flex-wrap gap-8 items-end">
                                                    <div>
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                            Montant
                                                        </span>
                                                        <p className="text-xl font-bold tabular-nums mt-0.5">{fmtMoney(commandeDetails.montant_ht)} DH</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                            TVA
                                                        </span>
                                                        <p className="text-xl font-bold tabular-nums mt-0.5">{fmtMoney(commandeDetails.montant_tva)} DH</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                            TTC
                                                        </span>
                                                        <p className="text-xl font-bold tabular-nums mt-0.5 text-indigo-600 dark:text-indigo-400">
                                                            {fmtMoney(commandeDetails.montant_ttc)} DH
                                                        </p>
                                                    </div>
                                                    {Number(commandeDetails.reduction) > 0 && (
                                                        <div>
                                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Réduction
                                                            </span>
                                                            <p className="text-xl font-bold tabular-nums mt-0.5">
                                                                {Number(commandeDetails.reduction).toFixed(1)} %
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                                                    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-muted/50 border-b border-border">
                                                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                                            Lignes ({commandeDetails.items?.length ?? 0})
                                                        </p>
                                                        <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 uppercase">
                                                            Reprises sur le BL
                                                        </span>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border">
                                                                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground py-3 pl-4">
                                                                        Désignation
                                                                    </TableHead>
                                                                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground py-3 text-right">
                                                                        Qté
                                                                    </TableHead>
                                                                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground py-3 text-right">
                                                                        PU
                                                                    </TableHead>
                                                                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground py-3 text-right">
                                                                        TVA %
                                                                    </TableHead>
                                                                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground py-3 text-right">
                                                                        Rem. %
                                                                    </TableHead>
                                                                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground py-3 text-right pr-4">
                                                                    Montant
                                                                    </TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {(commandeDetails.items || []).length === 0 ? (
                                                                    <TableRow>
                                                                        <TableCell
                                                                            colSpan={6}
                                                                            className="text-center py-10 text-muted-foreground text-sm"
                                                                        >
                                                                            Aucune ligne sur cette commande.
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ) : (
                                                                    (commandeDetails.items || []).map((it, idx) => (
                                                                        <TableRow
                                                                            key={it.id ?? idx}
                                                                            className="text-sm border-b border-border/80 last:border-0 hover:bg-muted/20"
                                                                        >
                                                                            <TableCell className="max-w-[300px] pl-4 py-3 font-medium">
                                                                                {it.designation || "—"}
                                                                            </TableCell>
                                                                            <TableCell className="text-right tabular-nums py-3">
                                                                                {fmtMoney(it.quantite)}
                                                                            </TableCell>
                                                                            <TableCell className="text-right tabular-nums py-3">
                                                                                {fmtMoney(it.prix_unitaire)}
                                                                            </TableCell>
                                                                            <TableCell className="text-right tabular-nums py-3">
                                                                                {fmtMoney(it.tva)}
                                                                            </TableCell>
                                                                            <TableCell className="text-right tabular-nums py-3">
                                                                                {fmtMoney(it.reduction)}
                                                                            </TableCell>
                                                                            <TableCell className="text-right font-semibold tabular-nums py-3 pr-4">
                                                                                {fmtMoney(it.montant_ht)} DH
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))
                                                                )}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-3 pt-1">
                                                    <Button variant="outline" size="sm" className="rounded-xl gap-2 h-10" asChild>
                                                        <Link
                                                            to={`/dashboard/commandes/${commandeDetails.id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            <ArrowUpRight className="h-4 w-4" />
                                                            Ouvrir la fiche commande
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-sm text-muted-foreground text-center py-6">Aucun détail disponible.</p>
                                        )}
                                        </CardContent>
                                    </Card>
                                )}

                                <div className="flex flex-wrap gap-3 pt-2">
                                    <Button
                                        type="button"
                                        className="h-11 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 dark:shadow-none"
                                        onClick={handleCreate}
                                        disabled={
                                            creating ||
                                            !selectedCommande ||
                                            loadingCommandeDetails ||
                                            !commandeDetails ||
                                            !(commandeDetails.items && commandeDetails.items.length > 0)
                                        }
                                    >
                                        {creating ? "Création…" : "Créer le bon de livraison"}
                                    </Button>
                                    <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setActiveTab("list")}>
                                        Retour à la liste
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rapport — bons de livraison</DialogTitle>
                        <DialogDescription>Synthèse sur la liste actuellement filtrée.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2 text-sm">
                        <div className="flex justify-between border-b border-border pb-2">
                            <span className="text-muted-foreground">Nombre de BL</span>
                            <span className="font-bold">{filteredRows.length}</span>
                        </div>
                        <div className="flex justify-between border-b border-border pb-2">
                            <span className="text-muted-foreground">Montant TTC total</span>
                            <span className="font-bold tabular-nums">
                                {reportData.totalTTC.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">En attente / Livrés / Annulés</span>
                            <span className="font-bold text-right">
                                {reportData.pending} / {reportData.livree} / {reportData.annule}
                            </span>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReportDialog(false)}>
                            Fermer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
