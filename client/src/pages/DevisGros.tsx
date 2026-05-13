import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/common/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/common/ui/alert-dialog";
import { toast } from "sonner";
import {
    Plus,
    Trash2,
    Scale,
    FileText,
    Loader2,
    Search,
    Calendar,
    CheckCircle2,
    Clock,
    XCircle,
    Weight,
    MoreVertical,
    ArrowUpRight,
    Download,
    User,
    RotateCcw,
} from "lucide-react";
import { generateDevisGrosPdfFromApiRow } from "@/components/pdf/GrosDocumentPdf";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { matchesSousSocieteListFilter } from "@/utils/sousSocieteListFilter";
import { isProductWholesaleGros } from "@/lib/isProductWholesaleGros";

interface Client {
    id: number;
    nom_complet: string;
}

interface Product {
    id: number;
    nom: string;
    reference?: string | null;
    prix?: number;
    grammage?: number;
    pricing_metal?: string | null;
}

interface DevisGrosItemForm {
    produit_id?: number;
    designation: string;
    grammage: string;
    prix_unitaire: string;
    reduction: string;
    taux_tva: string;
}

interface DevisGrosRow {
    id: number;
    numero_devis: string;
    date_devis: string;
    grammage: number;
    statuts_devis: string;
    client_id: number;
    client_nom?: string;
    montant_ttc?: number | string | null;
    montant_ht?: number | string | null;
    montant_tva?: number | string | null;
    reduction?: number | string | null;
    user_nom?: string | null;
    user_id?: number;
    has_commande_gros_link?: number | boolean;
    has_facture_gros_link?: number | boolean;
    linked_commande_gros_id?: number | null;
    linked_facture_gros_id?: number | null;
    point_de_vente_nom?: string | null;
    sous_societe_nom?: string | null;
}

const getSousSocieteLabel = (doc: { sous_societe_nom?: string | null }) => {
    const fromName = String(doc.sous_societe_nom || "").trim();
    return fromName || "—";
};

function devisGrosRowMontantTtc(row: DevisGrosRow): number {
    const ttc = row.montant_ttc;
    if (ttc != null && ttc !== "" && !Number.isNaN(Number(ttc))) {
        return Number(ttc);
    }
    return (Number(row.montant_ht) || 0) + (Number(row.montant_tva) || 0);
}

