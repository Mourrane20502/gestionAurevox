import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Textarea } from "@/components/common/ui/textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import { toast } from "sonner";
import {
    Banknote,
    Plus,
    CheckCircle2,
    XCircle,
    Clock,
    RefreshCcw,
    MoreVertical,
    Edit,
    Eye,
    Trash2,
    Download,
    Search,
} from "lucide-react";
import { generateRecuRemboursementPdf } from "@/components/pdf/RecuRemboursementPdf";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { exportToExcel } from "@/utils/exportExcel";
import { matchesSousSocieteListFilter } from "@/utils/sousSocieteListFilter";
import { 
    Filter, 
    FileSpreadsheet,
    FileText,
    BarChart3,
    DollarSign,
 
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AurevoxLogo from "@/assets/aurevox_logo.png";

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

interface Remboursement {
    id: number;
    commande_id: number;
    numero_commande: string;
    client_nom: string;
    montant: number;
    motif: string;
    statut: string;
    commande_montant_ttc?: number;
    commande_total_regle?: number;
    created_by_prenom?: string;
    created_by_nom?: string;
    valide_par_prenom?: string;
    valide_par_nom?: string;
    point_de_vente_id?: number | null;
    point_de_vente_nom?: string | null;
    created_at: string;
    sous_societe_nom?: string | null;
}

interface CommandeOption {
    id: number;
    numero_commande: string;
    montant_ttc: number;
    client_nom: string;
    total_regle: number;
}

type SousSocieteOption = {
    id: number;
    nom_sous_societe: string;
};

export default function Remboursements() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const role = (localStorage.getItem("role") || "").toLowerCase();
    const isAdmin = role === "admin" || role === "superadmin";

    const [list, setList] = useState<Remboursement[]>([]);
    const [allSousSocieteNames, setAllSousSocieteNames] = useState<string[]>([]);
    const [commandesOptions, setCommandesOptions] = useState<CommandeOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [editingRemboursement, setEditingRemboursement] = useState<Remboursement | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingCommandes, setLoadingCommandes] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [remboursementToDelete, setRemboursementToDelete] = useState<Remboursement | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filterCommandeId, setFilterCommandeId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterSousSociete, setFilterSousSociete] = useState<string>("all");
    const [filterPointDeVente, setFilterPointDeVente] = useState<string>("all");
    const [showFilters, setShowFilters] = useState(false);
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
    const months = [
        { val: "1", label: "Janvier" }, { val: "2", label: "Février" }, { val: "3", label: "Mars" },
        { val: "4", label: "Avril" }, { val: "5", label: "Mai" }, { val: "6", label: "Juin" },
        { val: "7", label: "Juillet" }, { val: "8", label: "Août" }, { val: "9", label: "Septembre" },
        { val: "10", label: "Octobre" }, { val: "11", label: "Novembre" }, { val: "12", label: "Décembre" }
    ];

    const [form, setForm] = useState({
        commande_id: "",
        montant: "",
        motif: "",
    });

    const headers = { Authorization: `Bearer ${token}` };

    const getMontantRemboursable = (montantTtc?: number, totalRegle?: number) => {
        const ttc = Number(montantTtc) || 0;
        const regle = Number(totalRegle);
        if (Number.isFinite(regle)) {
            return Math.max(Math.min(ttc, regle), 0);
        }
        return ttc;
    };

    const fetchList = async () => {
        try {
            const res = await fetch("/api/remboursements", { headers });
            if (res.ok) setList(await res.json());
            else setList([]);
        } catch {
            setList([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCommandesOptions = async () => {
        setLoadingCommandes(true);
        try {
            const res = await fetch("/api/remboursements/commandes-payees-non-facturees", { headers });
            const data = await res.json().catch(() => []);
            setCommandesOptions(Array.isArray(data) ? data : []);
            if (!res.ok) toast.error("Impossible de charger les commandes éligibles.");
        } catch {
            setCommandesOptions([]);
            toast.error("Erreur lors du chargement des commandes.");
        } finally {
            setLoadingCommandes(false);
        }
    };

    const location = useLocation();

    useEffect(() => {
        fetchList();
    }, []);

    useEffect(() => {
        const state = location.state as { 
            commandeId?: number, 
            montant?: number, 
            filterCommandeId?: number 
        };

        if (state) {
            if (state.filterCommandeId) {
                setFilterCommandeId(Number(state.filterCommandeId));
                navigate(location.pathname, { replace: true, state: {} });
            } else if (state.commandeId) {
                setForm({
                    commande_id: String(state.commandeId),
                    montant: String(state.montant || ""),
                    motif: `Remboursement de la commande #${state.commandeId}`,
                });
                setCreateOpen(true);
                navigate(location.pathname, { replace: true, state: {} });
            }
        }
    }, [location.state, navigate, location.pathname]);

    useEffect(() => {
        if (createOpen && !editingRemboursement) fetchCommandesOptions();
    }, [createOpen, editingRemboursement]);

    useEffect(() => {
        const fetchSousSocietes = async () => {
            if (!token) return;
            try {
                const res = await fetch("/api/settings/sous-societes", { headers });
                if (!res.ok) return;
                const data = await res.json();
                const names = (Array.isArray(data) ? data : [])
                    .map((s: SousSocieteOption) => String(s?.nom_sous_societe || "").trim())
                    .filter(Boolean);
                setAllSousSocieteNames(Array.from(new Set(names)));
            } catch {
                // fallback silencieux: on garde les sociétés venant de la liste des remboursements
            }
        };
        fetchSousSocietes();
    }, [token]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.commande_id || !form.montant || !form.motif.trim()) {
            toast.error("Veuillez remplir la commande, le montant et le motif.");
            return;
        }
        const montantNum = Number(form.montant);
        if (!Number.isFinite(montantNum) || montantNum <= 0) {
            toast.error("Montant invalide.");
            return;
        }

        const selectedCmd = commandesOptions.find((c) => c.id === Number(form.commande_id));
        if (selectedCmd) {
            const maxRemboursable = getMontantRemboursable(selectedCmd.montant_ttc, selectedCmd.total_regle);
            if (montantNum > maxRemboursable) {
                toast.error(
                    `Le montant du remboursement ne peut pas dépasser le montant déjà réglé (${maxRemboursable.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH).`
                );
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const res = await fetch("/api/remboursements", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({
                    commande_id: Number(form.commande_id),
                    montant: montantNum,
                    motif: form.motif.trim(),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success("Demande de remboursement enregistrée.");
                setCreateOpen(false);
                setEditingRemboursement(null);
                setForm({ commande_id: "", montant: "", motif: "" });
                fetchList();
                window.dispatchEvent(new CustomEvent("approvals-updated"));
            } else {
                toast.error(data.message || "Erreur lors de l'enregistrement.");
            }
        } catch {
            toast.error("Erreur réseau.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRemboursement || !form.montant || !form.motif.trim()) {
            toast.error("Veuillez remplir le montant et le motif.");
            return;
        }
        const montantNum = Number(form.montant);
        if (!Number.isFinite(montantNum) || montantNum <= 0) {
            toast.error("Montant invalide.");
            return;
        }

        const maxRemboursable = getMontantRemboursable(
            editingRemboursement.commande_montant_ttc,
            editingRemboursement.commande_total_regle
        );
        if (montantNum > maxRemboursable) {
            toast.error(
                `Le montant du remboursement ne peut pas dépasser le montant déjà réglé (${maxRemboursable.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH).`
            );
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/remboursements/${editingRemboursement.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({
                    montant: montantNum,
                    motif: form.motif.trim(),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success("Demande de remboursement mise à jour.");
                setCreateOpen(false);
                setEditingRemboursement(null);
                setForm({ commande_id: "", montant: "", motif: "" });
                fetchList();
                window.dispatchEvent(new CustomEvent("approvals-updated"));
            } else {
                toast.error(data.message || "Erreur lors de la mise à jour.");
            }
        } catch {
            toast.error("Erreur réseau.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEdit = (r: Remboursement) => {
        if (r.statut !== "en_attente") return;
        setEditingRemboursement(r);
        setForm({
            commande_id: String(r.commande_id),
            montant: String(r.montant),
            motif: r.motif || "",
        });
        setCreateOpen(true);
    };

    const confirmDelete = async () => {
        if (!remboursementToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/remboursements/${remboursementToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success("Demande de remboursement supprimée.");
                fetchList();
                setDeleteDialogOpen(false);
                setRemboursementToDelete(null);
                window.dispatchEvent(new CustomEvent("approvals-updated"));
            } else {
                toast.error(data.message || "Erreur lors de la suppression.");
            }
        } catch {
            toast.error("Erreur réseau.");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleExport = () => {
        const headers = ["ID", "Code", "Commande", "Client", "Montant (DH)", "Motif", "Statut", "Créé par", "Date"];
        const rows = filteredList.map(r => [
            r.id,
            formatRemboursementCode(r),
            r.numero_commande,
            r.client_nom || "—",
            r.montant,
            r.motif,
            r.statut === "valide" ? "Validé" : r.statut === "rejete" ? "Rejeté" : "En attente",
            r.created_by_prenom && r.created_by_nom ? `${r.created_by_prenom} ${r.created_by_nom}` : "—",
            new Date(r.created_at).toLocaleDateString("fr-FR")
        ]);

        exportToExcel({
            headers,
            rows,
            fileName: `remboursements_${new Date().toISOString().split('T')[0]}`,
            sheetName: "Remboursements"
        });
        toast.success("Remboursements exportés avec succès !");
    };

    const exportToPDF = async () => {
        try {
            const doc = new jsPDF({ orientation: "landscape" });
            const pageWidth = doc.internal.pageSize.getWidth();

            const loadImgToBase64 = (url: string) => new Promise<string | null>((res) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = url;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width; canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) { res(null); return; }
                    ctx.drawImage(img, 0, 0);
                    res(canvas.toDataURL("image/jpeg", 0.7));
                };
                img.onerror = () => res(null);
            });

            const logoImgData = await loadImgToBase64(AurevoxLogo);

            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageWidth, 40, "F");

            if (logoImgData) doc.addImage(logoImgData, "JPEG", 14, 8, 20, 20);

            doc.setFontSize(20);
            doc.setTextColor(67, 56, 202);
            doc.setFont("helvetica", "bold");
            doc.text("AUREVOX AGENCY", 40, 18);

            doc.setFontSize(12);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text("Liste des Remboursements", 40, 24);

            const tableData = filteredList.map((r) => [
                formatRemboursementCode(r),
                r.numero_commande || "—",
                r.client_nom || "—",
                `${Number(r.montant).toFixed(2)} DH`,
                r.motif || "—",
                r.statut === "valide" ? "Validé" : r.statut === "rejete" ? "Rejeté" : "En attente",
                new Date(r.created_at).toLocaleDateString("fr-FR")
            ]);

            autoTable(doc, {
                startY: 45,
                head: [["Code", "Commande", "Client", "Montant", "Motif", "Statut", "Date"]],
                body: tableData,
                theme: "grid",
                headStyles: { fillColor: [67, 56, 202], textColor: 255, fontSize: 9, fontStyle: "bold", halign: "center" },
                bodyStyles: { fontSize: 8 },
                columnStyles: { 3: { halign: "right" }, 5: { halign: "center" } },
            });

            doc.save(`remboursements_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            toast.error("Erreur lors de l'export PDF");
        }
    };

    const filteredList = list.filter(r => {
        const matchesFilter = filterCommandeId ? Number(r.commande_id) === Number(filterCommandeId) : true;
        const matchesSearch = searchTerm 
            ? r.numero_commande?.toLowerCase().includes(searchTerm.toLowerCase()) || 
              r.client_nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              formatRemboursementCode(r).toLowerCase().includes(searchTerm.toLowerCase())
            : true;
        
        const date = new Date(r.created_at);
        const matchesMonth = filterMonth === "all" || (date.getMonth() + 1).toString() === filterMonth;
        const matchesYear = filterYear === "all" || date.getFullYear().toString() === filterYear;
        const matchesStatus = filterStatus === "all" || r.statut === filterStatus;
        const matchesSousSociete = matchesSousSocieteListFilter(
            filterSousSociete,
            r.sous_societe_nom,
            r.numero_commande
        );
        const matchesPointDeVente =
            filterPointDeVente === "all" ||
            String(r.point_de_vente_nom || "").trim() === filterPointDeVente;

        return matchesFilter && matchesSearch && matchesMonth && matchesYear && matchesStatus && matchesSousSociete && matchesPointDeVente;
    });

    const sousSocieteOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    [...allSousSocieteNames, ...list
                        .map((r) => String(r.sous_societe_nom || "").trim())
                        .filter(Boolean)]
                )
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [list, allSousSocieteNames]
    );
    const pointDeVenteOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    list
                        .map((r) => String(r.point_de_vente_nom || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [list]
    );

    const totalPages = Math.ceil(filteredList.length / itemsPerPage);
    const paginatedList = filteredList.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterStatus, filterMonth, filterYear, filterSousSociete, filterPointDeVente]);

    const reportData = {
        totalMontant: filteredList.reduce((acc, r) => acc + Number(r.montant), 0),
        count: filteredList.length,
        statusCounts: {
            valide: filteredList.filter(r => r.statut === "valide").length,
            rejete: filteredList.filter(r => r.statut === "rejete").length,
            en_attente: filteredList.filter(r => r.statut === "en_attente").length
        }
    };

    const getStatutBadge = (statut: string) => {
        switch (statut) {
            case "valide":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> Validé
                    </span>
                );
            case "rejete":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        <XCircle className="h-3 w-3" /> Rejeté
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        <Clock className="h-3 w-3" /> En attente
                    </span>
                );
        }
    };

    const formatRemboursementCode = (r: Remboursement) => {
        const d = new Date(r.created_at);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `RM/${y}${m}${day}/${r.id}`;
    };

    const selectedCommande = commandesOptions.find((c) => c.id === Number(form.commande_id));
    const isEditMode = !!editingRemboursement;
    const maxMontant = isEditMode && editingRemboursement
        ? getMontantRemboursable(editingRemboursement.commande_montant_ttc, editingRemboursement.commande_total_regle)
        : getMontantRemboursable(selectedCommande?.montant_ttc, selectedCommande?.total_regle);

    return (
        <div className="space-y-6 pb-8 animate-in fade-in duration-300">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Banknote className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Remboursements
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gérez vos demandes de remboursement</p>
                </div>
            </div>

            {/* QUICK STATS */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    { label: "Total Remb.", val: list.length, icon: Banknote, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
                    { label: "Montant total (filtré)", val: `${reportData.totalMontant.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH`, icon: DollarSign, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                    { label: "En Attente", val: reportData.statusCounts.en_attente, icon: Clock, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" },
                    { label: "Validés", val: reportData.statusCounts.valide, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                    { label: "Rejetés", val: reportData.statusCounts.rejete, icon: XCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20" },
                ].map((s, idx) => (
                    <div key={idx} className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", s.bg, s.color)}><s.icon className="h-5 w-5" /></div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{s.label}</p>
                            <p className="text-xl font-bold text-foreground truncate">{s.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-4">
                <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-wrap justify-between items-center gap-4 backdrop-blur-sm">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-11 border-transparent bg-muted focus:bg-card focus:border-indigo-500 border rounded-xl"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant="outline"
                            className={cn("h-11 px-4 rounded-xl gap-2", showFilters && "bg-indigo-50 border-indigo-200 text-indigo-600")}
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <Filter className="h-4 w-4" />
                            Filtres
                            {(filterStatus !== "all" || filterMonth !== "all" || filterYear !== "all" || filterSousSociete !== "all" || filterPointDeVente !== "all") && (
                                <span className="h-2 w-2 rounded-full bg-indigo-600" />
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            className="h-11 px-4 rounded-xl gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-all"
                            onClick={handleExport}
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
                        <Button
                            onClick={() => setCreateOpen(true)}
                            className="h-11 px-6 rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 dark:shadow-none transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Plus className="h-4 w-4" />
                            Nouvelle demande
                        </Button>
                    </div>
                </div>

                {showFilters && (
                    <div className="bg-muted/30 p-4 rounded-[1.5rem] border border-border grid grid-cols-1 sm:grid-cols-5 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Statut</Label>
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                    <SelectValue placeholder="Tous les statuts" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les statuts</SelectItem>
                                    <SelectItem value="en_attente">En attente</SelectItem>
                                    <SelectItem value="valide">Validé</SelectItem>
                                    <SelectItem value="rejete">Rejeté</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Société</Label>
                            <Select value={filterSousSociete} onValueChange={setFilterSousSociete}>
                                <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                    <SelectValue placeholder="Toutes les sociétés" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Toutes les sociétés</SelectItem>
                                    {sousSocieteOptions.map((name) => (
                                        <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Point de vente</Label>
                            <Select value={filterPointDeVente} onValueChange={setFilterPointDeVente}>
                                <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                    <SelectValue placeholder="Tous les points de vente" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les points de vente</SelectItem>
                                    {pointDeVenteOptions.map((name) => (
                                        <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Mois</Label>
                            <Select value={filterMonth} onValueChange={setFilterMonth}>
                                <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                    <SelectValue placeholder="Tous les mois" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les mois</SelectItem>
                                    {months.map(m => (
                                        <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Année</Label>
                            <Select value={filterYear} onValueChange={setFilterYear}>
                                <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                    <SelectValue placeholder="Toutes les années" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Toutes les années</SelectItem>
                                    {years.map(y => (
                                        <SelectItem key={y} value={y}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
            </div>

            <Card className="border border-border shadow-sm overflow-hidden rounded-2xl bg-card/50 backdrop-blur-sm">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : list.length === 0 ? (
                        <p className="text-center text-muted-foreground py-12">
                            Aucune demande de remboursement.
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Code</TableHead>
                                        <TableHead className="font-semibold">Commande</TableHead>
                                        <TableHead className="font-semibold">Client</TableHead>
                                        <TableHead className="font-semibold text-right">Montant</TableHead>
                                        <TableHead className="font-semibold">Motif</TableHead>
                                        <TableHead className="font-semibold">Statut</TableHead>
                                        <TableHead className="font-semibold">Créé par</TableHead>
                                        <TableHead className="font-semibold">Date</TableHead>
                                        <TableHead className="font-semibold text-right w-[80px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedList.map((r) => (
                                        <TableRow key={r.id} className="border-b border-border/50">
                                            <TableCell>
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/dashboard/remboursements/${r.id}`)}
                                                    className="font-mono text-indigo-600 hover:underline text-xs"
                                                >
                                                    {formatRemboursementCode(r)}
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/dashboard/commandes/${r.commande_id}`)}
                                                    className="font-mono text-indigo-600 hover:underline text-sm"
                                                >
                                                    {r.numero_commande}
                                                </button>
                                            </TableCell>
                                            <TableCell className="text-sm">{r.client_nom || "—"}</TableCell>
                                            <TableCell className="text-right font-medium">
                                                {Number(r.montant).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate text-sm" title={r.motif}>
                                                {r.motif}
                                            </TableCell>
                                            <TableCell>{getStatutBadge(r.statut)}</TableCell>
                                            <TableCell className="text-sm">
                                                {r.created_by_prenom && r.created_by_nom
                                                    ? `${r.created_by_prenom} ${r.created_by_nom}`
                                                    : "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(r.created_at).toLocaleDateString("fr-FR", {
                                                    day: "2-digit",
                                                    month: "2-digit",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56">
                                                        <DropdownMenuItem onClick={() => navigate(`/dashboard/commandes/${r.commande_id}`)} className="cursor-pointer">
                                                            <Eye className="h-4 w-4" />
                                                            Voir
                                                        </DropdownMenuItem>
                                                        {r.statut === "valide" && (
                                                            <DropdownMenuItem
                                                                onClick={async () => {
                                                                    try {
                                                                        await generateRecuRemboursementPdf({
                                                                            id: r.id,
                                                                            client_nom: r.client_nom || "Client",
                                                                            numero_commande: r.numero_commande,
                                                                            montant: Number(r.montant),
                                                                            motif: r.motif || "",
                                                                            created_at: r.created_at,
                                                                            valide_par_nom: r.valide_par_nom,
                                                                            valide_par_prenom: r.valide_par_prenom,
                                                                            commande_montant_ttc: Number(r.commande_montant_ttc || 0),
                                                                            commande_total_regle: Number(r.commande_total_regle || 0),
                                                                        });
                                                                        toast.success("Reçu de remboursement téléchargé.");
                                                                    } catch (e) {
                                                                        console.error(e);
                                                                        toast.error("Erreur lors de la génération du reçu.");
                                                                    }
                                                                }}
                                                                className="cursor-pointer"
                                                            >
                                                                <Download className="h-4 w-4" />
                                                                Télécharger reçu Remboursement
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (r.statut === "en_attente") openEdit(r);
                                                                else toast.error("Seule une demande en attente peut être modifiée.");
                                                            }}
                                                            className="cursor-pointer"
                                                            disabled={r.statut !== "en_attente"}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        {isAdmin && (
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    if (r.statut === "en_attente") {
                                                                        setRemboursementToDelete(r);
                                                                        setDeleteDialogOpen(true);
                                                                    } else {
                                                                        toast.error("Seule une demande en attente peut être supprimée.");
                                                                    }
                                                                }}
                                                                disabled={r.statut !== "en_attente"}
                                                                variant="destructive"
                                                                className="cursor-pointer text-red-600 focus:text-red-600"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                Supprimer
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination UI */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4 bg-card border border-border rounded-2xl shadow-sm">
                    <div className="text-xs text-muted-foreground font-medium hidden sm:block">
                        <span className="text-foreground font-bold">{(currentPage - 1) * itemsPerPage + 1}</span>-
                        <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredList.length)}</span> sur
                        <span className="text-foreground font-bold"> {filteredList.length}</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 ml-auto sm:ml-0">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95 text-muted-foreground"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95 text-muted-foreground"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <div className="flex items-center gap-1 mx-1">
                            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 2) {
                                    pageNum = i + 1;
                                } else if (currentPage >= totalPages - 1) {
                                    pageNum = totalPages - 2 + i;
                                } else {
                                    pageNum = currentPage - 1 + i;
                                }

                                return (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? "default" : "outline"}
                                        size="icon"
                                        className={cn(
                                            "h-8 w-8 transition-all duration-300 active:scale-95 text-xs",
                                            currentPage === pageNum
                                                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 dark:shadow-none font-bold"
                                                : "border-border hover:bg-muted hover:text-indigo-600 text-muted-foreground"
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
                            className="h-8 w-8 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95 text-muted-foreground"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95 text-muted-foreground"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            <Dialog
                open={createOpen}
                onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) {
                        setEditingRemboursement(null);
                        setForm({ commande_id: "", montant: "", motif: "" });
                    }
                }}
            >
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {isEditMode ? "Modifier la demande de remboursement" : "Nouvelle demande de remboursement"}
                        </DialogTitle>
                        <DialogDescription>
                            {isEditMode
                                ? "Modifiez le montant et le motif. La commande ne peut pas être changée."
                                : "Choisissez une commande payée non facturée. Le montant remboursable (déjà réglé) est importé automatiquement, puis vous pouvez compléter le motif."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={isEditMode ? handleUpdate : handleCreate} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Commande (payée, non facturée)</Label>
                            {isEditMode && editingRemboursement ? (
                                <Input
                                    value={`${editingRemboursement.numero_commande} — ${editingRemboursement.client_nom || "—"}`}
                                    readOnly
                                    disabled
                                    className="bg-muted"
                                />
                            ) : (
                                <>
                                    <Select
                                        value={form.commande_id || undefined}
                                        onValueChange={(v) => {
                                            if (v === "__placeholder__") return;
                                            const cmd = commandesOptions.find((c) => c.id === Number(v));
                                            setForm((prev) => ({
                                                ...prev,
                                                commande_id: v,
                                                montant: cmd ? String(getMontantRemboursable(cmd.montant_ttc, cmd.total_regle)) : prev.montant,
                                            }));
                                        }}
                                        disabled={loadingCommandes}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder={loadingCommandes ? "Chargement..." : "Sélectionner une commande"} />
                                        </SelectTrigger>
                                        <SelectContent className="z-[200]" position="popper">
                                            {loadingCommandes ? (
                                                <div className="py-4 text-center text-sm text-muted-foreground">
                                                    Chargement des commandes...
                                                </div>
                                            ) : commandesOptions.length === 0 ? (
                                                <SelectItem value="__placeholder__" disabled>
                                                    Aucune commande payée non facturée
                                                </SelectItem>
                                            ) : (
                                                commandesOptions.map((c) => (
                                                    <SelectItem key={c.id} value={String(c.id)}>
                                                        {c.numero_commande} — {c.client_nom || "—"} —{" "}
                                                        {Number(c.total_regle).toLocaleString("fr-FR")} DH réglé /{" "}
                                                        {Number(c.montant_ttc).toLocaleString("fr-FR")} DH TTC
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {!loadingCommandes && commandesOptions.length === 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            Seules les commandes avec règlement approuvé et sans facture associée apparaissent ici.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Montant (DH)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={form.montant}
                                onChange={(e) => setForm((prev) => ({ ...prev, montant: e.target.value }))}
                                max={maxMontant ? maxMontant : undefined}
                            />
                            {maxMontant > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Max. {Number(maxMontant).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH (montant déjà réglé)
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Motif</Label>
                            <Textarea
                                placeholder="Raison du remboursement..."
                                value={form.motif}
                                onChange={(e) => setForm((prev) => ({ ...prev, motif: e.target.value }))}
                                rows={3}
                                className="resize-none"
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setCreateOpen(false);
                                    setEditingRemboursement(null);
                                    setForm({ commande_id: "", montant: "", motif: "" });
                                }}
                            >
                                Annuler
                            </Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
                                {isSubmitting ? (
                                    <RefreshCcw className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Banknote className="h-4 w-4 mr-2" />
                                )}
                                {isEditMode ? "Mettre à jour" : "Enregistrer la demande"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer la demande de remboursement ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            La demande pour la commande <span className="font-semibold">{remboursementToDelete?.numero_commande}</span> ({Number(remboursementToDelete?.montant).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH) sera définitivement supprimée.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); confirmDelete(); }}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            {isDeleting ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
                            {isDeleting ? "Suppression..." : "Supprimer"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-indigo-600" />
                            Rapport d'Activité : Remboursements
                        </DialogTitle>
                        <DialogDescription>
                            Résumé des remboursements basés sur les filtres actuels.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-8">
                        <div className="space-y-4">
                            <div className="p-4 bg-muted/50 rounded-2xl border border-border">
                                <p className="text-xs font-bold text-muted-foreground uppercase">Nombre de Demandes</p>
                                <p className="text-3xl font-black text-foreground">{reportData.count}</p>
                            </div>
                            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/20">
                                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase">Total Montant</p>
                                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{reportData.totalMontant.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/20 flex justify-between items-center">
                                <span className="text-sm font-medium">En attente</span>
                                <span className="font-bold text-amber-600">{reportData.statusCounts.en_attente}</span>
                            </div>
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/20 flex justify-between items-center">
                                <span className="text-sm font-medium">Validés</span>
                                <span className="font-bold text-emerald-600">{reportData.statusCounts.valide}</span>
                            </div>
                            <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20 flex justify-between items-center">
                                <span className="text-sm font-medium">Rejetés</span>
                                <span className="font-bold text-red-600">{reportData.statusCounts.rejete}</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowReportDialog(false)} className="bg-indigo-600">Fermer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
