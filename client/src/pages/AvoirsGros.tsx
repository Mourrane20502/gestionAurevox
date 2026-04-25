import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/common/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/common/ui/select";
import { toast } from "sonner";
import {
    RotateCcw, Search, User, Edit, Plus, CheckCircle2, XCircle, Clock, LockOpen, MoreVertical, ArrowUpRight, Download,
    ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { generateAvoirGrosPdfFromApiRow } from "@/components/pdf/GrosDocumentPdf";

interface Client { id: number; nom_complet: string; }
interface FactureGros { id: number; numero_facture: string; client_id: number; client_nom?: string; }
interface UserOption { id: number; username?: string; nom?: string; prenom?: string; }
interface Product {
    id: number;
    nom: string;
    reference?: string | null;
    prix?: number | null;
    nature_produit?: string;
    Nature_Produit?: string;
}
interface AvoirGrosItem {
    id?: number;
    produit_id?: number;
    designation: string;
    grammage: number;
    prix_unitaire: number;
    taux_tva: number;
    reduction?: number;
    montant_ht: number;
}
interface AvoirGros {
    id: number;
    numero_avoir: string;
    date_avoir: string;
    facture_gros_id?: number | null;
    devis_gros_id?: number | null;
    commande_gros_id?: number | null;
    client_id: number;
    client_nom: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    statut: string;
    user_nom?: string;
    user_id?: number;
    facture_gros_numero?: string;
    sous_societe_nom?: string | null;
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

function userSelectLabel(u: UserOption): string {
    const full = [u.prenom, u.nom].filter(Boolean).join(" ").trim();
    return full || u.username || `Utilisateur #${u.id}`;
}

export default function AvoirsGros() {
    const role = localStorage.getItem("role");
    const isAdmin = role === "admin";
    const token = localStorage.getItem("token");
    const location = useLocation();
    const navigate = useNavigate();

    const [avoirs, setAvoirs] = useState<AvoirGros[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [factures, setFactures] = useState<FactureGros[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>("all");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterClient, setFilterClient] = useState<string>("all");
    const [filterUser, setFilterUser] = useState<string>("all");
    const [filterSousSociete, setFilterSousSociete] = useState<string>("all");
    const [activeTab, setActiveTab] = useState("list");
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [editingAvoir, setEditingAvoir] = useState<AvoirGros | null>(null);
    const [factureSearch, setFactureSearch] = useState("");
    const [showFactureDropdown, setShowFactureDropdown] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [factureIdsWithAvoir, setFactureIdsWithAvoir] = useState<number[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        numero_avoir: "",
        date_avoir: new Date().toISOString().split("T")[0],
        status: "en_attente",
        facture_gros_id: "none",
    });
    const [items, setItems] = useState<AvoirGrosItem[]>([
        { designation: "", grammage: 1, prix_unitaire: 0, taux_tva: 0, reduction: 0, montant_ht: 0 },
    ]);

    const fetchAvoirs = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/avoirs-gros", { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setAvoirs(data);
                const ids = Array.from(new Set((data as AvoirGros[]).map((a) => Number(a.facture_gros_id)).filter(Boolean)));
                setFactureIdsWithAvoir(ids);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAvoirs();
        fetch("/api/clients", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []).then(setClients);
        fetch("/api/factures-gros", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []).then(setFactures);
        fetch("/api/users/all-users", { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.ok ? r.json() : { users: [] })
            .then((d) => setUsers(Array.isArray(d?.users) ? d.users : []));
        fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) => {
                const all = Array.isArray(rows) ? rows : [];
                setProducts(
                    all.filter((p: Product) => {
                        const nature = String(p.nature_produit || p.Nature_Produit || "").toLowerCase();
                        return nature === "gros" || nature === "gro";
                    })
                );
            });
    }, []);

    useEffect(() => {
        const state = location.state as { factureGrosId?: number } | null;
        if (!state?.factureGrosId || factures.length === 0 || clients.length === 0) return;
        const fid = Number(state.factureGrosId);
        if (!Number.isFinite(fid) || fid <= 0) return;
        handleFactureSelect(String(fid));
        const f = factures.find((x) => x.id === fid);
        if (f) setFactureSearch(f.numero_facture);
        setActiveTab("form");
        window.history.replaceState({}, document.title);
    }, [location.state, factures, clients]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterMonth, filterYear, filterStatus, filterClient, filterUser, filterSousSociete]);

    const handleFactureSelect = async (factureIdStr: string) => {
        if (!factureIdStr || factureIdStr === "none") {
            setFormData((p) => ({ ...p, facture_gros_id: "none" }));
            return;
        }
        setFormData((p) => ({ ...p, facture_gros_id: factureIdStr }));
        const res = await fetch(`/api/factures-gros/${factureIdStr}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        const client = clients.find((c) => Number(c.id) === Number(data.client_id));
        if (client) { setSelectedClient(client); setClientSearch(client.nom_complet); }
        setItems((data.items || []).map((it: any) => ({
            produit_id: it.produit_id,
            designation: it.designation || it.produit_nom || "",
            grammage: Number(it.grammage) || 0,
            prix_unitaire: Number(it.prix_unitaire) || 0,
            taux_tva: Number(it.taux_tva) || 0,
            reduction: Number(it.reduction) || 0,
            montant_ht: Number(it.montant_ht) || 0,
        })));
    };

    const handleItemChange = (index: number, field: keyof AvoirGrosItem, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        if (field === "grammage" || field === "prix_unitaire" || field === "reduction" || field === "taux_tva") {
            const g = Number(newItems[index].grammage) || 0;
            const pu = Number(newItems[index].prix_unitaire) || 0;
            newItems[index].reduction = 0;
            newItems[index].taux_tva = 0;
            newItems[index].montant_ht = g * pu;
        }
        setItems(newItems);
    };

    const handlePrixNetChange = (index: number, rawValue: number) => {
        const net = Number(rawValue) || 0;
        const g = Number(items[index]?.grammage) || 0;
        const pu = g > 0 ? net / g : net;
        handleItemChange(index, "prix_unitaire", pu);
    };

    const handleProductSelect = (index: number, product: Product) => {
        const next = [...items];
        next[index] = {
            ...next[index],
            produit_id: product.id,
            designation: product.nom,
            prix_unitaire: Number(product.prix) || next[index].prix_unitaire || 0,
        };
        const g = Number(next[index].grammage) || 0;
        const pu = Number(next[index].prix_unitaire) || 0;
        const red = Number(next[index].reduction) || 0;
        next[index].montant_ht = g * pu * (1 - red / 100);
        setItems(next);
        setActiveProductSearchIndex(null);
    };

    const addItem = () => setItems([...items, { designation: "", grammage: 1, prix_unitaire: 0, taux_tva: 0, reduction: 0, montant_ht: 0 }]);
    const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

    const resetForm = () => {
        setFormData({ numero_avoir: "", date_avoir: new Date().toISOString().split("T")[0], status: "en_attente", facture_gros_id: "none" });
        setItems([{ designation: "", grammage: 1, prix_unitaire: 0, taux_tva: 0, reduction: 0, montant_ht: 0 }]);
        setSelectedClient(null);
        setClientSearch("");
        setFactureSearch("");
        setEditingAvoir(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isAdmin && !selectedClient) return toast.error("Veuillez sélectionner un client");
        setIsSubmitting(true);
        try {
            const payload = {
                date_avoir: formData.date_avoir,
                status: formData.status,
                facture_gros_id: formData.facture_gros_id === "none" ? null : Number(formData.facture_gros_id),
                client_id: selectedClient?.id,
                items: items.map((it) => ({
                    produit_id: it.produit_id,
                    designation: it.designation,
                    grammage: Number(it.grammage),
                    prix_unitaire: Number(it.prix_unitaire),
                    taux_tva: 0,
                    reduction: 0,
                })),
            };
            const url = editingAvoir ? `/api/avoirs-gros/${editingAvoir.id}` : "/api/avoirs-gros";
            const method = editingAvoir ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                return toast.error(d.message || "Erreur lors de l'enregistrement");
            }
            toast.success(editingAvoir ? "Avoir gros mis à jour !" : "Avoir gros créé !");
            window.dispatchEvent(new CustomEvent("approvals-updated"));
            resetForm();
            setActiveTab("list");
            fetchAvoirs();
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchAvoirDetails = async (id: number) => {
        const res = await fetch(`/api/avoirs-gros/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return toast.error("Erreur de chargement");
        const data = await res.json();
        setEditingAvoir(data);
        setFormData({
            numero_avoir: data.numero_avoir,
            date_avoir: data.date_avoir.split("T")[0],
            status: data.statut,
            facture_gros_id: data.facture_gros_id ? String(data.facture_gros_id) : "none",
        });
        setItems((data.items || []).map((it: any) => ({ ...it, reduction: Number(it.reduction) || 0 })));
        const client = clients.find((c) => c.id === data.client_id);
        if (client) { setSelectedClient(client); setClientSearch(client.nom_complet); }
        if (data.facture_gros_id) {
            const f = factures.find((x) => x.id === data.facture_gros_id);
            setFactureSearch(f?.numero_facture || "");
        }
        setActiveTab("form");
    };

    const handleApproveAvoir = async (id: number) => {
        const res = await fetch(`/api/avoirs-gros/${id}/approve`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return toast.error("Erreur lors de la validation");
        toast.success("Avoir gros validé");
        fetchAvoirs();
    };
    const handleRejectAvoir = async (id: number) => {
        const res = await fetch(`/api/avoirs-gros/${id}/reject`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return toast.error("Erreur lors du rejet");
        toast.success("Avoir gros rejeté");
        fetchAvoirs();
    };
    const handleReopenAvoir = async (id: number) => {
        const res = await fetch(`/api/avoirs-gros/${id}/reopen`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return toast.error("Erreur lors de la réouverture");
        toast.success("Avoir gros rouvert");
        fetchAvoirs();
    };
    const handleDownloadPdf = async (id: number) => {
        try {
            const res = await fetch(`/api/avoirs-gros/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return toast.error("Impossible de charger l'avoir gros");
            const data = await res.json();
            await generateAvoirGrosPdfFromApiRow(data as Record<string, unknown>);
            toast.success("PDF généré");
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        }
    };

    const filterYears = useMemo(
        () =>
            Array.from(
                new Set(
                    avoirs
                        .map((a) => parseListDate(a.date_avoir))
                        .filter((d): d is Date => d != null)
                        .map((d) => d.getFullYear().toString())
                )
            ).sort((a, b) => Number(b) - Number(a)),
        [avoirs]
    );

    const sousSocieteOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    avoirs.map((a) => String(a.sous_societe_nom || "").trim()).filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr")),
        [avoirs]
    );

    const filteredAvoirs = avoirs.filter((a) => {
        const date = parseListDate(a.date_avoir);
        const s = searchTerm.trim().toLowerCase();
        const matchesSearch =
            s === "" ||
            String(a.numero_avoir || "").toLowerCase().includes(s) ||
            String(a.client_nom || "").toLowerCase().includes(s) ||
            String(a.facture_gros_numero || "").toLowerCase().includes(s) ||
            String(a.user_nom || "").toLowerCase().includes(s);
        const matchesMonth = filterMonth === "all" || (date != null && (date.getMonth() + 1).toString() === filterMonth);
        const matchesYear = filterYear === "all" || (date != null && date.getFullYear().toString() === filterYear);
        const matchesStatus = filterStatus === "all" || String(a.statut || "") === filterStatus;
        const matchesClient = filterClient === "all" || String(a.client_id ?? "") === filterClient;
        const matchesUser = filterUser === "all" || (a.user_id != null && String(a.user_id) === filterUser);
        const matchesSousSociete =
            filterSousSociete === "all" ||
            String(a.sous_societe_nom || "").trim() === filterSousSociete;
        return matchesSearch && matchesMonth && matchesYear && matchesStatus && matchesClient && matchesUser && matchesSousSociete;
    });

    const resetListFilters = () => {
        setSearchTerm("");
        setFilterMonth("all");
        setFilterYear("all");
        setFilterStatus("all");
        setFilterClient("all");
        setFilterUser("all");
        setFilterSousSociete("all");
    };
    const totalPages = Math.ceil(filteredAvoirs.length / itemsPerPage);
    const paginatedAvoirs = filteredAvoirs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const currentTotalHT = items.reduce((acc, it) => acc + (Number(it.montant_ht) || 0), 0);
    const currentTotalTTC = currentTotalHT;
    const totalTTC = avoirs.reduce((acc, a) => acc + (Number(a.montant_ttc) || 0), 0);
    const totalValide = avoirs.filter((a) => a.statut === "valide").reduce((acc, a) => acc + (Number(a.montant_ttc) || 0), 0);
    const countEnAttente = avoirs.filter((a) => a.statut === "en_attente").length;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <RotateCcw className="h-7 w-7 text-orange-600 dark:text-orange-400" />
                        Gestion des Avoirs Gros
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Avoirs de facturation au gros</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card"><div className="p-3 bg-orange-50 rounded-xl text-orange-600"><RotateCcw className="h-6 w-6" /></div><div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Avoirs</p><p className="text-xl font-bold text-foreground">- {totalTTC.toLocaleString()} DH</p></div></Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card"><div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle2 className="h-6 w-6" /></div><div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Validés (montant)</p><p className="text-xl font-bold text-foreground">- {totalValide.toLocaleString()} DH</p></div></Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card"><div className="p-3 bg-amber-50 rounded-xl text-amber-600"><Clock className="h-6 w-6" /></div><div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">En attente</p><p className="text-xl font-bold text-foreground">{countEnAttente}</p></div></Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger value="list" className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold">Liste des Avoirs</TabsTrigger>
                    <TabsTrigger value="form" onClick={() => { if (!editingAvoir) resetForm(); }} className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold">{editingAvoir ? "Modifier Avoir Gros" : "Nouvel Avoir Gros"}</TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="bg-card p-4 rounded-2xl border border-border shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
                            <div className="relative w-full max-w-md flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="N°, client, facture gros, utilisateur…"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-11 border-transparent bg-muted focus:bg-card focus:border-orange-500 border rounded-xl"
                                />
                            </div>
                            <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 rounded-xl" onClick={resetListFilters}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Réinitialiser
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mois</Label>
                                <Select value={filterMonth} onValueChange={setFilterMonth}>
                                    <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue placeholder="Tous les mois" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous les mois</SelectItem>
                                        {GROS_FILTER_MONTHS.map((m) => <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Année</Label>
                                <Select value={filterYear} onValueChange={setFilterYear}>
                                    <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue placeholder="Toutes" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Toutes les années</SelectItem>
                                        {filterYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Statut</Label>
                                <Select value={filterStatus} onValueChange={setFilterStatus}>
                                    <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue placeholder="Tous" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous les statuts</SelectItem>
                                        <SelectItem value="en_attente">En attente</SelectItem>
                                        <SelectItem value="valide">Validé</SelectItem>
                                        <SelectItem value="rejete">Rejeté</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</Label>
                                <Select value={filterClient} onValueChange={setFilterClient}>
                                    <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue placeholder="Tous" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous les clients</SelectItem>
                                        {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nom_complet}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Utilisateur</Label>
                                <Select value={filterUser} onValueChange={setFilterUser}>
                                    <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue placeholder="Tous" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous les utilisateurs</SelectItem>
                                        {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{userSelectLabel(u)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Société</Label>
                                <Select value={filterSousSociete} onValueChange={setFilterSousSociete}>
                                    <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue placeholder="Toutes" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Toutes les sociétés</SelectItem>
                                        {sousSocieteOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-x-auto">
                        <Table className="min-w-[1100px]">
                            <TableHeader><TableRow className="bg-muted/50 border-b border-border"><TableHead className="pl-6">N° Avoir</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Facture gros</TableHead><TableHead className="text-right">Montant Avoir</TableHead><TableHead>Statut</TableHead><TableHead>Utilisateur</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {isLoading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8} className="h-12 animate-pulse" /></TableRow>) :
                                    filteredAvoirs.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-20 text-muted-foreground">Aucun avoir gros trouvé</TableCell></TableRow> :
                                        paginatedAvoirs.map((avoir) => (
                                            <TableRow key={avoir.id} className="group hover:bg-muted/30">
                                                <TableCell className="pl-6"><button type="button" onClick={() => navigate(`/dashboard/avoirs-gros/${avoir.id}`)} className="font-bold text-orange-600 hover:underline">{avoir.numero_avoir}</button></TableCell>
                                                <TableCell><div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{avoir.client_nom}</span></div></TableCell>
                                                <TableCell>{new Date(avoir.date_avoir).toLocaleDateString()}</TableCell>
                                                <TableCell>{avoir.facture_gros_numero ? <button type="button" onClick={() => navigate(`/dashboard/factures-gros/${avoir.facture_gros_id}`)} className="text-indigo-600 hover:underline">{avoir.facture_gros_numero}</button> : "—"}</TableCell>
                                                <TableCell className="text-right font-bold">- {Number(avoir.montant_ttc || 0).toLocaleString()} DH</TableCell>
                                                <TableCell>
                                                    {avoir.statut === "valide" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-3 w-3" />Validé</span>}
                                                    {avoir.statut === "en_attente" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 animate-pulse"><Clock className="h-3 w-3" />Non Validé</span>}
                                                    {avoir.statut === "rejete" && <div className="flex flex-col gap-1"><span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700"><XCircle className="h-3 w-3" />Rejeté</span><button type="button" onClick={() => handleReopenAvoir(avoir.id)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600"><LockOpen className="h-3 w-3" />Rouvrir</button></div>}
                                                </TableCell>
                                                <TableCell>{avoir.user_nom || "—"}</TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-56">
                                                            <DropdownMenuItem onClick={() => handleDownloadPdf(avoir.id)}><Download className="h-4 w-4" />Télécharger PDF</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => fetchAvoirDetails(avoir.id)}><Edit className="h-4 w-4" />Modifier</DropdownMenuItem>
                                                            {(isAdmin || role === "responsable") && avoir.statut === "en_attente" && <DropdownMenuItem onClick={() => handleApproveAvoir(avoir.id)}><CheckCircle2 className="h-4 w-4" />Valider</DropdownMenuItem>}
                                                            {(isAdmin || role === "responsable") && avoir.statut === "en_attente" && <DropdownMenuItem onClick={() => handleRejectAvoir(avoir.id)} className="text-red-600"><XCircle className="h-4 w-4" />Rejeter</DropdownMenuItem>}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                {!isLoading && filteredAvoirs.length > 0 && (
                                    <TableRow className="bg-orange-50/30 dark:bg-orange-950/10 border-t-2 border-orange-100 dark:border-orange-900/30">
                                        <TableCell colSpan={3} className="px-6 py-4 font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wider text-xs">
                                            Total Complet (Filtré)
                                        </TableCell>
                                        <TableCell className="px-4 py-4 font-black text-orange-700 dark:text-orange-300 text-base">
                                            - {filteredAvoirs.reduce((acc, a) => acc + (Number(a.montant_ttc) || 0), 0).toLocaleString()} DH
                                        </TableCell>
                                        <TableCell colSpan={4} />
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        {totalPages > 1 && (
                            <div className="flex items-center justify-end gap-2 px-2 py-4 border-t border-border">
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                                <span className="text-xs text-muted-foreground px-2">{currentPage}/{totalPages}</span>
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight className="h-4 w-4" /></Button>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="form">
                    <Card className="border border-border shadow-2xl bg-card">
                        <div className="h-2 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 rounded-t-2xl" />
                        <CardHeader><CardTitle className="flex items-center gap-3"><div className="p-2 bg-orange-50 rounded-lg text-orange-600"><RotateCcw className="h-5 w-5" /></div>{editingAvoir ? `Modifier Avoir Gros : ${editingAvoir.numero_avoir}` : "Nouvel Avoir Gros"}</CardTitle></CardHeader>
                        <CardContent className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Facture Gros Associée</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                            <Input value={factureSearch} onChange={(e) => { setFactureSearch(e.target.value); setShowFactureDropdown(true); if (!e.target.value) handleFactureSelect("none"); }} onFocus={() => setShowFactureDropdown(true)} onBlur={() => setTimeout(() => setShowFactureDropdown(false), 200)} placeholder="Rechercher une facture gros..." className={cn("h-11 pl-10 border-border", formData.facture_gros_id !== "none" && "border-orange-500")} />
                                            {formData.facture_gros_id !== "none" && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-orange-500" />}
                                        </div>
                                        {showFactureDropdown && (
                                            <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto">
                                                <div onMouseDown={() => { handleFactureSelect("none"); setFactureSearch(""); setShowFactureDropdown(false); }} className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-muted-foreground border-b border-border">Aucune facture</div>
                                                {factures.filter((f) => !factureIdsWithAvoir.includes(f.id) && (!factureSearch.trim() || f.numero_facture.toLowerCase().includes(factureSearch.toLowerCase()))).map((f) => (
                                                    <div key={f.id} onMouseDown={() => { handleFactureSelect(String(f.id)); setFactureSearch(f.numero_facture); setShowFactureDropdown(false); }} className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group"><span className="font-bold">{f.numero_facture}</span><ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-orange-500" /></div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Date Avoir</Label>
                                        <Input type="date" value={formData.date_avoir} onChange={(e) => setFormData((p) => ({ ...p, date_avoir: e.target.value }))} required className="h-11 border-border focus:border-indigo-500" />
                                    </div>

                                    {isAdmin && (
                                        <div className="space-y-1.5 relative">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Client</Label>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                                <Input value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); if (!e.target.value) setSelectedClient(null); }} onFocus={() => setShowClientDropdown(true)} onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)} placeholder="Rechercher un client..." className={cn("h-11 pl-10 border-border", selectedClient && "border-indigo-500")} />
                                                {selectedClient && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-indigo-500" />}
                                            </div>
                                            {showClientDropdown && clients.filter((c) => c.nom_complet.toLowerCase().includes(clientSearch.toLowerCase())).length > 0 && (
                                                <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto">
                                                    {clients.filter((c) => c.nom_complet.toLowerCase().includes(clientSearch.toLowerCase())).map((c) => (
                                                        <div key={c.id} onMouseDown={() => { setSelectedClient(c); setClientSearch(c.nom_complet); setShowClientDropdown(false); }} className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground">{c.nom_complet}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Articles de l'avoir gros</h3><Button type="button" onClick={addItem} size="sm" className="bg-orange-100 text-orange-600 hover:bg-orange-200"><Plus className="h-4 w-4 mr-2" />Ajouter un article</Button></div>
                                    <div className="border border-border rounded-xl overflow-visible bg-card">
                                        <Table containerClassName="overflow-visible">
                                            <TableHeader><TableRow className="bg-muted/30"><TableHead className="w-[40%] pl-6">Désignation</TableHead><TableHead className="text-center">Grammage</TableHead><TableHead className="text-center">Prix/g</TableHead><TableHead className="text-right pr-6">Prix Net</TableHead><TableHead /></TableRow></TableHeader>
                                            <TableBody>
                                                {items.map((item, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell className="pl-6 relative">
                                                            <div className="relative">
                                                                <Input
                                                                    value={item.designation || ""}
                                                                    onChange={(e) => handleItemChange(index, "designation", e.target.value)}
                                                                    onFocus={() => setActiveProductSearchIndex(index)}
                                                                    onBlur={() => setTimeout(() => setActiveProductSearchIndex(null), 200)}
                                                                    placeholder="Chercher ou décrire l'article..."
                                                                    className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-10 text-sm"
                                                                />
                                                                {activeProductSearchIndex === index &&
                                                                    (item.designation || "").trim().length > 0 &&
                                                                    products.filter((p) => {
                                                                        const query = (item.designation || "").toLowerCase();
                                                                        return (
                                                                            p.nom.toLowerCase().includes(query) ||
                                                                            String(p.reference || "").toLowerCase().includes(query)
                                                                        );
                                                                    }).length > 0 && (
                                                                    <div className="absolute z-[9999] min-w-[420px] left-0 mt-2 bg-background border border-border shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-2xl max-h-[300px] overflow-y-auto ring-1 ring-black/5">
                                                                        {products
                                                                            .filter((p) => {
                                                                                const query = (item.designation || "").toLowerCase();
                                                                                return (
                                                                                    p.nom.toLowerCase().includes(query) ||
                                                                                    String(p.reference || "").toLowerCase().includes(query)
                                                                                );
                                                                            })
                                                                            .map((p) => (
                                                                                <div
                                                                                    key={p.id}
                                                                                    onMouseDown={() => handleProductSelect(index, p)}
                                                                                    className="px-4 py-3 hover:bg-orange-500/10 cursor-pointer text-sm font-medium text-foreground flex items-center justify-between border-b border-border last:border-0"
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
                                                        <TableCell><Input type="number" value={item.grammage} onChange={(e) => handleItemChange(index, "grammage", parseFloat(e.target.value) || 0)} className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-center" /></TableCell>
                                                        <TableCell><Input type="number" value={item.prix_unitaire} onChange={(e) => handleItemChange(index, "prix_unitaire", parseFloat(e.target.value) || 0)} className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-center" /></TableCell>
                                                        <TableCell><Input type="number" value={item.montant_ht || 0} onChange={(e) => handlePrixNetChange(index, parseFloat(e.target.value) || 0)} className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-right font-semibold" /></TableCell>
                                                        <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length <= 1} className="h-8 w-8 text-red-500"><XCircle className="h-4 w-4" /></Button></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                <div className="bg-muted/50 rounded-2xl p-6 border border-border flex flex-col md:flex-row gap-8 justify-between items-center bg-card/50">
                                    <div className="text-center md:text-right"><p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Montant Crédité (Prix Net)</p><p className="text-4xl font-black text-orange-600">-{currentTotalTTC.toLocaleString()} DH</p></div>
                                </div>

                                <div className="flex gap-4 pt-4 border-t border-border">
                                    <Button type="button" variant="ghost" onClick={() => { resetForm(); setActiveTab("list"); }} className="h-12 px-8 text-muted-foreground">Annuler</Button>
                                    <Button disabled={isSubmitting} className="h-12 flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold">{isSubmitting ? "Enregistrement..." : editingAvoir ? "Modifier l'Avoir Gros" : "Enregistrer l'Avoir Gros"}</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