const GROS_FILTER_MONTHS = [
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

function parseListDate(value: string | undefined | null): Date | null {
    if (value == null || value === "") return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function userSelectLabel(u: { id: number; username?: string; nom?: string; prenom?: string }): string {
    const full = [u.prenom, u.nom].filter(Boolean).join(" ").trim();
    return full || u.username || `Utilisateur #${u.id}`;
}

export default function DevisGros() {
    const location = useLocation();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [showCommandeGrosDialog, setShowCommandeGrosDialog] = useState(false);
    const [createdDevisGrosId, setCreatedDevisGrosId] = useState<number | null>(null);
    const [devisToDelete, setDevisToDelete] = useState<number | null>(null);

    const [list, setList] = useState<DevisGrosRow[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState<"list" | "form">("list");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>("all");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterClient, setFilterClient] = useState<string>("all");
    const [filterUser, setFilterUser] = useState<string>("all");
    const [filterSousSociete, setFilterSousSociete] = useState<string>("all");
    const [users, setUsers] = useState<{ id: number; username?: string; nom?: string; prenom?: string }[]>([]);
    const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

    const [dateDevis, setDateDevis] = useState(() => new Date().toISOString().split("T")[0]);
    const [clientId, setClientId] = useState<string>("");
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [showQuickAddClientDialog, setShowQuickAddClientDialog] = useState(false);
    const [pendingClientName, setPendingClientName] = useState("");
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [items, setItems] = useState<DevisGrosItemForm[]>([
        { designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" },
    ]);
    const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);

    const productsGros = products.filter(isProductWholesaleGros);

    const filterYears = useMemo(
        () => Array.from({ length: 8 }, (_, i) => (new Date().getFullYear() - i).toString()),
        []
    );
    const sousSocieteOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    list
                        .map((row) => String(row.sous_societe_nom || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [list]
    );

    const filteredList = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return list.filter((row) => {
            const matchesSearch =
                !q ||
                row.numero_devis?.toLowerCase().includes(q) ||
                (row.client_nom || "").toLowerCase().includes(q) ||
                (row.user_nom || "").toLowerCase().includes(q) ||
                (row.point_de_vente_nom || "").toLowerCase().includes(q) ||
                (row.sous_societe_nom || "").toLowerCase().includes(q);

            const date = parseListDate(String(row.date_devis ?? ""));
            const matchesMonth =
                filterMonth === "all" || (date != null && (date.getMonth() + 1).toString() === filterMonth);
            const matchesYear =
                filterYear === "all" || (date != null && date.getFullYear().toString() === filterYear);
            const matchesStatus =
                filterStatus === "all" || String(row.statuts_devis || "") === filterStatus;
            const matchesClient =
                filterClient === "all" || String(row.client_id ?? "") === filterClient;
            const matchesUser =
                filterUser === "all" ||
                (row.user_id != null && String(row.user_id) === filterUser);
            const matchesSousSociete = matchesSousSocieteListFilter(
                filterSousSociete,
                row.sous_societe_nom,
                row.numero_devis
            );

            return matchesSearch && matchesMonth && matchesYear && matchesStatus && matchesClient && matchesUser && matchesSousSociete;
        });
    }, [list, searchTerm, filterMonth, filterYear, filterStatus, filterClient, filterUser, filterSousSociete]);

    const resetListFilters = () => {
        setSearchTerm("");
        setFilterMonth("all");
        setFilterYear("all");
        setFilterStatus("all");
        setFilterClient("all");
        setFilterUser("all");
        setFilterSousSociete("all");
    };

    const grammageFiltre = useMemo(
        () => filteredList.reduce((acc, r) => acc + (Number(r.grammage) || 0), 0),
        [filteredList]
    );

    const stats = useMemo(
        () => ({
            total: list.length,
            pending: list.filter((d) => d.statuts_devis === "en attente").length,
            accepted: list.filter((d) => d.statuts_devis === "accepté").length,
            rejected: list.filter((d) => d.statuts_devis === "refusé").length,
        }),
        [list]
    );

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [rDevis, rClients, rProducts, rUsers] = await Promise.all([
                fetch("/api/devis-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/clients", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/users/all-users", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (rDevis.ok) setList(await rDevis.json());
            if (rClients.ok) setClients(await rClients.json());
            if (rProducts.ok) setProducts(await rProducts.json());
            if (rUsers.ok) {
                const data = await rUsers.json();
                setUsers(Array.isArray(data?.users) ? data.users : []);
            }
        } catch {
            toast.error("Erreur de chargement");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    useEffect(() => {
        const state = location.state as { editDevisGrosId?: number } | null;
        const editId = state?.editDevisGrosId;
        if (editId == null || !Number.isFinite(Number(editId))) return;
        /* Attendre fetchAll (clients, produits…) pour que les listes du formulaire soient prêtes */
        if (loading) return;
        loadForEdit(Number(editId));
        setTab("form");
        window.history.replaceState({}, document.title);
    }, [location.state, location.key, loading]);

    useEffect(() => {
        const state = location.state as {
            selectedProduct?: Product;
            openNewDevisGros?: boolean;
        } | null;
        const p = state?.selectedProduct;
        if (!p || !isProductWholesaleGros(p)) return;

        const g = Number(p.grammage);
        const pTotal = Number(p.prix);
        const pu = Number.isFinite(pTotal) ? pTotal : 0;
        setItems([
            {
                produit_id: p.id,
                designation: p.nom,
                grammage: Number.isFinite(g) && g > 0 ? String(g) : "",
                prix_unitaire: String(pu),
                reduction: "0",
                taux_tva: "0",
            },
        ]);
        setTab("form");
        setEditingId(null);
        setDateDevis(new Date().toISOString().split("T")[0]);
        window.history.replaceState({}, document.title);
    }, [location.state, location.key]);

    const resetForm = () => {
        setEditingId(null);
        setDateDevis(new Date().toISOString().split("T")[0]);
        setClientId("");
        setClientSearch("");
        setShowClientDropdown(false);
        setItems([{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]);
    };

    const addLine = () => {
        setItems((prev) => [...prev, { designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]);
    };

    const removeLine = (index: number) => {
        setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
    };

    const updateLine = (index: number, field: keyof DevisGrosItemForm, value: string | number | undefined) => {
        setItems((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value as never };
            return next;
        });
    };

    const handlePrixNetChange = (index: number, rawValue: string) => {
        const net = parseFloat(String(rawValue).replace(",", ".")) || 0;
        const g = parseFloat(String(items[index]?.grammage || "0").replace(",", ".")) || 0;
        const prixUnitaire = g > 0 ? net / g : net;
        updateLine(index, "prix_unitaire", String(prixUnitaire));
        updateLine(index, "reduction", "0");
        updateLine(index, "taux_tva", "0");
    };

    const applyProduct = (index: number, product: Product) => {
        const g = Number(product.grammage);
        const pTotal = Number(product.prix);
        const pu = Number.isFinite(pTotal) ? pTotal : 0;
        updateLine(index, "produit_id", product.id);
        updateLine(index, "designation", product.nom);
        updateLine(index, "grammage", Number.isFinite(g) && g > 0 ? String(g) : "");
        updateLine(index, "prix_unitaire", String(pu));
        setActiveProductSearchIndex(null);
    };

    const loadForEdit = async (id: number) => {
        try {
            const res = await fetch(`/api/devis-gros/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error("Impossible de charger le devis");
                return;
            }
            const d = await res.json();
            setEditingId(id);
            setDateDevis(String(d.date_devis || "").split("T")[0]);
            setClientId(String(d.client_id || ""));
            setClientSearch(String(d.client_nom || clients.find((c) => String(c.id) === String(d.client_id))?.nom_complet || ""));
            const raw = Array.isArray(d.items) ? d.items : [];
            setItems(
                raw.length
                    ? raw.map((it: { produit_id?: number; designation?: string; grammage?: number }) => ({
                          produit_id: it.produit_id,
                          designation: it.designation || "",
                          grammage: it.grammage != null ? String(it.grammage) : "",
                          prix_unitaire: (it as unknown as { prix_unitaire?: number }).prix_unitaire != null ? String((it as unknown as { prix_unitaire?: number }).prix_unitaire) : "",
                          reduction: (it as unknown as { reduction?: number }).reduction != null ? String((it as unknown as { reduction?: number }).reduction) : "0",
                          taux_tva: (it as unknown as { taux_tva?: number }).taux_tva != null ? String((it as unknown as { taux_tva?: number }).taux_tva) : "0",
                      }))
                    : [{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]
            );
            setTab("form");
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientId) {
            if (clientSearch.trim()) {
                setPendingClientName(clientSearch.trim());
                setShowQuickAddClientDialog(true);
                return;
            }
            toast.error("Choisissez un client");
            return;
        }
        const payloadItems = items.map((it) => ({
            produit_id: it.produit_id,
            designation:
                it.designation.trim() ||
                productsGros.find((p) => p.id === it.produit_id)?.nom ||
                "Produit gros",
            grammage: parseFloat(String(it.grammage).replace(",", ".")) || 0,
            prix_unitaire: parseFloat(String(it.prix_unitaire).replace(",", ".")) || 0,
            reduction: 0,
            taux_tva: 0,
        }));
        if (payloadItems.some((it) => it.grammage <= 0)) {
            toast.error("Chaque ligne : grammage > 0");
            return;
        }

        setSaving(true);
        try {
            const url = editingId ? `/api/devis-gros/${editingId}` : "/api/devis-gros";
            const method = editingId ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    date_devis: dateDevis,
                    client_id: Number(clientId),
                    items: payloadItems,
                }),
            });
            if (res.ok) {
                const result = await res.json().catch(() => ({}));
                toast.success(editingId ? "Devis gros enregistré" : "Devis gros créé");
                window.dispatchEvent(new CustomEvent("approvals-updated"));
                if (!editingId && result?.id != null && Number.isFinite(Number(result.id))) {
                    setCreatedDevisGrosId(Number(result.id));
                    setShowCommandeGrosDialog(true);
                    fetchAll();
                } else {
                    resetForm();
                    setTab("list");
                    fetchAll();
                }
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || "Échec");
            }
        } catch {
            toast.error("Erreur réseau");
        } finally {
            setSaving(false);
        }
    };

    const handleQuickAddClient = async () => {
        if (!pendingClientName.trim()) return;
        setIsAddingClient(true);
        try {
            const response = await fetch("/api/clients", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ nom_complet: pendingClientName, type: "particulier" }),
            });
            if (response.ok) {
                const newClient = await response.json();
                setClients((prev) => [newClient, ...prev]);
                setClientId(String(newClient.id));
                setClientSearch(newClient.nom_complet);
                setShowQuickAddClientDialog(false);
                toast.success("Client ajouté avec succès");
            } else {
                toast.error("Erreur lors de l'ajout du client");
            }
        } catch {
            toast.error("Erreur réseau");
        } finally {
            setIsAddingClient(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const res = await fetch(`/api/devis-gros/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                toast.success("Supprimé");
                fetchAll();
            } else toast.error("Échec suppression");
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleDownloadPdf = async (id: number) => {
        setPdfLoadingId(id);
        try {
            const res = await fetch(`/api/devis-gros/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error("Impossible de charger le document");
                return;
            }
            const data = await res.json();
            await generateDevisGrosPdfFromApiRow(data as Record<string, unknown>);
            toast.success("PDF téléchargé");
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        } finally {
            setPdfLoadingId(null);
        }
    };

    const statusBadge = (status: string) => {
        switch (status) {
            case "en attente":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        <Clock className="h-3 w-3" /> En attente
                    </span>
                );
            case "accepté":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Accepté
                    </span>
                );
            case "refusé":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                        <XCircle className="h-3 w-3" /> Refusé
                    </span>
                );
            default:
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Scale className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Devis gros
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Propositions au grammage (nature « Gros »), sans montants en base — comme la page Devis.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    {
                        label: "Total devis gros",
                        val: stats.total,
                        icon: FileText,
                        color: "text-indigo-600 dark:text-indigo-400",
                        bg: "bg-indigo-50 dark:bg-indigo-900/20",
                    },
                    {
                        label: "Grammage total (filtré)",
                        val: `${grammageFiltre.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} g`,
                        icon: Weight,
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
                        label: "Acceptés",
                        val: stats.accepted,
                        icon: CheckCircle2,
                        color: "text-emerald-600 dark:text-emerald-400",
                        bg: "bg-emerald-50 dark:bg-emerald-900/20",
                    },
                    {
                        label: "Refusés",
                        val: stats.rejected,
                        icon: XCircle,
                        color: "text-red-500",
                        bg: "bg-red-50 dark:bg-red-900/20",
                    },
                ].map((s, idx) => (
                    <div
                        key={idx}
                        className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-3"
                    >
                        <div className={cn("p-2 rounded-lg", s.bg, s.color)}>
                            <s.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                {s.label}
                            </p>
                            <p className="text-xl font-bold text-foreground truncate">{s.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "form")} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger
                        value="list"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        Liste des devis gros
                    </TabsTrigger>
                    <TabsTrigger
                        value="form"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        {editingId ? "Modifier le devis gros" : "Nouveau devis gros"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm space-y-4 backdrop-blur-sm">
                            <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
                                <div className="relative w-full max-w-md flex-1 min-w-[200px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="N°, client, utilisateur…"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9 h-11 border-transparent bg-muted focus:bg-card focus:border-indigo-500 border rounded-xl"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-11 shrink-0 rounded-xl"
                                    onClick={resetListFilters}
                                >
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Réinitialiser
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Mois
                                    </Label>
                                    <Select value={filterMonth} onValueChange={setFilterMonth}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous les mois" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les mois</SelectItem>
                                            {GROS_FILTER_MONTHS.map((m) => (
                                                <SelectItem key={m.val} value={m.val}>
                                                    {m.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Année
                                    </Label>
                                    <Select value={filterYear} onValueChange={setFilterYear}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Toutes" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Toutes les années</SelectItem>
                                            {filterYears.map((y) => (
                                                <SelectItem key={y} value={y}>
                                                    {y}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Statut
                                    </Label>
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les statuts</SelectItem>
                                            <SelectItem value="en attente">En attente</SelectItem>
                                            <SelectItem value="accepté">Accepté</SelectItem>
                                            <SelectItem value="refusé">Refusé</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Client
                                    </Label>
                                    <Select value={filterClient} onValueChange={setFilterClient}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les clients</SelectItem>
                                            {clients.map((c) => (
                                                <SelectItem key={c.id} value={String(c.id)}>
                                                    {c.nom_complet}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Utilisateur
                                    </Label>
                                    <Select value={filterUser} onValueChange={setFilterUser}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les utilisateurs</SelectItem>
                                            {users.map((u) => (
                                                <SelectItem key={u.id} value={String(u.id)}>
                                                    {userSelectLabel(u)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Société
                                    </Label>
                                    <Select value={filterSousSociete} onValueChange={setFilterSousSociete}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Toutes les sociétés" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Toutes les sociétés</SelectItem>
                                            {sousSocieteOptions.map((name) => (
                                                <SelectItem key={name} value={name}>
                                                    {name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-visible">
                        {loading ? (
                            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                                <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 border-b border-border">
                                        <TableHead className="py-4 px-6">Numéro</TableHead>
                                        <TableHead className="py-4 px-6">Client</TableHead>
                                        <TableHead className="text-right py-4 px-6 whitespace-nowrap">Montant</TableHead>
                                        <TableHead className="text-center py-4 px-6 whitespace-nowrap">Réduction</TableHead>
                                        <TableHead className="py-4 px-6">Date</TableHead>
                                        <TableHead className="text-right py-4 px-6">Grammage (g)</TableHead>
                                        <TableHead className="py-4 px-6">Statut</TableHead>
                                        <TableHead className="py-4 px-6 whitespace-nowrap">Utilisateur</TableHead>
                                        <TableHead className="text-right py-4 px-6" aria-label="Actions" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredList.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={9}
                                                className="text-center py-12 text-muted-foreground"
                                            >
                                                {list.length === 0
                                                    ? "Aucun devis gros"
                                                    : "Aucun résultat pour cette recherche"}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredList.map((row) => (
                                            <TableRow
                                                key={row.id}
                                                className="group border-b border-border hover:bg-muted/30 transition-colors"
                                            >
                                                <TableCell className="px-6">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => navigate(`/dashboard/devis-gros/${row.id}`)}
                                                                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                                            >
                                                                {row.numero_devis}
                                                            </button>
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/dashboard/devis-gros/${row.id}`);
                                                                }}
                                                                className="h-7 w-7 text-muted-foreground hover:text-indigo-600 hover:bg-muted/60"
                                                                title="Ouvrir"
                                                            >
                                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                        <div className="flex gap-2 mt-1">
                                                            {Boolean(row.has_commande_gros_link) && (
                                                                <span
                                                                    className="text-[9px] text-blue-600 dark:text-blue-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() => {
                                                                        if (row.linked_commande_gros_id) {
                                                                            navigate(`/dashboard/commandes-gros/${row.linked_commande_gros_id}`);
                                                                        }
                                                                    }}
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Commande
                                                                </span>
                                                            )}
                                                            {Boolean(row.has_facture_gros_link) && (
                                                                <span
                                                                    className="text-[9px] text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() => {
                                                                        if (row.linked_facture_gros_id) {
                                                                            navigate(`/dashboard/factures-gros/${row.linked_facture_gros_id}`);
                                                                        }
                                                                    }}
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Facture
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-6">
                                                    <div className="flex items-start gap-2">
                                                        <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-medium text-foreground truncate">
                                                                {row.client_nom || "—"}
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground">
                                                                <span className="font-medium">PDV :</span>{" "}
                                                                {row.point_de_vente_nom || "—"}
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground">
                                                                <span className="font-medium">Société :</span>{" "}
                                                                {getSousSocieteLabel(row)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-6 font-bold text-right text-foreground">
                                                    {devisGrosRowMontantTtc(row).toLocaleString("fr-FR", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}{" "}
                                                    DH
                                                </TableCell>
                                                <TableCell className="px-6 font-semibold text-center">
                                                    {Number(row.reduction) > 0 ? (
                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-[11px] font-semibold text-red-600">
                                                            -{Number(row.reduction).toFixed(1)}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground">Aucune</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-6 text-muted-foreground">
                                                    {new Date(row.date_devis).toLocaleDateString("fr-FR")}
                                                </TableCell>
                                                <TableCell className="px-6 text-right font-medium">
                                                    {Number(row.grammage).toLocaleString("fr-FR", {
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </TableCell>
                                                <TableCell className="px-6">{statusBadge(row.statuts_devis)}</TableCell>
                                                <TableCell className="px-6">
                                                    {row.user_nom ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <User className="h-3 w-3" />
                                                            <span className="font-medium text-foreground">{row.user_nom}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-6 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                disabled={pdfLoadingId === row.id}
                                                                onClick={() => handleDownloadPdf(row.id)}
                                                            >
                                                                {pdfLoadingId === row.id ? (
                                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                                ) : (
                                                                    <Download className="h-4 w-4 mr-2" />
                                                                )}
                                                                Télécharger PDF
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => loadForEdit(row.id)}>
                                                                <FileText className="h-4 w-4 mr-2" />
                                                                Modifier
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => setDevisToDelete(row.id)}
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                Supprimer
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                    {!loading && filteredList.length > 0 && (
                                        <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 border-t-2 border-indigo-100 dark:border-indigo-900/30">
                                            <TableCell colSpan={3} className="px-6 py-4 font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider text-xs">
                                                Total Complet (Filtré)
                                            </TableCell>
                                            <TableCell className="px-4 py-4 font-black text-indigo-700 dark:text-indigo-300 text-base text-right">
                                                {filteredList
                                                    .reduce((acc, d) => acc + devisGrosRowMontantTtc(d), 0)
                                                    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                                DH
                                            </TableCell>
                                            <TableCell colSpan={5} />
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="form">
                    <Card className="border border-border shadow-2xl bg-card animate-in fade-in zoom-in-95 duration-300">
                        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-t-2xl" />
                        <CardHeader className="pb-4">
                            <CardTitle className="text-xl flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                                    <Plus className="h-5 w-5" />
                                </div>
                                {editingId ? "Modification du devis gros" : "Création d'un nouveau devis gros"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-0">
                            <form onSubmit={submit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">
                                            Date
                                        </Label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                type="date"
                                                value={dateDevis}
                                                onChange={(e) => setDateDevis(e.target.value)}
                                                required
                                                className="h-11 pl-10 border-border focus:border-indigo-500 rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">
                                            Client *
                                        </Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={clientSearch}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setClientSearch(v);
                                                    setShowClientDropdown(true);
                                                    if (!v.trim()) setClientId("");
                                                }}
                                                onFocus={() => setShowClientDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                                                placeholder="Rechercher un client..."
                                                className={cn("h-11 pl-10 border-border focus:border-indigo-500 rounded-xl", clientId && "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-900/10")}
                                            />
                                            {clientId && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-indigo-500" />}
                                        </div>
                                        {showClientDropdown && (
                                            <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                                {clients.filter(c => c.nom_complet.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                                                    <div
                                                        key={c.id}
                                                        onMouseDown={() => { setClientId(String(c.id)); setClientSearch(c.nom_complet); setShowClientDropdown(false); }}
                                                        className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group"
                                                    >
                                                        {c.nom_complet}
                                                        <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-indigo-500" />
                                                    </div>
                                                ))}
                                                {clientSearch.trim() && !clients.some(c => c.nom_complet.toLowerCase().trim() === clientSearch.toLowerCase().trim()) && (
                                                    <div
                                                        onMouseDown={() => {
                                                            setPendingClientName(clientSearch.trim());
                                                            setShowQuickAddClientDialog(true);
                                                            setShowClientDropdown(false);
                                                        }}
                                                        className="px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer text-sm font-semibold text-indigo-600 border-t border-border"
                                                    >
                                                        Ajouter "{clientSearch.trim()}"
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                                            Lignes & grammage
                                        </h3>
                                        <Button
                                            type="button"
                                            onClick={addLine}
                                            size="sm"
                                            className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-xl"
                                        >
                                            <Plus className="h-4 w-4 mr-2" /> Ajouter une ligne
                                        </Button>
                                    </div>

                                    <div className="border border-border rounded-xl overflow-visible bg-card">
                                        <Table containerClassName="overflow-visible">
                                            <TableHeader>
                                                <TableRow className="bg-muted/30">
                                                    <TableHead className="w-[220px] text-[10px] font-bold uppercase py-4 pl-6">
                                                        Produit gros
                                                    </TableHead>
                                                    <TableHead className="w-[220px] text-[10px] font-bold uppercase py-4 text-center">
                                                        Prix / g
                                                    </TableHead>
                                                    <TableHead className="w-[160px] text-[10px] font-bold uppercase py-4">
                                                        Grammage (g) *
                                                    </TableHead>
                                                    <TableHead className="w-[180px] text-[10px] font-bold uppercase py-4 text-right">
                                                        Prix Net
                                                    </TableHead>
                                                    <TableHead className="w-[50px] py-4 pr-6" />
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {items.map((line, index) => (
                                                    <TableRow
                                                        key={index}
                                                        className="group transition-colors hover:bg-muted/20"
                                                    >
                                                        <TableCell className="py-2 pl-6 relative">
                                                            <div className="relative">
                                                                <Input
                                                                    value={line.designation || ""}
                                                                    onChange={(e) => {
                                                                        updateLine(index, "designation", e.target.value);
                                                                        updateLine(index, "produit_id", undefined);
                                                                    }}
                                                                    onFocus={() => setActiveProductSearchIndex(index)}
                                                                    onBlur={() => setTimeout(() => setActiveProductSearchIndex(null), 200)}
                                                                    placeholder="Chercher ou décrire l'article..."
                                                                    className="h-10 rounded-lg border-border"
                                                                />
                                                                {activeProductSearchIndex === index &&
                                                                    (line.designation || "").trim().length > 0 &&
                                                                    productsGros.filter((p) => {
                                                                        const query = String(line.designation || "").toLowerCase();
                                                                        return (
                                                                            p.nom.toLowerCase().includes(query) ||
                                                                            String(p.reference || "").toLowerCase().includes(query)
                                                                        );
                                                                    }).length > 0 && (
                                                                    <div className="absolute z-[9999] min-w-[450px] left-0 mt-2 bg-background border border-border shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-2xl max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-2 ring-1 ring-black/5 backdrop-blur-3xl">
                                                                        {productsGros
                                                                            .filter((p) => {
                                                                                const query = String(line.designation || "").toLowerCase();
                                                                                return (
                                                                                    p.nom.toLowerCase().includes(query) ||
                                                                                    String(p.reference || "").toLowerCase().includes(query)
                                                                                );
                                                                            })
                                                                            .map((p) => (
                                                                                <div
                                                                                    key={p.id}
                                                                                    onMouseDown={() => applyProduct(index, p)}
                                                                                    className="px-4 py-3 hover:bg-indigo-500/10 cursor-pointer text-sm font-medium text-foreground flex items-center justify-between border-b border-border last:border-0"
                                                                                >
                                                                                    <div className="flex flex-col">
                                                                                        <span>{p.nom}</span>
                                                                                        {p.reference && (
                                                                                            <span className="text-[11px] text-muted-foreground">
                                                                                                Ref: {p.reference}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="text-xs text-muted-foreground">
                                                                                        {(Number(p.prix) || 0).toLocaleString()} DH
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                step="any"
                                                                min={0}
                                                                value={line.prix_unitaire}
                                                                onChange={(e) =>
                                                                    updateLine(index, "prix_unitaire", e.target.value)
                                                                }
                                                                placeholder="0"
                                                                className="h-11 border-transparent bg-transparent focus:bg-card focus:border-indigo-400 text-base text-center"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                step="any"
                                                                min={0}
                                                                value={line.grammage}
                                                                onChange={(e) =>
                                                                    updateLine(index, "grammage", e.target.value)
                                                                }
                                                                placeholder="0"
                                                                required
                                                                className="h-10 border-transparent bg-transparent focus:bg-card focus:border-indigo-400 text-sm text-center"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                step="any"
                                                                min={0}
                                                                value={(() => {
                                                                    const g = parseFloat(line.grammage || "0") || 0;
                                                                    const pu = parseFloat(line.prix_unitaire || "0") || 0;
                                                                    const net = g * pu;
                                                                    const rounded = Math.round((net + Number.EPSILON) * 100) / 100;
                                                                    return Number.isFinite(rounded) ? String(rounded) : "0";
                                                                })()}
                                                                onChange={(e) => handlePrixNetChange(index, e.target.value)}
                                                                placeholder="0"
                                                                className="h-11 border-transparent bg-transparent focus:bg-card focus:border-indigo-400 text-base text-right font-semibold"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2 pr-6">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="rounded-lg"
                                                                onClick={() => removeLine(index)}
                                                                disabled={items.length <= 1}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>

                                 
                                </div>

                                <div className="flex flex-wrap gap-3 pt-2">
                                    <Button
                                        type="submit"
                                        disabled={saving}
                                        className="h-11 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 dark:shadow-none"
                                    >
                                        {saving ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : editingId ? (
                                            "Enregistrer"
                                        ) : (
                                            "Créer le devis gros"
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11 px-8 rounded-xl"
                                        onClick={() => {
                                            resetForm();
                                            setTab("list");
                                        }}
                                    >
                                        Annuler
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <AlertDialog
                open={devisToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setDevisToDelete(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Vous voulez vraiment supprimer ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action supprimera définitivement ce devis gros du système.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (devisToDelete == null) return;
                                await handleDelete(devisToDelete);
                                setDevisToDelete(null);
                            }}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={showCommandeGrosDialog} onOpenChange={setShowCommandeGrosDialog}>
                <DialogContent className="sm:max-w-[430px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
                    <div className="h-1.5 bg-indigo-600" />
                    <DialogHeader className="px-6 pt-4 pb-2">
                        <DialogTitle className="flex items-center gap-3 text-base">
                            <div className="h-8 w-8 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                                <FileText className="h-4 w-4" />
                            </div>
                            <span className="text-indigo-700 dark:text-indigo-300">Devis gros enregistré</span>
                        </DialogTitle>
                        <DialogDescription className="px-1 pt-2 text-sm text-muted-foreground">
                            Souhaitez-vous créer une <span className="font-semibold text-indigo-600">commande gros</span> à partir de ce devis&nbsp;? Ensuite vous pourrez établir la <span className="font-semibold text-indigo-600">facture gros</span>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-4">
                        {createdDevisGrosId != null && (
                            <div className="mb-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 px-3 py-2 text-[11px] text-indigo-700 dark:text-indigo-200 flex items-center justify-between">
                                <span className="font-semibold uppercase tracking-widest">Devis gros #{createdDevisGrosId}</span>
                                <span className="text-[10px] text-indigo-500 dark:text-indigo-300">Étape suivante : commande gros</span>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <Button
                                variant="ghost"
                                className="flex-1 h-10 rounded-xl text-xs font-semibold"
                                onClick={() => {
                                    setShowCommandeGrosDialog(false);
                                    setCreatedDevisGrosId(null);
                                    resetForm();
                                    setTab("list");
                                    fetchAll();
                                    window.history.replaceState({}, document.title);
                                }}
                            >
                                Plus tard
                            </Button>
                            <Button
                                className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white"
                                onClick={() => {
                                    if (createdDevisGrosId == null) return;
                                    navigate("/dashboard/commandes-gros", {
                                        state: { devisGrosId: createdDevisGrosId },
                                    });
                                    setShowCommandeGrosDialog(false);
                                    setCreatedDevisGrosId(null);
                                    resetForm();
                                    setTab("list");
                                }}
                            >
                                Créer la commande gros
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showQuickAddClientDialog} onOpenChange={setShowQuickAddClientDialog}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Client non trouvé</DialogTitle>
                        <DialogDescription>Voulez-vous l'ajouter automatiquement ?</DialogDescription>
                    </DialogHeader>
                    <div className="text-sm">
                        Nom du client : <span className="font-semibold">{pendingClientName}</span>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowQuickAddClientDialog(false)}>Annuler</Button>
                        <Button onClick={handleQuickAddClient} disabled={isAddingClient}>
                            {isAddingClient ? "Ajout..." : "Oui, ajouter"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
