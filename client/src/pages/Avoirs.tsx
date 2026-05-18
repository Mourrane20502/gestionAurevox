import { useEffect, useMemo, useState } from "react";
import { factureHeaderTvaPercent, factureLineTvaPercent } from "@/lib/normalizeLineTva";
import { exportToExcel } from "@/utils/exportExcel";
import { useLocation, useNavigate } from "react-router-dom";
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
    RotateCcw,
    BarChart3,
    Filter,
    Calendar,
    FileSpreadsheet,
    FileText,
    Search,
    User,
    Printer,
    Edit,
    ChevronsLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
    CheckCircle2,
    ArrowUpRight,
    Plus,
    AlertCircle,
    Trash2,
    ShieldCheck,
    XCircle,
    Clock,
    LockOpen,
    MoreVertical,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { generateAvoirPdf } from "@/components/pdf/AvoirPdf";
import { matchesSousSocieteListFilter } from "@/utils/sousSocieteListFilter";
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

interface AvoirItem {
    id?: number;
    produit_id?: number;
    designation: string;
    quantite: number;
    prix_unitaire: number;
    tva: number;
    reduction?: number;
    montant_ht: number;
}

interface Facture {
    id: number;
    numero_facture: string;
    statut?: string;
    total_regle?: number;
    montant_ttc?: number;
    reste_a_payer?: number;
}

type SousSocieteOption = {
    id: number;
    nom_sous_societe: string;
};

function isFacturePaid(f: Facture): boolean {
    const montantTtc = Number(f.montant_ttc) || 0;
    const totalRegle = Number(f.total_regle) || 0;
    const paidByAmounts = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
    return f.statut === "paye" || f.statut === "payee" || paidByAmounts;
}

interface Avoir {
    id: number;
    numero_avoir: string;
    date_avoir: string;
    facture_id?: number | null;
    devis_id?: number | null;
    commande_id?: number | null;
    client_id: number;
    client_nom: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    statut: string;
    client_type?: string;
    facture_total?: number;
    numero_facture?: string;
    facture_mode_paiement?: string;
    banque_nom?: string;
    user_nom?: string;
    user_id?: number;
    point_de_vente_nom?: string;
    sous_societe_nom?: string | null;
}

