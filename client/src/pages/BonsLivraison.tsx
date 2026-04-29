import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { exportToExcel } from "@/utils/exportExcel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/common/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PackageOpen, Plus, FileText, ArrowRight, Search, ListOrdered, MoreVertical, Calendar, User, Pencil, Filter, FileSpreadsheet, Printer, BarChart3, CheckCircle2, Trash } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Commande {
    id: number;
    numero_commande: string;
    client_nom?: string;
    bon_livraison_id?: number | null;
    date_commande?: string;
    montant_ttc?: number;
    statut?: string;
}

interface CommandeItem {
    produit_id?: number;
    designation?: string;
    quantite?: number;
    prix_unitaire?: number;
    tva?: number;
    reduction?: number;
    montant_ht?: number;
}

interface CommandeDetails extends Commande {
    items?: CommandeItem[];
    montant_ht?: number;
    montant_tva?: number;
}

interface BonLivraison {
    id: number;
    numero_bon_livraison: string;
    date_bon_livraison: string;
    numero_commande?: string;
    devis_id?: number | null;
    facture_id?: number | null;
    client_nom?: string;
    user_nom?: string;
    point_de_vente_nom?: string;
    sous_societe_nom?: string;
    montant_ttc?: number;
    statut?: string;
}

const normalizeBlStatus = (status: string | null | undefined) => {
    const s = String(status || "").trim().toLowerCase();
    if (s === "livree" || s === "livré" || s === "livre" || s === "validee") return "livree";
    if (s === "annulee" || s === "annulée") return "annulee";
    return "en_attente";
};

const formatAmountNoGrouping = (value: number | string | null | undefined) => {
    const num = Number(value || 0);
    return num.toFixed(2).replace(".", ",");
};

