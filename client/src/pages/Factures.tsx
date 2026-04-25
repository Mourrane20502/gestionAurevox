import { useEffect, useRef, useState } from "react";
import { exportToExcel } from "@/utils/exportExcel";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/common/ui/tabs";
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
    FileText,
    Plus,
    Search,
    Printer,
    User,
    CheckCircle2,
    AlertCircle,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    RotateCcw,
    BarChart3,
    Filter,
    Calendar,
    FileSpreadsheet,
    UserPlus,
    ShieldCheck,
    XCircle,
    Clock,
    Download,
    Banknote,
    MoreVertical,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DeleteSvgIcon, EditSvgIcon, ViewSvgIcon } from "@/components/icons/actionSvgIcons";
import { generateFacturePdf } from "@/components/pdf/FacturePdf";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Client {
    id: number;
    nom_complet: string;
}

interface Product {
    id: number;
    nom: string;
    reference?: string | null;
    prix: number;
}

interface Commande {
    id: number;
    numero_commande: string;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    total_regle?: number;
    reste_a_payer?: number;
    statut?: string;
    facture_id?: number | null;
    has_avoir?: number | boolean | unknown;
    has_avoir_facture?: number | boolean | unknown;
}

interface FactureItem {
    id?: number;
    produit_id?: number;
    designation: string;
    quantite: number;
    prix_unitaire: number;
    tva: number;
    reduction: number;
    montant_ht: number;
}

interface Facture {
    id: number;
    numero_facture: string;
    date_facture: string;
    date_echeance: string;
    client_id: number;
    client_nom: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    statut: string;
    mode_paiement: string;
    client_type?: string;
    commande_id?: number | null;
    devis_id?: number | null;
    reduction?: number;
    total_reduction?: number;
    user_nom?: string;
    user_id?: number;
    point_de_vente_nom?: string;
    total_regle?: number;
    reste_a_payer?: number;
    sous_societe_nom?: string | null;
}
type SousSocieteOption = { id: number; nom_sous_societe: string };

/** Aligné sur la liste commandes : réglée si encaissement complet, statut paiement, ou facture liée déjà payée. */
function isCommandeRegleePourFacturation(cmdData: any, facturesList: any[]): boolean {
    if (!cmdData) return false;
    const cmdId = Number(cmdData.id);
    if (!Number.isFinite(cmdId)) return false;
    const cmdTotalRegle = Number(cmdData.total_regle) || 0;
    const montantTtc =
        Number(cmdData.montant_ttc) ||
        (Number(cmdData.montant_ht) + Number(cmdData.montant_tva)) ||
        0;
    const paidByAmounts = montantTtc > 0 && cmdTotalRegle >= montantTtc - 0.01;
    const st = String(cmdData.statut || "").toLowerCase();
    const regleeByStatut = st === "paye" || st === "payee" || st === "reglee";
    const linkedFacture = Array.isArray(facturesList)
        ? facturesList.find((f: any) => Number(f?.commande_id) === cmdId)
        : undefined;
    const facturePayee =
        !!linkedFacture &&
        (linkedFacture.statut === "paye" || linkedFacture.statut === "payee");
    return facturePayee || regleeByStatut || paidByAmounts;
}

const getSousSocieteLabel = (doc: { sous_societe_nom?: string | null; numero_facture?: string | null }) => {
    const fromName = String(doc.sous_societe_nom || "").trim();
    return fromName || "—";
};

function truthyAvoirFlag(v: unknown): boolean {
    if (v === true || v === 1) return true;
    if (typeof v === "string" && v === "1") return true;
    return false;
}

function isCommandeEligibleForFactureLink(
    cmd: any,
    facturesList: Facture[],
    remboursementMap: Record<number, number>,
    editingFactureId: number | null | undefined
): boolean {
    const cid = Number(cmd?.id);
    if (!Number.isFinite(cid)) return false;
    if (remboursementMap[cid]) return false;
    if (truthyAvoirFlag(cmd?.has_avoir) || truthyAvoirFlag(cmd?.has_avoir_facture)) return false;
    const fid = cmd?.facture_id != null ? Number(cmd.facture_id) : null;
    const edNum =
        editingFactureId != null && Number.isFinite(Number(editingFactureId))
            ? Number(editingFactureId)
            : null;
    if (fid != null && (edNum == null || fid !== edNum)) return false;
    const linkedOther = facturesList.some(
        f => Number(f.commande_id) === cid && (edNum == null || Number(f.id) !== edNum)
    );
    if (linkedOther) return false;
    return true;
}

function isFacturePaidForAvoir(facture: Facture, commandes: { id: number; total_regle?: number; reste_a_payer?: number }[]): boolean {
    let totalRegle = Number(facture.total_regle) || 0;
    const montantTtc = Number(facture.montant_ttc) || 0;
    if (!totalRegle && facture.commande_id) {
        const linkedCmd = commandes.find(c => c.id === facture.commande_id);
        if (linkedCmd) totalRegle = Number((linkedCmd as any).total_regle) || 0;
    }
    const paidByAmounts = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
    return facture.statut === "paye" || facture.statut === "payee" || paidByAmounts;
}

function getFactureRemainingForPayment(facture: Facture, commandes: { id: number; total_regle?: number; reste_a_payer?: number }[]): number {
    const montantTtc = Number(facture.montant_ttc) || 0;
    let totalRegle = Number(facture.total_regle) || 0;
    if (!totalRegle && facture.commande_id) {
        const linkedCmd = commandes.find(c => c.id === facture.commande_id);
        if (linkedCmd) totalRegle = Number((linkedCmd as any).total_regle) || 0;
    }
    return Math.max(montantTtc - totalRegle, 0);
}

function factureMatchesStatusFilter(
    f: Facture,
    filterStatus: string,
    commandes: Commande[],
    factureIdsWithAvoir: number[],
    remboursementMap: Record<number, number>
): boolean {
    if (filterStatus === "all") return true;
    const isReglee = isFacturePaidForAvoir(f, commandes);
    if (filterStatus === "regle") return isReglee;
    if (filterStatus === "non_regle") return !isReglee;
    if (filterStatus === "rembourse") {
        const cmdId = f.commande_id != null ? Number(f.commande_id) : NaN;
        return Number.isFinite(cmdId) && !!remboursementMap[cmdId];
    }
    if (filterStatus === "rendu") return factureIdsWithAvoir.includes(f.id);
    return f.statut === filterStatus;
}