export default function Avoirs() {
    const role = localStorage.getItem("role");
    const isAdmin = role === "admin";
    const navigate = useNavigate();

    const [avoirs, setAvoirs] = useState<Avoir[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [factures, setFactures] = useState<Facture[]>([]);
    const [allSousSocieteNames, setAllSousSocieteNames] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const location = useLocation();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<string>("list");
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);
    const [editingAvoir, setEditingAvoir] = useState<Avoir | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [factureModePaiement, setFactureModePaiement] = useState<string | null>(null);
    const [factureSearch, setFactureSearch] = useState("");
    const [showFactureDropdown, setShowFactureDropdown] = useState(false);

    const [formData, setFormData] = useState({
        numero_avoir: "",
        date_avoir: new Date().toISOString().split('T')[0],
        status: "en_attente",
        facture_id: "none"
    });

    const [items, setItems] = useState<AvoirItem[]>([
        { designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }
    ]);

    // Filter states
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterClientType, setFilterClientType] = useState<string>("all");
    const [filterSousSociete, setFilterSousSociete] = useState<string>("all");
    const [filterPointDeVente, setFilterPointDeVente] = useState<string>("all");
    const [showFilters, setShowFilters] = useState(false);
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [filterUser, setFilterUser] = useState<string>("all");
    const [filterClient, setFilterClient] = useState<string>("all");
    const [factureIdsWithAvoir, setFactureIdsWithAvoir] = useState<number[]>([]);
    const facturesReglees = useMemo(() => factures.filter((f) => isFacturePaid(f)), [factures]);

    const months = [
        { label: "Janvier", val: "01" }, { label: "Février", val: "02" }, { label: "Mars", val: "03" },
        { label: "Avril", val: "04" }, { label: "Mai", val: "05" }, { label: "Juin", val: "06" },
        { label: "Juillet", val: "07" }, { label: "Août", val: "08" }, { label: "Septembre", val: "09" },
        { label: "Octobre", val: "10" }, { label: "Novembre", val: "11" }, { label: "Décembre", val: "12" }
    ];
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
    const sousSocieteOptions = Array.from(
        new Set(
            [...allSousSocieteNames, ...avoirs
                .map((a) => String(a.sous_societe_nom || "").trim())
                .filter(Boolean)]
        )
    ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    const pointDeVenteOptions = Array.from(
        new Set(
            avoirs
                .map((a) => String(a.point_de_vente_nom || "").trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

    const token = localStorage.getItem("token");

    const fetchAvoirs = async () => {
        setIsLoading(true);
        try {
            // Simplified: for now just an empty array as backend might not be ready
            // but we add it to the page structure
            const response = await fetch("/api/avoirs", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setAvoirs(data);
                const ids: number[] = Array.from(
                    new Set(
                        (data as any[]).map((a: any) => a.facture_id).filter((id: any) => typeof id === "number")
                    )
                );
                setFactureIdsWithAvoir(ids);
            }
        } catch (error) {
            console.error("Error:", error);
            // toast.error("Erreur de chargement");
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

    const fetchFactures = async () => {
        try {
            const response = await fetch("/api/factures", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setFactures(await response.json());
        } catch (error) { console.error("Error fetching factures:", error); }
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

    useEffect(() => {
        fetchAvoirs();
        fetchClients();
        fetchProducts();
        fetchFactures();
        fetchUsers();
    }, []);

    useEffect(() => {
        const fetchSousSocietes = async () => {
            if (!token) return;
            try {
                const response = await fetch("/api/settings/sous-societes", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!response.ok) return;
                const data = await response.json();
                const names = (Array.isArray(data) ? data : [])
                    .map((s: SousSocieteOption) => String(s?.nom_sous_societe || "").trim())
                    .filter(Boolean);
                setAllSousSocieteNames(Array.from(new Set(names)));
            } catch {
                // fallback silencieux: on garde les sociétés présentes dans la liste des avoirs
            }
        };
        fetchSousSocietes();
    }, [token]);

    const handleFactureSelect = async (factureIdStr: string) => {
        if (!factureIdStr || factureIdStr === "none") {
            setFormData(prev => ({ ...prev, facture_id: "none" }));
            setFactureModePaiement(null);
            return;
        }
        const id = parseInt(factureIdStr);
        setFormData(prev => ({ ...prev, facture_id: factureIdStr }));

        try {
            const response = await fetch(`/api/factures/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();

                // Store mode_paiement from the facture
                setFactureModePaiement(data.mode_paiement || null);

                // Find client
                const client = clients.find(c => c.id === data.client_id);
                if (client) {
                    setSelectedClient(client);
                    setClientSearch(client.nom_complet);
                }

                const factureTvaRate = factureHeaderTvaPercent(data);

                // Calculer le reste à payer pour proposer un avoir du montant restant (TTC)
                const totalTTCFacture = Number(data.montant_ttc) || 0;
                const totalRegle = Number(data.total_regle) || 0;
                const resteAPayer = totalTTCFacture - totalRegle;

                // Si la facture est partiellement payée, on propose un avoir du reste à payer
                if (totalRegle > 0 && resteAPayer > 0) {
                    const htReste = resteAPayer / (1 + factureTvaRate / 100);
                    setItems([{
                        designation: `Avoir sur facture ${data.numero_facture} (solde restant)`,
                        quantite: 1,
                        prix_unitaire: htReste,
                        tva: factureTvaRate,
                        reduction: 0,
                        montant_ht: htReste,
                    }]);
                    toast.info(`Facture partiellement payée (${totalRegle.toLocaleString()} DH réglés). L'avoir est initialisé avec le solde restant : ${resteAPayer.toLocaleString()} DH TTC.`);
                } else if (data.items && data.items.length > 0) {
                    setItems(
                        data.items.map((it: { produit_id?: number; designation?: string; quantite?: number; prix_unitaire?: number; tva?: number; reduction?: number; montant_ht?: number }) => {
                            const red = Number(it.reduction) || 0;
                            const brut = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
                            const net =
                                Number(it.montant_ht) ||
                                brut * (1 - red / 100);
                            const tva = factureLineTvaPercent(it.tva, factureTvaRate);
                            return {
                                produit_id: it.produit_id,
                                designation: it.designation,
                                quantite: it.quantite,
                                prix_unitaire: it.prix_unitaire,
                                tva,
                                reduction: red,
                                montant_ht: net,
                            };
                        })
                    );
                }
            }
        } catch (error) {
            console.error("Error fetching facture details:", error);
            toast.error("Erreur de chargement des détails de la facture");
        }
    };

    useEffect(() => {
        const state = location.state as any;
        if (state?.factureId && factures.length > 0 && clients.length > 0) {
            const fid = Number(state.factureId);
            if (factureIdsWithAvoir.includes(fid)) {
                window.history.replaceState({}, document.title);
                return;
            }
            const selectedFacture = factures.find(f => f.id === fid);
            if (selectedFacture && !isFacturePaid(selectedFacture)) {
                toast.error("Seules les factures réglées peuvent faire l'objet d'un avoir.");
                window.history.replaceState({}, document.title);
                return;
            }
            handleFactureSelect(state.factureId.toString());
            if (selectedFacture) setFactureSearch(selectedFacture.numero_facture);
            setActiveTab("form");
            window.history.replaceState({}, document.title);
            return;
        }

        // Ouverture directe d'un avoir depuis AvoirDetails
        if (state?.avoirId) {
            fetchAvoirDetails(state.avoirId);
            setActiveTab("form");
            window.history.replaceState({}, document.title);
        }
    }, [location.state, factures, clients, factureIdsWithAvoir]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterMonth, filterYear, filterStatus, filterClientType, filterSousSociete, filterPointDeVente, filterUser, filterClient]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };



    const handleItemChange = (index: number, field: keyof AvoirItem, value: any) => {
        const newItems = [...items];
        const safeValue = typeof value === "number" && isNaN(value) ? 0 : value;
        newItems[index] = { ...newItems[index], [field]: safeValue };

        if (field === "designation") {
            newItems[index].produit_id = undefined;
        }

        if (field === "quantite" || field === "prix_unitaire" || field === "reduction") {
            const qte = Number(newItems[index].quantite) || 0;
            const pu = Number(newItems[index].prix_unitaire) || 0;
            const red = Number(newItems[index].reduction) || 0;
            newItems[index].montant_ht = qte * pu * (1 - red / 100);
        }
        setItems(newItems);
    };

    const handleProductSelect = (index: number, product: Product) => {
        const newItems = [...items];
        newItems[index] = {
            ...newItems[index],
            produit_id: product.id,
            designation: product.nom,
            prix_unitaire: product.prix,
            montant_ht: (newItems[index].quantite || 1) * product.prix
        };
        setItems(newItems);
        setActiveProductSearchIndex(null);
    };

    const addItem = () => {
        setItems([...items, { designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isAdmin && !selectedClient) {
            toast.error("Veuillez sélectionner un client");
            return;
        }
        const factureIdVal = formData.facture_id && formData.facture_id !== "none" ? Number(formData.facture_id) : null;
        if (factureIdVal != null && !editingAvoir) {
            const facture = factures.find(f => f.id === factureIdVal);
            if (facture && !isFacturePaid(facture)) {
                toast.error("Seules les factures réglées peuvent faire l'objet d'un avoir.");
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const data = {
                ...formData,
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

            const url = editingAvoir ? `/api/avoirs/${editingAvoir.id}` : "/api/avoirs";
            const method = editingAvoir ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                toast.success(editingAvoir ? "Avoir mis à jour !" : "Avoir créé !");
                // Notifier le sidebar pour rafraîchir le compteur d'approbations
                window.dispatchEvent(new CustomEvent("approvals-updated"));

                resetForm();
                setActiveTab("list");
                fetchAvoirs();
            } else {
                const errData = await response.json().catch(() => ({}));
                const msg = errData.message || "Erreur lors de l'enregistrement";
                const isDuplicateMsg = typeof msg === "string" && msg.includes("existe déjà");
                toast.error(isDuplicateMsg ? "Erreur lors de l'enregistrement" : msg);
            }
        } catch (error) {
            console.error("Error:", error);
            toast.error("Erreur serveur");
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchAvoirDetails = async (id: number) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/avoirs/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setEditingAvoir(data);
                setFormData({
                    numero_avoir: data.numero_avoir,
                    date_avoir: data.date_avoir.split('T')[0],
                    status: data.statut,
                    facture_id: data.facture_id ? data.facture_id.toString() : "none"
                });
                setItems((data.items || []).map((it: any) => ({
                    ...it,
                    reduction: it.reduction ?? 0
                })));
                // Restore mode_paiement if facture is linked
                if (data.facture_id) {
                    try {
                        const fRes = await fetch(`/api/factures/${data.facture_id}`, { headers: { Authorization: `Bearer ${token}` } });
                        if (fRes.ok) { const fData = await fRes.json(); setFactureModePaiement(fData.mode_paiement || null); }
                    } catch { /* ignore */ }
                } else {
                    setFactureModePaiement(null);
                }
                const client = clients.find(c => c.id === data.client_id);
                if (client) {
                    setSelectedClient(client);
                    setClientSearch(client.nom_complet);
                }
                // Set factureSearch for autocomplete
                if (data.facture_id) {
                    const linkedFacture = factures.find(f => f.id === data.facture_id);
                    if (linkedFacture) setFactureSearch(linkedFacture.numero_facture);
                } else {
                    setFactureSearch("");
                }
                setActiveTab("form");
            }
        } catch (error) {
            console.error("Error fetching avoir details:", error);
            toast.error("Erreur de chargement");
        } finally {
            setIsLoading(false);
        }
    };


    const resetForm = () => {
        setFormData({
            numero_avoir: "",
            date_avoir: new Date().toISOString().split('T')[0],
            status: "en_attente",
            facture_id: "none"
        });
        setItems([{ designation: "", quantite: 1, prix_unitaire: 0, tva: 0, reduction: 0, montant_ht: 0 }]);
        setSelectedClient(null);
        setClientSearch("");
        setEditingAvoir(null);
        setFactureModePaiement(null);
        setFactureSearch("");
    };

    const handleApproveAvoir = async (avoirId: number) => {
        try {
            const response = await fetch(`/api/avoirs/${avoirId}/approve`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Avoir validé avec succès");
                fetchAvoirs();
            } else {
                const data = await response.json();
                toast.error(data.message || "Erreur lors de la validation");
            }
        } catch (error) {
            console.error("Error approving avoir:", error);
            toast.error("Erreur lors de la validation");
        }
    };

    const handleRejectAvoir = async (avoirId: number) => {
        try {
            const response = await fetch(`/api/avoirs/${avoirId}/reject`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Avoir rejeté");
                fetchAvoirs();
            } else {
                const data = await response.json();
                toast.error(data.message || "Erreur lors du rejet");
            }
        } catch (error) {
            console.error("Error rejecting avoir:", error);
            toast.error("Erreur lors du rejet");
        }
    };

    const filteredAvoirs = avoirs.filter(a => {
        const matchesSearch = a.numero_avoir.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.client_nom?.toLowerCase().includes(searchTerm.toLowerCase());

        const avoirDate = new Date(a.date_avoir);
        const avoirMonth = (avoirDate.getMonth() + 1).toString().padStart(2, '0');
        const avoirYear = avoirDate.getFullYear().toString();

        const matchesMonth = filterMonth === "all" || avoirMonth === filterMonth;
        const matchesYear = filterYear === "all" || avoirYear === filterYear;
        const matchesStatus = filterStatus === "all" || a.statut === filterStatus;
        const matchesClientType = filterClientType === "all" || a.client_type === filterClientType;
        const matchesUser = filterUser === "all" || a.user_id?.toString() === filterUser;
        const matchesClient = filterClient === "all" || a.client_id?.toString() === filterClient;
        const matchesSousSociete = matchesSousSocieteListFilter(
            filterSousSociete,
            a.sous_societe_nom,
            a.numero_avoir
        );
        const matchesPointDeVente =
            filterPointDeVente === "all" ||
            String(a.point_de_vente_nom || "").trim() === filterPointDeVente;

        return matchesSearch && matchesMonth && matchesYear && matchesStatus && matchesClientType && matchesUser && matchesClient && matchesSousSociete && matchesPointDeVente;
    });

    const reportData = {
        count: filteredAvoirs.length,
        totalHT: filteredAvoirs.reduce((acc, a) => acc + (Number(a.montant_ht) || 0), 0),
        totalTTC: filteredAvoirs.reduce((acc, a) => acc + (Number(a.montant_ttc) || 0), 0),
        statusCounts: {
            en_attente: filteredAvoirs.filter(a => a.statut === 'en_attente').length,
            valide: filteredAvoirs.filter(a => a.statut === 'valide').length,
            rejete: filteredAvoirs.filter(a => a.statut === 'rejete').length,
            brouillon: filteredAvoirs.filter(a => a.statut === 'brouillon').length
        }
    };

    const exportToXLS = () => {
        if (filteredAvoirs.length === 0) {
            toast.error("Aucun avoir à exporter");
            return;
        }
        const headers = ["Numero Avoir", "Date", "Client", "Montant HT", "Montant", "Banque", "Statut"];
        const rows = filteredAvoirs.map(a => [
            a.numero_avoir || '',
            new Date(a.date_avoir).toLocaleDateString(),
            a.client_nom || '',
            Number(a.montant_ht) || 0,
            Number(a.montant_ttc) || 0,
            a.banque_nom || '—',
            a.statut || ''
        ]);

        exportToExcel({
            headers,
            rows,
            fileName: `avoirs_${filterMonth}_${filterYear}`,
            sheetName: "Avoirs"
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
            doc.text("Liste des Avoirs", 40, 24);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Exporté le : ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageWidth - 14, 18, { align: "right" });
            doc.text(`Total : ${filteredAvoirs.length} avoirs`, pageWidth - 14, 24, { align: "right" });

            const tableData = filteredAvoirs.map((a) => {
                const montantHT = Number(a.montant_ht) || 0;
                const montantTVA = Number(a.montant_tva) || 0;
                const montantTTC = Number(a.montant_ttc) || (montantHT + montantTVA);
                const formattedTTC = montantTTC.toFixed(2).replace(".", ",");

                return [
                    a.numero_avoir || "—",
                    a.client_nom || "—",
                    a.banque_nom || "—",
                    `${formattedTTC} DH`,
                    new Date(a.date_avoir).toLocaleDateString("fr-FR"),
                    a.statut || "—",
                    a.user_nom || "—"
                ];
            });

            autoTable(doc, {
                startY: 45,
                head: [["Numéro", "Client", "Banque", "Montant", "Date", "Statut", "Utilisateur"]],
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
                },
                margin: { left: 14, right: 14 },
            });

            // Footer
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Page ${i} / ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
            }

            doc.save(`avoirs_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            console.error("Erreur export PDF:", error);
            toast.error("Erreur lors de l'export PDF");
        }
    };

    const handlePrint = async (avoirId: number) => {
        try {
            const response = await fetch(`/api/avoirs/${avoirId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                generateAvoirPdf(data);
                toast.success("PDF généré !");
            }
        } catch (error) {
            toast.error("Erreur lors de la génération du PDF");
        }
    };



    const totalPages = Math.ceil(filteredAvoirs.length / itemsPerPage);
    const paginatedAvoirs = filteredAvoirs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const currentTotalHT = items.reduce((acc, it) => acc + (Number(it.montant_ht) || 0), 0);
    const currentTotalTVA = items.reduce((acc, it) => acc + ((Number(it.montant_ht) || 0) * (Number(it.tva) || 0) / 100), 0);
    const currentTotalTTC = currentTotalHT + currentTotalTVA;

    const totalTTC = avoirs.reduce((acc, a) => acc + (Number(a.montant_ttc) || 0), 0);
    const totalValide = avoirs.filter(a => a.statut === 'valide').reduce((acc, a) => acc + (Number(a.montant_ttc) || 0), 0);
    const countEnAttente = avoirs.filter(a => a.statut === 'en_attente').length;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <RotateCcw className="h-7 w-7 text-orange-600 dark:text-orange-400" />
                        Gestion des Avoirs
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Retours clients et remboursements</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-orange-600 dark:text-orange-400"><RotateCcw className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Avoirs</p>
                        <p className="text-xl font-bold text-foreground">- {totalTTC.toLocaleString()} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Validés (montant)</p>
                        <p className="text-xl font-bold text-foreground">- {totalValide.toLocaleString()} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400"><Clock className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">En attente</p>
                        <p className="text-xl font-bold text-foreground">{countEnAttente}</p>
                    </div>
                </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger
                        value="list"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                    >
                        Liste des Avoirs
                    </TabsTrigger>
                    <TabsTrigger
                        value="form"
                        className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold"
                        onClick={() => { if (!editingAvoir) resetForm(); }}
                    >
                        {editingAvoir ? "Modifier Avoir" : "Nouvel Avoir"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-wrap justify-between items-center gap-4 backdrop-blur-sm">
                            <div className="relative w-full max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Rechercher un avoir (N° ou client)..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-11 border-transparent bg-muted/50 focus:bg-card focus:border-orange-500 transition-all border rounded-xl"
                                />
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                    variant="outline"
                                    className={cn("h-11 px-4 rounded-xl gap-2", showFilters && "bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-900/20 dark:border-orange-800")}
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
                                    className="h-11 px-6 rounded-xl gap-2 bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-100 dark:shadow-none transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    onClick={() => setShowReportDialog(true)}
                                >
                                    <BarChart3 className="h-4 w-4" />
                                    Rapport
                                </Button>
                            </div>
                        </div>

                        {showFilters && (
                            <div className="bg-muted/30 p-4 rounded-[1.5rem] border border-border grid grid-cols-1 sm:grid-cols-5 lg:grid-cols-7 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Statut</Label>
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous les statuts" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les statuts</SelectItem>
                                            <SelectItem value="valide">Validé</SelectItem>
                                            <SelectItem value="en_attente">En attente</SelectItem>
                                            <SelectItem value="rejete">Rejeté</SelectItem>
                                            <SelectItem value="brouillon">Brouillon</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Type Client</Label>
                                    <Select value={filterClientType} onValueChange={setFilterClientType}>
                                        <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                                            <SelectValue placeholder="Tous les types" />
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
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
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
                                    <TableHead className="w-[140px] text-xs font-bold text-muted-foreground uppercase py-4 pl-6 whitespace-nowrap">N° Avoir</TableHead>
                                    <TableHead className="w-[220px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Client / Point de vente</TableHead>
                                    <TableHead className="w-[110px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Date</TableHead>
                                    <TableHead className="w-[130px] text-xs font-bold text-muted-foreground uppercase py-4 text-right whitespace-nowrap">Montant Avoir</TableHead>
                                    <TableHead className="w-[120px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Banque</TableHead>
                                    <TableHead className="w-[110px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Mode paiement</TableHead>
                                    <TableHead className="w-[120px] text-xs font-bold text-muted-foreground uppercase py-4 text-center whitespace-nowrap">Statut</TableHead>
                                    <TableHead className="w-[140px] text-xs font-bold text-muted-foreground uppercase py-4 whitespace-nowrap">Utilisateur</TableHead>
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
                                            <TableCell><div className="h-4 w-24 bg-muted rounded" /></TableCell>
                                            <TableCell className="pr-6"><div className="h-8 w-16 bg-muted rounded ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredAvoirs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-20 text-muted-foreground">
                                            Aucun avoir trouvé
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedAvoirs.map((avoir) => (
                                        <TableRow key={avoir.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0 text-sm">
                                            <TableCell className="py-4 pl-6">
                                                <div className="flex flex-col">
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/dashboard/avoirs/${avoir.id}`)}
                                                        className="text-left font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                                                    >
                                                        {avoir.numero_avoir}
                                                    </button>
                                                    {avoir.facture_id && (
                                                        <span
                                                            className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 w-fit cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => navigate(`/dashboard/factures/${avoir.facture_id}`)}
                                                        >
                                                            Facture
                                                        </span>
                                                    )}
                                                    {avoir.devis_id && (
                                                        <span
                                                            className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 w-fit cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => navigate(`/dashboard/devis/${avoir.devis_id}`)}
                                                        >
                                                            Devis associé
                                                        </span>
                                                    )}
                                                    {avoir.commande_id && (
                                                        <span
                                                            className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 w-fit cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => navigate(`/dashboard/commandes/${avoir.commande_id}`)}
                                                        >
                                                            Commande associée
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-4 w-4 text-muted-foreground" />
                                                        <span className="font-medium">{avoir.client_nom}</span>
                                                    </div>
                                                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                                                        {avoir.point_de_vente_nom || "Point de vente non défini"}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(avoir.date_avoir).toLocaleDateString()}
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-bold">
                                                -{" "}
                                                {(Number(avoir.montant_ttc) || 0).toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                DH
                                            </TableCell>
                                            <TableCell>
                                                {avoir.banque_nom ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tight bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm">
                                                        {avoir.banque_nom}
                                                    </span>
                                                ) : <span className="text-muted-foreground text-xs">—</span>}
                                            </TableCell>
                                            <TableCell>
                                                {avoir.facture_mode_paiement ? (
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${avoir.facture_mode_paiement === 'virement' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                                        avoir.facture_mode_paiement === 'cheque' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                                                            avoir.facture_mode_paiement === 'especes' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                                                                'bg-muted text-muted-foreground'
                                                        }`}>
                                                        {avoir.facture_mode_paiement === 'virement' ? 'Virement' :
                                                            avoir.facture_mode_paiement === 'cheque' ? 'Chèque' :
                                                                avoir.facture_mode_paiement === 'especes' ? 'Espèces' :
                                                                    avoir.facture_mode_paiement}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col items-start gap-1">
                                                    {avoir.statut === 'valide' && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                            <CheckCircle2 className="h-3 w-3" /> Validé
                                                        </span>
                                                    )}
                                                    {avoir.statut === 'en_attente' && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 animate-pulse">
                                                            <Clock className="h-3 w-3" /> Non Validé
                                                        </span>
                                                    )}
                                                    {avoir.statut === 'rejete' && (
                                                        <>
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                                                                <XCircle className="h-3 w-3" /> Rejeté
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 mt-0.5"
                                                                title="Rouvrir cet avoir et relancer la demande"
                                                                onClick={async () => {
                                                                    try {
                                                                        const res = await fetch(`/api/avoirs/${avoir.id}/reopen`, {
                                                                            method: "PUT",
                                                                            headers: {
                                                                                "Content-Type": "application/json",
                                                                                Authorization: `Bearer ${token}`,
                                                                            },
                                                                        });
                                                                        if (!res.ok) {
                                                                            const body = await res.json().catch(() => ({}));
                                                                            toast.error(body.message || "Erreur lors de la réouverture de l'avoir");
                                                                            return;
                                                                        }
                                                                        toast.success("Avoir rouvert et remis en attente de validation");
                                                                        fetchAvoirs();
                                                                        window.dispatchEvent(new CustomEvent("approvals-updated"));
                                                                    } catch (e) {
                                                                        console.error(e);
                                                                        toast.error("Erreur lors de la réouverture de l'avoir");
                                                                    }
                                                                }}
                                                            >
                                                                <LockOpen className="h-3 w-3" />
                                                                <span>Rouvrir</span>
                                                            </button>
                                                        </>
                                                    )}
                                                    {(!avoir.statut || (avoir.statut !== 'valide' && avoir.statut !== 'en_attente' && avoir.statut !== 'rejete')) && (
                                                        <span className="text-muted-foreground text-xs">{avoir.statut || '—'}</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {avoir.user_nom ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <User className="h-3 w-3" />
                                                        <span className="font-medium text-foreground">{avoir.user_nom}</span>
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
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (avoir.statut !== 'en_attente') handlePrint(avoir.id);
                                                                else toast.error("Cet avoir doit être validé avant téléchargement");
                                                            }}
                                                            disabled={avoir.statut === 'en_attente'}
                                                            className="cursor-pointer"
                                                        >
                                                            <Printer className="h-4 w-4" />
                                                            Imprimer
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => fetchAvoirDetails(avoir.id)} className="cursor-pointer">
                                                            <Edit className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        {(isAdmin || role === 'responsable') && avoir.statut === 'en_attente' && (
                                                            <>
                                                                <DropdownMenuItem onClick={() => handleApproveAvoir(avoir.id)} className="cursor-pointer">
                                                                    <ShieldCheck className="h-4 w-4" />
                                                                    Valider
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleRejectAvoir(avoir.id)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
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
                                {!isLoading && filteredAvoirs.length > 0 && (
                                    <TableRow className="bg-orange-50/30 dark:bg-orange-950/10 border-t-2 border-orange-100 dark:border-orange-900/30">
                                        <TableCell colSpan={3} className="px-6 py-4 font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wider text-xs">
                                            Total Complet (Filtré)
                                        </TableCell>
                                        <TableCell className="px-4 py-4 font-black text-orange-700 dark:text-orange-300 text-base">
                                            - {filteredAvoirs.reduce((acc, a) => acc + (Number(a.montant_ttc) || 0), 0).toLocaleString()} DH
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
                                <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredAvoirs.length)}</span> sur
                                <span className="text-foreground font-bold"> {filteredAvoirs.length}</span>
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
                        <div className="h-2 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 rounded-t-2xl"></div>
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-3">
                                <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-orange-600 dark:text-orange-400">
                                    <RotateCcw className="h-5 w-5" />
                                </div>
                                {editingAvoir ? `Modifier Avoir : ${editingAvoir.numero_avoir}` : "Nouvel Avoir"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Facture Associée</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={factureSearch}
                                                onChange={(e) => {
                                                    setFactureSearch(e.target.value);
                                                    setShowFactureDropdown(true);
                                                    if (!e.target.value) {
                                                        handleFactureSelect("none");
                                                    }
                                                }}
                                                onFocus={() => setShowFactureDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowFactureDropdown(false), 200)}
                                                placeholder="Rechercher une facture..."
                                                className={cn("h-11 pl-10 border-border", formData.facture_id !== "none" && "border-orange-500 bg-orange-50/10 dark:bg-orange-900/10")}
                                            />
                                            {formData.facture_id !== "none" && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-orange-500" />}
                                        </div>
                                        {showFactureDropdown && (
                                            <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                                <div
                                                    onMouseDown={() => {
                                                        handleFactureSelect("none");
                                                        setFactureSearch("");
                                                        setShowFactureDropdown(false);
                                                    }}
                                                    className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-muted-foreground border-b border-border"
                                                >
                                                    Aucune facture
                                                </div>
                                                {facturesReglees
                                                    .filter(f => {
                                                        if (factureIdsWithAvoir.includes(f.id)) return false;
                                                        if (!factureSearch.trim()) return true;
                                                        return f.numero_facture.toLowerCase().includes(factureSearch.toLowerCase());
                                                    })
                                                    .map(f => (
                                                        <div
                                                            key={f.id}
                                                            onMouseDown={() => {
                                                                handleFactureSelect(f.id.toString());
                                                                setFactureSearch(f.numero_facture);
                                                                setShowFactureDropdown(false);
                                                            }}
                                                            className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group"
                                                        >
                                                            <span className="font-bold">{f.numero_facture}</span>
                                                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-orange-500" />
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>

                                    {factureModePaiement && (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Mode de paiement (Facture)</Label>
                                            <div className={`h-11 flex items-center px-4 rounded-lg border font-bold text-sm gap-2 ${factureModePaiement === 'virement' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-400' :
                                                factureModePaiement === 'cheque' ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-900/40 text-purple-700 dark:text-purple-400' :
                                                    factureModePaiement === 'especes' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400' :
                                                        'bg-muted border-border text-foreground'
                                                }`}>
                                                <CheckCircle2 className="h-4 w-4 opacity-70" />
                                                {factureModePaiement === 'virement' ? 'Virement bancaire' :
                                                    factureModePaiement === 'cheque' ? 'Chèque' :
                                                        factureModePaiement === 'especes' ? 'Espèces' :
                                                            factureModePaiement}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Date Avoir</Label>
                                        <Input
                                            type="date"
                                            name="date_avoir"
                                            value={formData.date_avoir}
                                            onChange={handleInputChange}
                                            required
                                            className="h-11 border-border focus:border-indigo-500"
                                        />
                                    </div>

                                    {isAdmin && (
                                        <div className="space-y-1.5 relative">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Client</Label>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    value={clientSearch}
                                                    onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); if (!e.target.value) setSelectedClient(null); }}
                                                    onFocus={() => setShowClientDropdown(true)}
                                                    onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                                                    placeholder="Rechercher un client..."
                                                    className={cn("h-11 pl-10 border-border", selectedClient && "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-900/10")}
                                                />
                                                {selectedClient && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-indigo-500" />}
                                            </div>
                                            {showClientDropdown && clients.filter(c => c.nom_complet.toLowerCase().includes(clientSearch.toLowerCase())).length > 0 && (
                                                <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                                    {clients.filter(c => c.nom_complet.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                                                        <div key={c.id} onMouseDown={() => { setSelectedClient(c); setClientSearch(c.nom_complet); setShowClientDropdown(false); }} className="px-4 py-3 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between group">
                                                            {c.nom_complet}
                                                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-indigo-500 text-right" />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Articles de l'avoir</h3>
                                        <Button type="button" onClick={addItem} size="sm" className="bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-900/20 dark:text-orange-400">
                                            <Plus className="h-4 w-4 mr-2" /> Ajouter un article
                                        </Button>
                                    </div>

                                    <div className="border border-border rounded-xl overflow-visible bg-card">
                                        <Table containerClassName="overflow-visible">
                                            <TableHeader>
                                                <TableRow className="bg-muted/30">
                                                    <TableHead className="w-[45%] text-[10px] font-bold uppercase py-4 pl-6">Désignation & Article</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Quantité</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Prix Unit</TableHead>
                                                    <TableHead className="text-[10px] font-bold uppercase text-center py-4">Rem. %</TableHead>
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
                                                                className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-center"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                step={0.5}
                                                                value={item.reduction ?? 0}
                                                                onChange={(e) => handleItemChange(index, 'reduction', parseFloat(e.target.value) || 0)}
                                                                className="border-transparent bg-transparent focus:bg-card focus:border-indigo-400 h-9 text-sm text-center w-16"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Select
                                                                value={(() => {
                                                                    const n = Math.round(Number(item.tva) || 0);
                                                                    return [0, 7, 10, 20].includes(n) ? String(n) : "20";
                                                                })()}
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
                                                        <TableCell className="py-2 pr-6">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <span className="font-bold text-sm">{(item.montant_ht).toLocaleString()} DH</span>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => removeItem(index)}
                                                                    disabled={items.length <= 1}
                                                                    className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
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
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Montant HT de l'avoir</p>
                                            <p className="text-xl font-bold text-foreground">{currentTotalHT.toLocaleString()} DH</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">TVA</p>
                                            <p className="text-xl font-bold text-amber-600">{currentTotalTVA.toLocaleString()} DH</p>
                                        </div>
                                        {items.length === 0 && (
                                            <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold bg-amber-50 dark:bg-amber-900/20 px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-900/40">
                                                <AlertCircle className="h-4 w-4" />
                                                Aucun article — avoir à 0 DH
                                            </div>
                                        )}
                                    </div>
                                    <div className="h-16 w-px bg-border hidden md:block"></div>
                                    <div className="text-center md:text-right">
                                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Montant Crédité (TTC)</p>
                                        <p className="text-4xl font-black text-orange-600 dark:text-orange-400 drop-shadow-sm">-{currentTotalTTC.toLocaleString()} DH</p>
                                        {formData.facture_id !== "none" && (
                                            <p className="text-xs text-muted-foreground mt-1">Ce montant sera déduit de la facture associée</p>
                                        )}
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
                                        className="h-12 flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold shadow-lg shadow-orange-100 dark:shadow-none"
                                    >
                                        {isSubmitting ? "Enregistrement..." : editingAvoir ? "Modifier l'Avoir" : "Enregistrer l'Avoir"}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Rapport Modal */}
            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none shadow-2xl rounded-[2rem] animate-in zoom-in-95 duration-300">
                    <div className="h-1.5 bg-orange-600 text-white"></div>
                    <DialogHeader className="p-5 pb-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-orange-600 dark:text-orange-400 shadow-sm border border-orange-100 dark:border-orange-900/50">
                                    <BarChart3 className="h-5 w-5" />
                                </div>
                                <div>
                                    <DialogTitle className="text-xl font-black text-foreground tracking-tight">Rapport des Avoirs</DialogTitle>
                                    <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Synthèse des notes de crédit</DialogDescription>
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
                                        <SelectItem value="valide">Validé</SelectItem>
                                        <SelectItem value="brouillon">Brouillon</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <Card className="bg-muted/30 border-none shadow-none p-4 rounded-xl transition-all hover:bg-muted/50">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Total Crédité</p>
                                <p className="text-xl font-black text-foreground">{reportData.totalHT.toLocaleString()} <span className="text-[10px] text-muted-foreground font-bold font-mono">DH</span></p>
                            </Card>
                            <Card className="bg-orange-600/5 border-none shadow-none p-4 rounded-xl transition-all hover:bg-orange-600/10 border border-orange-100/50">
                                <p className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-1.5">Total TTC Crédité</p>
                                <p className="text-xl font-black text-orange-600 dark:text-orange-400">{reportData.totalTTC.toLocaleString()} <span className="text-[10px] opacity-60 font-bold font-mono">DH</span></p>
                            </Card>
                        </div>

                        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden divide-y divide-border">
                            <div className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400"><FileText className="h-4 w-4" /></div>
                                    <span className="text-xs font-bold text-muted-foreground">Volume total d'avoirs</span>
                                </div>
                                <span className="text-base font-black text-foreground">{reportData.count}</span>
                            </div>
                            <div className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400"><RotateCcw className="h-4 w-4" /></div>
                                    <span className="text-xs font-bold text-muted-foreground">Avoirs validés</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-base font-black text-orange-600">{reportData.statusCounts.valide}</span>
                                    <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-orange-500 rounded-full"
                                            style={{ width: `${reportData.count > 0 ? (reportData.statusCounts.valide / reportData.count) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3.5 bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/50 rounded-xl">
                            <Calendar className="h-5 w-5 text-orange-500" />
                            <p className="text-xs font-medium text-muted-foreground">
                                Ce rapport couvre la période sélectionnée : {months.find(m => m.val === filterMonth)?.label || "Toute l'année"} {filterYear}
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="p-5 pt-0">
                        <Button
                            className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold shadow-lg shadow-orange-100 dark:shadow-none transition-all hover:scale-[1.01] active:scale-[0.99]"
                            onClick={() => setShowReportDialog(false)}
                        >
                            Fermer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