export default function BonsLivraison() {
    const location = useLocation();
    const token = localStorage.getItem("token");

    const [bons, setBons] = useState<BonLivraison[]>([]);
    const [commandes, setCommandes] = useState<Commande[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<"liste" | "form">("liste");
    const [selectedCommandeId, setSelectedCommandeId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCommandeDetails, setSelectedCommandeDetails] = useState<CommandeDetails | null>(null);
    const [isLoadingCommandeDetails, setIsLoadingCommandeDetails] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterPdv, setFilterPdv] = useState<string>("all");
    const [filterSociete, setFilterSociete] = useState<string>("all");
    const [filterUser, setFilterUser] = useState<string>("all");
    const [reportOpen, setReportOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [bonToDelete, setBonToDelete] = useState<BonLivraison | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    const fetchData = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const [blRes, cmdRes] = await Promise.all([
                fetch("/api/bons-livraison", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/commandes", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (blRes.ok) setBons(await blRes.json());
            if (cmdRes.ok) setCommandes(await cmdRes.json());
        } catch (e) {
            console.error(e);
            toast.error("Erreur de chargement des bons de livraison");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [token]);

    const commandesEligibles = useMemo(
        () => commandes.filter((c) => !c.bon_livraison_id),
        [commandes]
    );

    const selectedCommande = useMemo(
        () => commandesEligibles.find((c) => String(c.id) === selectedCommandeId) || null,
        [commandesEligibles, selectedCommandeId]
    );

    useEffect(() => {
        const fetchCommandeDetails = async () => {
            if (!token || !selectedCommandeId) {
                setSelectedCommandeDetails(null);
                return;
            }
            setIsLoadingCommandeDetails(true);
            try {
                const res = await fetch(`/api/commandes/${selectedCommandeId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("Impossible de charger le détail commande");
                const data = await res.json();
                setSelectedCommandeDetails(data || null);
            } catch (e) {
                console.error(e);
                setSelectedCommandeDetails(null);
                toast.error("Erreur lors du chargement des éléments de la commande");
            } finally {
                setIsLoadingCommandeDetails(false);
            }
        };
        fetchCommandeDetails();
    }, [selectedCommandeId, token]);

    const filteredBons = useMemo(() => {
        const s = searchTerm.trim().toLowerCase();
        return bons.filter((b) => {
            const rowText = `${b.numero_bon_livraison} ${b.numero_commande || ""} ${b.client_nom || ""}`.toLowerCase();
            const matchesSearch = !s || rowText.includes(s);
            const d = b.date_bon_livraison ? new Date(b.date_bon_livraison) : null;
            const rowMonth = d && !Number.isNaN(d.getTime()) ? String(d.getMonth() + 1).padStart(2, "0") : "";
            const rowYear = d && !Number.isNaN(d.getTime()) ? String(d.getFullYear()) : "";
            const matchesMonth = filterMonth === "all" || rowMonth === filterMonth;
            const matchesYear = filterYear === "all" || rowYear === filterYear;
            const matchesStatus = filterStatus === "all" || normalizeBlStatus(b.statut) === filterStatus;
            const matchesPdv = filterPdv === "all" || (b.point_de_vente_nom || "").trim() === filterPdv;
            const matchesSociete = filterSociete === "all" || (b.sous_societe_nom || "").trim() === filterSociete;
            const matchesUser = filterUser === "all" || (b.user_nom || "").trim() === filterUser;
            return matchesSearch && matchesMonth && matchesYear && matchesStatus && matchesPdv && matchesSociete && matchesUser;
        });
    }, [bons, searchTerm, filterMonth, filterYear, filterStatus, filterPdv, filterSociete, filterUser]);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        bons.forEach((b) => {
            const d = b.date_bon_livraison ? new Date(b.date_bon_livraison) : null;
            if (d && !Number.isNaN(d.getTime())) years.add(String(d.getFullYear()));
        });
        return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }, [bons]);

    const availablePdvs = useMemo(
        () =>
            Array.from(
                new Set(
                    bons
                        .map((b) => (b.point_de_vente_nom || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr")),
        [bons]
    );

    const availableSocietes = useMemo(
        () =>
            Array.from(
                new Set(
                    bons
                        .map((b) => (b.sous_societe_nom || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr")),
        [bons]
    );

    const availableUsers = useMemo(
        () =>
            Array.from(
                new Set(
                    bons
                        .map((b) => (b.user_nom || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr")),
        [bons]
    );

    const dashboardStats = useMemo(() => {
        const total = bons.length;
        const pending = bons.filter((b) => normalizeBlStatus(b.statut) === "en_attente").length;
        const delivered = bons.filter((b) => normalizeBlStatus(b.statut) === "livree").length;
        const totalTTC = bons.reduce((acc, b) => acc + Number(b.montant_ttc || 0), 0);
        return { total, pending, delivered, totalTTC };
    }, [bons]);

    const reportData = useMemo(() => {
        const count = filteredBons.length;
        const totalTTC = filteredBons.reduce((acc, b) => acc + Number(b.montant_ttc || 0), 0);
        return {
            count,
            totalTTC,
            statusCounts: {
                en_attente: filteredBons.filter((b) => normalizeBlStatus(b.statut) === "en_attente").length,
                livree: filteredBons.filter((b) => normalizeBlStatus(b.statut) === "livree").length,
                annulee: filteredBons.filter((b) => normalizeBlStatus(b.statut) === "annulee").length,
            },
        };
    }, [filteredBons]);

    useEffect(() => {
        const visibleIds = new Set(filteredBons.map((b) => b.id));
        setSelectedIds((prev) => prev.filter((id) => visibleIds.has(id)));
    }, [filteredBons]);

    const toggleSelectAll = () => {
        const ids = filteredBons.map((b) => b.id);
        const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
        setSelectedIds(allSelected ? [] : ids);
    };

    const toggleSelectOne = (id: number) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleExportExcel = () => {
        const headers = ["N° BL", "Commande", "Client", "Date", "Montant TTC", "Statut"];
        const rows = [
            ...filteredBons.map((b) => [
                b.numero_bon_livraison || "",
                b.numero_commande || "",
                b.client_nom || "",
                String(b.date_bon_livraison || "").slice(0, 10),
                formatAmountNoGrouping(b.montant_ttc),
                normalizeBlStatus(b.statut) === "livree" ? "livré" : normalizeBlStatus(b.statut) === "annulee" ? "annulé" : "en attente",
            ]),
            ["", "", "", "TOTAL", formatAmountNoGrouping(reportData.totalTTC), ""],
        ];
        exportToExcel({
            headers,
            rows,
            fileName: `bons_livraison_${new Date().toISOString().slice(0, 10)}`,
            sheetName: "Bons Livraison",
        });
        toast.success("Excel exporté avec succès");
    };

    const handleExportPdf = () => {
        try {
            const doc = new jsPDF({ orientation: "landscape" });
            doc.setFontSize(14);
            doc.text("Liste des bons de livraison", 14, 14);
            autoTable(doc, {
                startY: 22,
                head: [["N° BL", "Commande", "Client", "Date", "Montant TTC", "Statut"]],
                body: filteredBons.map((b) => [
                    b.numero_bon_livraison || "",
                    b.numero_commande || "",
                    b.client_nom || "",
                    String(b.date_bon_livraison || "").slice(0, 10),
                    `${formatAmountNoGrouping(b.montant_ttc)} MAD`,
                    normalizeBlStatus(b.statut) === "livree" ? "livré" : normalizeBlStatus(b.statut) === "annulee" ? "annulé" : "en attente",
                ]),
                styles: { fontSize: 9 },
                headStyles: { fillColor: [79, 70, 229] },
                foot: [["", "", "", "TOTAL", `${formatAmountNoGrouping(reportData.totalTTC)} MAD`, ""]],
            });
            doc.save(`bons_livraison_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            console.error(error);
            toast.error("Erreur lors de l'export PDF");
        }
    };

    const createFromCommande = async (commandeId: number) => {
        if (!token) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/bons-livraison/from-commande/${commandeId}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Erreur lors de la création du bon de livraison");
            toast.success("Bon de livraison créé avec succès");
            setActiveTab("liste");
            setSelectedCommandeId("");
            await fetchData();
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de la création");
        } finally {
            setIsSubmitting(false);
        }
    };

    const updateBon = async (bl: BonLivraison) => {
        if (!token) return;
        const currentNumber = String(bl.numero_bon_livraison || "").trim();
        const currentDate = String(bl.date_bon_livraison || "").slice(0, 10);

        const numero_bon_livraison = window.prompt("Modifier le numéro du bon de livraison", currentNumber)?.trim();
        if (numero_bon_livraison === undefined || numero_bon_livraison === null) return;
        if (!numero_bon_livraison) {
            toast.error("Le numéro de BL est obligatoire");
            return;
        }

        const date_bon_livraison = window.prompt("Modifier la date du bon de livraison (YYYY-MM-DD)", currentDate)?.trim();
        if (date_bon_livraison === undefined || date_bon_livraison === null) return;
        if (!date_bon_livraison) {
            toast.error("La date du BL est obligatoire");
            return;
        }

        try {
            const res = await fetch(`/api/bons-livraison/${bl.id}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ numero_bon_livraison, date_bon_livraison }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Erreur lors de la modification du BL");
            toast.success("Bon de livraison modifié");
            await fetchData();
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de la modification");
        }
    };

    const openDeleteDialog = (bl: BonLivraison) => {
        setBonToDelete(bl);
        setDeleteDialogOpen(true);
    };

    const confirmDeleteBon = async () => {
        if (!token) return;
        if (!bonToDelete) return;
        setIsDeleting(true);

        try {
            const res = await fetch(`/api/bons-livraison/${bonToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Erreur lors de la suppression du BL");
            toast.success("Bon de livraison supprimé");
            setDeleteDialogOpen(false);
            setBonToDelete(null);
            await fetchData();
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de la suppression");
        } finally {
            setIsDeleting(false);
        }
    };

    const confirmBulkDelete = async () => {
        if (!token || selectedIds.length === 0) return;
        setIsBulkDeleting(true);
        try {
            await Promise.all(
                selectedIds.map(async (id) => {
                    const res = await fetch(`/api/bons-livraison/${id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.message || `Suppression BL ${id} impossible`);
                    }
                })
            );
            toast.success("Bons de livraison supprimés");
            setBulkDeleteDialogOpen(false);
            setSelectedIds([]);
            await fetchData();
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de la suppression en masse");
        } finally {
            setIsBulkDeleting(false);
        }
    };

    useEffect(() => {
        const state = location.state as { commandeId?: number } | null;
        if (!state?.commandeId) return;
        const cmdId = String(state.commandeId);
        setActiveTab("form");
        setSelectedCommandeId(cmdId);
        window.history.replaceState({}, document.title);
    }, [location.state]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <PackageOpen className="h-7 w-7 text-indigo-600" />
                        Bons de livraison
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Même workflow que commandes/devis/factures, avec création uniquement depuis commande.
                    </p>
                </div>
                <Button
                    onClick={() => setActiveTab("form")}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Nouveau bon de livraison
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border border-border shadow-sm">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total BL</p>
                        <p className="text-2xl font-black text-foreground mt-1">{dashboardStats.total}</p>
                    </CardContent>
                </Card>
                <Card className="border border-amber-200 bg-amber-50/40 shadow-sm">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">En attente</p>
                        <p className="text-2xl font-black text-amber-700 mt-1">{dashboardStats.pending}</p>
                    </CardContent>
                </Card>
                <Card className="border border-emerald-200 bg-emerald-50/40 shadow-sm">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Livrés</p>
                        <p className="text-2xl font-black text-emerald-700 mt-1">{dashboardStats.delivered}</p>
                    </CardContent>
                </Card>
                <Card className="border border-indigo-200 bg-indigo-50/40 shadow-sm">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Montant TTC</p>
                        <p className="text-xl font-black text-indigo-700 mt-1">
                            {dashboardStats.totalTTC.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "liste" | "form")} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14 w-auto inline-flex">
                    <TabsTrigger
                        value="liste"
                        className="gap-2 rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        <ListOrdered className="h-4 w-4" />
                        Liste
                    </TabsTrigger>
                    <TabsTrigger
                        value="form"
                        className="gap-2 rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        <FileText className="h-4 w-4" />
                        Formulaire
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="liste" className="mt-4">
                    <Card className="border border-border shadow-sm overflow-hidden">
                        <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-violet-500" />
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Liste des bons de livraison</CardTitle>
                            <CardDescription>Historique et suivi des BL créés depuis commandes.</CardDescription>
                            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between pt-2">
                                <div className="relative w-full max-w-sm">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Rechercher BL / commande / client..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="h-11 pl-9 border border-border focus-visible:ring-indigo-500"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "h-12 px-6 rounded-2xl gap-2 border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
                                            showFilters && "bg-zinc-100 border-zinc-400"
                                        )}
                                        onClick={() => setShowFilters((v) => !v)}
                                    >
                                        <Filter className="h-4 w-4" />
                                        Filtres
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="h-12 px-6 rounded-2xl gap-2 border border-emerald-300 bg-emerald-50/40 text-emerald-600 hover:bg-emerald-50"
                                        onClick={handleExportExcel}
                                    >
                                        <FileSpreadsheet className="h-4 w-4" />
                                        <span className="hidden sm:inline">Excel</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="h-12 px-6 rounded-2xl gap-2 border border-red-300 bg-red-50/40 text-red-600 hover:bg-red-50"
                                        onClick={handleExportPdf}
                                    >
                                        <Printer className="h-4 w-4" />
                                        <span className="hidden sm:inline">PDF</span>
                                    </Button>
                                    <Button
                                        className="h-12 px-6 rounded-2xl gap-2 bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200"
                                        onClick={() => setReportOpen(true)}
                                    >
                                        <BarChart3 className="h-4 w-4" />
                                        <span className="hidden sm:inline">Rapport</span>
                                    </Button>
                                    {selectedIds.length > 0 && (
                                        <Button
                                            variant="destructive"
                                            className="h-11 px-4 rounded-xl gap-2 bg-red-600 hover:bg-red-700"
                                            onClick={() => setBulkDeleteDialogOpen(true)}
                                        >
                                            <Trash className="h-4 w-4" />
                                            <span>Supprimer ({selectedIds.length})</span>
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {showFilters && (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
                                    <Select value={filterMonth} onValueChange={setFilterMonth}>
                                        <SelectTrigger className="h-10"><SelectValue placeholder="Mois" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les mois</SelectItem>
                                            {Array.from({ length: 12 }).map((_, i) => {
                                                const v = String(i + 1).padStart(2, "0");
                                                return <SelectItem key={v} value={v}>{v}</SelectItem>;
                                            })}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filterYear} onValueChange={setFilterYear}>
                                        <SelectTrigger className="h-10"><SelectValue placeholder="Année" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Toutes les années</SelectItem>
                                            {availableYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className="h-10"><SelectValue placeholder="Statut" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les statuts</SelectItem>
                                            <SelectItem value="en_attente">En attente</SelectItem>
                                            <SelectItem value="livree">Livré</SelectItem>
                                            <SelectItem value="annulee">Annulé</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={filterPdv} onValueChange={setFilterPdv}>
                                        <SelectTrigger className="h-10"><SelectValue placeholder="Point de vente" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les PDV</SelectItem>
                                            {availablePdvs.map((pdv) => (
                                                <SelectItem key={pdv} value={pdv}>{pdv}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filterSociete} onValueChange={setFilterSociete}>
                                        <SelectTrigger className="h-10"><SelectValue placeholder="Société" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Toutes les sociétés</SelectItem>
                                            {availableSocietes.map((soc) => (
                                                <SelectItem key={soc} value={soc}>{soc}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filterUser} onValueChange={setFilterUser}>
                                        <SelectTrigger className="h-10"><SelectValue placeholder="Utilisateur" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les utilisateurs</SelectItem>
                                            {availableUsers.map((usr) => (
                                                <SelectItem key={usr} value={usr}>{usr}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-x-auto">
                                <Table className="min-w-[980px]">
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 border-b border-border">
                                            <TableHead className="w-12 py-4 pl-6">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                                    checked={filteredBons.length > 0 && filteredBons.every((b) => selectedIds.includes(b.id))}
                                                    onChange={toggleSelectAll}
                                                />
                                            </TableHead>
                                            <TableHead className="w-[180px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap pl-6">N° BL</TableHead>
                                            <TableHead className="w-[180px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Commande source</TableHead>
                                            <TableHead className="w-[300px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Client / Point de vente</TableHead>
                                            <TableHead className="w-[180px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Utilisateur</TableHead>
                                            <TableHead className="w-[140px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Date</TableHead>
                                            <TableHead className="w-[150px] text-xs font-bold text-muted-foreground uppercase py-4 text-right whitespace-nowrap">Montant</TableHead>
                                            <TableHead className="w-[130px] text-xs font-bold text-muted-foreground uppercase py-4 text-center whitespace-nowrap">Statut</TableHead>
                                            <TableHead className="w-[120px] text-xs font-bold text-muted-foreground uppercase py-4 text-right pr-6 whitespace-nowrap">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            Array.from({ length: 5 }).map((_, i) => (
                                                <TableRow key={i} className="animate-pulse border-b border-border">
                                                    <TableCell className="pl-6"><div className="h-4 w-4 bg-muted rounded" /></TableCell>
                                                    <TableCell className="pl-6"><div className="h-4 w-24 bg-muted rounded" /></TableCell>
                                                    <TableCell><div className="h-4 w-24 bg-muted rounded" /></TableCell>
                                                    <TableCell><div className="h-4 w-32 bg-muted rounded" /></TableCell>
                                                    <TableCell><div className="h-4 w-24 bg-muted rounded" /></TableCell>
                                                    <TableCell><div className="h-4 w-20 bg-muted rounded" /></TableCell>
                                                    <TableCell className="text-right"><div className="h-4 w-20 bg-muted rounded ml-auto" /></TableCell>
                                                    <TableCell className="text-center"><div className="h-4 w-16 bg-muted rounded mx-auto" /></TableCell>
                                                    <TableCell className="pr-6 text-right"><div className="h-8 w-8 bg-muted rounded ml-auto" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : filteredBons.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} className="py-20 text-center text-muted-foreground">
                                                    Aucun bon de livraison pour le moment.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredBons.map((bl) => (
                                                (() => {
                                                    const normalizedStatus = normalizeBlStatus(bl.statut);
                                                    return (
                                                <TableRow key={bl.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0">
                                                    <TableCell className="w-12 py-4 pl-6">
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                                            checked={selectedIds.includes(bl.id)}
                                                            onChange={() => toggleSelectOne(bl.id)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="pl-6 py-4">
                                                        <Link
                                                            to={`/dashboard/bons-livraison/${bl.id}`}
                                                            className="text-left text-[15px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                        >
                                                            {bl.numero_bon_livraison}
                                                        </Link>
                                                        <div className="flex gap-2 mt-1">
                                                            {Boolean(bl.numero_commande) && (
                                                                <span className="text-[9px] text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Commande
                                                                </span>
                                                            )}
                                                            {Boolean(bl.devis_id) && (
                                                                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Devis
                                                                </span>
                                                            )}
                                                            {Boolean(bl.facture_id) && (
                                                                <span className="text-[9px] text-blue-600 dark:text-blue-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Facture
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span className="font-medium">{bl.numero_commande || "—"}</span>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <div className="flex items-start gap-2">
                                                            <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-foreground truncate">
                                                                    {bl.client_nom || "—"}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground">
                                                                    <span className="font-medium">PDV :</span> {bl.point_de_vente_nom || "—"}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground">
                                                                    <span className="font-medium">Société :</span> {bl.sous_societe_nom || "—"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span className="font-medium">{bl.user_nom || "—"}</span>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <Calendar className="h-4 w-4" />
                                                            {String(bl.date_bon_livraison || "").slice(0, 10)}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold py-4">
                                                        {Number(bl.montant_ttc || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                                                    </TableCell>
                                                    <TableCell className="text-center py-4">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "text-[10px] uppercase font-bold",
                                                                normalizedStatus === "livree"
                                                                    ? "border-emerald-300 text-emerald-700 bg-emerald-50/70"
                                                                    : normalizedStatus === "annulee"
                                                                        ? "border-red-300 text-red-700 bg-red-50/70"
                                                                        : "border-amber-300 text-amber-700 bg-amber-50/70"
                                                            )}
                                                        >
                                                            {normalizedStatus === "livree" ? "livré" : normalizedStatus === "annulee" ? "annulé" : "en attente"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-4 pr-6 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-56">
                                                                <DropdownMenuItem className="cursor-pointer" onClick={() => updateBon(bl)}>
                                                                    <Pencil className="h-4 w-4" /> Modifier
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="cursor-pointer text-red-600 focus:text-red-600"
                                                                    onClick={() => openDeleteDialog(bl)}
                                                                >
                                                             <Trash className="h-4 w-4" color="red" />        Supprimer
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                                    );
                                                })()
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="form" className="mt-4">
                    <Card className="border border-border shadow-2xl bg-card animate-in fade-in zoom-in-95 duration-300 overflow-hidden">
                        <div className="h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-2xl"></div>
                        <CardHeader>
                            <CardTitle className="text-lg">Création du bon de livraison</CardTitle>
                            <CardDescription>
                                Sélectionnez une commande validée/non liée pour importer automatiquement ses éléments.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Commande source *</Label>
                                    <Select value={selectedCommandeId} onValueChange={setSelectedCommandeId}>
                                        <SelectTrigger className="h-11 border-indigo-200 bg-indigo-50/30">
                                            <SelectValue placeholder="Choisir une commande" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {commandesEligibles.map((c) => (
                                                <SelectItem key={c.id} value={String(c.id)}>
                                                    {c.numero_commande} - {c.client_nom || "Client"}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {selectedCommande && (
                                <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <p className="text-[11px] uppercase text-muted-foreground">Commande</p>
                                        <p className="font-semibold">{selectedCommande.numero_commande}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase text-muted-foreground">Client</p>
                                        <p className="font-semibold">{selectedCommande.client_nom || "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase text-muted-foreground">Montant TTC</p>
                                        <p className="font-semibold">
                                            {Number(selectedCommande.montant_ttc || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-xl border border-border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 border-b border-border">
                                            <TableHead className="text-xs font-bold uppercase text-muted-foreground">Désignation</TableHead>
                                            <TableHead className="text-xs font-bold uppercase text-muted-foreground text-center">Qté</TableHead>
                                            <TableHead className="text-xs font-bold uppercase text-muted-foreground text-right">Prix unitaire</TableHead>
                                            <TableHead className="text-xs font-bold uppercase text-muted-foreground text-center">TVA</TableHead>
                                            <TableHead className="text-xs font-bold uppercase text-muted-foreground text-center">Réduction</TableHead>
                                            <TableHead className="text-xs font-bold uppercase text-muted-foreground text-right">Montant HT</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!selectedCommandeId ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                                    Sélectionnez une commande pour importer ses éléments.
                                                </TableCell>
                                            </TableRow>
                                        ) : isLoadingCommandeDetails ? (
                                            <TableRow><TableCell colSpan={6} className="h-14" /></TableRow>
                                        ) : !selectedCommandeDetails?.items?.length ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                                    Aucun élément trouvé sur cette commande.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            selectedCommandeDetails.items.map((it, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-medium">{it.designation || "—"}</TableCell>
                                                    <TableCell className="text-center">{Number(it.quantite || 0)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {Number(it.prix_unitaire || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                                                    </TableCell>
                                                    <TableCell className="text-center">{Number(it.tva || 20).toFixed(2)} %</TableCell>
                                                    <TableCell className="text-center">{Number(it.reduction || 0).toFixed(2)} %</TableCell>
                                                    <TableCell className="text-right font-semibold">
                                                        {Number(it.montant_ht || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {selectedCommandeDetails && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="rounded-lg border border-border p-3">
                                        <p className="text-[11px] uppercase text-muted-foreground">Total HT</p>
                                        <p className="font-semibold">
                                            {Number(selectedCommandeDetails.montant_ht || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-border p-3">
                                        <p className="text-[11px] uppercase text-muted-foreground">Montant TVA</p>
                                        <p className="font-semibold">
                                            {Number(selectedCommandeDetails.montant_tva || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-border p-3">
                                        <p className="text-[11px] uppercase text-muted-foreground">Total TTC</p>
                                        <p className="font-semibold text-indigo-700">
                                            {Number(selectedCommandeDetails.montant_ttc || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="bg-muted/50 rounded-2xl p-6 border border-border flex flex-col md:flex-row gap-8 justify-between items-center bg-card/50">
                                <div className="flex gap-10 text-center md:text-left">
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Montant HT</p>
                                        <p className="text-xl font-bold text-foreground">
                                            {Number(selectedCommandeDetails?.montant_ht || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">TVA</p>
                                        <p className="text-xl font-bold text-amber-600">
                                            {Number(selectedCommandeDetails?.montant_tva || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                                        </p>
                                    </div>
                                </div>
                                <div className="h-16 w-px bg-border hidden md:block"></div>
                                <div className="text-center md:text-right">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total TTC</p>
                                    <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 drop-shadow-sm">
                                        {Number(selectedCommandeDetails?.montant_ttc || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-1 border-t border-border">
                                <Button variant="ghost" onClick={() => setActiveTab("liste")} className="h-12 px-8 text-muted-foreground hover:text-foreground">Annuler</Button>
                                <Button
                                    onClick={() => createFromCommande(Number(selectedCommandeId))}
                                    disabled={isSubmitting || !selectedCommandeId}
                                    className="h-12 flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-100 dark:shadow-none"
                                >
                                    {isSubmitting ? "Création..." : "Enregistrer le bon de livraison"}
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    setDeleteDialogOpen(open);
                    if (!open) setBonToDelete(null);
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Supprimer le bon de livraison ?</DialogTitle>
                        <DialogDescription>
                            Cette action est irreversible. Le BL{" "}
                            <span className="font-semibold">{bonToDelete?.numero_bon_livraison || ""}</span> sera supprime
                            definitivement avec ses lignes.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
                            Annuler
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDeleteBon}
                            disabled={isDeleting || !bonToDelete}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isDeleting ? "Suppression..." : "Supprimer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Supprimer la sélection ?</DialogTitle>
                        <DialogDescription>
                            Cette action est irreversible. {selectedIds.length} bon(s) de livraison vont être supprimés.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setBulkDeleteDialogOpen(false)} disabled={isBulkDeleting}>
                            Annuler
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmBulkDelete}
                            disabled={isBulkDeleting || selectedIds.length === 0}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isBulkDeleting ? "Suppression..." : "Supprimer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Rapport des bons de livraison</DialogTitle>
                        <DialogDescription>Synthèse basée sur les filtres actifs de la liste.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border p-4">
                            <p className="text-xs uppercase text-muted-foreground">Nombre de BL</p>
                            <p className="text-2xl font-black">{reportData.count}</p>
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            <p className="text-xs uppercase text-muted-foreground">Montant TTC total</p>
                            <p className="text-2xl font-black text-indigo-600">
                                {formatAmountNoGrouping(reportData.totalTTC)} MAD
                            </p>
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            <p className="text-xs uppercase text-muted-foreground">En attente</p>
                            <p className="text-xl font-bold text-amber-600">{reportData.statusCounts.en_attente}</p>
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            <p className="text-xs uppercase text-muted-foreground">Livrés / Annulés</p>
                            <p className="text-xl font-bold text-emerald-600">
                                {reportData.statusCounts.livree} / <span className="text-red-600">{reportData.statusCounts.annulee}</span>
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setReportOpen(false)}>Fermer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
