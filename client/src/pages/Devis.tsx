import { useEffect, useRef, useState } from "react";
import { exportToExcel } from "@/utils/exportExcel";
import { normalizeLineTvaPercent } from "@/lib/normalizeLineTva";
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/common/ui/tabs";
import { toast } from "sonner";
import {
    Plus, Search, FileText, ChevronLeft, ChevronRight,
    ChevronsLeft, ChevronsRight, CheckCircle2, ArrowUpRight, Calendar, BarChart3, UserPlus,
    XCircle,
    Clock,
    Filter,
    FileSpreadsheet,
    User,
    Printer,
    MoreVertical,
    DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeleteSvgIcon, EditSvgIcon } from "@/components/icons/actionSvgIcons";
import { generateDevisPdf } from "@/components/pdf/DevisPdf";
import { matchesSousSocieteListFilter } from "@/utils/sousSocieteListFilter";
import {
    formatListPdfDh,
    formatListPdfMargeHt,
    formatListPdfPrixAchatHt,
    formatListPdfPrixTotal,
    formatListPdfPrixVenteProduit,
    formatListPdfTva,
    LIST_DOC_PDF_COLUMN_STYLES,
    LIST_DOC_PDF_HEAD,
    resolveListPdfPrixTotalTtc,
} from "@/utils/listDocumentPdfColumns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";

interface Client {
    id: number;
    nom_complet: string;
}

interface Product {
    id: number;
    nom: string;
    reference?: string | null;
    prix: number;
    prix_de_vente?: number | string | null;
    stock: number;
}

/** PU de vente : prix de vente si renseigné, sinon prix d'achat (repli). */
function getProductSaleUnitPrice(product: { prix: number; prix_de_vente?: number | string | null }): number {
    const pv = Number(product.prix_de_vente);
    if (Number.isFinite(pv) && pv > 0) return pv;
    const pa = Number(product.prix);
    return Number.isFinite(pa) ? pa : 0;
}

interface DevisItem {
    id?: number;
    produit_id?: number;
    designation: string;
    quantite: number;
    prix_unitaire: number;
    tva: number;
    reduction: number;
    montant_ht: number;
}

interface Devis {
    id: number;
    numero_devis: string;
    date_devis: string;
    montant_ht: number;
    taux_tva: number;
    montant_tva: number;
    statuts_devis: string;
    client_id: number;
    user_id: number;
    client_nom: string;
    client_type?: string;
    user_nom?: string;
    items?: DevisItem[];
    reduction?: number;
    total_reduction?: number;
    montant_ttc?: number;
    /** Marge HT estimée (lignes avec produit : Σ montant_ht − quantité × prix d'achat) */
    marge_ht?: number | string | null;
    /** Σ qté × prix_de_vente catalogue (repli prix produit / ligne) */
    prix_vente_ht?: number | string | null;
    point_de_vente_nom?: string;
    sous_societe_nom?: string | null;
    bon_livraison_id?: number | null;
    has_bon_livraison?: number | boolean;
}

interface LinkedCommandeSummary {
    id: number;
    devis_id: number;
    numero_commande?: string;
    reduction?: number;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
}

interface LinkedFactureSummary {
    id: number;
    devis_id: number;
    numero_facture?: string;
    montant_ttc?: number;
}

const getSousSocieteLabel = (doc: { sous_societe_nom?: string | null; numero_devis?: string | null }) => {
    const fromName = String(doc.sous_societe_nom || "").trim();
    return fromName || "—";
};

const toNum = (value: any): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const getDevisReductionPct = (devis: Devis): number => {
    return Math.max(0, toNum(devis.reduction));
};

const getDevisFinalTTC = (devis: Devis): number => {
    // montant_ttc is already the final amount after line-item reductions.
    // Do not apply `devis.reduction` again, otherwise totals are discounted twice.
    return toNum(devis.montant_ttc) || (toNum(devis.montant_ht) + toNum(devis.montant_tva));
};

/** Marge bénéficiaire HT (backend) : vente HT lignes produit − coût d'achat (prix catalogue × qté). */
function formatListeMargeHt(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
}

