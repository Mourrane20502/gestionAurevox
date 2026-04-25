import { useEffect, useMemo, useRef, useState } from "react";
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
    ShoppingCart,
    Plus,
    Search,
    Calendar,
    User,
    DollarSign,
    Clock,
    FileText, ChevronLeft, ChevronRight,
    ChevronsLeft, ChevronsRight, CheckCircle2, ArrowUpRight, BarChart3, UserPlus, Printer, Filter, FileSpreadsheet, XCircle, Banknote, LockOpen, MoreVertical, RotateCcw, Download
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { matchesSousSocieteListFilter } from "@/utils/sousSocieteListFilter";
import { DeleteSvgIcon, EditSvgIcon, ViewSvgIcon } from "@/components/icons/actionSvgIcons";
import { generateCommandePdf } from "@/components/pdf/CommandePdf";
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
    stock: number;
}

interface CommandeItem {
    id?: number;
    produit_id?: number;
    designation: string;
    quantite: number;
    prix_unitaire: number;
    tva: number;
    reduction: number;
    montant_ht: number;
}

interface Commande {
    id: number;
    numero_commande: string;
    date_commande: string;
    client_id: number;
    client_nom: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    statut: string;
    client_type?: string;
    devis_id?: number | null;
    reduction?: number;
    total_reduction?: number;
    user_nom?: string;
    user_id?: number;
    point_de_vente_nom?: string;
    total_regle?: number;
    reste_a_payer?: number;
    has_avoir?: boolean;
    has_avoir_facture?: boolean;
    banque_id?: number | null;
    sous_societe_nom?: string | null;
}

interface Devis {
    id: number;
    numero_devis: string;
    client_id: number;
    client_nom: string;
    items?: any[];
    reduction?: number;
}

/** Filtres statut étendus : réglé / remboursement / avoir (hors statuts métier stockés en base). */
function commandeMatchesStatusFilter(
    c: Commande,
    filterStatus: string,
    factures: any[],
    remboursementMap: Record<number, number>
): boolean {
    if (filterStatus === "all") return true;
    const mtTtc =
        Number(c.montant_ttc) || (Number(c.montant_ht) + Number(c.montant_tva)) || 0;
    const totalRegle = Number(c.total_regle) || 0;
    const linkedFacture = factures.find((f: any) => f.commande_id === c.id);
    const factureIsPaid =
        !!linkedFacture &&
        (linkedFacture.statut === "paye" || linkedFacture.statut === "payee");
    const paidByAmounts = mtTtc > 0 && totalRegle >= mtTtc - 0.01;
    const isReglee =
        factureIsPaid ||
        c.statut === "paye" ||
        c.statut === "payee" ||
        c.statut === "reglee" ||
        paidByAmounts;

    if (filterStatus === "regle") return isReglee;
    if (filterStatus === "non_regle") return !isReglee;
    if (filterStatus === "rembourse") return !!remboursementMap[c.id];
    if (filterStatus === "rendu") return !!(c.has_avoir || c.has_avoir_facture);
    return c.statut === filterStatus;
}

function isCommandeReglee(commande: Commande, factures: any[]): boolean {
    const linkedFacture = factures.find((f: any) => Number(f?.commande_id) === commande.id);
    const factureIsPaid =
        !!linkedFacture &&
        (linkedFacture.statut === "paye" || linkedFacture.statut === "payee");
    const totalRegle = Number(commande.total_regle) || 0;
    const montantTtc =
        Number(commande.montant_ttc) ||
        (Number(commande.montant_ht) + Number(commande.montant_tva)) ||
        0;
    const statut = String(commande.statut || "").toLowerCase();
    const commandeStatutReglee = statut === "paye" || statut === "payee" || statut === "reglee";
    const paidByAmounts = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
    return factureIsPaid || commandeStatutReglee || paidByAmounts;
}

const getSousSocieteLabel = (doc: { sous_societe_nom?: string | null; numero_commande?: string | null }) => {
    const fromName = String(doc.sous_societe_nom || "").trim();
    return fromName || "—";
};

/** Devis IDs already used on another commande (exclut la commande en cours d’édition). */
function getCommandeLinkedDevisIds(commandes: Commande[], editingCommandeId: number | null): Set<number> {
    const set = new Set<number>();
    for (const c of commandes) {
        if (editingCommandeId != null && c.id === editingCommandeId) continue;
        if (c.devis_id != null) {
            const id = Number(c.devis_id);
            if (Number.isFinite(id)) set.add(id);
        }
    }
    return set;
}

function getFactureLinkedDevisIds(factures: any[]): Set<number> {
    const set = new Set<number>();
    for (const f of factures) {
        if (f?.devis_id != null) {
            const id = Number(f.devis_id);
            if (Number.isFinite(id)) set.add(id);
        }
    }
    return set;
}

/** Aligné sur l'API : sans remboursement, sans avoir, pas déjà liée à une facture. */
function commandePeutEtreConvertieEnFacture(
    commande: Commande,
    factures: any[],
    remboursementMap: Record<number, number>
): boolean {
    if (remboursementMap[commande.id]) return false;
    if (commande.has_avoir || commande.has_avoir_facture) return false;
    if (factures.some((f: any) => Number(f?.commande_id) === commande.id)) return false;
    return true;
}

