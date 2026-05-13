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
    ListOrdered,
    Loader2,
    Search,
    Calendar,
    CheckCircle2,
    Clock,
    XCircle,
    DollarSign,
    Weight,
    FileText,
    MoreVertical,
    ArrowUpRight,
    Download,
    User,
    RotateCcw,
} from "lucide-react";
import { generateCommandeGrosPdfFromApiRow } from "@/components/pdf/GrosDocumentPdf";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { matchesSousSocieteListFilter } from "@/utils/sousSocieteListFilter";

interface Client {
    id: number;
    nom_complet: string;
}

interface Pdv {
    id: number;
    nom: string;
}

interface Banque {
    id: number;
    nom_banque?: string;
    nom_compte?: string;
}

interface Product {
    id: number;
    nom: string;
    reference?: string | null;
    prix?: number;
    grammage?: number;
    nature_produit?: string;
    Nature_Produit?: string;
}

interface DevisGrosOpt {
    id: number;
    numero_devis: string;
}

interface CommandeGrosItemForm {
    produit_id?: number;
    designation: string;
    grammage: string;
    prix_unitaire: string;
    reduction: string;
    taux_tva: string;
}

interface CommandeGrosRow {
    id: number;
    numero_commande: string;
    date_commande: string;
    grammage: number;
    statut: string;
    client_id: number;
    client_nom?: string;
    point_de_vente_nom?: string;
    montant_ttc?: number | string | null;
    montant_ht?: number | string | null;
    montant_tva?: number | string | null;
    reduction?: number | string | null;
    user_nom?: string | null;
    user_id?: number;
    total_regle?: number | string | null;
    reste_a_payer?: number | string | null;
    devis_gros_numero?: string;
    devis_gros_id?: number | null;
    has_facture_gros_link?: number | boolean;
    linked_facture_gros_id?: number | null;
    sous_societe_nom?: string | null;
}

function commandeGrosRowMontantTtc(row: CommandeGrosRow): number {
    const ttc = row.montant_ttc;
    if (ttc != null && ttc !== "" && !Number.isNaN(Number(ttc))) {
        return Number(ttc);
    }
    return (Number(row.montant_ht) || 0) + (Number(row.montant_tva) || 0);
}

const getSousSocieteLabel = (doc: { sous_societe_nom?: string | null }) => {
    const fromName = String(doc.sous_societe_nom || "").trim();
    return fromName || "—";
};