function Devis() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const role = localStorage.getItem("role");
    const isAdmin = role === "admin" || role === "responsable" || role === "superadmin";

    const [devis, setDevis] = useState<Devis[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [calculatedValues, setCalculatedValues] = useState({ montantTVA: 0, montantTTC: 0, totalReductionAmount: 0 });
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [editingDevis, setEditingDevis] = useState<Devis | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [devisToDelete, setDevisToDelete] = useState<Devis | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterClientType, setFilterClientType] = useState<string>("all");
    const [filterSousSociete, setFilterSousSociete] = useState<string>("all");
    const [filterPointDeVente, setFilterPointDeVente] = useState<string>("all");
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [showQuickAddClientDialog, setShowQuickAddClientDialog] = useState(false);
    const [pendingClientName, setPendingClientName] = useState("");
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [showCommandeDialog, setShowCommandeDialog] = useState(false);
    const [createdDevisId, setCreatedDevisId] = useState<number | null>(null);
    const cameFromProductSaleRef = useRef(false);
    const [users, setUsers] = useState<any[]>([]);
    const [filterUser, setFilterUser] = useState<string>("all");
    const [filterClient, setFilterClient] = useState<string>("all");
    const [allSousSocieteNames, setAllSousSocieteNames] = useState<string[]>([]);
    const [linkedCommandes, setLinkedCommandes] = useState<LinkedCommandeSummary[]>([]);
    const [linkedFactures, setLinkedFactures] = useState<LinkedFactureSummary[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

    const token = localStorage.getItem("token");

    const fetchClients = async () => {
        try {
            const response = await fetch("/api/clients", { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) setClients(await response.json());
        } catch (error) { console.error("Error fetching clients:", error); }
    };

    const fetchProducts = async () => {
        try {
            const response = await fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) setProducts(await response.json());
        } catch (error) { console.error("Error fetching products:", error); }
    };

    const fetchDevis = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/devis", { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) setDevis(await response.json());
        } catch (error) { console.error("Error fetching devis:", error); }
        finally { setIsLoading(false); }
    };

    const fetchLinkedCommandes = async () => {
        try {
            const response = await fetch("/api/commandes", { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) {
                const data = await response.json();
                const summaries: LinkedCommandeSummary[] = (data || [])
                    .filter((c: any) => c.devis_id)
                    .map((c: any) => ({
                        id: c.id,
                        devis_id: c.devis_id,
                        numero_commande: c.numero_commande,
                        reduction: c.reduction,
                        montant_ht: c.montant_ht,
                        montant_tva: c.montant_tva,
                        montant_ttc: c.montant_ttc,
                    }));
                setLinkedCommandes(summaries);
            }
        } catch (error) {
            console.error("Error fetching linked commandes:", error);
        }
    };

    const fetchLinkedFactures = async () => {
        try {
            const response = await fetch("/api/factures", { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) {
                const data = await response.json();
                const summaries: LinkedFactureSummary[] = (data || [])
                    .filter((f: any) => f.devis_id)
                    .map((f: any) => ({
                        id: f.id,
                        devis_id: f.devis_id,
                        numero_facture: f.numero_facture,
                        montant_ttc: f.montant_ttc,
                    }));
                setLinkedFactures(summaries);
            }
        } catch (error) {
            console.error("Error fetching linked factures:", error);
        }
    };
    const fetchUsers = async () => {
        try {
            const response = await fetch("/api/users/all-users", { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
            }
        } catch (error) { console.error("Error fetching users:", error); }
    };

    const fetchSousSocieteNames = async () => {
        try {
            const response = await fetch("/api/settings/sous-societes", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            const data = await response.json();
            const names = Array.isArray(data)
                ? data
                      .map((row: any) => String(row?.nom_sous_societe || "").trim())
                      .filter(Boolean)
                : [];
            setAllSousSocieteNames(names);
        } catch (error) {
            console.error("Error fetching sous societes:", error);
        }
    };

    useEffect(() => { fetchClients(); fetchDevis(); fetchProducts(); fetchUsers(); fetchLinkedCommandes(); fetchLinkedFactures(); fetchSousSocieteNames(); }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterPointDeVente]);

    useEffect(() => {
        const state = location.state as any;

        // Arrivée depuis un produit (création rapide) — toujours en devis classique
        if (state?.selectedProduct) {
            cameFromProductSaleRef.current = true;
            const product = state.selectedProduct;
            const pu = getProductSaleUnitPrice(product);
            const newItem: DevisItem = {
                produit_id: product.id,
                designation: product.nom,
                prix_unitaire: pu,
                quantite: 1,
                tva: 20,
                reduction: 0,
                montant_ht: pu,
            };
            setItems([newItem]);
            calculateTotals([newItem]);
            setActiveTab("form");
            window.history.replaceState({}, document.title);
            return;
        }

        // Arrivée depuis une facture/commande avec un devis déjà existant
        if (state?.devisId && devis.length > 0) {
            const targetId = Number(state.devisId);
            const d = devis.find(dev => dev.id === targetId);
            if (d) {
                setEditingDevis(d);
                setActiveTab("form");
            }
            window.history.replaceState({}, document.title);
        }
    }, [location.state, products, devis, navigate]);

    useEffect(() => {
        const fetchDevisDetails = async () => {
            if (editingDevis) {
                try {
                    const response = await fetch(`/api/devis/${editingDevis.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const fullDevis = await response.json();
                        setFormData({
                            numero_devis: fullDevis.numero_devis,
                            date_devis: fullDevis.date_devis.split('T')[0],
                            montant_ht: (fullDevis.montant_ht || 0).toString(),
                            taux_tva: String(normalizeLineTvaPercent(fullDevis.taux_tva)),
                            reduction: (fullDevis.reduction || 0).toString(),
                            statuts_devis: fullDevis.statuts_devis,
                        });
                        const normalizedItems = (fullDevis.items || []).map((item: any) => ({
                            ...item,
                            designation: item.designation || "",
                            tva: normalizeLineTvaPercent(item.tva),
                            reduction: Number(item.reduction) || 0,
                            quantite: Number(item.quantite) || 0,
                            prix_unitaire: Number(item.prix_unitaire) || 0,
                            montant_ht: Number(item.montant_ht) || 0
                        }));
                        setItems(normalizedItems);
                        calculateTotals(normalizedItems, Number(fullDevis.reduction));
                        const client = clients.find(c => c.id === fullDevis.client_id);
                        if (client) { setSelectedClient(client); setClientSearch(client.nom_complet); }
                    }
                } catch (error) {
                    console.error("Error fetching devis details:", error);
                }
            }
        };
        fetchDevisDetails();
    }, [editingDevis, clients]);

    useEffect(() => {
        if (id && devis.length > 0) {
            const devisToEdit = devis.find(d => d.id === parseInt(id));
            if (devisToEdit) setEditingDevis(devisToEdit);
        }
    }, [id, devis]);

    const [formData, setFormData] = useState({
        numero_devis: "",
        date_devis: new Date().toISOString().split('T')[0],
        montant_ht: "",
        taux_tva: "20",
        statuts_devis: "en attente",
        reduction: "0"
    });
    const [items, setItems] = useState<DevisItem[]>([
        { designation: "", quantite: 1, prix_unitaire: 0, tva: 20, reduction: 0, montant_ht: 0 }
    ]);

    const calculateTotals = (currentItems: DevisItem[], forcedGlobalRed?: number) => {
        let itemsBruteHT = 0;
        let itemsNetHT = 0;
        let itemsTotalTVA = 0;
        let sumItemRedPct = 0; // simple sum of reduction percentages
        let totalReductionAmount = 0; // sum of reduction amounts in DH

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
            sumItemRedPct += (Number(item.reduction) || 0); // sum of %
            totalReductionAmount += (brute - net); // reduction in DH
        });

        // Global reduction = sum of all item reduction percentages
        const displayRed = forcedGlobalRed !== undefined ? forcedGlobalRed : sumItemRedPct;

        setCalculatedValues({ montantTVA: itemsTotalTVA, montantTTC: itemsNetHT + itemsTotalTVA, totalReductionAmount });

        setFormData(prev => ({
            ...prev,
            reduction: displayRed % 1 === 0 ? displayRed.toString() : parseFloat(displayRed.toFixed(2)).toString(),
            montant_ht: itemsNetHT.toFixed(2) // Net HT after all item reductions
        }));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));

        if (items.length === 0 && (name === "montant_ht" || name === "taux_tva")) {
            const ht = name === "montant_ht" ? parseFloat(value) || 0 : parseFloat(formData.montant_ht) || 0;
            const tva = name === "taux_tva" ? parseFloat(value) || 0 : parseFloat(formData.taux_tva) || 0;

            const htApresRed = ht;
            const m_tva = (htApresRed * tva) / 100;
            setCalculatedValues({ montantTVA: m_tva, montantTTC: htApresRed + m_tva, totalReductionAmount: 0 });
        }
    };

    const handleItemChange = (index: number, field: keyof DevisItem, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };

        if (field === "designation") {
            newItems[index].produit_id = undefined;
        }

        if (field === "quantite" || field === "prix_unitaire" || field === "reduction") {
            const bruteHT = (Number(newItems[index].quantite) || 0) * (Number(newItems[index].prix_unitaire) || 0);
            const redRate = (Number(newItems[index].reduction) || 0) / 100;
            newItems[index].montant_ht = bruteHT * (1 - redRate);

            // Stock validation if we have a product_id
            if (field === "quantite" && newItems[index].produit_id) {
                const product = products.find(p => p.id === newItems[index].produit_id);
                if (product && value > product.stock) {
                    toast.error(`Stock insuffisant pour ${product.nom}. Disponible: ${product.stock}`);
                }
            }
        }
        setItems(newItems);
        // Recalculate totals and let it update the global reduction field
        calculateTotals(newItems);
    };

    const handleProductSelect = (index: number, product: Product) => {
        const qte = items[index].quantite || 1;
        if (qte > product.stock) {
            toast.error(`Stock insuffisant pour ${product.nom}. Disponible: ${product.stock}`);
            return;
        }

        const pu = getProductSaleUnitPrice(product);
        const newItems = [...items];
        newItems[index] = {
            ...newItems[index],
            produit_id: product.id,
            designation: product.nom,
            prix_unitaire: pu,
            reduction: 0,
            montant_ht: qte * pu,
        };
        setItems(newItems);
        calculateTotals(newItems, Number(formData.reduction) || 0);
        setActiveProductSearchIndex(null);
    };

    const addItem = () => {
        const newItems = [...items, { designation: "", quantite: 1, prix_unitaire: 0, tva: 20, reduction: 0, montant_ht: 0 }];
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
        calculateTotals(newItems, Number(formData.reduction) || 0);
    };

    const handleSelectChange = (name: string, value: string) => setFormData((p) => ({ ...p, [name]: value }));
    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (items.some(item => !item.designation.trim())) errors.items = "Toutes les désignations sont requises";
        if (!selectedClient) errors.client_id = "Client requis";

        // Stock validation check before submission
        items.forEach(item => {
            if (item.produit_id) {
                const product = products.find(p => p.id === item.produit_id);
                if (product && (item.quantite || 0) > product.stock) {
                    errors.items = `Stock insuffisant pour ${product.nom} (${product.stock} restants)`;
                }
            }
        });

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient && clientSearch.trim()) {
            setPendingClientName(clientSearch.trim());
            setShowQuickAddClientDialog(true);
            return;
        }
        if (!validateForm()) return;
        setIsSubmitting(true);
        const reductionValue = Number(formData.reduction) || 0;
        const mustResetApproval = Boolean(editingDevis);
        const baseData: any = {
            ...formData,
            client_id: selectedClient?.id,
            date_devis: formData.date_devis || new Date().toISOString().split('T')[0],
            reduction: reductionValue,
            statuts_devis: mustResetApproval ? "en attente" : formData.statuts_devis,
            items: items
        };

        // Si ce n'est pas un admin/responsable, ne pas renvoyer statuts_devis
        // pour éviter d'écraser le statut déjà fixé par l'admin (accepté / refusé).
        const data = isAdmin || mustResetApproval
            ? baseData
            : (() => {
                const { statuts_devis, ...rest } = baseData;
                return rest;
            })();
        try {
            const method = editingDevis ? "PUT" : "POST";
            const url = editingDevis ? `/api/devis/${editingDevis.id}` : "/api/devis";
            const response = await fetch(url, {
                method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(data),
            });
            if (response.ok) {
                const result = await response.json();
                toast.success(editingDevis ? "Mis à jour !" : "Créé !");
                const timerDevisId = editingDevis ? editingDevis.id : result?.id;
                if (timerDevisId != null && Number.isFinite(Number(timerDevisId))) {
                    try {
                        localStorage.removeItem(`devisLifetimeStart_${timerDevisId}`);
                        localStorage.setItem(`devisJourRenewed_${timerDevisId}`, String(Date.now()));
                    } catch {
                        /* ignore */
                    }
                }
                // Notifier le sidebar pour rafraîchir le compteur d'approbations
                window.dispatchEvent(new CustomEvent("approvals-updated"));

                if (!editingDevis) {
                    if (cameFromProductSaleRef.current) {
                        cameFromProductSaleRef.current = false;
                        setActiveTab("list");
                        resetForm();
                        setEditingDevis(null);
                        fetchDevis();
                        window.history.replaceState({}, document.title);
                    }
                    setCreatedDevisId(result.id);
                    setShowCommandeDialog(true);
                } else {
                    resetForm();
                    setEditingDevis(null);
                    fetchDevis();
                    setActiveTab("list");
                    navigate('/dashboard/devis');
                }
            } else toast.error("Erreur d'enregistrement");
        } catch { toast.error("Erreur serveur"); }
        finally { setIsSubmitting(false); }
    };

    const resetForm = () => {
        setFormData({ numero_devis: "", date_devis: new Date().toISOString().split('T')[0], montant_ht: "", taux_tva: "20", statuts_devis: "en attente", reduction: "0" });
        setItems([{ designation: "", quantite: 1, prix_unitaire: 0, tva: 20, reduction: 0, montant_ht: 0 }]);
        setSelectedClient(null); setClientSearch(""); setCalculatedValues({ montantTVA: 0, montantTTC: 0, totalReductionAmount: 0 }); setShowClientDropdown(false);
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

    const confirmDelete = async () => {
        if (!devisToDelete) return;
        try {
            const response = await fetch(`/api/devis/${devisToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success("Supprimé !");
                fetchDevis();
            } else {
                const body = await response.json().catch(() => ({}));
                toast.error(body.message || "Erreur suppression");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setDeleteDialogOpen(false);
            setDevisToDelete(null);
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
            for (const id of selectedIds) {
                const response = await fetch(`/api/devis/${id}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (response.ok) successCount++;
            }
            
            if (successCount > 0) {
                toast.success(`${successCount} devis supprimés avec succès`);
                setSelectedIds([]);
                fetchDevis();
            } else {
                toast.error("Erreur lors de la suppression des devis");
            }
        } catch (error) {
            toast.error("Erreur lors de la suppression en masse");
        } finally {
            setIsBulkDeleting(false);
            setBulkDeleteDialogOpen(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === paginatedDevis.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(paginatedDevis.map(d => d.id));
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const filteredDevis = devis.filter(d => {
        const matchesSearch = d.numero_devis.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (d.client_nom && d.client_nom.toLowerCase().includes(searchTerm.toLowerCase()));

        const date = new Date(d.date_devis);
        const matchesMonth = filterMonth === "all" || (date.getMonth() + 1).toString() === filterMonth;
        const matchesYear = filterYear === "all" || date.getFullYear().toString() === filterYear;
        const matchesStatus = filterStatus === "all" || d.statuts_devis === filterStatus;
        const matchesClientType = filterClientType === "all" || d.client_type === filterClientType;
        const matchesUser = filterUser === "all" || d.user_id?.toString() === filterUser;
        const matchesClient = filterClient === "all" || d.client_id?.toString() === filterClient;
        const matchesPointDeVente =
            filterPointDeVente === "all" ||
            String(d.point_de_vente_nom || "").trim().toLowerCase() === filterPointDeVente;
        const matchesSousSociete = matchesSousSocieteListFilter(
            filterSousSociete,
            d.sous_societe_nom,
            d.numero_devis
        );

        return matchesSearch && matchesMonth && matchesYear && matchesStatus && matchesClientType && matchesUser && matchesClient && matchesPointDeVente && matchesSousSociete;
    });

    const exportToXLS = () => {
        const headers = ["N° Devis", "Client", "Date", "Montant", "Montant TVA", "Total TTC", "Status"];
        const rows = filteredDevis.map(d => [
            d.numero_devis,
            d.client_nom,
            new Date(d.date_devis).toLocaleDateString(),
            Number(d.montant_ht) || 0,
            Number(d.montant_tva) || 0,
            getDevisFinalTTC(d),
            d.statuts_devis
        ]);
        exportToExcel({ headers, rows, fileName: `devis_export_${new Date().toISOString().split('T')[0]}`, sheetName: "Devis" });
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
            doc.text("Liste des Devis", 40, 24);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Exporté le : ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageWidth - 14, 18, { align: "right" });
            doc.text(`Total : ${filteredDevis.length} devis`, pageWidth - 14, 24, { align: "right" });

            const tableData = filteredDevis.map((d) => {
                return [
                    d.numero_devis,
                    d.client_nom || "—",
                    getSousSocieteLabel(d),
                    formatListPdfPrixAchatHt(d.montant_ht, d.marge_ht),
                    formatListPdfPrixVenteProduit(d.prix_vente_ht, d.montant_ht),
                    formatListPdfTva(d.montant_tva, d.prix_vente_ht, d.taux_tva, d.montant_ht),
                    formatListPdfPrixTotal(d.prix_vente_ht, d.montant_tva, d.montant_ht, d.taux_tva),
                    formatListPdfMargeHt(d.marge_ht),
                    new Date(d.date_devis).toLocaleDateString("fr-FR"),
                    d.statuts_devis,
                    d.point_de_vente_nom || "—",
                    d.user_nom || "—",
                ];
            });

            autoTable(doc, {
                startY: 45,
                head: [
                    [
                        ...LIST_DOC_PDF_HEAD,
                        "Statut",
                        "Point de vente",
                        "Utilisateur",
                    ],
                ],
                body: tableData,
                theme: "grid",
                headStyles: {
                    fillColor: [67, 56, 202],
                    textColor: 255,
                    fontSize: 8,
                    fontStyle: "bold",
                    halign: "center",
                    cellPadding: 3,
                },
                bodyStyles: {
                    fontSize: 7,
                    cellPadding: 2,
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252],
                },
                columnStyles: LIST_DOC_PDF_COLUMN_STYLES,
                margin: { left: 14, right: 14 },
            });

            const totalDevis = filteredDevis.reduce(
                (acc, d) =>
                    acc + resolveListPdfPrixTotalTtc(d.prix_vente_ht, d.montant_tva, d.montant_ht, d.taux_tva),
                0
            );
            const totalY = (doc as any).lastAutoTable?.finalY
                ? (doc as any).lastAutoTable.finalY + 8
                : 53;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(31, 41, 55);
            doc.text(`Total : ${formatListPdfDh(totalDevis)}`, pageWidth - 14, totalY, { align: "right" });
            doc.setFont("helvetica", "normal");

            // Footer
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Page ${i} / ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
            }

            doc.save(`devis_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            console.error("Erreur export PDF:", error);
            toast.error("Erreur lors de l'export PDF");
        }
    };

    const reportData = {
        totalHT: filteredDevis.reduce((acc, d) => acc + Number(d.montant_ht), 0),
        totalTTC: filteredDevis.reduce((acc, d) => acc + getDevisFinalTTC(d), 0),
        count: filteredDevis.length,
        statusCounts: {
            en_attente: filteredDevis.filter(d => d.statuts_devis === "en attente").length,
            accepte: filteredDevis.filter(d => d.statuts_devis === "accepté").length,
            refuse: filteredDevis.filter(d => d.statuts_devis === "refusé").length
        }
    };

    const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
    const sousSocieteOptions = Array.from(new Set(allSousSocieteNames)).sort((a, b) =>
        a.localeCompare(b, "fr", { sensitivity: "base" })
    );
    const pointDeVenteOptions = Array.from(
        new Set(
            devis
                .map((d) => String(d.point_de_vente_nom || "").trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    const months = [
        { val: "1", label: "Janvier" }, { val: "2", label: "Février" }, { val: "3", label: "Mars" },
        { val: "4", label: "Avril" }, { val: "5", label: "Mai" }, { val: "6", label: "Juin" },
        { val: "7", label: "Juillet" }, { val: "8", label: "Août" }, { val: "9", label: "Septembre" },
        { val: "10", label: "Octobre" }, { val: "11", label: "Novembre" }, { val: "12", label: "Décembre" }
    ];

    const totalPages = Math.ceil(filteredDevis.length / itemsPerPage);
    const paginatedDevis = filteredDevis.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const stats = {
        total: devis.length,
        pending: devis.filter(d => d.statuts_devis === "en attente").length,
        accepted: devis.filter(d => d.statuts_devis === "accepté").length,
        rejected: devis.filter(d => d.statuts_devis === "refusé").length,
    };

    const handleGeneratePdf = async (d: Devis) => {
        try {
            const response = await fetch(`/api/devis/${d.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) {
                toast.error("Erreur lors du chargement du devis");
                return;
            }
            const fullDevis = await response.json();
            await generateDevisPdf(fullDevis);
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "en attente": return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"><Clock className="h-3 w-3" /> En attente</span>;
            case "accepté": return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Accepté</span>;
            case "refusé": return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"><XCircle className="h-3 w-3" /> Refusé</span>;
            default: return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">{status}</span>;
        }
    };

    const [activeTab, setActiveTab] = useState<string>("list");

    useEffect(() => {
        if (editingDevis) setActiveTab("form");
    }, [editingDevis]);

    // Handle product passed from Products page
    useEffect(() => {
        const state = location.state as { selectedProduct?: Product; openCreateForm?: boolean };
        if (state?.openCreateForm) {
            setEditingDevis(null);
            setActiveTab("form");
            window.history.replaceState({}, document.title);
            return;
        }
        if (state?.selectedProduct) {
            cameFromProductSaleRef.current = true;
            const product = state.selectedProduct;
            const pu = getProductSaleUnitPrice(product);
            const newItem: DevisItem = {
                produit_id: product.id,
                designation: product.nom,
                prix_unitaire: pu,
                quantite: 1,
                tva: 20,
                reduction: 0,
                montant_ht: pu,
            };
            setItems([newItem]);
            calculateTotals([newItem]);
            setActiveTab("form");
            // Clear location state to prevent re-adding on refresh
            window.history.replaceState({}, document.title);
        }
    }, [location.state, products, navigate]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <FileText className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Devis
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gérez vos propositions commerciales</p>
                </div>
            </div>

            {/* Dash Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    { label: "Total Devis", val: stats.total, icon: FileText, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
                    { label: "Montant total (filtré)", val: `${reportData.totalTTC.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`, icon: DollarSign, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                    { label: "En Attente", val: stats.pending, icon: Clock, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" },
                    { label: "Acceptés", val: stats.accepted, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                    { label: "Refusés", val: stats.rejected, icon: XCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20" },
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

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger
                        value="list"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        Liste des Devis
                    </TabsTrigger>
                    <TabsTrigger
                        value="form"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        {editingDevis ? "Modifier Devis" : "Nouveau Devis"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-wrap justify-between items-center gap-4 backdrop-blur-sm">
                            <div className="relative w-full max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Numéro de devis ou client..."
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
                            <div className="bg-muted/30 p-4 rounded-[1.5rem] border border-border grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-6 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                                            <SelectItem value="en attente">En attente</SelectItem>
                                            <SelectItem value="accepté">Accepté</SelectItem>
                                            <SelectItem value="refusé">Refusé</SelectItem>
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

                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 border-b border-border">
                                    <TableHead className="w-12 py-4 px-6">
                                        <input 
                                            type="checkbox" 
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                            checked={paginatedDevis.length > 0 && selectedIds.length === paginatedDevis.length}
                                            onChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Numéro</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Client</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right">Montant</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right">Marge</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-center">Réduction</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-center">Date</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-center">Statut</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Utilisateur</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right px-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell colSpan={10} className="h-14 bg-muted/20" />
                                        </TableRow>
                                    ))
                                ) : filteredDevis.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="text-center py-20">
                                            <FileText className="h-12 w-12 text-muted mx-auto mb-3" />
                                            <p className="text-muted-foreground font-medium">Aucun devis trouvé</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedDevis.map((d) => (
                                        <TableRow key={d.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0 text-sm">
                                            <TableCell className="px-6 py-4">
                                                <input 
                                                    type="checkbox" 
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                                    checked={selectedIds.includes(d.id)}
                                                    onChange={() => toggleSelect(d.id)}
                                                />
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/dashboard/devis/${d.id}`)}
                                                            className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                                        >
                                                            {d.numero_devis}
                                                        </button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.open(`/dashboard/devis/${d.id}`, "_blank", "noopener");
                                                            }}
                                                            className="h-7 w-7 text-muted-foreground hover:text-indigo-600 hover:bg-muted/60"
                                                            title="Ouvrir dans un nouvel onglet"
                                                        >
                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                    <div className="flex gap-2 mt-1">
                                                        {(() => {
                                                            const linkedCmd = linkedCommandes.find(c => c.devis_id === d.id);
                                                            if (!linkedCmd) return null;
                                                            return (
                                                                <span
                                                                    className="text-[9px] text-blue-600 dark:text-blue-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() => navigate(`/dashboard/commandes/${linkedCmd.id}`)}
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Commande
                                                                </span>
                                                            );
                                                        })()}
                                                        {(() => {
                                                            // Chercher d'abord une facture directement liée au devis
                                                            const linkedFact = linkedFactures.find(f => f.devis_id === d.id);
                                                            if (linkedFact) {
                                                                return (
                                                                    <span
                                                                        className="text-[9px] text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                        onClick={() => navigate(`/dashboard/factures/${linkedFact.id}`)}
                                                                    >
                                                                        <CheckCircle2 className="h-2.5 w-2.5" /> Facture
                                                                    </span>
                                                                );
                                                            }

                                                            // Fallback: via commande liée possédant une facture_id
                                                            const viaCmd = linkedCommandes.find(c => c.devis_id === d.id) as any;
                                                            const factureId = viaCmd?.facture_id;
                                                            if (!factureId) return null;
                                                            return (
                                                                <span
                                                                    className="text-[9px] text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 font-bold uppercase tracking-titter bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() => navigate(`/dashboard/factures/${factureId}`)}
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Facture
                                                                </span>
                                                            );
                                                        })()}
                                                        {Number(d.bon_livraison_id) > 0 && (
                                                            <span
                                                                className="text-[9px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => navigate(`/dashboard/bons-livraison/${d.bon_livraison_id}`)}
                                                            >
                                                                <CheckCircle2 className="h-2.5 w-2.5" /> BL
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-semibold text-foreground">
                                                <div className="flex flex-col">
                                                    <span className="truncate">{d.client_nom || "—"}</span>
                                                    <span className="text-[11px] text-muted-foreground">
                                                        <span className="font-medium">PDV :</span> {d.point_de_vente_nom || "—"}
                                                    </span>
                                                    <span className="text-[11px] text-muted-foreground">
                                                        <span className="font-medium">Société :</span> {getSousSocieteLabel(d)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-bold text-right text-foreground">
                                                {(() => {
                                                    const formatted = getDevisFinalTTC(d).toLocaleString("fr-FR", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    });
                                                    return formatted;
                                                })()}{" "}
                                                DH
                                            </TableCell>
                                            <TableCell className="font-bold text-right text-sm text-emerald-800 dark:text-emerald-300 tabular-nums">
                                                {formatListeMargeHt(d.marge_ht)}
                                            </TableCell>
                                            <TableCell className="font-semibold text-center">
                                                {(() => {
                                                    const redSource = getDevisReductionPct(d);

                                                    return redSource > 0 ? (
                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-[11px] font-semibold text-red-600">
                                                            -{redSource.toFixed(1)}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground">Aucune</span>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell className="text-center text-muted-foreground">
                                                {new Date(d.date_devis).toLocaleDateString('fr-FR')}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {getStatusBadge(d.statuts_devis)}
                                            </TableCell>
                                            <TableCell>
                                                {d.user_nom ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <User className="h-3 w-3" />
                                                        <span className="font-medium text-foreground">{d.user_nom}</span>
                                                    </span>
                                                ) : <span className="text-muted-foreground text-xs">—</span>}
                                            </TableCell>
                                            <TableCell className="px-6 py-4 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56">
                                                        {(() => {
                                                            const linked = linkedCommandes.find(c => c.devis_id === d.id);
                                                            if (linked) {
                                                                return (
                                                                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${linked.id}`)}>
                                                                        <ArrowUpRight className="h-4 w-4" />
                                                                        Devis déjà converti
                                                                    </DropdownMenuItem>
                                                                );
                                                            }
                                                            const canConvert = d.statuts_devis === "accepté";
                                                            return (
                                                                <DropdownMenuItem
                                                                    className="cursor-pointer"
                                                                    disabled={!canConvert}
                                                                    onClick={() => {
                                                                        if (!canConvert) {
                                                                            toast.error("Ce devis doit d'abord être accepté par un administrateur.");
                                                                            return;
                                                                        }
                                                                        navigate("/dashboard/commandes", { state: { devisId: d.id } });
                                                                    }}
                                                                >
                                                                    <ArrowUpRight className="h-4 w-4" />
                                                                    Convertir en commande
                                                                </DropdownMenuItem>
                                                            );
                                                        })()}
                                                        <DropdownMenuItem
                                                            onClick={() => d.statuts_devis === "accepté" && handleGeneratePdf(d)}
                                                            className="cursor-pointer"
                                                            disabled={d.statuts_devis !== "accepté"}
                                                            title={d.statuts_devis !== "accepté" ? "Le téléchargement est réservé aux devis acceptés par l'admin." : undefined}
                                                        >
                                                            <Printer className="h-4 w-4" />
                                                            Télécharger / Imprimer
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => { setEditingDevis(d); setActiveTab("form"); }} className="cursor-pointer">
                                                            <EditSvgIcon className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => { setDevisToDelete(d); setDeleteDialogOpen(true); }} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                            <DeleteSvgIcon className="h-4 w-4" />
                                                            Supprimer
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                                {!isLoading && filteredDevis.length > 0 && (
                                    <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 border-t-2 border-indigo-100 dark:border-indigo-900/30">
                                        <TableCell colSpan={3} className="px-6 py-4 font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider text-xs">
                                            Total Complet (Filtré)
                                        </TableCell>
                                        <TableCell className="px-4 py-4 font-black text-indigo-700 dark:text-indigo-300 text-base">
                                            {filteredDevis
                                                .reduce((acc, d) => acc + getDevisFinalTTC(d), 0)
                                                .toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2
                                                })}{" "}
                                            DH
                                        </TableCell>
                                        <TableCell className="px-4 py-4 font-bold text-emerald-800 dark:text-emerald-300 text-sm tabular-nums text-right">
                                            {filteredDevis
                                                .reduce((acc, d) => acc + toNum(d.marge_ht), 0)
                                                .toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2
                                                })}{" "}
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
                                <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredDevis.length)}</span> sur
                                <span className="text-foreground font-bold"> {filteredDevis.length}</span>
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
                </TabsContent>

                <TabsContent value="form">
                    <Card className="border border-border shadow-2xl bg-card animate-in fade-in zoom-in-95 duration-300">
                        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-t-2xl"></div>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-xl flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400"><Plus className="h-5 w-5" /></div>
                                {editingDevis ? `Modification : ${editingDevis.numero_devis}` : "Création d'un nouveau Devis"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Date</Label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input type="date" name="date_devis" value={formData.date_devis} onChange={handleInputChange} className="h-11 pl-10 border-border focus:border-indigo-500" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Client</Label>
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
                                                className={cn(
                                                    "h-11 pl-10 border-border",
                                                    selectedClient && "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-900/10"
                                                )}
                                            />
                                            {selectedClient && (
                                                <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-indigo-500" />
                                            )}
                                        </div>
                                        {showClientDropdown && (
                                            <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                                {clients
                                                    .filter((c) =>
                                                        c.nom_complet.toLowerCase().includes(clientSearch.toLowerCase())
                                                    )
                                                    .map((c) => (
                                                        <div
                                                            key={c.id}
                                                            onMouseDown={() => {
                                                                setSelectedClient(c);
                                                                setClientSearch(c.nom_complet);
                                                                setShowClientDropdown(false);
                                                            }}
                                                            className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group"
                                                        >
                                                            {c.nom_complet}
                                                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-indigo-500" />
                                                        </div>
                                                    ))}
                                                {clientSearch.trim() &&
                                                    !clients.some(
                                                        (c) =>
                                                            c.nom_complet.toLowerCase().trim() ===
                                                            clientSearch.toLowerCase().trim()
                                                    ) && (
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
                                        {formErrors.client_id && <p className="text-red-500 text-[10px] uppercase font-bold">{formErrors.client_id}</p>}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Statut</Label>
                                        {isAdmin ? (
                                            <Select
                                                value={formData.statuts_devis}
                                                onValueChange={(v) => handleSelectChange("statuts_devis", v)}
                                            >
                                                <SelectTrigger className="h-11 border-border">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="en attente">En Attente</SelectItem>
                                                    <SelectItem value="accepté">Accepté</SelectItem>
                                                    <SelectItem value="refusé">Refusé</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <div className="h-11 flex items-center px-3 rounded-xl border border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                                                {formData.statuts_devis === "accepté"
                                                    ? "Accepté"
                                                    : formData.statuts_devis === "refusé"
                                                    ? "Refusé"
                                                    : "En attente"}
                                            </div>
                                        )}
                                    </div>

                                    {/* Réduction Globale supprimée */}
                                </div>

                                {/* Items Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Désignations & Articles</h3>
                                        <Button type="button" onClick={addItem} size="sm" className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400">
                                            <Plus className="h-4 w-4 mr-2" /> Ajouter une ligne
                                        </Button>
                                    </div>

                                    <div className="border border-border rounded-xl overflow-visible bg-card">
                                        <Table className="h-full" containerClassName="overflow-visible">
                                            <TableHeader>
                                                <TableRow className="bg-muted/30">
                                                    <TableHead className="w-[40%] text-[10px] font-bold uppercase py-4 pl-6">Désignation & Description</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Quantité</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Prix Unitaire</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Red. %</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">TVA %</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-right py-4 pr-6">Total</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {items.map((item, index) => (
                                                    <TableRow key={index} className="group transition-colors hover:bg-muted/20">
                                                        <TableCell className="py-2 pl-6 relative">
                                                            <div className="relative">
                                                                <Input
                                                                    placeholder="Chercher ou décrire l'article..."
                                                                    value={item.designation || ""}
                                                                    onChange={(e) => handleItemChange(index, 'designation', e.target.value)}
                                                                    onFocus={() => setActiveProductSearchIndex(index)}
                                                                    onBlur={() => setTimeout(() => setActiveProductSearchIndex(null), 200)}
                                                                    className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-10 text-sm w-full font-medium"
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
                                                                onChange={(e) => handleItemChange(index, 'quantite', parseFloat(e.target.value) || 0)}
                                                                className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-center"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                value={item.prix_unitaire}
                                                                onChange={(e) => handleItemChange(index, 'prix_unitaire', parseFloat(e.target.value) || 0)}
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
                                                        <TableCell className="py-2 text-right font-medium text-sm">
                                                            {item.montant_ht.toLocaleString('fr-FR')} DH
                                                        </TableCell>
                                                        <TableCell className="py-2 text-right">
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
                                    {formErrors.items && <p className="text-red-500 text-[10px] uppercase font-bold">{formErrors.items}</p>}
                                </div>

                                <div className="bg-muted/50 rounded-2xl p-6 border border-border flex flex-col md:flex-row gap-8 justify-between items-center bg-card/50">
                                    <div className="flex gap-10">
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Montant</p>
                                            <p className="text-xl font-bold text-foreground">{(Number(formData.montant_ht) || 0).toLocaleString('fr-FR')} DH</p>
                                        </div>
                                        {/* Global Reduction Removed from Summary */}
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">TVA</p>
                                            <p className="text-xl font-bold text-amber-600">{calculatedValues.montantTVA.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Réduction Valeur</p>
                                            <p className="text-xl font-bold text-red-600">{calculatedValues.totalReductionAmount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH</p>
                                        </div>
                                    </div>
                                    <div className="h-16 w-px bg-border hidden md:block"></div>
                                    <div className="text-center md:text-right">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total TTC</p>
                                        <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 drop-shadow-sm">{calculatedValues.montantTTC.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH</p>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <Button type="button" variant="ghost" onClick={() => { setEditingDevis(null); resetForm(); }} className="flex-1 h-12 text-muted-foreground">Annuler</Button>
                                    <Button disabled={isSubmitting} className="flex-[2] h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-100 dark:shadow-none">
                                        {isSubmitting ? "Traitement en cours..." : editingDevis ? "Modifier le Devis" : "Générer le Devis"}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Delete Devis Alert */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Supprimer le devis ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Voulez-vous vraiment supprimer <span className="font-bold text-foreground">{devisToDelete?.numero_devis}</span> ?
                            <br /><br />Cette action supprimera toutes les données liées à ce document.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">Supprimer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Supprimer la sélection ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Voulez-vous vraiment supprimer <span className="font-bold text-foreground">{selectedIds.length}</span> devis ?
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

            <Dialog open={showCommandeDialog} onOpenChange={setShowCommandeDialog}>
                <DialogContent className="sm:max-w-[430px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
                    <div className="h-1.5 bg-indigo-600" />
                    <DialogHeader className="px-6 pt-4 pb-2">
                        <DialogTitle className="flex items-center gap-3 text-base">
                            <div className="h-8 w-8 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <FileText className="h-4 w-4" />
                            </div>
                            <span className="text-indigo-700 dark:text-indigo-300">
                                Devis enregistré avec succès
                            </span>
                        </DialogTitle>
                        <DialogDescription className="px-1 pt-2 text-sm text-muted-foreground">
                            Voulez-vous immédiatement <span className="font-semibold text-indigo-600">générer une commande</span> à partir de ce devis&nbsp;?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-4">
                        {createdDevisId && (
                            <div className="mb-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 px-3 py-2 text-[11px] text-indigo-700 dark:text-indigo-200 flex items-center justify-between">
                                <span className="font-semibold uppercase tracking-widest">
                                    Devis #{createdDevisId}
                                </span>
                                <span className="text-[10px] text-indigo-500 dark:text-indigo-300">
                                    Étape suivante : commande client
                                </span>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <Button
                                variant="ghost"
                                className="flex-1 h-10 rounded-xl text-xs font-semibold"
                                onClick={() => {
                                    setShowCommandeDialog(false);
                                    resetForm();
                                    setEditingDevis(null);
                                    fetchDevis();
                                    setActiveTab("list");
                                    window.history.replaceState({}, document.title);
                                }}
                            >
                                Plus tard
                            </Button>
                            <Button
                                className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white"
                                onClick={() => {
                                    navigate("/dashboard/commandes", { state: { devisId: createdDevisId } });
                                }}
                            >
                                Générer la commande
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
                                    <DialogTitle className="text-xl font-black text-foreground tracking-tight">Rapport des Devis</DialogTitle>
                                    <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Analyse des devis filtrés</DialogDescription>
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
                                        <SelectItem value="en attente">En attente</SelectItem>
                                        <SelectItem value="accepté">Accepté</SelectItem>
                                        <SelectItem value="refusé">Refusé</SelectItem>
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
                                    <span className="text-xs font-bold text-muted-foreground">Volume total</span>
                                </div>
                                <span className="text-base font-black text-foreground">{reportData.count} <span className="text-[10px] text-muted-foreground uppercase font-black">Devis</span></span>
                            </div>

                            <div className="grid grid-cols-1 divide-y divide-border bg-muted/10">
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
                                        <span className="text-[10px] font-black text-emerald-600 uppercase">Acceptés</span>
                                        <span className="text-xs font-black">{reportData.statusCounts.accepte}</span>
                                    </div>
                                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${(reportData.statusCounts.accepte / reportData.count) * 100 || 0}%` }}></div>
                                    </div>
                                </div>
                                <div className="p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-red-600 uppercase">Refusés</span>
                                        <span className="text-xs font-black">{reportData.statusCounts.refuse}</span>
                                    </div>
                                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-red-500" style={{ width: `${(reportData.statusCounts.refuse / reportData.count) * 100 || 0}%` }}></div>
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
        </div >
    );
}

export default Devis;