function Commandes() {
    const role = localStorage.getItem("role");
    const isCommercial = role === "user" || role === "commercial";

    const navigate = useNavigate();
    const location = useLocation();
    const [commandes, setCommandes] = useState<Commande[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [devis, setDevis] = useState<Devis[]>([]);
    const [factures, setFactures] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<string>("list");
    const [clientSearch, setClientSearch] = useState("");
    const [calculatedValues, setCalculatedValues] = useState({ montantTVA: 0, montantTTC: 0 });
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);
    const [editingCommande, setEditingCommande] = useState<Commande | null>(null);
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterClientType, setFilterClientType] = useState<string>("all");
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [showQuickAddClientDialog, setShowQuickAddClientDialog] = useState(false);
    const [pendingClientName, setPendingClientName] = useState("");
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [commandeToDelete, setCommandeToDelete] = useState<Commande | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [showFactureDialog, setShowFactureDialog] = useState(false);
    const [showReglementDialog, setShowReglementDialog] = useState(false);
    const [createdCommandeId, setCreatedCommandeId] = useState<number | null>(null);
    /** Banque choisie sur le formulaire avant reset (dialog « Générer la facture »). */
    const createdCommandeBanqueIdRef = useRef<string | null>(null);
    const [devisSearch, setDevisSearch] = useState("");
    const [showDevisDropdown, setShowDevisDropdown] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [filterUser, setFilterUser] = useState<string>("all");
    const [filterClient, setFilterClient] = useState<string>("all");
    const [filterSousSociete, setFilterSousSociete] = useState<string>("all");
    const [filterPointDeVente, setFilterPointDeVente] = useState<string>("all");
    const [allSousSocieteNames, setAllSousSocieteNames] = useState<string[]>([]);
    const [banques, setBanques] = useState<any[]>([]);
    const [paymentModes, setPaymentModes] = useState<any[]>([]);
    const [remboursementMap, setRemboursementMap] = useState<Record<number, number>>({});
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

    const [formData, setFormData] = useState({
        numero_commande: "",
        date_commande: new Date().toISOString().split('T')[0],
        statut: "en_attente",
        devis_id: null as number | null,
        reduction: "0",
        montant_ht: "0",
        a_facture: false,
        mode_paiement: "virement",
        banque_id: "none",
        paiement_espece_type: "total"
    });

    const [items, setItems] = useState<CommandeItem[]>([
        { designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }
    ]);

    const token = localStorage.getItem("token");

    const devisLinkedByCommande = useMemo(
        () => getCommandeLinkedDevisIds(commandes, editingCommande?.id ?? null),
        [commandes, editingCommande?.id]
    );
    const devisLinkedByFacture = useMemo(() => getFactureLinkedDevisIds(factures), [factures]);

    const devisSelectableForCommande = useMemo(() => {
        const selectedId = formData.devis_id;
        return devis.filter((d) => {
            if (selectedId != null && d.id === selectedId) return true;
            if (devisLinkedByCommande.has(d.id) || devisLinkedByFacture.has(d.id)) return false;
            return true;
        });
    }, [devis, devisLinkedByCommande, devisLinkedByFacture, formData.devis_id]);

    const fetchCommandes = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/commandes", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setCommandes(data);
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

    const fetchDevis = async () => {
        try {
            const response = await fetch("/api/devis", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setDevis(await response.json());
        } catch (error) { console.error("Error fetching devis:", error); }
    };

    const fetchFactures = async () => {
        try {
            const response = await fetch("/api/factures", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setFactures(await response.json());
        } catch (error) {
            console.error("Error fetching factures for commandes:", error);
        }
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
                data.forEach((r: any) => { map[r.commande_id] = r.id; });
                setRemboursementMap(map);
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchCommandes();
        fetchClients();
        fetchProducts();
        fetchDevis();
        fetchFactures();
        fetchUsers();
        fetchBanques();
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
                type SsOpt = { nom_sous_societe?: string };
                const names = (Array.isArray(data) ? data : [])
                    .map((s: SsOpt) => String(s?.nom_sous_societe || "").trim())
                    .filter(Boolean);
                setAllSousSocieteNames(Array.from(new Set(names)));
            } catch {
                /* liste dérivée des commandes en secours */
            }
        };
        fetchSousSocietes();
    }, [token]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterSousSociete, filterPointDeVente]);

    useEffect(() => {
        const state = location.state as any;
        if (state?.openCreateForm) {
            setEditingCommande(null);
            setActiveTab("form");
            window.history.replaceState({}, document.title);
        } else if (state?.devisId) {
            // Même si le devis semble déjà lié (données en cache / état temporaire),
            // on laisse l'utilisateur convertir et pré-remplir le formulaire.
            // La validation métier côté serveur gérera les cas réellement incompatibles.
            handleDevisSelect(state.devisId.toString());
            setActiveTab("form");
            // Clear location state
            window.history.replaceState({}, document.title);
        } else if (state?.commandeId) {
            const cmd = commandes.find(c => c.id === state.commandeId);
            if (cmd) {
                setEditingCommande(cmd);
                setActiveTab("form");
            }
            // Clear location state
            window.history.replaceState({}, document.title);
        }
    }, [location.state, commandes]);

    useEffect(() => {
        const fetchCommandeDetails = async () => {
            if (editingCommande) {
                try {
                    const response = await fetch(`/api/commandes/${editingCommande.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const fullCmd = await response.json();
                        setFormData({
                            numero_commande: fullCmd.numero_commande,
                            date_commande: fullCmd.date_commande.split('T')[0],
                            statut: fullCmd.statut || "en_attente",
                            devis_id: fullCmd.devis_id || null,
                            reduction: (fullCmd.reduction || 0).toString(),
                            montant_ht: (fullCmd.montant_ht || 0).toString(),
                            a_facture: Boolean(fullCmd.a_facture),
                            mode_paiement: fullCmd.mode_paiement || "virement",
                            banque_id: (fullCmd.banque_id != null && fullCmd.banque_id !== 0) ? String(fullCmd.banque_id) : "none",
                            paiement_espece_type: "total"
                        });

                        // Normalize items
                        const normalizedItems = (fullCmd.items || []).map((it: any) => ({
                            ...it,
                            designation: it.designation || "",
                            tva: Number(it.tva) || 0,
                            reduction: Number(it.reduction) || 0,
                            quantite: Number(it.quantite) || 0,
                            prix_unitaire: Number(it.prix_unitaire) || 0,
                            montant_ht: Number(it.montant_ht) || 0
                        }));
                        setItems(normalizedItems);
                        calculateTotals(normalizedItems, Number(fullCmd.reduction));

                        // Handle client
                        const cmdClient = clients.find(c => c.id === fullCmd.client_id);
                        if (cmdClient) {
                            setSelectedClient(cmdClient);
                            setClientSearch(cmdClient.nom_complet);
                        } else if (fullCmd.client_nom) {
                            // If not in clients list yet (e.g. still loading), set dummy for UI
                            setClientSearch(fullCmd.client_nom);
                        }
                        // Set devisSearch for autocomplete
                        if (fullCmd.devis_id) {
                            const linkedDevis = devis.find(d => d.id === fullCmd.devis_id);
                            if (linkedDevis) setDevisSearch(`${linkedDevis.numero_devis} - ${linkedDevis.client_nom}`);
                        } else {
                            setDevisSearch("");
                        }
                    }
                } catch (error) {
                    console.error("Error fetching details:", error);
                }
            }
        };
        fetchCommandeDetails();
    }, [editingCommande, clients]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const calculateTotals = (currentItems: CommandeItem[], forcedGlobalRed?: number) => {
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
            reduction: displayRed % 1 === 0 ? displayRed.toString() : parseFloat(displayRed.toFixed(2)).toString(),
            montant_ht: itemsNetHT.toFixed(2) // Net HT after all item reductions
        }));
    };

    const handleItemChange = (index: number, field: keyof CommandeItem, value: any) => {
        const newItems = [...items];

        const safeValue =
            typeof value === "number" && isNaN(value) ? 0 : value;

        newItems[index] = { ...newItems[index], [field]: safeValue };

        if (field === "designation") {
            newItems[index].produit_id = undefined;
        }

        if (field === "quantite" || field === "prix_unitaire" || field === "reduction") {
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
            montant_ht: (Number(newItems[index].quantite) || 1) * product.prix
        };
        setItems(newItems);
        calculateTotals(newItems, Number(formData.reduction) || 0);
        setActiveProductSearchIndex(null);
    };

    const handleDevisSelect = async (devisId: string) => {
        if (devisId === "none") {
            setFormData(prev => ({ ...prev, devis_id: null }));
            setItems([{ designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }]);
            setSelectedClient(null);
            setClientSearch("");
            return;
        }

        const dId = parseInt(devisId);
        setFormData(prev => ({ ...prev, devis_id: dId }));

        try {
            const response = await fetch(`/api/devis/${dId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const fullDevis = await response.json();

                // Set client
                const client = clients.find(c => c.id === fullDevis.client_id);
                if (client) {
                    setSelectedClient(client);
                    setClientSearch(client.nom_complet);
                } else if (fullDevis.client_id && fullDevis.client_nom) {
                    // Important for redirection: set dummy client so validation doesn't block submit
                    setSelectedClient({ id: fullDevis.client_id, nom_complet: fullDevis.client_nom });
                    setClientSearch(fullDevis.client_nom);
                }

                // Set devis search string
                setDevisSearch(`${fullDevis.numero_devis || ''} - ${fullDevis.client_nom || ''}`);

                // Set items
                if (fullDevis.items && fullDevis.items.length > 0) {
                    const mappedItems = fullDevis.items.map((it: any) => ({
                        produit_id: it.produit_id,
                        designation: it.designation || "",
                        quantite: Number(it.quantite) || 1,
                        prix_unitaire: Number(it.prix_unitaire) || 0,
                        tva: it.tva !== undefined ? Number(it.tva) : 20,
                        reduction: Number(it.reduction) || 0,
                        montant_ht: Number(it.montant_ht) || 0
                    }));
                    setItems(mappedItems);
                    calculateTotals(mappedItems);
                }
                toast.success("Détails du devis importés");
            }
        } catch (error) {
            console.error("Error fetching full devis:", error);
            toast.error("Erreur de chargement du devis");
        }
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
            const reductionValue = Number(formData.reduction) || 0;
            const mustResetApproval = Boolean(editingCommande);
            const data = {
                ...formData,
                reduction: reductionValue,
                statut: mustResetApproval ? "en_attente" : formData.statut,
                montant_ht: Number(formData.montant_ht),
                a_facture: Boolean(formData.a_facture),
                client_id: selectedClient?.id,
                items: items.map(it => ({
                    produit_id: it.produit_id,
                    quantite: Number(it.quantite),
                    prix_unitaire: Number(it.prix_unitaire),
                    tva: Number(it.tva),
                    reduction: Number(it.reduction),
                    designation: it.designation
                }))
            };

            const url = editingCommande ? `/api/commandes/${editingCommande.id}` : "/api/commandes";
            const method = editingCommande ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                const result = await response.json().catch(() => ({}));
                toast.success(editingCommande ? "Commande mise à jour !" : "Commande créée !");
                // Notifier le sidebar pour rafraîchir le compteur d'approbations
                window.dispatchEvent(new CustomEvent("approvals-updated"));

                if (!editingCommande) {
                    const newId = result.id;
                    // Mémoriser l'id de la nouvelle commande pour le règlement / facturation
                    setCreatedCommandeId(newId);
                    createdCommandeBanqueIdRef.current =
                        formData.banque_id && formData.banque_id !== "none" ? formData.banque_id : null;
                    // Après création d'une nouvelle commande, revenir systématiquement à la liste
                    resetForm();
                    setActiveTab("list");
                    fetchCommandes();

                    if (formData.a_facture) {
                        // Nouvelle commande avec facturation immédiate : ouvrir le dialog de facture
                        setShowFactureDialog(true);
                    } else {
                        // Pas de facture : proposer le règlement
                        setShowReglementDialog(true);
                    }
                } else {
                    // Cas modification d'une commande existante
                    if (formData.a_facture) {
                        // Si "À facturer" est Oui, diriger directement vers la page Factures
                        const commandeId = editingCommande.id;
                        resetForm();
                        setActiveTab("list");
                        fetchCommandes();
                        navigate("/dashboard/factures", {
                            state: { commandeId, banqueId: formData.banque_id, skipReglement: true },
                        });
                    } else {
                        // Sinon, simple retour à la liste
                        resetForm();
                        setActiveTab("list");
                        fetchCommandes();
                    }
                }
            } else {
                toast.error("Échec de l'enregistrement");
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
            numero_commande: "",
            date_commande: new Date().toISOString().split('T')[0],
            statut: "en_attente",
            devis_id: null,
            reduction: "0",
            montant_ht: "0",
            a_facture: false,
            mode_paiement: "virement",
            banque_id: "none",
            paiement_espece_type: "total"
        });
        setItems([{ designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }]);
        setSelectedClient(null);
        setClientSearch("");
        setDevisSearch("");
        setEditingCommande(null);
        setCalculatedValues({ montantTVA: 0, montantTTC: 0 });
        setShowClientDropdown(false);
        setShowDevisDropdown(false);
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
        if (!commandeToDelete) return;
        if (isCommandeReglee(commandeToDelete, factures)) {
            toast.error("Suppression impossible : cette commande est déjà réglée.");
            setDeleteDialogOpen(false);
            setCommandeToDelete(null);
            return;
        }
        try {
            const response = await fetch(`/api/commandes/${commandeToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success("Commande supprimée");
                fetchCommandes();
            } else {
                const body = await response.json().catch(() => ({}));
                toast.error(body.message || "Erreur suppression");
            }
        } catch (error) {
            toast.error("Erreur suppression");
        } finally {
            setDeleteDialogOpen(false);
            setCommandeToDelete(null);
        }
    };


    const openBulkDeleteDialog = () => {
        if (selectedIds.length === 0) return;
        setBulkDeleteDialogOpen(true);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        setIsBulkDeleting(true);
        try {
            let successCount = 0;
            let blockedCount = 0;
            for (const id of selectedIds) {
                const commande = commandes.find((c) => c.id === id);
                if (commande && isCommandeReglee(commande, factures)) {
                    blockedCount++;
                    continue;
                }
                const response = await fetch(`/api/commandes/${id}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (response.ok) successCount++;
            }
            
            if (successCount > 0) {
                toast.success(`${successCount} commandes supprimées avec succès`);
                setSelectedIds([]);
                fetchCommandes();
            } else {
                toast.error("Erreur lors de la suppression des commandes");
            }
            if (blockedCount > 0) {
                toast.error(`${blockedCount} commande(s) réglée(s) n'ont pas pu être supprimées.`);
            }
        } catch (error) {
            toast.error("Erreur lors de la suppression en masse");
        } finally {
            setIsBulkDeleting(false);
            setBulkDeleteDialogOpen(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === paginatedCommandes.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(paginatedCommandes.map(c => c.id));
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const sousSocieteOptions = useMemo(
        () =>
            Array.from(
                new Set([
                    ...allSousSocieteNames,
                    ...commandes.map((c) => String(c.sous_societe_nom || "").trim()).filter(Boolean),
                ])
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [allSousSocieteNames, commandes]
    );

    const filteredCommandes = commandes.filter(c => {
        const matchesSearch = c.numero_commande.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.client_nom?.toLowerCase().includes(searchTerm.toLowerCase());

        const date = new Date(c.date_commande);
        const matchesMonth = filterMonth === "all" || (date.getMonth() + 1).toString() === filterMonth;
        const matchesYear = filterYear === "all" || date.getFullYear().toString() === filterYear;
        const matchesStatus = commandeMatchesStatusFilter(c, filterStatus, factures, remboursementMap);
        const matchesClientType = filterClientType === "all" || c.client_type === filterClientType;
        const matchesUser = filterUser === "all" || c.user_id?.toString() === filterUser;
        const matchesClient = filterClient === "all" || c.client_id?.toString() === filterClient;
        const matchesPointDeVente =
            filterPointDeVente === "all" ||
            String(c.point_de_vente_nom || "").trim().toLowerCase() === filterPointDeVente;
        const matchesSousSociete = matchesSousSocieteListFilter(
            filterSousSociete,
            c.sous_societe_nom,
            c.numero_commande
        );

        return (
            matchesSearch &&
            matchesMonth &&
            matchesYear &&
            matchesStatus &&
            matchesClientType &&
            matchesUser &&
            matchesClient &&
            matchesPointDeVente &&
            matchesSousSociete
        );
    });

    const pointDeVenteOptions = Array.from(
        new Set(
            commandes
                .map((c) => String(c.point_de_vente_nom || "").trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

    const exportToXLS = () => {
        const headers = ["N° Commande", "Client", "Date", "Montant HT", "Montant TVA", "Total TTC", "Status"];
        const rows = filteredCommandes.map(c => [
            c.numero_commande,
            c.client_nom,
            new Date(c.date_commande).toLocaleDateString(),
            Number(c.montant_ht) || 0,
            Number(c.montant_tva) || 0,
            Number(c.montant_ttc) || 0,
            c.statut
        ]);
        exportToExcel({ headers, rows, fileName: `commandes_export_${new Date().toISOString().split('T')[0]}`, sheetName: "Commandes" });
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
            doc.text("Liste des Commandes", 40, 24);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Exporté le : ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageWidth - 14, 18, { align: "right" });
            doc.text(`Total : ${filteredCommandes.length} commandes`, pageWidth - 14, 24, { align: "right" });

            const tableData = filteredCommandes.map((c) => {
                const montantHT = Number(c.montant_ht) || 0;
                const montantTVA = Number(c.montant_tva) || 0;
                const montantTTC = Number(c.montant_ttc) || (montantHT + montantTVA);
                const formattedTTC = montantTTC.toFixed(2).replace(".", ",");
                const totalRegle = Number(c.total_regle) || 0;
                const resteCalcule =
                    typeof c.reste_a_payer !== "undefined"
                        ? Number(c.reste_a_payer)
                        : Math.max(montantTTC - totalRegle, 0);
                const estReglee = isCommandeReglee(c, factures);
                const reglementCommence = !estReglee && totalRegle > 0 && resteCalcule > 0;
                const statutReglement = estReglee
                    ? "Réglé"
                    : reglementCommence
                      ? "Règlement commencé"
                      : "Non réglé";

                return [
                    c.numero_commande,
                    c.client_nom || "—",
                    getSousSocieteLabel(c),
                    `${formattedTTC} DH`,
                    new Date(c.date_commande).toLocaleDateString("fr-FR"),
                    statutReglement,
                    c.point_de_vente_nom || "—",
                    c.user_nom || "—"
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

            const totalCommandes = filteredCommandes.reduce((acc, c) => {
                const montantHT = Number(c.montant_ht) || 0;
                const montantTVA = Number(c.montant_tva) || 0;
                const montantTTC = Number(c.montant_ttc) || (montantHT + montantTVA);
                return acc + montantTTC;
            }, 0);
            const totalY = (doc as any).lastAutoTable?.finalY
                ? (doc as any).lastAutoTable.finalY + 8
                : 53;
            const totalFormatted = totalCommandes.toFixed(2).replace(".", ",");
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

            doc.save(`commandes_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            console.error("Erreur export PDF:", error);
            toast.error("Erreur lors de l'export PDF");
        }
    };

    const reportData = {
        totalHT: filteredCommandes.reduce((acc, c) => acc + Number(c.montant_ht), 0),
        totalTTC: filteredCommandes.reduce((acc, c) => acc + Number(c.montant_ttc), 0),
        count: filteredCommandes.length,
        statusCounts: {
            en_attente: filteredCommandes.filter(c => c.statut === "en_attente").length,
            validee: filteredCommandes.filter(c => c.statut === "validee").length,
            livree: filteredCommandes.filter(c => c.statut === "livree").length,
            annulee: filteredCommandes.filter(c => c.statut === "annulee").length
        }
    };

    const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
    const months = [
        { val: "1", label: "Janvier" }, { val: "2", label: "Février" }, { val: "3", label: "Mars" },
        { val: "4", label: "Avril" }, { val: "5", label: "Mai" }, { val: "6", label: "Juin" },
        { val: "7", label: "Juillet" }, { val: "8", label: "Août" }, { val: "9", label: "Septembre" },
        { val: "10", label: "Octobre" }, { val: "11", label: "Novembre" }, { val: "12", label: "Décembre" }
    ];

    const totalPages = Math.ceil(filteredCommandes.length / itemsPerPage);
    const paginatedCommandes = filteredCommandes.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const totalHTTotal = items.reduce((acc, it) => acc + (it.montant_ht || 0), 0);
    const totalTVATotal = calculatedValues.montantTVA;
    const totalTTCTotal = calculatedValues.montantTTC;
    const totalReductionValue = items.reduce((acc, it) => {
        const bruteHT = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
        const redPct = Number(it.reduction) || 0;
        return acc + (bruteHT * redPct) / 100;
    }, 0);

    const handleGeneratePdf = async (commande: Commande) => {
        try {
            const response = await fetch(`/api/commandes/${commande.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) {
                toast.error("Erreur lors du chargement de la commande");
                return;
            }
            const fullCommande = await response.json();
            await generateCommandePdf(fullCommande);
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        }
    };

    const getStatusBadge = (status: string, commandeId?: number) => {
        switch (status) {
            case "en_attente":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 animate-pulse">
                        <Clock className="h-3 w-3" /> En attente
                    </span>
                );
            case "validee":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="h-3 w-3" /> Validée
                    </span>
                );
            case "livree":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                        <ShoppingCart className="h-3 w-3" /> Livrée
                    </span>
                );
            case "annulee":
                return (
                    <div className="flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                            <XCircle className="h-3 w-3" /> Annulée
                        </span>
                        {commandeId && (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 mt-0.5"
                                title="Rouvrir cette commande et relancer la demande"
                                onClick={async () => {
                                    try {
                                        const res = await fetch(`/api/commandes/${commandeId}/reopen`, {
                                            method: "PUT",
                                            headers: {
                                                "Content-Type": "application/json",
                                                Authorization: `Bearer ${token}`,
                                            },
                                        });
                                        if (!res.ok) {
                                            const body = await res.json().catch(() => ({}));
                                            toast.error(body.message || "Erreur lors de la réouverture de la commande");
                                            return;
                                        }
                                        toast.success("Commande rouverte et remise en attente de validation");
                                        fetchCommandes();
                                        window.dispatchEvent(new CustomEvent("approvals-updated"));
                                    } catch (e) {
                                        console.error(e);
                                        toast.error("Erreur lors de la réouverture de la commande");
                                    }
                                }}
                            >
                                <LockOpen className="h-3 w-3" />
                                <span>Rouvrir</span>
                            </button>
                        )}
                    </div>
                );
            default:
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted text-muted-foreground">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ShoppingCart className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Gestion des Commandes
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Suivi des commandes clients</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><ShoppingCart className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Commandes</p>
                        <p className="text-xl font-bold text-foreground">{commandes.length}</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400"><DollarSign className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Chiffre d'Affaires</p>
                        <p className="text-xl font-bold text-foreground">{commandes.reduce((acc, c) => acc + (Number(c.total_regle) || 0), 0).toLocaleString()} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400"><Clock className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">En attente</p>
                        <p className="text-xl font-bold text-foreground">{commandes.filter(c => c.statut === 'en_attente').length}</p>
                    </div>
                </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger
                        value="list"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        Liste des Commandes
                    </TabsTrigger>
                    <TabsTrigger
                        value="form"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                        onClick={() => { if (!editingCommande) resetForm(); }}
                    >
                        {editingCommande ? "Modifier Commande" : "Nouvelle Commande"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-wrap justify-between items-center gap-4 backdrop-blur-sm">
                            <div className="relative w-full max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Rechercher par numéro ou client..."
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

                        {selectedIds.length > 0 && (
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800 flex items-center justify-between animate-in fade-in slide-in-from-left-2 duration-300">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                        {selectedIds.length} élément(s) sélectionné(s)
                                    </span>
                                </div>
                                <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    onClick={openBulkDeleteDialog}
                                    disabled={isBulkDeleting}
                                    className="h-9 rounded-lg bg-red-500 hover:bg-red-600 font-bold gap-2"
                                >
                                    <DeleteSvgIcon className="h-4 w-4 fill-white" />
                                    {isBulkDeleting ? "Suppression..." : "Supprimer la sélection"}
                                </Button>
                            </div>
                        )}

                        {showFilters && (
                            <div className="bg-muted/30 p-4 rounded-[1.5rem] border border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                                            <SelectItem value="validee">Validée</SelectItem>
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
                                            <SelectItem value="all">Toutes les sociétés</SelectItem>
                                            {sousSocieteOptions.map((name) => (
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
                        <Table className="min-w-[1100px]">
                            <TableHeader>
                                <TableRow className="bg-muted/50 border-b border-border">
                                    <TableHead className="w-12 py-4 pl-6">
                                        <input 
                                            type="checkbox" 
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                            checked={paginatedCommandes.length > 0 && selectedIds.length === paginatedCommandes.length}
                                            onChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead className="w-[150px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">N° Commande</TableHead>
                                    <TableHead className="w-[220px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Client / Point de vente</TableHead>
                                    <TableHead className="w-[120px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Date</TableHead>
                                    <TableHead className="w-[130px] text-xs font-bold text-muted-foreground uppercase py-4 text-right whitespace-nowrap">Montant</TableHead>
                                    <TableHead className="w-[110px] text-xs font-bold text-muted-foreground uppercase py-4 text-center whitespace-nowrap">Réduction</TableHead>
                                    <TableHead className="w-[150px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Utilisateur</TableHead>
                                    <TableHead className="w-[110px] text-xs font-bold text-muted-foreground uppercase py-4 text-center whitespace-nowrap">Statut règlement</TableHead>
                                    <TableHead className="w-[130px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Statut / Reste</TableHead>
                                    <TableHead className="w-[180px] text-xs font-bold text-muted-foreground uppercase py-4 text-right pr-6 whitespace-nowrap">Actions</TableHead>
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
                                            <TableCell><div className="h-4 w-20 bg-muted rounded" /></TableCell>
                                            <TableCell className="pr-6"><div className="h-8 w-16 bg-muted rounded ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredCommandes.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-20 text-muted-foreground">
                                            Aucune commande trouvée
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedCommandes.map((commande) => (
                                        <TableRow key={commande.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0">
                                            <TableCell className="w-12 py-4 pl-6">
                                                <input 
                                                    type="checkbox" 
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                                    checked={selectedIds.includes(commande.id)}
                                                    onChange={() => toggleSelect(commande.id)}
                                                />
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/dashboard/commandes/${commande.id}`)}
                                                            className="text-left font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                                        >
                                                            {commande.numero_commande}
                                                        </button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.open(`/dashboard/commandes/${commande.id}`, "_blank", "noopener");
                                                            }}
                                                            className="h-7 w-7 text-muted-foreground hover:text-indigo-600 hover:bg-muted/60"
                                                            title="Ouvrir dans un nouvel onglet"
                                                        >
                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                    <div className="flex gap-2 mt-1">
                                                        {commande.devis_id && (
                                                            <span
                                                                className="text-[9px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => navigate(`/dashboard/devis/${commande.devis_id}`)}
                                                            >
                                                                <CheckCircle2 className="h-2.5 w-2.5" /> Devis
                                                            </span>
                                                        )}
                                                        {(() => {
                                                            const linkedFacture = factures?.find?.((f: any) => f.commande_id === commande.id);
                                                            if (!linkedFacture) return null;
                                                            return (
                                                                <span
                                                                    className="text-[9px] text-blue-600 dark:text-blue-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() => navigate(`/dashboard/factures/${linkedFacture.id}`)}
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Facture
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                    {(() => {
                                                        const hasRemboursement = !!remboursementMap[commande.id];
                                                        const showAvoir = commande.has_avoir || commande.has_avoir_facture;

                                                        return (
                                                            <div className="flex flex-col gap-0.5 mt-0.5">
                                                                {hasRemboursement && (
                                                                    <span className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-1 font-bold bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded-sm w-fit">
                                                                        <RotateCcw className="h-3 w-3" /> Remboursé
                                                                    </span>
                                                                )}
                                                                {showAvoir && (
                                                                    <span className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-1 font-bold bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded-sm w-fit">
                                                                        <FileText className="h-3 w-3" /> Avoir existe
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-start gap-2">
                                                    <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-foreground truncate">
                                                            {commande.client_nom || "—"}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            <span className="font-medium">PDV :</span> {commande.point_de_vente_nom || "—"}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            <span className="font-medium">Société :</span> {getSousSocieteLabel(commande)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Calendar className="h-4 w-4" />
                                                    {new Date(commande.date_commande).toLocaleDateString()}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-bold text-right">
                                                {(Number(commande.montant_ttc) || (Number(commande.montant_ht) + Number(commande.montant_tva)) || 0).toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                DH
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {Number(commande.reduction) > 0 ? (
                                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-[11px] font-semibold text-red-600">
                                                        -{Number(commande.reduction).toFixed(1)}%
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground">Aucune</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {commande.user_nom ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <User className="h-3 w-3" />
                                                        <span className="font-medium text-foreground">{commande.user_nom}</span>
                                                    </span>
                                                ) : <span className="text-muted-foreground text-xs">—</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {(() => {
                                                    const totalRegle = Number((commande as any).total_regle) || 0;
                                                    const mtTtc = Number((commande as any).montant_ttc) || 0;
                                                    const resteCalc =
                                                        typeof (commande as any).reste_a_payer !== "undefined"
                                                            ? Number((commande as any).reste_a_payer)
                                                            : Math.max(mtTtc - totalRegle, 0);

                                                    // Si une facture liée est déjà marquée payée/réglée,
                                                    // on considère aussi la commande comme réglée.
                                                    const linkedFacture = factures.find(
                                                        (f: any) => f.commande_id === commande.id
                                                    );
                                                    const factureIsPaid =
                                                        !!linkedFacture &&
                                                        (linkedFacture.statut === "paye" ||
                                                            linkedFacture.statut === "payee");

                                                    const paidByAmounts = mtTtc > 0 && totalRegle >= mtTtc - 0.01;
                                                    // Si le backend marque la commande OU la facture liée comme payée/réglée,
                                                    // on force l'affichage "Réglé"
                                                    const isRegle =
                                                        factureIsPaid ||
                                                        commande.statut === "paye" ||
                                                        commande.statut === "payee" ||
                                                        commande.statut === "reglee" ||
                                                        paidByAmounts;

                                                    const reste = isRegle ? 0 : Math.max(resteCalc, 0);
                                                    const isReglementCommence = !isRegle && totalRegle > 0 && reste > 0;

                                                    return isRegle ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                            <CheckCircle2 className="h-3 w-3" /> Réglé
                                                        </span>
                                                    ) : isReglementCommence ? (
                                                        <button
                                                            type="button"
                                                            title="Commande liée à un règlement en cours"
                                                            onClick={() =>
                                                                toast.info(
                                                                    `Commande liée à un règlement : ${Number(totalRegle || 0).toLocaleString("fr-FR", {
                                                                        minimumFractionDigits: 2,
                                                                        maximumFractionDigits: 2,
                                                                    })} DH déjà saisi(s).`
                                                                )
                                                            }
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-200/70 dark:hover:bg-amber-900/40 transition-colors"
                                                        >
                                                            <Clock className="h-3 w-3" />
                                                            Règlement commencé
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                                                            <DollarSign className="h-3 w-3" /> Non réglé
                                                        </span>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="flex justify-center">
                                                        {getStatusBadge(commande.statut, commande.id)}
                                                    </div>
                                                    {typeof commande.reste_a_payer !== "undefined" && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            Reste:{" "}
                                                            <span className="font-semibold">
                                                                {Number(commande.reste_a_payer).toLocaleString()} DH
                                                            </span>
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 pr-6 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56">
                                                        {(() => {
                                                            const linkedFacture = factures?.find?.((f: any) => f.commande_id === commande.id);
                                                            const hasRemboursement = !!remboursementMap[commande.id];
                                                            const peutConvertirFacture = commandePeutEtreConvertieEnFacture(
                                                                commande,
                                                                factures,
                                                                remboursementMap
                                                            );
                                                            const canConvert = commande.statut === "validee" || commande.statut === "validée" || commande.statut === "livree";
                                                            const isReglee = isCommandeReglee(commande, factures);
                                                            
                                                            return (
                                                                <>
                                                                    {linkedFacture ? (
                                                                        <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/dashboard/factures/${linkedFacture.id}`)}>
                                                                            <ArrowUpRight className="h-4 w-4" />
                                                                            Voir la facture
                                                                        </DropdownMenuItem>
                                                                    ) : (
                                                                        <>
                                                                            {!hasRemboursement && (
                                                                            <DropdownMenuItem
                                                                                className="cursor-pointer font-bold text-indigo-600"
                                                                                disabled={!canConvert || !peutConvertirFacture}
                                                                                title={
                                                                                    !peutConvertirFacture
                                                                                        ? "Commande non éligible (remboursement, avoir ou facture déjà liée)."
                                                                                        : undefined
                                                                                }
                                                                                onClick={() => {
                                                                                    if (!canConvert) {
                                                                                        toast.error("Cette commande doit être validée par un administrateur avant facturation.");
                                                                                        return;
                                                                                    }
                                                                                    const totalRegle = Number(commande.total_regle) || 0;
                                                                                    const montantTtc = Number(commande.montant_ttc) || (Number(commande.montant_ht) + Number(commande.montant_tva)) || 0;
                                                                                    const paidByAmounts = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
                                                                                    const st = String(commande.statut || "").toLowerCase();
                                                                                    const regleeByStatut =
                                                                                        st === "paye" || st === "payee" || st === "reglee";
                                                                                    const skipReglement = paidByAmounts || regleeByStatut;
                                                                                    const editingThisRow = editingCommande?.id === commande.id;
                                                                                    const banqueFromForm =
                                                                                        editingThisRow &&
                                                                                        formData.banque_id &&
                                                                                        formData.banque_id !== "none"
                                                                                            ? formData.banque_id
                                                                                            : null;
                                                                                    const banqueFromCommande =
                                                                                        commande.banque_id != null &&
                                                                                        commande.banque_id !== 0
                                                                                            ? String(commande.banque_id)
                                                                                            : null;
                                                                                    const banquePourFacture =
                                                                                        banqueFromForm || banqueFromCommande;
                                                                                    navigate("/dashboard/factures", {
                                                                                        state: {
                                                                                            commandeId: commande.id,
                                                                                            banqueId: banquePourFacture || undefined,
                                                                                            skipReglement,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            >
                                                                                <ArrowUpRight className="h-4 w-4" />
                                                                                Convertir en facture
                                                                            </DropdownMenuItem>
                                                                            )}
                                                                        </>
                                                                    )}

                                                                    {!linkedFacture && isReglee && !hasRemboursement && (
                                                                        <DropdownMenuItem
                                                                            className="cursor-pointer text-orange-600 focus:text-orange-600"
                                                                            onClick={() => {
                                                                                const montantTtc = Number(commande.montant_ttc) || (Number(commande.montant_ht) + Number(commande.montant_tva)) || 0;
                                                                                const totalRegle = Number(commande.total_regle) || 0;
                                                                                const montantRemboursable = Math.max(Math.min(montantTtc, totalRegle), 0);
                                                                                navigate("/dashboard/remboursements", {
                                                                                    state: {
                                                                                        commandeId: commande.id,
                                                                                        montant: montantRemboursable,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            <RotateCcw className="h-4 w-4" />
                                                                            Générer remboursement
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    
                                                                    {hasRemboursement && (
                                                                        <DropdownMenuItem 
                                                                            className="cursor-pointer text-indigo-600 focus:text-indigo-600"
                                                                            onClick={() => {
                                                                                const remboursementId = remboursementMap[commande.id];
                                                                                if (!remboursementId) {
                                                                                    toast.error("Détail du remboursement introuvable.");
                                                                                    return;
                                                                                }
                                                                                navigate(`/dashboard/remboursements/${remboursementId}`);
                                                                            }}
                                                                        >
                                                                            <Download className="h-4 w-4" />
                                                                            Voir remboursement
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                        <DropdownMenuItem onClick={() => navigate(`/dashboard/commandes/${commande.id}`)} className="cursor-pointer">
                                                            <ViewSvgIcon className="h-4 w-4" />
                                                            Voir le détail
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (commande.statut !== 'en_attente') handleGeneratePdf(commande);
                                                                else toast.error("Cette commande doit être validée avant téléchargement");
                                                            }}
                                                            disabled={commande.statut === 'en_attente'}
                                                            className="cursor-pointer"
                                                        >
                                                            <Printer className="h-4 w-4" />
                                                            Télécharger
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => { setEditingCommande(commande); setActiveTab("form"); }} className="cursor-pointer">
                                                            <EditSvgIcon className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (isCommandeReglee(commande, factures)) {
                                                                    toast.error("Suppression impossible : cette commande est déjà réglée.");
                                                                    return;
                                                                }
                                                                setCommandeToDelete(commande);
                                                                setDeleteDialogOpen(true);
                                                            }}
                                                            variant="destructive"
                                                            className="cursor-pointer text-red-600 focus:text-red-600"
                                                        >
                                                            <DeleteSvgIcon className="h-4 w-4" />
                                                            Supprimer
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                                {!isLoading && filteredCommandes.length > 0 && (
                                    <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 border-t-2 border-indigo-100 dark:border-indigo-900/30">
                                        <TableCell colSpan={3} className="px-6 py-4 font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider text-xs">
                                            Total Complet (Filtré)
                                        </TableCell>
                                        <TableCell className="px-4 py-4 font-black text-indigo-700 dark:text-indigo-300 text-base">
                                            {filteredCommandes
                                                .reduce(
                                                    (acc, c) =>
                                                        acc +
                                                        (Number(c.montant_ttc) ||
                                                            (Number(c.montant_ht) + Number(c.montant_tva))),
                                                    0
                                                )
                                                .toLocaleString()}{" "}
                                            DH
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
                                <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredCommandes.length)}</span> sur
                                <span className="text-foreground font-bold"> {filteredCommandes.length}</span>
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
                        <div className="h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-2xl"></div>
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                                    <ShoppingCart className="h-5 w-5" />
                                </div>
                                {editingCommande ? `Modifier Commande : ${editingCommande.numero_commande}` : "Nouvelle Commande"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-indigo-600">Lier à un Devis (Optionnel)</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={devisSearch}
                                                onChange={(e) => {
                                                    setDevisSearch(e.target.value);
                                                    setShowDevisDropdown(true);
                                                    if (!e.target.value) {
                                                        handleDevisSelect("none");
                                                    }
                                                }}
                                                onFocus={() => setShowDevisDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowDevisDropdown(false), 200)}
                                                placeholder="Rechercher un devis..."
                                                className={cn("h-11 pl-10 border-indigo-200 bg-indigo-50/30", formData.devis_id && "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-900/10")}
                                            />
                                            {formData.devis_id && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-indigo-500" />}
                                        </div>
                                        {showDevisDropdown && (
                                            <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                                <div
                                                    onMouseDown={() => {
                                                        handleDevisSelect("none");
                                                        setDevisSearch("");
                                                        setShowDevisDropdown(false);
                                                    }}
                                                    className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-muted-foreground border-b border-border"
                                                >
                                                    Aucun (Saisie manuelle)
                                                </div>
                                                {devisSelectableForCommande
                                                    .filter(d => {
                                                        if (!devisSearch.trim()) return true;
                                                        const search = devisSearch.toLowerCase();
                                                        return d.numero_devis.toLowerCase().includes(search) ||
                                                            (d.client_nom && d.client_nom.toLowerCase().includes(search));
                                                    })
                                                    .map(d => (
                                                        <div
                                                            key={d.id}
                                                            onMouseDown={() => {
                                                                handleDevisSelect(d.id.toString());
                                                                setDevisSearch(`${d.numero_devis} - ${d.client_nom}`);
                                                                setShowDevisDropdown(false);
                                                            }}
                                                            className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-bold">{d.numero_devis}</span>
                                                                <span className="text-xs text-muted-foreground">{d.client_nom}</span>
                                                            </div>
                                                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-indigo-500" />
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Date Commande</Label>
                                        <Input
                                            type="date"
                                            name="date_commande"
                                            value={formData.date_commande}
                                            onChange={handleInputChange}
                                            required
                                            className="h-11 border-border focus:border-indigo-500"
                                        />
                                    </div>

                                    <div className="space-y-1.5 flex flex-col justify-end">
                                        <Label className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-700 flex items-center gap-2">
                                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">
                                                !
                                            </span>
                                            Facturer immédiatement
                                        </Label>
                                        <div className="mt-1 inline-flex items-center gap-3 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/60">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setFormData(prev => {
                                                        const nextAFacture = !prev.a_facture;
                                                        if (!nextAFacture && prev.mode_paiement !== "espece") {
                                                            toast.warning("Votre commande est non facturée, de préférence merci de changer le mode de paiement vers ESPECE.");
                                                        }
                                                        return { ...prev, a_facture: nextAFacture };
                                                    })
                                                }
                                                className={cn(
                                                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                                    formData.a_facture ? "bg-emerald-500" : "bg-gray-300"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform",
                                                        formData.a_facture ? "translate-x-4" : "translate-x-1"
                                                    )}
                                                />
                                            </button>
                                            <span className="text-xs font-semibold text-emerald-900">
                                                {formData.a_facture
                                                    ? "Oui, générer une facture tout de suite"
                                                    : "Non, conserver uniquement la commande"}
                                            </span>
                                        </div>
                                    </div>

                                    <>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Mode de Paiement</Label>
                                            <Select
                                                value={formData.mode_paiement}
                                                onValueChange={(v) =>
                                                    setFormData(prev => {
                                                        if (!prev.a_facture && v !== "espece") {
                                                            toast.warning("Votre commande est non facturée, de préférence merci de changer le mode de paiement vers ESPECE.");
                                                        }
                                                        return { ...prev, mode_paiement: v };
                                                    })
                                                }
                                            >
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
                                            <Select value={formData.banque_id || "none"} onValueChange={(v) => setFormData(prev => ({ ...prev, banque_id: v }))}>
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

                                        {/* plus de champ spécifique pour paiement espèces ici */}
                                    </>

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
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Articles de la commande</h3>
                                        <Button type="button" onClick={addItem} size="sm" className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400">
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
                                                    <TableRow key={index} className="group hover:bg-muted/20 transition-colors">
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
                                                                        if (!(p.stock > 0)) return false;
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
                                                                            if (!(p.stock > 0)) return false;
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
                                            <p className="text-xl font-bold text-foreground">{totalHTTotal.toLocaleString()} DH</p>
                                        </div>
                                        {/* Global Reduction Removed */}
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">TVA</p>
                                            <p className="text-xl font-bold text-amber-600">{totalTVATotal.toLocaleString()} DH</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Réduction Valeur</p>
                                            <p className="text-xl font-bold text-red-600">{totalReductionValue.toLocaleString()} DH</p>
                                        </div>
                                    </div>
                                    <div className="h-16 w-px bg-border hidden md:block"></div>
                                    <div className="text-center md:text-right">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total TTC</p>
                                        <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 drop-shadow-sm">{totalTTCTotal.toLocaleString()} DH</p>
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
                                        {isSubmitting ? "Enregistrement..." : editingCommande ? "Modifier la Commande" : "Enregistrer la Commande"}
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
                        <DialogTitle className="text-red-500">Supprimer la commande ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Voulez-vous vraiment supprimer la commande <span className="font-bold text-foreground">{commandeToDelete?.numero_commande}</span> ?
                            Cette action est irréversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Supprimer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Supprimer la sélection ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Voulez-vous vraiment supprimer <span className="font-bold text-foreground">{selectedIds.length}</span> commande(s) ?
                            Cette action est irréversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setBulkDeleteDialogOpen(false)}>Annuler</Button>
                        <Button
                            variant="destructive"
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {isBulkDeleting ? "Suppression..." : "Supprimer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showFactureDialog} onOpenChange={setShowFactureDialog}>
                <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
                    <div className="h-1.5 bg-indigo-600" />
                    <DialogHeader className="px-6 pt-4 pb-2">
                        <DialogTitle className="flex items-center gap-3 text-base">
                            <div className="h-8 w-8 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <FileText className="h-4 w-4" />
                            </div>
                            <span className="text-indigo-700 dark:text-indigo-300">
                                Commande enregistrée avec succès
                            </span>
                        </DialogTitle>
                        <DialogDescription className="px-1 pt-2 text-sm text-muted-foreground">
                            Voulez-vous maintenant <span className="font-semibold text-indigo-600">générer la facture</span> liée à cette commande&nbsp;?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-4">
                        {createdCommandeId && (
                            <div className="mb-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 px-3 py-2 text-[11px] text-indigo-700 dark:text-indigo-200 flex items-center justify-between">
                                <span className="font-semibold uppercase tracking-widest">
                                    Commande #{createdCommandeId}
                                </span>
                                <span className="text-[10px] text-indigo-500 dark:text-indigo-300">
                                    Étape suivante : facturation
                                </span>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <Button
                                variant="ghost"
                                className="flex-1 h-10 rounded-xl text-xs font-semibold"
                                onClick={() => {
                                    setShowFactureDialog(false);
                                    resetForm();
                                    setActiveTab("list");
                                    fetchCommandes();
                                    setShowReglementDialog(true);
                                }}
                            >
                                Plus tard
                            </Button>
                            <Button
                                className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white"
                                onClick={() => {
                                    navigate("/dashboard/factures", {
                                        state: {
                                            commandeId: createdCommandeId,
                                            banqueId: createdCommandeBanqueIdRef.current || undefined,
                                        },
                                    });
                                }}
                            >
                                Générer la facture
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Popup après commande sans facture ou "Plus tard" : saisir le règlement ? */}
            <Dialog open={showReglementDialog} onOpenChange={setShowReglementDialog}>
                <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
                    <div className="h-1.5 bg-emerald-600" />
                    <DialogHeader className="px-6 pt-4 pb-2">
                        <DialogTitle className="flex items-center gap-3 text-base">
                            <div className="h-8 w-8 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <Banknote className="h-4 w-4" />
                            </div>
                            <span className="text-emerald-700 dark:text-emerald-300">
                                Saisir le règlement
                            </span>
                        </DialogTitle>
                        <DialogDescription className="px-1 pt-2 text-sm text-muted-foreground">
                            Voulez-vous <span className="font-semibold text-emerald-600">saisir un règlement</span> (paiement)&nbsp;?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-4">
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <Button
                                variant="ghost"
                                className="flex-1 h-10 rounded-xl text-xs font-semibold"
                                onClick={() => {
                                    setShowReglementDialog(false);
                                    setActiveTab("list");
                                    resetForm();
                                    fetchCommandes();
                                    navigate("/dashboard/commandes");
                                }}
                            >
                                Plus tard
                            </Button>
                            <Button
                                className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white"
                                onClick={() => {
                                    setShowReglementDialog(false);
                                    if (createdCommandeId) {
                                        navigate("/dashboard/reglements", {
                                            state: { commandeId: createdCommandeId, openDialog: true },
                                        });
                                    } else {
                                        navigate("/dashboard/reglements");
                                    }
                                }}
                            >
                                Saisir le règlement
                            </Button>
                        </div>
                    </div>
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
                                    <DialogTitle className="text-xl font-black text-foreground tracking-tight">Rapport des Commandes</DialogTitle>
                                    <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Analyse des commandes filtrées</DialogDescription>
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
                                        <SelectItem value="validee">Validée</SelectItem>
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
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400"><ShoppingCart className="h-4 w-4" /></div>
                                    <span className="text-xs font-bold text-muted-foreground">Volume total</span>
                                </div>
                                <span className="text-base font-black text-foreground">{reportData.count} <span className="text-[10px] text-muted-foreground uppercase font-black">Commandes</span></span>
                            </div>

                            <div className="grid grid-cols-2 divide-x divide-border bg-muted/10">
                                <div className="p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-amber-600 uppercase">En attente</span>
                                        <span className="text-xs font-black">{reportData.statusCounts.en_attente}</span>
                                    </div>
                                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-500" style={{ width: `${(reportData.statusCounts.en_attente / reportData.count) * 100 || 0}%` }}></div>
                                    </div>
                                </div>
                                <div className="p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-emerald-600 uppercase">Validées</span>
                                        <span className="text-xs font-black">{reportData.statusCounts.validee}</span>
                                    </div>
                                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${(reportData.statusCounts.validee / reportData.count) * 100 || 0}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 divide-x divide-border">
                                <div className="p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-blue-600 uppercase">Livrées</span>
                                        <span className="text-xs font-black">{reportData.statusCounts.livree}</span>
                                    </div>
                                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${(reportData.statusCounts.livree / reportData.count) * 100 || 0}%` }}></div>
                                    </div>
                                </div>
                                <div className="p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-red-600 uppercase">Annulées</span>
                                        <span className="text-xs font-black">{reportData.statusCounts.annulee}</span>
                                    </div>
                                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-red-500" style={{ width: `${(reportData.statusCounts.annulee / reportData.count) * 100 || 0}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3.5 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/50 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Calendar className="h-5 w-5 text-indigo-500" />
                                <p className="text-xs font-medium text-muted-foreground">
                                    Période : {months.find(m => m.val === filterMonth)?.label || "Toute l'année"} {filterYear}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-indigo-950 rounded-lg border border-indigo-100 dark:border-indigo-800 shadow-sm">
                                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                <span className="text-[10px] font-bold text-indigo-600 uppercase">Live</span>
                            </div>
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

export default Commandes;