function isProductNatureGros(p: Product): boolean {
    const n = p.nature_produit ?? p.Nature_Produit;
    const s = n == null ? "" : String(n).trim().toLowerCase();
    return s === "gros" || s === "gro";
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

function roundTo(value: number, decimals = 2): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Aligne refusée / validée avec les valeurs du filtre */
function normCommandeGrosStatut(s: string): string {
    const v = String(s || "").toLowerCase();
    if (v === "validée") return "validee";
    if (v === "refusée") return "refusee";
    return v;
}

function isCommandeGrosReglee(
    row: CommandeGrosRow,
    factureGrosStatusMap: Record<number, string>,
    factureGrosResteMap: Record<number, number>
): boolean {
    const totalRegle = Number((row as any).total_regle) || 0;
    const mtTtc = commandeGrosRowMontantTtc(row);
    const linkedFactureId =
        row.linked_facture_gros_id != null
            ? Number(row.linked_facture_gros_id)
            : NaN;
    const linkedFactureReste =
        Number.isFinite(linkedFactureId)
            ? Number(factureGrosResteMap[linkedFactureId])
            : NaN;
    const linkedFactureStatus =
        row.linked_facture_gros_id != null
            ? String(factureGrosStatusMap[Number(row.linked_facture_gros_id)] || "").toLowerCase()
            : "";
    const hasLinkedFacture = Number.isFinite(linkedFactureId) && linkedFactureId > 0;
    const factureIsPaid =
        linkedFactureStatus === "paye" ||
        linkedFactureStatus === "payee" ||
        linkedFactureStatus === "reglee";
    const hasLinkedFactureReste = Number.isFinite(linkedFactureReste);
    const isRegleByAmounts = mtTtc > 0 && totalRegle >= mtTtc - 0.01;
    return hasLinkedFacture
        ? (factureIsPaid || (hasLinkedFactureReste && Math.max(linkedFactureReste, 0) <= 0.01))
        : isRegleByAmounts;
}

export default function CommandeGros() {
    const location = useLocation();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [showFactureGrosDialog, setShowFactureGrosDialog] = useState(false);
    const [createdCommandeGrosId, setCreatedCommandeGrosId] = useState<number | null>(null);
    const [commandeToDelete, setCommandeToDelete] = useState<number | null>(null);

    const [list, setList] = useState<CommandeGrosRow[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [pdvs, setPdvs] = useState<Pdv[]>([]);
    const [devisGrosOpts, setDevisGrosOpts] = useState<DevisGrosOpt[]>([]);
    const [banques, setBanques] = useState<Banque[]>([]);
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
    const [allSousSocieteNames, setAllSousSocieteNames] = useState<string[]>([]);
    const [users, setUsers] = useState<{ id: number; username?: string; nom?: string; prenom?: string }[]>([]);
    const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
    const [factureGrosStatusMap, setFactureGrosStatusMap] = useState<Record<number, string>>({});
    const [factureGrosResteMap, setFactureGrosResteMap] = useState<Record<number, number>>({});
    const [reglementsGros, setReglementsGros] = useState<any[]>([]);

    const [dateCommande, setDateCommande] = useState(() => new Date().toISOString().split("T")[0]);
    const [clientId, setClientId] = useState<string>("");
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [showQuickAddClientDialog, setShowQuickAddClientDialog] = useState(false);
    const [pendingClientName, setPendingClientName] = useState("");
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [pdvId, setPdvId] = useState<string>("");
    const [devisGrosId, setDevisGrosId] = useState<string>("");
    const [banqueId, setBanqueId] = useState<string>("");
    const [modePaiement, setModePaiement] = useState<string>("virement");
    const [paymentModes, setPaymentModes] = useState<{ value: string; label: string }[]>([]);
    const [statut, setStatut] = useState<string>("en_attente");
    const [items, setItems] = useState<CommandeGrosItemForm[]>([{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]);
    const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);

    const productsGros = products.filter(isProductNatureGros);

    const filterYears = useMemo(
        () => Array.from({ length: 8 }, (_, i) => (new Date().getFullYear() - i).toString()),
        []
    );

    const filteredList = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return list.filter((row) => {
            const matchesSearch =
                !q ||
                row.numero_commande?.toLowerCase().includes(q) ||
                (row.client_nom || "").toLowerCase().includes(q) ||
                (row.user_nom || "").toLowerCase().includes(q) ||
                (row.devis_gros_numero || "").toLowerCase().includes(q) ||
                (row.point_de_vente_nom || "").toLowerCase().includes(q) ||
                (row.sous_societe_nom || "").toLowerCase().includes(q);

            const date = parseListDate(String(row.date_commande ?? ""));
            const matchesMonth =
                filterMonth === "all" || (date != null && (date.getMonth() + 1).toString() === filterMonth);
            const matchesYear =
                filterYear === "all" || (date != null && date.getFullYear().toString() === filterYear);
            const matchesStatus =
                filterStatus === "all" ||
                (filterStatus === "regle"
                    ? isCommandeGrosReglee(row, factureGrosStatusMap, factureGrosResteMap)
                    : filterStatus === "non_regle"
                        ? !isCommandeGrosReglee(row, factureGrosStatusMap, factureGrosResteMap)
                        : normCommandeGrosStatut(row.statut) === filterStatus);
            const matchesClient =
                filterClient === "all" || String(row.client_id ?? "") === filterClient;
            const matchesUser =
                filterUser === "all" ||
                (row.user_id != null && String(row.user_id) === filterUser);
            const matchesSousSociete = matchesSousSocieteListFilter(
                filterSousSociete,
                row.sous_societe_nom,
                row.numero_commande
            );

            return (
                matchesSearch &&
                matchesMonth &&
                matchesYear &&
                matchesStatus &&
                matchesClient &&
                matchesUser &&
                matchesSousSociete
            );
        });
    }, [
        list,
        searchTerm,
        filterMonth,
        filterYear,
        filterStatus,
        filterClient,
        filterUser,
        filterSousSociete,
        factureGrosStatusMap,
        factureGrosResteMap,
    ]);

    const resetListFilters = () => {
        setSearchTerm("");
        setFilterMonth("all");
        setFilterYear("all");
        setFilterStatus("all");
        setFilterClient("all");
        setFilterUser("all");
        setFilterSousSociete("all");
    };

    const sousSocieteOptions = useMemo(
        () =>
            Array.from(
                new Set([
                    ...allSousSocieteNames,
                    ...list.map((r) => String(r.sous_societe_nom || "").trim()).filter(Boolean),
                ])
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [allSousSocieteNames, list]
    );
    const devisGrosDisponibles = useMemo(() => {
        const linkedDevisIds = new Set(
            list
                .map((c) => Number(c.devis_gros_id))
                .filter((id) => Number.isFinite(id) && id > 0)
        );
        return devisGrosOpts.filter(
            (d) => !linkedDevisIds.has(d.id) || String(d.id) === String(devisGrosId || "")
        );
    }, [list, devisGrosOpts, devisGrosId]);

    const grammageFiltre = useMemo(
        () => filteredList.reduce((acc, r) => acc + (Number(r.grammage) || 0), 0),
        [filteredList]
    );

    const stats = useMemo(
        () => ({
            total: list.length,
            pending: list.filter((d) => d.statut === "en_attente").length,
            validee: list.filter((d) => d.statut === "validee").length,
            refusee: list.filter((d) => d.statut === "refusee" || d.statut === "refusée").length,
        }),
        [list]
    );

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [rCmd, rClients, rPdv, rDevis, rBanq, rProducts, rPm, rUsers, rFacturesGros, rReglementsGros] = await Promise.all([
                fetch("/api/commandes-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/clients", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/pdv", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/devis-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/banque", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/settings/payment-modes", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/users/all-users", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/factures-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/reglements-clients-gros", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (rCmd.ok) setList(await rCmd.json());
            if (rClients.ok) setClients(await rClients.json());
            if (rPdv.ok) setPdvs(await rPdv.json());
            if (rDevis.ok) {
                const dg = await rDevis.json();
                setDevisGrosOpts(
                    Array.isArray(dg)
                        ? dg.map((d: { id: number; numero_devis: string }) => ({
                              id: d.id,
                              numero_devis: d.numero_devis,
                          }))
                        : []
                );
            }
            if (rBanq.ok) setBanques(await rBanq.json());
            if (rProducts.ok) setProducts(await rProducts.json());
            if (rPm.ok) {
                const pm = await rPm.json();
                setPaymentModes(Array.isArray(pm) ? pm : []);
            }
            if (rUsers.ok) {
                const data = await rUsers.json();
                setUsers(Array.isArray(data?.users) ? data.users : []);
            }
            if (rReglementsGros.ok) {
                const data = await rReglementsGros.json();
                setReglementsGros(Array.isArray(data) ? data : []);
            } else {
                setReglementsGros([]);
            }
            if (rFacturesGros.ok) {
                const data = await rFacturesGros.json();
                const map: Record<number, string> = {};
                const resteMap: Record<number, number> = {};
                if (Array.isArray(data)) {
                    data.forEach((f: any) => {
                        const id = Number(f?.id);
                        if (Number.isFinite(id) && id > 0) {
                            map[id] = String(f?.statut || "").toLowerCase();
                            const reste = Number(f?.reste_a_payer);
                            if (Number.isFinite(reste)) {
                                resteMap[id] = Math.max(reste, 0);
                            }
                        }
                    });
                }
                setFactureGrosStatusMap(map);
                setFactureGrosResteMap(resteMap);
            } else {
                setFactureGrosStatusMap({});
                setFactureGrosResteMap({});
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
                /* noms issus de la liste en secours */
            }
        };
        fetchSousSocietes();
    }, [token]);

    useEffect(() => {
        const state = location.state as { devisGrosId?: number; editCommandeGrosId?: number } | null;
        const editId = state?.editCommandeGrosId;
        if (editId != null && Number.isFinite(Number(editId))) {
            if (loading) return;
            loadForEdit(Number(editId));
            setTab("form");
            window.history.replaceState({}, document.title);
            return;
        }
        const dgId = state?.devisGrosId;
        if (dgId == null || !Number.isFinite(Number(dgId))) return;
        if (loading) return;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/devis-gros/${dgId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok || cancelled) {
                    if (!cancelled) toast.error("Impossible de charger le devis gros");
                    return;
                }
                const d = await res.json();
                setEditingId(null);
                setDateCommande(new Date().toISOString().split("T")[0]);
                setClientId(String(d.client_id || ""));
                setClientSearch(
                    String(d.client_nom || clients.find((c) => String(c.id) === String(d.client_id))?.nom_complet || "")
                );
                setDevisGrosId(String(dgId));
                const raw = Array.isArray(d.items) ? d.items : [];
                setItems(
                    raw.length
                        ? raw.map((it: any) => mapImportedGrosLine(it))
                        : [{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]
                );
                setTab("form");
                window.history.replaceState({}, document.title);
            } catch {
                if (!cancelled) toast.error("Erreur réseau");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [location.state, location.key, token, loading]);

    const resetForm = () => {
        setEditingId(null);
        setDateCommande(new Date().toISOString().split("T")[0]);
        setClientId("");
        setClientSearch("");
        setShowClientDropdown(false);
        setPdvId(pdvs[0]?.id ? String(pdvs[0].id) : "");
        setDevisGrosId("");
        setBanqueId("");
        setModePaiement("virement");
        setStatut("en_attente");
        setItems([{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]);
    };

    useEffect(() => {
        if (pdvs.length && !pdvId) setPdvId(String(pdvs[0].id));
    }, [pdvs]);

    useEffect(() => {
        if (!devisGrosId || editingId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/devis-gros/${devisGrosId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok || cancelled) return;
                const d = await res.json();
                setClientId(String(d.client_id || ""));
                setClientSearch(
                    String(d.client_nom || clients.find((c) => String(c.id) === String(d.client_id))?.nom_complet || "")
                );
                const raw = Array.isArray(d.items) ? d.items : [];
                setItems(
                    raw.length
                        ? raw.map((it: any) => mapImportedGrosLine(it))
                        : [{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]
                );
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [devisGrosId, editingId, token]);

    const addLine = () => setItems((prev) => [...prev, { designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]);
    const removeLine = (index: number) =>
        setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

    const updateLine = (index: number, field: keyof CommandeGrosItemForm, value: string | number | undefined) => {
        setItems((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value as never };
            return next;
        });
    };

    const mapImportedGrosLine = (it: any): CommandeGrosItemForm => {
        const grammageRaw = it?.grammage != null ? String(it.grammage) : "";
        const grammageNum = parseFloat(grammageRaw.replace(",", ".")) || 0;
        const netCandidate =
            Number(it?.montant_ttc) ||
            ((Number(it?.montant_ht) || 0) + (Number(it?.montant_tva) || 0)) ||
            Number(it?.prix_net) ||
            Number(it?.prix_total) ||
            0;
        const prixUnitaireRaw =
            it?.prix_unitaire != null
                ? String(it.prix_unitaire)
                : "";
        const prixUnitaire =
            grammageNum > 0 && netCandidate > 0
                ? String(roundTo(netCandidate / grammageNum, 8))
                : prixUnitaireRaw;

        return {
            produit_id: it?.produit_id,
            designation: it?.designation || "",
            grammage: grammageRaw,
            prix_unitaire: prixUnitaire,
            reduction: it?.reduction != null ? String(it.reduction) : "0",
            taux_tva: it?.taux_tva != null ? String(it.taux_tva) : "0",
        };
    };

    const handlePrixNetChange = (index: number, rawValue: string) => {
        const net = parseFloat(String(rawValue).replace(",", ".")) || 0;
        const g = parseFloat(String(items[index]?.grammage || "0").replace(",", ".")) || 0;
        const prixUnitaire = g > 0 ? roundTo(net / g, 8) : roundTo(net, 8);
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
            const res = await fetch(`/api/commandes-gros/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error("Impossible de charger la commande");
                return;
            }
            const d = await res.json();
            setEditingId(id);
            setDateCommande(String(d.date_commande || "").split("T")[0]);
            setClientId(String(d.client_id || ""));
            setClientSearch(
                String(d.client_nom || clients.find((c) => String(c.id) === String(d.client_id))?.nom_complet || "")
            );
            setPdvId(String(d.point_de_vente_id || ""));
            setDevisGrosId(d.devis_gros_id ? String(d.devis_gros_id) : "");
            setBanqueId(d.banque_id ? String(d.banque_id) : "");
            setModePaiement(d.mode_paiement || "virement");
            setStatut(d.statut || "en_attente");
            const raw = Array.isArray(d.items) ? d.items : [];
            setItems(
                raw.length
                    ? raw.map((it: any) => mapImportedGrosLine(it))
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
        const effectivePdvId = pdvId || (pdvs[0]?.id ? String(pdvs[0].id) : "");
        if (!effectivePdvId) {
            toast.error("Aucun point de vente configuré");
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

        const body: Record<string, unknown> = {
            date_commande: dateCommande,
            client_id: Number(clientId),
            point_de_vente_id: Number(effectivePdvId),
            items: payloadItems,
            devis_gros_id: devisGrosId ? Number(devisGrosId) : null,
            banque_id: banqueId ? Number(banqueId) : null,
            mode_paiement: modePaiement || "virement",
        };
        if (editingId) body.statut = statut;

        setSaving(true);
        try {
            const url = editingId ? `/api/commandes-gros/${editingId}` : "/api/commandes-gros";
            const method = editingId ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const result = await res.json().catch(() => ({}));
                toast.success(editingId ? "Commande gros enregistrée" : "Commande gros créée");
                window.dispatchEvent(new CustomEvent("approvals-updated"));
                if (!editingId && result?.id != null && Number.isFinite(Number(result.id))) {
                    setCreatedCommandeGrosId(Number(result.id));
                    setShowFactureGrosDialog(true);
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

    const handleDelete = async (id: number) => {
        try {
            const res = await fetch(`/api/commandes-gros/${id}`, {
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
            const res = await fetch(`/api/commandes-gros/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error("Impossible de charger le document");
                return;
            }
            const data = await res.json();
            await generateCommandeGrosPdfFromApiRow(data as Record<string, unknown>);
            toast.success("PDF téléchargé");
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        } finally {
            setPdfLoadingId(null);
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

    const statusBadge = (s: string) => {
        const v = String(s || "").toLowerCase();
        if (v === "en_attente")
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    <Clock className="h-3 w-3" /> En attente
                </span>
            );
        if (v === "validee" || v === "validée")
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Validée
                </span>
            );
        if (v === "refusee" || v === "refusée")
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Refusée
                </span>
            );
        return (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">{s}</span>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ListOrdered className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Commandes gros
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Commandes au grammage (sans montants), comme les commandes classiques.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    { label: "Total", val: stats.total, icon: FileText, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
                    { label: "Grammage total (filtré)", val: `${grammageFiltre.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} g`, icon: Weight, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                    { label: "En attente", val: stats.pending, icon: Clock, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" },
                    { label: "Validées", val: stats.validee, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                    { label: "Refusées", val: stats.refusee, icon: XCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20" },
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

            <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "form")} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger value="list" className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold">
                        Liste des commandes gros
                    </TabsTrigger>
                    <TabsTrigger value="form" className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold">
                        {editingId ? "Modifier la commande gros" : "Nouvelle commande gros"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="bg-card p-4 rounded-2xl border border-border shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
                            <div className="relative w-full max-w-md flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="N°, client, devis gros, PDV, utilisateur…"
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
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
                                        <SelectItem value="en_attente">En attente</SelectItem>
                                        <SelectItem value="validee">Validée</SelectItem>
                                        <SelectItem value="refusee">Refusée</SelectItem>
                                            <SelectItem value="regle">Réglé</SelectItem>
                                            <SelectItem value="non_regle">Non réglé</SelectItem>
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
                                        <TableHead className="py-4 px-6 text-center whitespace-nowrap">Statut règlement</TableHead>
                                        <TableHead className="py-4 px-6">Statut</TableHead>
                                        <TableHead className="py-4 px-6 whitespace-nowrap">Utilisateur</TableHead>
                                        <TableHead className="text-right py-4 px-6" aria-label="Actions" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredList.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                                                {list.length === 0 ? "Aucune commande gros" : "Aucun résultat"}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredList.map((row) => (
                                            <TableRow key={row.id} className="group border-b border-border hover:bg-muted/30 transition-colors">
                                                <TableCell className="px-6">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => navigate(`/dashboard/commandes-gros/${row.id}`)}
                                                                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                                            >
                                                                {row.numero_commande}
                                                            </button>
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/dashboard/commandes-gros/${row.id}`);
                                                                }}
                                                                className="h-7 w-7 text-muted-foreground hover:text-indigo-600 hover:bg-muted/60"
                                                                title="Ouvrir"
                                                            >
                                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                        <div className="flex gap-2 mt-1">
                                                            {row.devis_gros_id ? (
                                                                <span
                                                                    className="text-[9px] text-blue-600 dark:text-blue-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() =>
                                                                        navigate(`/dashboard/devis-gros/${row.devis_gros_id}`)
                                                                    }
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Devis
                                                                </span>
                                                            ) : null}
                                                            {Boolean(row.has_facture_gros_link) && row.linked_facture_gros_id ? (
                                                                <span
                                                                    className="text-[9px] text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() =>
                                                                        navigate(`/dashboard/factures-gros/${row.linked_facture_gros_id}`)
                                                                    }
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Facture
                                                                </span>
                                                            ) : null}
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
                                                    {commandeGrosRowMontantTtc(row).toLocaleString("fr-FR", {
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
                                                    {new Date(row.date_commande).toLocaleDateString("fr-FR")}
                                                </TableCell>
                                                <TableCell className="px-6 text-right font-medium">
                                                    {Number(row.grammage).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="px-6 text-center">
                                                    {(() => {
                                                        const totalRegle = Number((row as any).total_regle) || 0;
                                                        const mtTtc = commandeGrosRowMontantTtc(row);
                                                        const resteCalc =
                                                            typeof (row as any).reste_a_payer !== "undefined"
                                                                ? Number((row as any).reste_a_payer)
                                                                : Math.max(mtTtc - totalRegle, 0);
                                                        const linkedFactureId =
                                                            row.linked_facture_gros_id != null
                                                                ? Number(row.linked_facture_gros_id)
                                                                : NaN;
                                                        const linkedFactureReste =
                                                            Number.isFinite(linkedFactureId)
                                                                ? Number(factureGrosResteMap[linkedFactureId])
                                                                : NaN;
                                                        const linkedFactureStatus =
                                                            row.linked_facture_gros_id != null
                                                                ? String(factureGrosStatusMap[Number(row.linked_facture_gros_id)] || "").toLowerCase()
                                                                : "";
                                                        const hasLinkedFacture = Number.isFinite(linkedFactureId) && linkedFactureId > 0;
                                                        const factureIsPaid =
                                                            linkedFactureStatus === "paye" ||
                                                            linkedFactureStatus === "payee" ||
                                                            linkedFactureStatus === "reglee";
                                                        const baseReste = Number.isFinite(linkedFactureReste)
                                                            ? linkedFactureReste
                                                            : resteCalc;
                                                        const hasLinkedFactureReste = Number.isFinite(linkedFactureReste);
                                                        const isRegleByAmounts = mtTtc > 0 && totalRegle >= mtTtc - 0.01;
                                                        const latestReglement = reglementsGros
                                                            .filter((r: any) => {
                                                                const byCommande = Number(r?.commande_gros_id) === Number(row.id);
                                                                const byFacture =
                                                                    row.linked_facture_gros_id != null &&
                                                                    Number(r?.facture_gros_id) === Number(row.linked_facture_gros_id);
                                                                return byCommande || byFacture;
                                                            })
                                                            .sort((a: any, b: any) => {
                                                                const da = new Date(a?.date_reglement || 0).getTime();
                                                                const db = new Date(b?.date_reglement || 0).getTime();
                                                                if (db !== da) return db - da;
                                                                return Number(b?.id || 0) - Number(a?.id || 0);
                                                            })[0];
                                                        const latestReglementStatut = String(latestReglement?.statut || "").toLowerCase();
                                                        // Statut règlement doit dépendre du règlement/facture, jamais du statut de validation de commande.
                                                        const isRegle = hasLinkedFacture
                                                            ? (factureIsPaid || (hasLinkedFactureReste && Math.max(linkedFactureReste, 0) <= 0.01))
                                                            : isRegleByAmounts;
                                                        const reste = isRegle ? 0 : Math.max(baseReste, 0);

                                                        return latestReglementStatut === "approuve" || isRegle ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                                <CheckCircle2 className="h-3 w-3" /> Réglé
                                                            </span>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-1">
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                                                                    <DollarSign className="h-3 w-3" /> Non réglé
                                                                </span>
                                                                <span className="text-[11px] font-semibold text-muted-foreground">
                                                                    Reste : {Number(Math.max(reste, 0)).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell className="px-6">{statusBadge(row.statut)}</TableCell>
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
                                                            {(() => {
                                                                const linkedFactureId = Number(row.linked_facture_gros_id);
                                                                const hasLinkedFacture =
                                                                    Number.isFinite(linkedFactureId) &&
                                                                    linkedFactureId > 0;

                                                                if (hasLinkedFacture) {
                                                                    return (
                                                                        <DropdownMenuItem
                                                                            className="cursor-pointer"
                                                                            onClick={() => navigate(`/dashboard/factures-gros/${linkedFactureId}`)}
                                                                        >
                                                                            <ArrowUpRight className="h-4 w-4 mr-2" />
                                                                            Voir la facture gros
                                                                        </DropdownMenuItem>
                                                                    );
                                                                }

                                                                return (
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer font-bold text-indigo-600"
                                                                        onClick={() => {
                                                                            navigate("/dashboard/factures-gros", {
                                                                                state: { commandeGrosId: row.id },
                                                                            });
                                                                        }}
                                                                    >
                                                                        <ArrowUpRight className="h-4 w-4 mr-2" />
                                                                        Convertir en facture gros
                                                                    </DropdownMenuItem>
                                                                );
                                                            })()}
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
                                                                onClick={() => setCommandeToDelete(row.id)}
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
                                                    .reduce((acc, c) => acc + commandeGrosRowMontantTtc(c), 0)
                                                    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                                DH
                                            </TableCell>
                                            <TableCell colSpan={6} />
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
                                {editingId ? "Modification commande gros" : "Nouvelle commande gros"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-0">
                            <form onSubmit={submit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Date</Label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input type="date" value={dateCommande} onChange={(e) => setDateCommande(e.target.value)} required className="h-11 pl-10 border-border focus:border-indigo-500 rounded-xl" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 relative">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Client *</Label>
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
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Devis gros (optionnel)</Label>
                                        <Select value={devisGrosId || "__none__"} onValueChange={(v) => setDevisGrosId(v === "__none__" ? "" : v)}>
                                            <SelectTrigger className="h-11 rounded-xl border-border">
                                                <SelectValue placeholder="—" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">—</SelectItem>
                                                {devisGrosDisponibles.map((d) => (
                                                    <SelectItem key={d.id} value={String(d.id)}>
                                                        {d.numero_devis}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Banque (optionnel)</Label>
                                        <Select value={banqueId || "__none__"} onValueChange={(v) => setBanqueId(v === "__none__" ? "" : v)}>
                                            <SelectTrigger className="h-11 rounded-xl border-border">
                                                <SelectValue placeholder="—" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">—</SelectItem>
                                                {banques.map((b) => (
                                                    <SelectItem key={b.id} value={String(b.id)}>
                                                        {b.nom_banque || b.nom_compte || `Banque #${b.id}`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Mode de paiement</Label>
                                        <Select value={modePaiement} onValueChange={setModePaiement}>
                                            <SelectTrigger className="h-11 rounded-xl border-border max-w-md">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {paymentModes.length > 0 ? (
                                                    paymentModes.map((m) => (
                                                        <SelectItem key={m.value} value={m.value}>
                                                            {m.label}
                                                        </SelectItem>
                                                    ))
                                                ) : (
                                                    <>
                                                        <SelectItem value="espece">Espèce</SelectItem>
                                                        <SelectItem value="cheque">Chèque</SelectItem>
                                                        <SelectItem value="virement">Virement</SelectItem>
                                                        <SelectItem value="carte">Carte bancaire</SelectItem>
                                                        <SelectItem value="effet">Effet</SelectItem>
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {editingId && (
                                        <div className="space-y-1.5 md:col-span-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase">Statut</Label>
                                            <Select value={statut} onValueChange={setStatut}>
                                                <SelectTrigger className="h-11 rounded-xl border-border max-w-md">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="en_attente">En attente</SelectItem>
                                                    <SelectItem value="validee">Validée</SelectItem>
                                                    <SelectItem value="refusee">Refusée</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Lignes & grammage</h3>
                                        <Button type="button" onClick={addLine} size="sm" className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-xl">
                                            <Plus className="h-4 w-4 mr-2" /> Ajouter une ligne
                                        </Button>
                                    </div>
                                    <div className="border border-border rounded-xl overflow-visible bg-card">
                                        <Table containerClassName="overflow-visible">
                                            <TableHeader>
                                                <TableRow className="bg-muted/30">
                                                    <TableHead className="w-[220px] text-[10px] font-bold uppercase py-4 pl-6">Produit gros</TableHead>
                                                    <TableHead className="w-[220px] text-[10px] font-bold uppercase py-4 text-center">Prix / g</TableHead>
                                                    <TableHead className="w-[160px] text-[10px] font-bold uppercase py-4">Grammage (g) *</TableHead>
                                                    <TableHead className="w-[180px] text-[10px] font-bold uppercase py-4 text-right">Prix Net</TableHead>
                                                    <TableHead className="w-[50px] py-4 pr-6" />
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {items.map((line, index) => (
                                                    <TableRow key={index} className="group transition-colors hover:bg-muted/20">
                                                        <TableCell className="py-2 pl-6">
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
                                                                onChange={(e) => updateLine(index, "prix_unitaire", e.target.value)}
                                                                className="h-11 border-transparent bg-transparent focus:bg-card focus:border-indigo-400 text-base text-center"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="number"
                                                                step="any"
                                                                min={0}
                                                                value={line.grammage}
                                                                onChange={(e) => updateLine(index, "grammage", e.target.value)}
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
                                                                    const net = roundTo(g * pu, 2);
                                                                    return Number.isFinite(net) ? String(net) : "0";
                                                                })()}
                                                                onChange={(e) => handlePrixNetChange(index, e.target.value)}
                                                                className="h-11 border-transparent bg-transparent focus:bg-card focus:border-indigo-400 text-base text-right font-semibold"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2 pr-6">
                                                            <Button type="button" variant="ghost" size="icon" className="rounded-lg" onClick={() => removeLine(index)} disabled={items.length <= 1}>
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
                                    <Button type="submit" disabled={saving} className="h-11 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 dark:shadow-none">
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Enregistrer" : "Créer la commande gros"}
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
                open={commandeToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setCommandeToDelete(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Vous voulez vraiment supprimer ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action supprimera définitivement cette commande gros du système.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (commandeToDelete == null) return;
                                await handleDelete(commandeToDelete);
                                setCommandeToDelete(null);
                            }}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={showFactureGrosDialog} onOpenChange={setShowFactureGrosDialog}>
                <DialogContent className="sm:max-w-[430px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
                    <div className="h-1.5 bg-indigo-600" />
                    <DialogHeader className="px-6 pt-4 pb-2">
                        <DialogTitle className="flex items-center gap-3 text-base">
                            <div className="h-8 w-8 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                                <FileText className="h-4 w-4" />
                            </div>
                            <span className="text-indigo-700 dark:text-indigo-300">Commande gros créée</span>
                        </DialogTitle>
                        <DialogDescription className="px-1 pt-2 text-sm text-muted-foreground">
                            Souhaitez-vous maintenant créer la <span className="font-semibold text-indigo-600">facture gros</span> liée à cette commande&nbsp;?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-4">
                        {createdCommandeGrosId != null && (
                            <div className="mb-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 px-3 py-2 text-[11px] text-indigo-700 dark:text-indigo-200 flex items-center justify-between">
                                <span className="font-semibold uppercase tracking-widest">Commande gros #{createdCommandeGrosId}</span>
                                <span className="text-[10px] text-indigo-500 dark:text-indigo-300">Étape suivante : facture gros</span>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <Button
                                variant="ghost"
                                className="flex-1 h-10 rounded-xl text-xs font-semibold"
                                onClick={() => {
                                    setShowFactureGrosDialog(false);
                                    setCreatedCommandeGrosId(null);
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
                                    if (createdCommandeGrosId == null) return;
                                    navigate("/dashboard/factures-gros", {
                                        state: { commandeGrosId: createdCommandeGrosId },
                                    });
                                    setShowFactureGrosDialog(false);
                                    setCreatedCommandeGrosId(null);
                                    resetForm();
                                    setTab("list");
                                }}
                            >
                                Créer la facture gros
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