function Factures() {
    const role = localStorage.getItem("role");
    const isCommercial = role === "user" || role === "commercial";
    const isAdmin = role === "admin" || role === "responsable";
    const nav = useNavigate();
    const location = useLocation();
    const lastNavCommandeImportRef = useRef<number | null>(null);

    const [factures, setFactures] = useState<Facture[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [commandes, setCommandes] = useState<Commande[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<string>("list");
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [calculatedValues, setCalculatedValues] = useState({ montantTVA: 0, montantTTC: 0 });
    const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);
    const [editingFacture, setEditingFacture] = useState<Facture | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [factureToDelete, setFactureToDelete] = useState<Facture | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [avoirDialogOpen, setAvoirDialogOpen] = useState(false);
    const [selectedFactureForAvoir, setSelectedFactureForAvoir] = useState<Facture | null>(null);
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterClientType, setFilterClientType] = useState<string>("all");
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [showQuickAddClientDialog, setShowQuickAddClientDialog] = useState(false);
    const [pendingClientName, setPendingClientName] = useState("");
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [commandeSearch, setCommandeSearch] = useState("");
    const [showCommandeDropdown, setShowCommandeDropdown] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [filterUser, setFilterUser] = useState<string>("all");
    const [filterClient, setFilterClient] = useState<string>("all");
    const [filterSousSociete, setFilterSousSociete] = useState<string>("all");
    const [filterPointDeVente, setFilterPointDeVente] = useState<string>("all");
    const [allSousSocieteNames, setAllSousSocieteNames] = useState<string[]>([]);
    const [banques, setBanques] = useState<any[]>([]);
    const [paymentModes, setPaymentModes] = useState<any[]>([]);
    const itemsPerPage = 10;
    const [factureIdsWithAvoir, setFactureIdsWithAvoir] = useState<number[]>([]);
    const [factureAvoirMap, setFactureAvoirMap] = useState<Record<number, number>>({});
    const [remboursementMap, setRemboursementMap] = useState<Record<number, number>>({});
    const [showReglementDialog, setShowReglementDialog] = useState(false);
    const [createdFactureIdForReglement, setCreatedFactureIdForReglement] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        numero_facture: "",
        date_facture: new Date().toISOString().split('T')[0],
        date_echeance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        mode_paiement: "virement",
        statut: "en_attente",
        commande_id: "none",
        devis_id: "none",
        reduction: "0",
        banque_id: "none",
        paiement_espece_type: "total",
        montant_paye: ""
    });

    const [items, setItems] = useState<FactureItem[]>([
        { designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }
    ]);

    const token = localStorage.getItem("token");

    const fetchFactures = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/factures", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setFactures(data);
            }
        } catch (error) {
            console.error("Error:", error);
            toast.error("Erreur de chargement");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchClients = async () => {
        try {
            const response = await fetch("/api/clients", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setClients(await response.json());
        } catch (error) { console.error("Error fetching clients:", error); }
    };

    const fetchProducts = async () => {
        try {
            const response = await fetch("/api/products", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setProducts(await response.json());
        } catch (error) { console.error("Error fetching products:", error); }
    };

    const fetchCommandes = async () => {
        try {
            const response = await fetch("/api/commandes", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setCommandes(await response.json());
        } catch (error) { console.error("Error fetching commandes:", error); }
    };

    const fetchUsers = async () => {
        try {
            const response = await fetch("/api/users/all-users", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
            }
        } catch (error) { console.error("Error fetching users:", error); }
    };

    const fetchBanques = async () => {
        try {
            const response = await fetch("/api/banque", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setBanques(await response.json());
        } catch (error) { console.error("Error fetching banques:", error); }
    };

    const fetchAvoirsForFactures = async () => {
        try {
            const response = await fetch("/api/avoirs", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = (await response.json()) as any[];
                const ids: number[] = Array.from(
                    new Set(
                        data.map(a => a.facture_id).filter((id: any) => typeof id === "number")
                    )
                );
                const map: Record<number, number> = {};
                data.forEach((a: any) => {
                    if (typeof a.facture_id === "number" && typeof a.id === "number") {
                        map[a.facture_id] = a.id;
                    }
                });
                setFactureIdsWithAvoir(ids);
                setFactureAvoirMap(map);
            }
        } catch (error) {
            console.error("Error fetching avoirs for factures:", error);
        }
    };

    const handleApproveFacture = async (id: number) => {
        try {
            const response = await fetch(`/api/factures/${id}/approve`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success("Facture validée");
                fetchFactures();
            }
        } catch (error) { toast.error("Erreur serveur"); }
    };

    const handleRejectFacture = async (id: number) => {
        try {
            const response = await fetch(`/api/factures/${id}/reject`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success("Facture rejetée");
                fetchFactures();
            }
        } catch (error) { toast.error("Erreur serveur"); }
    };

    const fetchPaymentModes = async () => {
        try {
            const response = await fetch("/api/settings/payment-modes", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setPaymentModes(await response.json());
        } catch (error) { console.error("Error fetching payment modes:", error); }
    };

    const fetchRemboursements = async () => {
        try {
            const res = await fetch("/api/remboursements", { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                const map: Record<number, number> = {};
                (data as any[]).forEach((r: any) => {
                    if (r.commande_id != null) map[r.commande_id] = r.id;
                });
                setRemboursementMap(map);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchFactures();
        fetchClients();
        fetchProducts();
        fetchCommandes();
        fetchUsers();
        fetchBanques();
        fetchAvoirsForFactures();
        fetchPaymentModes();
        fetchRemboursements();
    }, []);

    useEffect(() => {
        const fetchSousSocietes = async () => {
            if (!token) return;
            try {
                const res = await fetch("/api/settings/sous-societes", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                const names = (Array.isArray(data) ? data : [])
                    .map((s: SousSocieteOption) => String(s?.nom_sous_societe || "").trim())
                    .filter(Boolean);
                setAllSousSocieteNames(Array.from(new Set(names)));
            } catch {
                // silent fallback to names present in factures list
            }
        };
        fetchSousSocietes();
    }, [token]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterPointDeVente]);

    useEffect(() => {
        const state = location.state as any;
        if (state?.openCreateForm) {
            setEditingFacture(null);
            setActiveTab("form");
            window.history.replaceState({}, document.title);
            return;
        }

        // Arrivée depuis une commande (await import pour éviter course avec le statut / règlement)
        if (state?.commandeId) {
            const cid = Number(state.commandeId);
            if (!Number.isFinite(cid)) return;
            if (lastNavCommandeImportRef.current === cid) return;
            lastNavCommandeImportRef.current = cid;
            const cameFromPaidCommande = state.skipReglement;
            void (async () => {
                await handleCommandeSelect(String(cid), { banqueIdFromNav: state.banqueId });
                setFormData((prev) => ({
                    ...prev,
                    ...(cameFromPaidCommande ? { statut: "paye" as const } : {}),
                }));
                setActiveTab("form");
                window.history.replaceState({}, document.title);
            })();
            return;
        }
        lastNavCommandeImportRef.current = null;

        // Arrivée depuis un avoir
        if (state?.factureId && factures.length > 0) {
            const targetId = Number(state.factureId);
            const facture = factures.find(f => f.id === targetId);
            if (facture) {
                setEditingFacture(facture);
                setActiveTab("form");
            }
            window.history.replaceState({}, document.title);
        }
    }, [location.state, factures]); // Note: only depends on location.state and factures for edits

    useEffect(() => {
        const fetchFactureDetails = async () => {
            if (editingFacture) {
                try {
                    const response = await fetch(`/api/factures/${editingFacture.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const fullFacture = await response.json();
                        setFormData({
                            numero_facture: fullFacture.numero_facture,
                            date_facture: fullFacture.date_facture.split('T')[0],
                            date_echeance: fullFacture.date_echeance.split('T')[0],
                            mode_paiement: fullFacture.mode_paiement,
                            statut: fullFacture.statut || "non_payee",
                            commande_id: fullFacture.commande_id?.toString() || "none",
                            devis_id: fullFacture.devis_id?.toString() || "none",
                            reduction: (fullFacture.reduction || 0).toString(),
                            banque_id: (fullFacture.banque_id != null && fullFacture.banque_id !== 0) ? String(fullFacture.banque_id) : "none",
                            paiement_espece_type: "total",
                            montant_paye: ""
                        });

                        // Normalize items
                        const normalizedItems = (fullFacture.items || []).map((it: any) => ({
                            ...it,
                            designation: it.designation || "",
                            tva: Number(it.tva) || 0,
                            reduction: Number(it.reduction) || 0,
                            quantite: Number(it.quantite) || 0,
                            prix_unitaire: Number(it.prix_unitaire) || 0,
                            montant_ht: Number(it.montant_ht) || 0
                        }));
                        setItems(normalizedItems);
                        calculateTotals(normalizedItems, Number(fullFacture.reduction));

                        // Handle client
                        const factClient = clients.find(c => c.id === fullFacture.client_id);
                        if (factClient) {
                            setSelectedClient(factClient);
                            setClientSearch(factClient.nom_complet);
                        } else if (fullFacture.client_nom) {
                            setClientSearch(fullFacture.client_nom);
                        }
                        // Set commandeSearch for autocomplete
                        if (fullFacture.commande_id) {
                            const linkedCmd = commandes.find(c => c.id === fullFacture.commande_id);
                            if (linkedCmd) setCommandeSearch(linkedCmd.numero_commande);
                        } else {
                            setCommandeSearch("");
                        }
                    }
                } catch (error) {
                    console.error("Error fetching details:", error);
                }
            }
        };
        fetchFactureDetails();
    }, [editingFacture, clients]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const calculateTotals = (currentItems: FactureItem[], forcedGlobalRed?: number) => {
        let itemsBruteHT = 0;
        let itemsNetHT = 0;
        let itemsTotalTVA = 0;
        let sumItemRedPct = 0; // simple sum of reduction percentages

        currentItems.forEach(item => {
            const qte = Number(item.quantite) || 0;
            const pu = Number(item.prix_unitaire) || 0;
            const brute = qte * pu;
            const redRate = (Number(item.reduction) || 0) / 100;
            const net = brute * (1 - redRate);
            const tva = (net * (Number(item.tva) || 0)) / 100;

            itemsBruteHT += brute;
            itemsNetHT += net;
            itemsTotalTVA += tva;
            sumItemRedPct += (Number(item.reduction) || 0);
        });

        // Global reduction = sum of all item reduction percentages
        const displayRed = forcedGlobalRed !== undefined ? forcedGlobalRed : sumItemRedPct;

        setCalculatedValues({ montantTVA: itemsTotalTVA, montantTTC: itemsNetHT + itemsTotalTVA });

        setFormData(prev => ({
            ...prev,
            reduction: displayRed % 1 === 0 ? displayRed.toString() : parseFloat(displayRed.toFixed(2)).toString()
        }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCommandeSelect = async (
        commandeIdStr: string,
        opts?: { banqueIdFromNav?: string | number | null }
    ) => {
        if (commandeIdStr === "none") {
            setFormData(prev => ({ ...prev, commande_id: "none", devis_id: "none" }));
            setItems([{ designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }]);
            setSelectedClient(null);
            setClientSearch("");
            return;
        }

        try {
            const response = await fetch(`/api/commandes/${commandeIdStr}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                const cmdData = await response.json();

                if (
                    !isCommandeEligibleForFactureLink(
                        cmdData,
                        factures,
                        remboursementMap,
                        editingFacture?.id
                    )
                ) {
                    toast.error(
                        "Cette commande ne peut pas être liée : sans remboursement, sans avoir, et sans autre facture."
                    );
                    setFormData(prev => ({ ...prev, commande_id: "none" }));
                    setCommandeSearch("");
                    return;
                }

                setFormData(prev => ({ ...prev, commande_id: commandeIdStr }));

                const montantTtcCommande =
                    Number(cmdData.montant_ttc) ||
                    (Number(cmdData.montant_ht) + Number(cmdData.montant_tva)) ||
                    0;
                const isReglee = isCommandeRegleePourFacturation(cmdData, factures);
                const cmdTotalRegle = Number(cmdData.total_regle) || 0;
                const totalRegleFacture = isReglee
                    ? cmdTotalRegle > 0
                        ? cmdTotalRegle
                        : montantTtcCommande
                    : undefined;

                const fromNav = opts?.banqueIdFromNav;
                const banqueFromNav =
                    fromNav != null &&
                    String(fromNav).trim() !== "" &&
                    String(fromNav) !== "none"
                        ? String(fromNav)
                        : null;
                const banqueFromCmd =
                    cmdData.banque_id != null &&
                    cmdData.banque_id !== 0 &&
                    String(cmdData.banque_id).trim() !== ""
                        ? String(cmdData.banque_id)
                        : null;

                // Auto-fill client, devis_id, banque et, si commande déjà réglée,
                // forcer le statut et mémoriser l'état de règlement pour la facture créée.
                setFormData((prev) => {
                    const { total_regle: _tr, reste_a_payer: _ra, ...rest } = prev as any;
                    const banqueFallback =
                        prev.banque_id && prev.banque_id !== "none" ? prev.banque_id : null;
                    const banque_id = banqueFromNav || banqueFromCmd || banqueFallback || "none";
                    return {
                        ...rest,
                        devis_id: cmdData.devis_id?.toString() || "none",
                        banque_id,
                        statut: isReglee ? "paye" : prev.statut === "paye" ? "en_attente" : prev.statut,
                        ...(isReglee
                            ? {
                                  total_regle: totalRegleFacture,
                                  reste_a_payer: 0,
                              }
                            : {}),
                    };
                });
                const cmdClient = clients.find(c => c.id === cmdData.client_id);
                if (cmdClient) {
                    setSelectedClient(cmdClient);
                    setClientSearch(cmdClient.nom_complet);
                } else if (cmdData.client_id && cmdData.client_nom) {
                    setSelectedClient({ id: cmdData.client_id, nom_complet: cmdData.client_nom });
                    setClientSearch(cmdData.client_nom);
                }

                // Always set search text
                setCommandeSearch(cmdData.numero_commande || "");

                // Auto-fill items
                if (cmdData.items && cmdData.items.length > 0) {
                    const mappedItems = cmdData.items.map((it: any) => ({
                        produit_id: it.produit_id,
                        designation: it.designation,
                        quantite: Number(it.quantite),
                        prix_unitaire: Number(it.prix_unitaire),
                        tva: it.tva !== undefined ? Number(it.tva) : 20,
                        reduction: Number(it.reduction) || 0,
                        montant_ht: Number(it.montant_ht) || 0
                    }));
                    setItems(mappedItems);
                    calculateTotals(mappedItems);
                }

                toast.success("Détails de la commande importés");
            }
        } catch (error) {
            console.error("Error fetching commande details:", error);
            toast.error("Erreur lors de l'importation");
        }
    };

    const handleItemChange = (index: number, field: keyof FactureItem, value: any) => {
        const newItems = [...items];
        const safeValue = typeof value === "number" && isNaN(value) ? 0 : value;
        newItems[index] = { ...newItems[index], [field]: safeValue };

        if (field === "designation") {
            newItems[index].produit_id = undefined;
        }

        if (field === "quantite" || field === "prix_unitaire" || field === "tva" || field === "reduction") {
            const bruteHT = (Number(newItems[index].quantite) || 0) * (Number(newItems[index].prix_unitaire) || 0);
            const redRate = (Number(newItems[index].reduction) || 0) / 100;
            newItems[index].montant_ht = bruteHT * (1 - redRate);
        }
        setItems(newItems);
        // Recalculate totals and let it update the global reduction field
        calculateTotals(newItems);
    };

    const handleProductSelect = (index: number, product: Product) => {
        const newItems = [...items];
        newItems[index] = {
            ...newItems[index],
            produit_id: product.id,
            designation: product.nom,
            prix_unitaire: product.prix,
            reduction: 0,
            montant_ht: (newItems[index].quantite || 1) * product.prix
        };
        setItems(newItems);
        calculateTotals(newItems, Number(formData.reduction) || 0);
        setActiveProductSearchIndex(null);
    };

    const addItem = () => {
        setItems([...items, { designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }]);
    };

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
        calculateTotals(newItems, Number(formData.reduction) || 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient && clientSearch.trim()) {
            setPendingClientName(clientSearch.trim());
            setShowQuickAddClientDialog(true);
            return;
        }
        if (!selectedClient) {
            toast.error("Veuillez sélectionner un client");
            return;
        }
        if (items.some(it => !it.designation)) {
            toast.error("Veuillez remplir toutes les désignations");
            return;
        }

        setIsSubmitting(true);
        try {
            const data: any = {
                ...formData,
                reduction: Number(formData.reduction) || 0,
                client_id: selectedClient?.id,
                items: items.map(it => ({
                    produit_id: it.produit_id,
                    quantite: Number(it.quantite),
                    prix_unitaire: Number(it.prix_unitaire),
                    tva: Number(it.tva),
                    reduction: Number(it.reduction) || 0,
                    designation: it.designation
                }))
            };

            // Si la facture est créée à partir d'une commande déjà réglée : recharger la commande
            // (la liste en mémoire peut être incomplète) et synchroniser statut / montants avec le backend.
            if (data.commande_id && data.commande_id !== "none") {
                const cmdIdNum = Number(data.commande_id);
                const cmdFromList = commandes.find(c => c.id === cmdIdNum);
                if (
                    cmdFromList &&
                    !isCommandeEligibleForFactureLink(
                        cmdFromList,
                        factures,
                        remboursementMap,
                        editingFacture?.id
                    )
                ) {
                    toast.error(
                        "Cette commande ne peut pas être liée : sans remboursement, sans avoir, sans autre facture."
                    );
                    setIsSubmitting(false);
                    return;
                }
            }

            if (!editingFacture && data.commande_id && data.commande_id !== "none") {
                const cmdIdNum = Number(data.commande_id);
                try {
                    const cmdRes = await fetch(`/api/commandes/${cmdIdNum}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (cmdRes.ok) {
                        const cmdData = await cmdRes.json();
                        if (isCommandeRegleePourFacturation(cmdData, factures)) {
                            const ttc =
                                Number(cmdData.montant_ttc) ||
                                (Number(cmdData.montant_ht) + Number(cmdData.montant_tva)) ||
                                0;
                            const regle = Number(cmdData.total_regle) || 0;
                            data.statut = "paye";
                            data.total_regle = regle > 0 ? regle : ttc;
                            data.reste_a_payer = 0;
                        }
                    }
                } catch {
                    /* ignore */
                }
            }

            const url = editingFacture ? `/api/factures/${editingFacture.id}` : "/api/factures";
            const method = editingFacture ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                toast.success(editingFacture ? "Facture mise à jour !" : "Facture créée !");
                // Notifier le sidebar pour rafraîchir le compteur d'approbations
                window.dispatchEvent(new CustomEvent("approvals-updated"));

                if (editingFacture) {
                    resetForm();
                    setActiveTab("list");
                    fetchFactures();
                } else {
                    const responseBody = await response.json().catch(() => ({}));
                    const newId = responseBody?.id ?? null;

                    // Considérer la facture comme payée soit si le backend renvoie statut "paye",
                    // soit si le formulaire avait déjà le statut "paye" (cas commande déjà réglée).
                    const paidStat = String(
                        responseBody?.statut || data.statut || formData.statut || ""
                    );
                    const isFacturePaid =
                        paidStat === "paye" || paidStat === "payee";

                    resetForm();
                    fetchFactures();
                    setActiveTab("list");
                    nav("/dashboard/factures");

                    if (!isFacturePaid) {
                        setCreatedFactureIdForReglement(newId);
                        setShowReglementDialog(true);
                    }
                }
            } else {
                let msg = "Erreur lors de l'enregistrement";
                try {
                    const body = await response.json();
                    if (body?.message && typeof body.message === "string") msg = body.message;
                } catch {
                    /* ignore */
                }
                toast.error(msg);
            }
        } catch (error) {
            console.error("Error:", error);
            toast.error("Erreur serveur");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({
            numero_facture: "",
            date_facture: new Date().toISOString().split('T')[0],
            date_echeance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            mode_paiement: "virement",
            statut: "en_attente",
            commande_id: "none",
            devis_id: "none",
            reduction: "0",
            banque_id: "none",
            paiement_espece_type: "total",
            montant_paye: ""
        });
        setItems([{ designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }]);
        setSelectedClient(null);
        setClientSearch("");
        setCommandeSearch("");
        setEditingFacture(null);
        setCalculatedValues({ montantTVA: 0, montantTTC: 0 });
        setShowClientDropdown(false);
    };

    const handleQuickAddClient = async () => {
        if (!pendingClientName.trim()) return;
        setIsAddingClient(true);
        try {
            const response = await fetch("/api/clients", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ nom_complet: pendingClientName, type: "particulier" }),
            });
            if (response.ok) {
                const newClient = await response.json();
                toast.success("Client ajouté et sélectionné !");
                await fetchClients(); // Refresh list
                setSelectedClient(newClient);
                setClientSearch(newClient.nom_complet);
                setShowQuickAddClientDialog(false);
                setPendingClientName("");
            } else {
                toast.error("Erreur lors de l'ajout du client");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        } finally {
            setIsAddingClient(false);
        }
    };

    const handleDelete = async () => {
        if (!factureToDelete) return;
        try {
            const response = await fetch(`/api/factures/${factureToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success("Facture supprimée");
                fetchFactures();
            }
        } catch (error) {
            toast.error("Erreur suppression");
        } finally {
            setDeleteDialogOpen(false);
            setFactureToDelete(null);
        }
    };

    const filteredFactures = factures.filter(f => {
        const matchesSearch = f.numero_facture.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.client_nom?.toLowerCase().includes(searchTerm.toLowerCase());

        const date = new Date(f.date_facture);
        const matchesMonth = filterMonth === "all" || (date.getMonth() + 1).toString() === filterMonth;
        const matchesYear = filterYear === "all" || date.getFullYear().toString() === filterYear;
        const matchesStatus = factureMatchesStatusFilter(
            f,
            filterStatus,
            commandes,
            factureIdsWithAvoir,
            remboursementMap
        );
        const matchesClientType = filterClientType === "all" || f.client_type === filterClientType;
        const matchesUser = filterUser === "all" || f.user_id?.toString() === filterUser;
        const matchesClient = filterClient === "all" || f.client_id?.toString() === filterClient;
        const matchesPointDeVente =
            filterPointDeVente === "all" ||
            String(f.point_de_vente_nom || "").trim().toLowerCase() === filterPointDeVente;
        let matchesSousSociete = true;
        if (filterSousSociete !== "all") {
            const currentName = String(f.sous_societe_nom || "").trim().toLowerCase();
            const wantedName = String(filterSousSociete || "").trim().toLowerCase();
            const selectedTag =
                String(filterSousSociete || "")
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .match(/[A-Za-z0-9]/)?.[0]
                    ?.toUpperCase() || "";
            const codeHasTag = selectedTag
                ? String(f.numero_facture || "").toUpperCase().includes(`-${selectedTag}-`)
                : false;
            matchesSousSociete = currentName === wantedName || codeHasTag;
        }

        return matchesSearch && matchesMonth && matchesYear && matchesStatus && matchesClientType && matchesUser && matchesClient && matchesPointDeVente && matchesSousSociete;
    });

    const exportToXLS = () => {
        const headers = ["N° Facture", "Client", "Date", "Échéance", "Montant HT", "Montant TVA", "Montant", "Statut", "Mode Paiement"];
        const rows = filteredFactures.map(f => [
            f.numero_facture,
            f.client_nom,
            new Date(f.date_facture).toLocaleDateString(),
            new Date(f.date_echeance).toLocaleDateString(),
            Number(f.montant_ht) || 0,
            Number(f.montant_tva) || 0,
            Number(f.montant_ttc) || 0,
            f.statut,
            f.mode_paiement
        ]);

        exportToExcel({
            headers,
            rows,
            fileName: `factures_export_${new Date().toISOString().split('T')[0]}`,
            sheetName: "Factures"
        });
        toast.success("Excel exporté avec succès");
    };

    const exportToPDF = async () => {
        try {
            const doc = new jsPDF({ orientation: "landscape" });
            const pageWidth = doc.internal.pageSize.getWidth();

            // Image loading helper
            const loadImgToBase64 = (url: string) => new Promise<string | null>((res) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = url;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) { res(null); return; }
                    ctx.drawImage(img, 0, 0);
                    res(canvas.toDataURL("image/jpeg", 0.7));
                };
                img.onerror = () => res(null);
            });

            let gestionnaireName = "Gestionnaire";
            let gestionnaireLogoUrl: string | null = null;
            try {
                const token = localStorage.getItem("token");
                const response = await fetch("/api/gestionnaires", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (response.ok) {
                    const data = await response.json();
                    const first = Array.isArray(data) ? data[0] : null;
                    const resolvedName = String(first?.nom || "").trim();
                    if (resolvedName) gestionnaireName = resolvedName;
                    if (first?.logo) {
                        gestionnaireLogoUrl = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${first.logo}`;
                    }
                }
            } catch {
                // fallback to default label if gestionnaire endpoint is unavailable
            }
            const logoImgData = gestionnaireLogoUrl
                ? await loadImgToBase64(gestionnaireLogoUrl)
                : null;

            // Header Background
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageWidth, 40, "F");

            // Logo
            if (logoImgData) {
                doc.addImage(logoImgData, "JPEG", 14, 8, 20, 20);
            }

            // Header Text
            doc.setFontSize(20);
            doc.setTextColor(67, 56, 202); // indigo
            doc.setFont("helvetica", "bold");
            doc.text(gestionnaireName, 40, 18);

            doc.setFontSize(12);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text("Liste des Factures", 40, 24);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Exporté le : ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageWidth - 14, 18, { align: "right" });
            doc.text(`Total : ${filteredFactures.length} factures`, pageWidth - 14, 24, { align: "right" });

            const tableData = filteredFactures.map((f) => {
                const montantHT = Number(f.montant_ht) || 0;
                const montantTVA = Number(f.montant_tva) || 0;
                const montantTTC = Number(f.montant_ttc) || (montantHT + montantTVA);
                const formattedTTC = montantTTC.toFixed(2).replace(".", ",");
                const totalRegle = Number(f.total_regle) || 0;
                const resteCalcule =
                    typeof f.reste_a_payer !== "undefined"
                        ? Number(f.reste_a_payer)
                        : Math.max(montantTTC - totalRegle, 0);
                const estReglee = isFacturePaidForAvoir(f, commandes);
                const reglementCommence = !estReglee && totalRegle > 0 && resteCalcule > 0;
                const statutReglement = estReglee
                    ? "Réglé"
                    : reglementCommence
                      ? "Règlement commencé"
                      : "Non réglé";

                return [
                    f.numero_facture,
                    f.client_nom || "—",
                    getSousSocieteLabel(f),
                    `${formattedTTC} DH`,
                    new Date(f.date_facture).toLocaleDateString("fr-FR"),
                    statutReglement,
                    f.point_de_vente_nom || "—",
                    f.user_nom || "—"
                ];
            });

            autoTable(doc, {
                startY: 45,
                head: [["Numéro", "Client", "Société", "Montant", "Date", "Statut règlement", "Point de vente", "Utilisateur"]],
                body: tableData,
                theme: "grid",
                headStyles: {
                    fillColor: [67, 56, 202],
                    textColor: 255,
                    fontSize: 9,
                    fontStyle: "bold",
                    halign: "center",
                    cellPadding: 3,
                },
                bodyStyles: {
                    fontSize: 8,
                    cellPadding: 3,
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252],
                },
                columnStyles: {
                    3: { halign: "right", fontStyle: "bold" },
                    4: { halign: "center" },
                    5: { halign: "center" },
                    6: { halign: "center" },
                },
                margin: { left: 14, right: 14 },
            });

            const totalFactures = filteredFactures.reduce((acc, f) => {
                const montantHT = Number(f.montant_ht) || 0;
                const montantTVA = Number(f.montant_tva) || 0;
                const montantTTC = Number(f.montant_ttc) || (montantHT + montantTVA);
                return acc + montantTTC;
            }, 0);
            const totalY = (doc as any).lastAutoTable?.finalY
                ? (doc as any).lastAutoTable.finalY + 8
                : 53;
            const totalFormatted = totalFactures.toFixed(2).replace(".", ",");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(31, 41, 55);
            doc.text(`Total : ${totalFormatted} DH`, pageWidth - 14, totalY, { align: "right" });
            doc.setFont("helvetica", "normal");

            // Footer
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Page ${i} / ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
            }

            doc.save(`factures_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            console.error("Erreur export PDF:", error);
            toast.error("Erreur lors de l'export PDF");
        }
    };

    const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
    const sousSocieteOptions = Array.from(
        new Set([
            ...allSousSocieteNames,
            ...factures
                .map((f) => String(f.sous_societe_nom || "").trim())
                .filter(Boolean),
        ])
    ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    const pointDeVenteOptions = Array.from(
        new Set(
            factures
                .map((f) => String(f.point_de_vente_nom || "").trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    const months = [
        { val: "1", label: "Janvier" }, { val: "2", label: "Février" }, { val: "3", label: "Mars" },
        { val: "4", label: "Avril" }, { val: "5", label: "Mai" }, { val: "6", label: "Juin" },
        { val: "7", label: "Juillet" }, { val: "8", label: "Août" }, { val: "9", label: "Septembre" },
        { val: "10", label: "Octobre" }, { val: "11", label: "Novembre" }, { val: "12", label: "Décembre" }
    ];

    const reportData = {
        totalHT: filteredFactures.reduce((acc, f) => acc + Number(f.montant_ht), 0),
        totalTVA: filteredFactures.reduce((acc, f) => acc + Number(f.montant_tva), 0),
        totalTTC: filteredFactures.reduce((acc, f) => acc + Number(f.montant_ttc), 0),
        count: filteredFactures.length,
        paidCount: filteredFactures.filter(f => f.statut === "payee").length,
        unpaidCount: filteredFactures.filter(f => f.statut === "non_payee").length
    };

    const totalPages = Math.ceil(filteredFactures.length / itemsPerPage);
    const paginatedFactures = filteredFactures.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const totalTTC = factures.reduce((acc, f) => acc + Number(f.montant_ttc), 0);
    const totalPaid = factures
        .filter(f => f.statut === 'paye' || f.statut === 'payee')
        .reduce((acc, f) => acc + Number(f.montant_ttc), 0);
    const totalDraft = factures.filter(f => f.statut === 'brouillon').length;

    const currentTotalHT = items.reduce((acc, it) => acc + (Number(it.montant_ht) || 0), 0);
    const currentTotalTVA = calculatedValues.montantTVA;
    const currentTotalTTC = calculatedValues.montantTTC;
    const currentTotalReductionValue = items.reduce((acc, it) => {
        const bruteHT = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
        const redPct = Number(it.reduction) || 0;
        return acc + (bruteHT * redPct) / 100;
    }, 0);

    const availableCommandes = commandes.filter(c =>
        isCommandeEligibleForFactureLink(c, factures, remboursementMap, editingFacture?.id)
    );

    const handleGeneratePdf = async (facture: Facture) => {
        try {
            const response = await fetch(`/api/factures/${facture.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) {
                toast.error("Erreur lors du chargement de la facture");
                return;
            }
            const fullFacture = await response.json();
            await generateFacturePdf(fullFacture);
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <FileText className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Gestion des Factures
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Facturation et suivi des paiements</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><FileText className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Facturé</p>
                        <p className="text-xl font-bold text-foreground">{totalTTC.toLocaleString()} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Encaissé</p>
                        <p className="text-xl font-bold text-foreground">{totalPaid.toLocaleString()} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400"><AlertCircle className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Brouillons</p>
                        <p className="text-xl font-bold text-foreground">{totalDraft}</p>
                    </div>
                </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger
                        value="list"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        Liste des Factures
                    </TabsTrigger>
                    <TabsTrigger
                        value="form"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                        onClick={() => { if (!editingFacture) resetForm(); }}
                    >
                        {editingFacture ? "Modifier Facture" : "Nouvelle Facture"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-wrap justify-between items-center gap-4 backdrop-blur-sm">
                            <div className="relative w-full max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Rechercher une facture..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-11 border-transparent bg-muted/50 focus:bg-card focus:border-indigo-500 transition-all border rounded-xl"
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
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 px-4 rounded-xl gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-all font-medium"
                                    onClick={exportToXLS}
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    <span className="hidden sm:inline">Excel</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 px-4 rounded-xl gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all font-medium"
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
                            <div className="bg-muted/30 p-4 rounded-[1.5rem] border border-border grid grid-cols-1 sm:grid-cols-6 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Utilisateur</Label>
                                    <Select value={filterUser} onValueChange={setFilterUser}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les utilisateurs</SelectItem>
                                            {users.map(u => (
                                                <SelectItem key={u.id} value={u.id.toString()}>{u.username || u.nom || "Utilisateur"}</SelectItem>
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
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Toutes les années</SelectItem>
                                            {years.map(y => (
                                                <SelectItem key={y} value={y}>{y}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Statut</Label>
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les statuts</SelectItem>
                                            <SelectItem value="en_attente">En attente</SelectItem>
                                            <SelectItem value="regle">Réglé</SelectItem>
                                            <SelectItem value="non_regle">Non réglé</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Type Client</Label>
                                    <Select value={filterClientType} onValueChange={setFilterClientType}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les types</SelectItem>
                                            <SelectItem value="particulier">Particulier</SelectItem>
                                            <SelectItem value="revendeur">Revendeur</SelectItem>
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
                                            <SelectItem value="all">Société</SelectItem>
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
                                                <SelectItem key={name} value={name.toLowerCase()}>
                                                    {name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-x-auto">
                        <Table className="min-w-[1200px]">
                            <TableHeader>
                                <TableRow className="bg-muted/50 border-b border-border">
                                    <TableHead className="w-[130px] text-xs font-bold text-muted-foreground uppercase py-4 pl-6 whitespace-nowrap">N° Facture</TableHead>
                                    <TableHead className="w-[220px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Client / Point de vente</TableHead>
                                    <TableHead className="w-[110px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Date</TableHead>
                                    <TableHead className="w-[110px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Échéance</TableHead>
                                    <TableHead className="w-[130px] text-xs font-bold text-muted-foreground uppercase py-4 text-right whitespace-nowrap">Montant</TableHead>
                                    <TableHead className="w-[100px] text-xs font-bold text-muted-foreground uppercase py-4 text-center whitespace-nowrap">Réduction</TableHead>
                                    <TableHead className="w-[90px] text-xs font-bold text-muted-foreground uppercase py-4 text-center whitespace-nowrap">Avoir</TableHead>
                                    <TableHead className="w-[120px] text-xs font-bold text-muted-foreground uppercase py-4 text-center whitespace-nowrap">Statut</TableHead>
                                    <TableHead className="w-[140px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Utilisateur</TableHead>
                                    <TableHead className="w-[200px] text-xs font-bold text-muted-foreground uppercase py-4 text-right pr-6 whitespace-nowrap">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell className="pl-6"><div className="h-4 w-24 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-4 w-32 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-4 w-20 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-4 w-20 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-4 w-20 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-4 w-20 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-4 w-20 bg-muted rounded" /></TableCell>
                                            <TableCell className="pr-6"><div className="h-8 w-16 bg-muted rounded ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredFactures.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-20 text-muted-foreground">
                                            Aucune facture enregistrée
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedFactures.map((facture) => (
                                        <TableRow key={facture.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0">
                                            <TableCell className="py-4 pl-6">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => nav(`/dashboard/factures/${facture.id}`)}
                                                            className="text-left font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                                        >
                                                            {facture.numero_facture}
                                                        </button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.open(`/dashboard/factures/${facture.id}`, "_blank", "noopener");
                                                            }}
                                                            className="h-7 w-7 text-muted-foreground hover:text-indigo-600 hover:bg-muted/60"
                                                            title="Ouvrir dans un nouvel onglet"
                                                        >
                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                    <div className="flex gap-2 mt-1">
                                                        {facture.devis_id && (
                                                            <span
                                                                className="text-[9px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => nav(`/dashboard/devis/${facture.devis_id}`)}
                                                            >
                                                                <CheckCircle2 className="h-2.5 w-2.5" /> Devis
                                                            </span>
                                                        )}
                                                        {facture.commande_id && (
                                                            <span
                                                                className="text-[9px] text-blue-600 dark:text-blue-400 flex items-center gap-0.5 font-bold uppercase tracking-titter bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => nav(`/dashboard/commandes/${facture.commande_id}`)}
                                                            >
                                                                <CheckCircle2 className="h-2.5 w-2.5" /> Commande
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-start gap-2">
                                                    <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-foreground truncate">
                                                            {facture.client_nom || "—"}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            <span className="font-medium">PDV :</span> {facture.point_de_vente_nom || "—"}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            <span className="font-medium">Société :</span> {getSousSocieteLabel(facture)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(facture.date_facture).toLocaleDateString()}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-red-500 font-medium">
                                                    {new Date(facture.date_echeance).toLocaleDateString()}
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-bold text-right">
                                                {(Number(facture.montant_ttc) || (Number(facture.montant_ht) + Number(facture.montant_tva)) || 0).toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                DH
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {Number(facture.reduction) > 0 ? (
                                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-[11px] font-semibold text-red-600">
                                                        -{Number(facture.reduction).toFixed(1)}%
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground">Aucune</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {factureIdsWithAvoir.includes(facture.id) ? (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-[10px] text-muted-foreground font-medium">Avoir déjà généré</span>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => nav(`/dashboard/avoirs/${factureAvoirMap[facture.id]}`)}
                                                            className="h-8 px-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 gap-1"
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                            <span className="text-[10px] font-bold uppercase hidden sm:inline">Télécharger</span>
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            if (!isFacturePaidForAvoir(facture, commandes)) {
                                                                toast.error("Seules les factures réglées peuvent faire l'objet d'un avoir.");
                                                                return;
                                                            }
                                                            setSelectedFactureForAvoir(facture);
                                                            setAvoirDialogOpen(true);
                                                        }}
                                                        className="h-8 px-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 gap-1"
                                                    >
                                                        <RotateCcw className="h-3.5 w-3.5" />
                                                        <span className="text-[10px] font-bold uppercase hidden sm:inline">Générer</span>
                                                    </Button>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {(() => {
                                                    // Priorité: informations de la facture (total_regle / reste_a_payer) si elles existent.
                                                    // Sinon, si la facture est liée à une commande, on utilise la situation de la commande
                                                    // pour déterminer visuellement si la facture doit être considérée comme réglée.
                                                    let totalRegle = Number((facture as any).total_regle) || 0;
                                                    const montantTtc = Number(facture.montant_ttc) || 0;

                                                    if (!totalRegle && facture.commande_id) {
                                                        const linkedCmd = commandes.find(c => c.id === facture.commande_id);
                                                        if (linkedCmd) {
                                                            const cmdTotalRegle = Number((linkedCmd as any).total_regle) || 0;
                                                            totalRegle = cmdTotalRegle;
                                                        }
                                                    }

                                                    let reste: number;
                                                    if (typeof (facture as any).reste_a_payer !== "undefined") {
                                                        reste = Number((facture as any).reste_a_payer);
                                                    } else if (facture.commande_id) {
                                                        const linkedCmd = commandes.find(c => c.id === facture.commande_id);
                                                        if (linkedCmd && typeof (linkedCmd as any).reste_a_payer !== "undefined") {
                                                            reste = Number((linkedCmd as any).reste_a_payer);
                                                        } else {
                                                            reste = Math.max(montantTtc - totalRegle, 0);
                                                        }
                                                    } else {
                                                        reste = Math.max(montantTtc - totalRegle, 0);
                                                    }

                                                    const paidByAmounts = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
                                                    // Si le backend marque la facture comme "paye" ou "payee", on force l'affichage en "Réglé"
                                                    const isRegle = facture.statut === "paye" || facture.statut === "payee" || paidByAmounts;
                                                    const isReglementCommence = !isRegle && totalRegle > 0 && totalRegle < montantTtc - 0.01;
                                                    const displayReste = isRegle ? 0 : Math.max(reste, 0);

                                                    return (
                                                        <div className="flex flex-col items-start gap-1">
                                                            <span className={cn(
                                                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                                                isRegle ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" :
                                                                isReglementCommence ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" :
                                                                "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                                                            )}>
                                                                {isRegle ? <><CheckCircle2 className="h-3 w-3" /> Réglé</> : isReglementCommence ? <>Règlement commencé</> : <><AlertCircle className="h-3 w-3" /> Non réglé</>}
                                                            </span>
                                                            {facture.statut === 'en_attente' && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                                                    <Clock className="h-3 w-3" /> En attente
                                                                </span>
                                                            )}
                                                            {facture.statut === 'rejete' && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                                                                    <XCircle className="h-3 w-3" /> Rejeté
                                                                </span>
                                                            )}
                                                            {displayReste > 0 && (
                                                                <span className="text-[10px] text-muted-foreground">Reste: <span className="font-semibold">{displayReste.toLocaleString()} DH</span></span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell>
                                                {facture.user_nom ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <User className="h-3 w-3" />
                                                        <span className="font-medium text-foreground">{facture.user_nom}</span>
                                                    </span>
                                                ) : <span className="text-muted-foreground text-xs">—</span>}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56">
                                                        <DropdownMenuItem onClick={() => nav(`/dashboard/factures/${facture.id}`)} className="cursor-pointer">
                                                            <ViewSvgIcon className="h-4 w-4" />
                                                            Voir le détail
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (facture.statut === 'en_attente') {
                                                                    toast.error("Cette facture doit être validée avant téléchargement");
                                                                    return;
                                                                }
                                                                handleGeneratePdf(facture);
                                                            }}
                                                            disabled={facture.statut === 'en_attente'}
                                                            className="cursor-pointer"
                                                        >
                                                            <Printer className="h-4 w-4" />
                                                            Télécharger
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => { setEditingFacture(facture); setActiveTab("form"); }} className="cursor-pointer">
                                                            <EditSvgIcon className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => nav("/dashboard/reglements", { state: { factureId: facture.id, openDialog: true } })}
                                                            disabled={getFactureRemainingForPayment(facture, commandes) <= 0.01}
                                                            className="cursor-pointer"
                                                        >
                                                            <Banknote className="h-4 w-4" />
                                                            Régler
                                                        </DropdownMenuItem>
                                                        {isAdmin && facture.statut === 'en_attente' && (
                                                            <>
                                                                <DropdownMenuItem onClick={() => handleApproveFacture(facture.id)} className="cursor-pointer">
                                                                    <ShieldCheck className="h-4 w-4" />
                                                                    Valider
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleRejectFacture(facture.id)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                                    <XCircle className="h-4 w-4" />
                                                                    Rejeter
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                                {!isLoading && filteredFactures.length > 0 && (
                                    <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 border-t-2 border-indigo-100 dark:border-indigo-900/30">
                                        <TableCell colSpan={4} className="px-6 py-4 font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider text-xs">
                                            Total Complet (Filtré)
                                        </TableCell>
                                        <TableCell className="px-4 py-4 font-black text-indigo-700 dark:text-indigo-300 text-base">
                                            {filteredFactures.reduce((acc, f) => acc + ((Number(f.montant_ttc) ?? (Number(f.montant_ht) + Number(f.montant_tva))) || 0), 0).toLocaleString()} DH
                                        </TableCell>
                                        <TableCell colSpan={5} />
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination UI */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-2 py-4 bg-card border-t border-border rounded-b-2xl shadow-sm">
                            <div className="text-xs text-muted-foreground font-medium hidden sm:block">
                                <span className="text-foreground font-bold">{(currentPage - 1) * itemsPerPage + 1}</span>-
                                <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredFactures.length)}</span> sur
                                <span className="text-foreground font-bold"> {filteredFactures.length}</span>
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
                </TabsContent>

                <TabsContent value="form">
                    <Card className="border border-border shadow-2xl bg-card animate-in fade-in zoom-in-95 duration-300">
                        <div className="h-2 bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-500 rounded-t-2xl"></div>
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                                    <FileText className="h-5 w-5" />
                                </div>
                                {editingFacture ? `Modifier Facture : ${editingFacture.numero_facture}` : "Nouvelle Facture"}
                            </CardTitle>

                        </CardHeader>
                        <CardContent className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Date Facture</Label>
                                        <Input
                                            type="date"
                                            name="date_facture"
                                            value={formData.date_facture}
                                            onChange={handleInputChange}
                                            required
                                            className="h-11 border-border focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Date Échéance</Label>
                                        <Input
                                            type="date"
                                            name="date_echeance"
                                            value={formData.date_echeance}
                                            onChange={handleInputChange}
                                            required
                                            className="h-11 border-border focus:border-indigo-500"
                                        />
                                    </div>

                                    {/* Réduction Globale supprimée */}
                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Client</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={clientSearch}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setClientSearch(v);
                                                    setShowClientDropdown(true);
                                                    if (!v.trim()) setSelectedClient(null);
                                                }}
                                                onFocus={() => setShowClientDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                                                placeholder="Rechercher un client..."
                                                className={cn("h-11 pl-10 border-border", selectedClient && "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-900/10")}
                                            />
                                            {selectedClient && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-indigo-500" />}
                                        </div>
                                        {showClientDropdown && (
                                            <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                                {clients.filter(c => c.nom_complet.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                                                    <div
                                                        key={c.id}
                                                        onMouseDown={() => { setSelectedClient(c); setClientSearch(c.nom_complet); setShowClientDropdown(false); }}
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
                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-indigo-600">Lier à une Commande</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={commandeSearch}
                                                onChange={(e) => {
                                                    setCommandeSearch(e.target.value);
                                                    setShowCommandeDropdown(true);
                                                    if (!e.target.value) {
                                                        handleCommandeSelect("none");
                                                    }
                                                }}
                                                onFocus={() => setShowCommandeDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowCommandeDropdown(false), 200)}
                                                placeholder="Rechercher une commande..."
                                                className={cn("h-11 pl-10 border-indigo-200 bg-indigo-50/30", formData.commande_id !== "none" && "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-900/10")}
                                            />
                                            {formData.commande_id !== "none" && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-indigo-500" />}
                                        </div>
                                        {showCommandeDropdown && (
                                            <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                                <div
                                                    onMouseDown={() => {
                                                        handleCommandeSelect("none");
                                                        setCommandeSearch("");
                                                        setShowCommandeDropdown(false);
                                                    }}
                                                    className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-muted-foreground border-b border-border"
                                                >
                                                    Aucune
                                                </div>
                                                {availableCommandes
                                                    .filter(cmd => {
                                                        if (!commandeSearch.trim()) return true;
                                                        return cmd.numero_commande.toLowerCase().includes(commandeSearch.toLowerCase());
                                                    })
                                                    .map(cmd => (
                                                        <div
                                                            key={cmd.id}
                                                            onMouseDown={() => {
                                                                handleCommandeSelect(cmd.id.toString());
                                                                setCommandeSearch(cmd.numero_commande);
                                                                setShowCommandeDropdown(false);
                                                            }}
                                                            className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group"
                                                        >
                                                            <span className="font-bold">{cmd.numero_commande}</span>
                                                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-indigo-500" />
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Mode de Paiement</Label>
                                        <Select value={formData.mode_paiement} onValueChange={(v) => handleSelectChange("mode_paiement", v)}>
                                            <SelectTrigger className="h-11 border-border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {paymentModes.length > 0 ? (
                                                    paymentModes.map((m: any) => (
                                                        <SelectItem key={m.value} value={m.value}>
                                                            {m.label}
                                                        </SelectItem>
                                                    ))
                                                ) : (
                                                    <>
                                                        <SelectItem value="espece">Espèce</SelectItem>
                                                        <SelectItem value="cheque">Chèque</SelectItem>
                                                        <SelectItem value="virement">Virement</SelectItem>
                                                        <SelectItem value="carte">Carte Bancaire</SelectItem>
                                                        <SelectItem value="effet">Effet</SelectItem>
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-indigo-600">Banque</Label>
                                        <Select value={formData.banque_id || "none"} onValueChange={(v) => handleSelectChange('banque_id', v)}>
                                            <SelectTrigger className="h-11 border-indigo-200 bg-indigo-50/10">
                                                <SelectValue placeholder="Sélectionner une banque" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Aucune</SelectItem>
                                                {banques.map(b => (
                                                    <SelectItem key={b.id} value={b.id.toString()}>{b.nom_banque} {b.nom_compte ? `- ${b.nom_compte}` : ""}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Articles de la facture</h3>
                                        <Button type="button" onClick={addItem} size="sm" className="bg-indigo-100 text-indigo-600 hover:bg-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400">
                                            <Plus className="h-4 w-4 mr-2" /> Ajouter un article
                                        </Button>
                                    </div>

                                    <div className="border border-border rounded-xl overflow-visible bg-card">
                                        <Table containerClassName="overflow-visible">
                                            <TableHeader>
                                                <TableRow className="bg-muted/30">
                                                    <TableHead className="w-[40%] text-[10px] font-bold uppercase py-4 pl-6">Désignation & Article</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Quantité</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Prix Unit</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Red. %</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">TVA %</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-right py-4 pr-6">Total</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {items.map((item, index) => (
                                                    <TableRow key={index} className="group hover:bg-muted/10 transition-colors">
                                                        <TableCell className="py-2 pl-6 relative">
                                                            <div className="relative">
                                                                <Input
                                                                    placeholder="Chercher ou décrire l'article..."
                                                                    value={item.designation || ""}
                                                                    onChange={(e) => handleItemChange(index, 'designation', e.target.value)}
                                                                    onFocus={() => setActiveProductSearchIndex(index)}
                                                                    onBlur={() => setTimeout(() => setActiveProductSearchIndex(null), 200)}
                                                                    className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-10 text-sm font-medium w-full"
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
                                                                    <div className="absolute z-[9999] min-w-[450px] left-0 mt-2 bg-background border border-border shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-2xl max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-2 ring-1 ring-black/5 backdrop-blur-3xl">
                                                                        <div className="p-2 border-b border-border bg-muted/30">
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Résultats produits</span>
                                                                        </div>
                                                                        {products.filter((p) => {
                                                                            const query = (item.designation || "").toLowerCase();
                                                                            return (
                                                                                p.nom.toLowerCase().includes(query) ||
                                                                                String(p.reference || "").toLowerCase().includes(query)
                                                                            );
                                                                        }).map((p) => (
                                                                            <div key={p.id} onMouseDown={() => handleProductSelect(index, p)} className="px-4 py-3 hover:bg-indigo-500/10 cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group border-b border-border last:border-0 transition-colors">
                                                                                <div className="flex flex-col gap-0.5">
                                                                                    <span className="font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{p.nom}</span>
                                                                                    {p.reference && (
                                                                                        <span className="text-[11px] text-muted-foreground">
                                                                                            Ref: {p.reference}
                                                                                        </span>
                                                                                    )}
                                                                                    <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded w-fit">{p.prix.toLocaleString('fr-FR')} DH</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-[10px] uppercase font-black text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity tracking-tighter">Choisir</span>
                                                                                    <ArrowUpRight className="h-4 w-4 text-indigo-500 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                value={item.quantite}
                                                                onChange={(e) => handleItemChange(index, 'quantite', parseFloat(e.target.value))}
                                                                className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-center"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                value={item.prix_unitaire}
                                                                onChange={(e) => handleItemChange(index, 'prix_unitaire', parseFloat(e.target.value))}
                                                                disabled={isCommercial && Boolean(item.produit_id)}
                                                                className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-center disabled:opacity-70 disabled:cursor-not-allowed"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                value={item.reduction}
                                                                onChange={(e) => handleItemChange(index, 'reduction', parseFloat(e.target.value) || 0)}
                                                                className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-center font-bold text-red-500"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Select
                                                                value={item.tva.toString()}
                                                                onValueChange={(v) => handleItemChange(index, 'tva', parseFloat(v))}
                                                            >
                                                                <SelectTrigger className="border-transparent bg-transparent h-9 text-sm">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="0">0%</SelectItem>
                                                                    <SelectItem value="7">7%</SelectItem>
                                                                    <SelectItem value="10">10%</SelectItem>
                                                                    <SelectItem value="20">20%</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell className="py-2 text-right pr-6 font-bold text-sm">
                                                            {(item.montant_ht).toLocaleString()} DH
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => removeItem(index)}
                                                                className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <DeleteSvgIcon className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                <div className="bg-muted/50 rounded-2xl p-6 border border-border flex flex-col md:flex-row gap-8 justify-between items-center bg-card/50">
                                    <div className="flex gap-10 text-center md:text-left">
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Montant HT</p>
                                            <p className="text-xl font-bold text-foreground">{currentTotalHT.toLocaleString()} DH</p>
                                        </div>
                                        {/* Global Reduction Removed */}
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">TVA</p>
                                            <p className="text-xl font-bold text-amber-600">{currentTotalTVA.toLocaleString()} DH</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Réduction Valeur</p>
                                            <p className="text-xl font-bold text-red-600">{currentTotalReductionValue.toLocaleString()} DH</p>
                                        </div>
                                    </div>
                                    <div className="h-16 w-px bg-border hidden md:block"></div>
                                    <div className="text-center md:text-right">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total TTC</p>
                                        <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 drop-shadow-sm">{currentTotalTTC.toLocaleString()} DH</p>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4 border-t border-border">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => { resetForm(); setActiveTab("list"); }}
                                        className="h-12 px-8 text-muted-foreground hover:text-foreground"
                                    >
                                        Annuler
                                    </Button>
                                    <Button
                                        disabled={isSubmitting}
                                        className="h-12 flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-100 dark:shadow-none"
                                    >
                                        {isSubmitting ? "Enregistrement..." : editingFacture ? "Modifier la Facture" : "Enregistrer la Facture"}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Supprimer la facture ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Voulez-vous vraiment supprimer la facture <span className="font-bold text-foreground">{factureToDelete?.numero_facture}</span> ?
                            Cette action est irréversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Supprimer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Popup après création facture : saisir le règlement ? */}
            <Dialog open={showReglementDialog} onOpenChange={(open) => { setShowReglementDialog(open); if (!open) setCreatedFactureIdForReglement(null); }}>
                <DialogContent className="sm:max-w-[430px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
                    <div className="h-1.5 bg-emerald-600" />
                    <DialogHeader className="px-6 pt-4 pb-2">
                        <DialogTitle className="flex items-center gap-3 text-base">
                            <div className="h-8 w-8 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <Banknote className="h-4 w-4" />
                            </div>
                            <span className="text-emerald-700 dark:text-emerald-300">
                                Facture enregistrée avec succès
                            </span>
                        </DialogTitle>
                        <DialogDescription className="px-1 pt-2 text-sm text-muted-foreground">
                            Voulez-vous maintenant <span className="font-semibold text-emerald-600">saisir le règlement</span> pour cette facture&nbsp;?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-4">
                        {createdFactureIdForReglement != null && (
                            <div className="mb-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-200 flex items-center justify-between">
                                <span className="font-semibold uppercase tracking-widest">
                                    Facture #{createdFactureIdForReglement}
                                </span>
                                <span className="text-[10px] text-emerald-500 dark:text-emerald-300">
                                    Saisie du paiement
                                </span>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <Button
                                variant="ghost"
                                className="flex-1 h-10 rounded-xl text-xs font-semibold"
                                onClick={() => {
                                    setShowReglementDialog(false);
                                    setCreatedFactureIdForReglement(null);
                                }}
                            >
                                Plus tard
                            </Button>
                            <Button
                                className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white"
                                onClick={() => {
                                    setShowReglementDialog(false);
                                    nav("/dashboard/reglements", { state: { factureId: createdFactureIdForReglement, openDialog: true } });
                                    setCreatedFactureIdForReglement(null);
                                }}
                            >
                                Saisir le règlement
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={avoirDialogOpen} onOpenChange={setAvoirDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RotateCcw className="h-5 w-5 text-orange-500" />
                            Confirmer la génération d'avoir
                        </DialogTitle>
                        <DialogDescription className="py-2">
                            Voulez-vous vraiment générer un avoir pour la facture <span className="font-bold text-foreground">{selectedFactureForAvoir?.numero_facture}</span> ?
                            Cette action vous redirigera vers le formulaire d'avoir.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex gap-2 sm:justify-end">
                        <Button variant="ghost" onClick={() => setAvoirDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                            onClick={() => {
                                if (!selectedFactureForAvoir) {
                                    setAvoirDialogOpen(false);
                                    return;
                                }
                                if (!isFacturePaidForAvoir(selectedFactureForAvoir, commandes)) {
                                    toast.error("Seules les factures réglées peuvent faire l'objet d'un avoir.");
                                    return;
                                }
                                setAvoirDialogOpen(false);
                                nav("/dashboard/avoirs", { state: { factureId: selectedFactureForAvoir.id } });
                            }}
                        >
                            Confirmer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rapport Modal */}
            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none shadow-2xl rounded-[2rem] animate-in zoom-in-95 duration-300">
                    <div className="h-1.5 bg-indigo-600"></div>
                    <DialogHeader className="p-5 pb-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                                    <BarChart3 className="h-5 w-5" />
                                </div>
                                <div>
                                    <DialogTitle className="text-xl font-black text-foreground tracking-tight">Rapport d'Activité</DialogTitle>
                                    <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Synthèse des factures filtrées</DialogDescription>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter opacity-50">Généré le</p>
                                <p className="text-xs font-bold text-foreground">{new Date().toLocaleDateString()}</p>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="p-5 space-y-4">
                        {/* Inline Filters */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Client</Label>
                                <Select value={filterClient} onValueChange={setFilterClient}>
                                    <SelectTrigger className="h-9 rounded-xl bg-muted/50 border-none text-xs font-bold">
                                        <SelectValue placeholder="Client" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous</SelectItem>
                                        {clients.map(c => (
                                            <SelectItem key={c.id} value={c.id.toString()}>{c.nom_complet}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Mois</Label>
                                <Select value={filterMonth} onValueChange={setFilterMonth}>
                                    <SelectTrigger className="h-9 rounded-xl bg-muted/50 border-none text-xs font-bold">
                                        <SelectValue placeholder="Mois" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous</SelectItem>
                                        {months.map(m => (
                                            <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Année</Label>
                                <Select value={filterYear} onValueChange={setFilterYear}>
                                    <SelectTrigger className="h-9 rounded-xl bg-muted/50 border-none text-xs font-bold">
                                        <SelectValue placeholder="Année" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Toutes</SelectItem>
                                        {years.map(y => (
                                            <SelectItem key={y} value={y}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Statut</Label>
                                <Select value={filterStatus} onValueChange={setFilterStatus}>
                                    <SelectTrigger className="h-9 rounded-xl bg-muted/50 border-none text-xs font-bold">
                                        <SelectValue placeholder="Statut" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous</SelectItem>
                                        <SelectItem value="en_attente">En attente</SelectItem>
                                        <SelectItem value="regle">Réglé</SelectItem>
                                        <SelectItem value="non_regle">Non réglé</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <Card className="bg-muted/30 border-none shadow-none p-4 rounded-xl transition-all hover:bg-muted/50">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Total</p>
                                <p className="text-xl font-black text-foreground">{reportData.totalHT.toLocaleString()} <span className="text-[10px] text-muted-foreground font-bold font-mono">DH</span></p>
                            </Card>
                            <Card className="bg-indigo-600/5 border-none shadow-none p-4 rounded-xl transition-all hover:bg-indigo-600/10 border border-indigo-100/50">
                                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1.5">Total TTC</p>
                                <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{reportData.totalTTC.toLocaleString()} <span className="text-[10px] opacity-60 font-bold font-mono">DH</span></p>
                            </Card>
                        </div>

                        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden divide-y divide-border">
                            <div className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400"><FileText className="h-4 w-4" /></div>
                                    <span className="text-xs font-bold text-muted-foreground">Nombre total de factures</span>
                                </div>
                                <span className="text-base font-black text-foreground">{reportData.count}</span>
                            </div>
                            <div className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /></div>
                                    <span className="text-xs font-bold text-muted-foreground">Factures réglées</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-base font-black text-emerald-600">{reportData.paidCount}</span>
                                    <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full"
                                            style={{ width: `${reportData.count > 0 ? (reportData.paidCount / reportData.count) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400"><AlertCircle className="h-4 w-4" /></div>
                                    <span className="text-xs font-bold text-muted-foreground">Factures en attente</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-base font-black text-amber-600">{reportData.unpaidCount}</span>
                                    <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-amber-500 rounded-full"
                                            style={{ width: `${reportData.count > 0 ? (reportData.unpaidCount / reportData.count) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3.5 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/50 rounded-xl">
                            <Calendar className="h-5 w-5 text-indigo-500" />
                            <p className="text-xs font-medium text-muted-foreground">
                                Ce rapport couvre la période sélectionnée dans vos filtres ({months.find(m => m.val === filterMonth)?.label || "Toute l'année"} {filterYear})
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="p-5 pt-0">
                        <Button
                            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all hover:scale-[1.01] active:scale-[0.99]"
                            onClick={() => setShowReportDialog(false)}
                        >
                            Fermer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quick Add Client Dialog */}
            <Dialog open={showQuickAddClientDialog} onOpenChange={setShowQuickAddClientDialog}>
                <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden border-none shadow-2xl rounded-[2rem] animate-in zoom-in-95 duration-300">
                    <div className="h-1.5 bg-indigo-600"></div>
                    <DialogHeader className="p-6 pb-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400">
                                <UserPlus className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-black text-foreground tracking-tight">Client non trouvé</DialogTitle>
                                <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Voulez-vous l'ajouter ?</DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="p-6 pt-2 pb-6 space-y-4">
                        <div className="p-4 bg-muted/50 rounded-2xl border border-border">
                            <p className="text-sm font-medium text-muted-foreground mb-1">Nom du client :</p>
                            <p className="text-lg font-bold text-foreground">{pendingClientName}</p>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Ce client n'existe pas dans votre base de données. En cliquant sur "Oui", il sera automatiquement ajouté comme nouveau client de type <span className="font-bold text-indigo-600">Particulier</span>.
                        </p>
                    </div>

                    <DialogFooter className="p-6 pt-0 flex gap-3">
                        <Button
                            variant="ghost"
                            className="flex-1 h-11 rounded-xl font-bold"
                            onClick={() => {
                                setShowQuickAddClientDialog(false);
                                setClientSearch("");
                            }}
                        >
                            Non, annuler
                        </Button>
                        <Button
                            className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-100 dark:shadow-none"
                            onClick={handleQuickAddClient}
                            disabled={isAddingClient}
                        >
                            {isAddingClient ? "Ajout..." : "Oui, ajouter"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default Factures;
