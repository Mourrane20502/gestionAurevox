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
import { toast } from "sonner";
import {
    Plus,
    Trash2,
    Receipt,
    Loader2,
    Search,
    Calendar,
    CheckCircle2,
    AlertCircle,
    Clock,
    FileText,
    MoreVertical,
    ArrowUpRight,
    Download,
    User,
    RotateCcw,
    Banknote,
} from "lucide-react";
import { generateFactureGrosPdfFromApiRow } from "@/components/pdf/GrosDocumentPdf";
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
    id_point_de_vente?: number | null;
    point_de_vente_id?: number | null;
    pricing_metal?: string | null;
}

interface CommandeGrosOpt {
    id: number;
    numero_commande: string;
}

interface FactureGrosItemForm {
    produit_id?: number;
    designation: string;
    grammage: string;
    prix_unitaire: string;
    reduction: string;
    taux_tva: string;
}

interface FactureGrosRow {
    id: number;
    numero_facture: string;
    date_facture: string;
    grammage: number;
    statut: string;
    client_id?: number;
    client_nom?: string;
    point_de_vente_nom?: string;
    montant_ttc?: number | string | null;
    total_regle?: number | string | null;
    reste_a_payer?: number | string | null;
    montant_ht?: number | string | null;
    montant_tva?: number | string | null;
    reduction?: number | string | null;
    user_nom?: string | null;
    user_id?: number;
    commande_gros_numero?: string;
    devis_gros_numero?: string;
    commande_gros_id?: number | null;
    devis_gros_id?: number | null;
    sous_societe_nom?: string | null;
}

function factureGrosRowMontantTtc(row: FactureGrosRow): number {
    const ttc = row.montant_ttc;
    if (ttc != null && ttc !== "" && !Number.isNaN(Number(ttc))) {
        return Number(ttc);
    }
    return (Number(row.montant_ht) || 0) + (Number(row.montant_tva) || 0);
}

function isFactureGrosReglee(row: FactureGrosRow): boolean {
    const totalRegle = Number((row as any).total_regle) || 0;
    const mtTtc = factureGrosRowMontantTtc(row);
    return mtTtc > 0 && totalRegle >= mtTtc - 0.01;
}

const getSousSocieteLabel = (doc: { sous_societe_nom?: string | null }) => {
    const fromName = String(doc.sous_societe_nom || "").trim();
    return fromName || "—";
};

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

function normFactureGrosStatut(s: string): string {
    const v = String(s || "").toLowerCase().trim();
    if (v === "payée") return "payee";
    if (v === "non payée" || v === "non payee") return "non_payee";
    if (v === "en attente") return "en_attente";
    return v.replace(/\s+/g, "_");
}

const FALLBACK_PAYMENT_MODES = [
    { value: "espece", label: "Espèce" },
    { value: "cheque", label: "Chèque" },
    { value: "virement", label: "Virement" },
    { value: "carte", label: "Carte bancaire" },
    { value: "effet", label: "Effet" },
];

export default function FactureGros() {
    const location = useLocation();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [list, setList] = useState<FactureGrosRow[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [pdvs, setPdvs] = useState<Pdv[]>([]);
    const [commandesGrosOpts, setCommandesGrosOpts] = useState<CommandeGrosOpt[]>([]);
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
    const [factureIdsWithAvoir, setFactureIdsWithAvoir] = useState<number[]>([]);
    const [factureAvoirMap, setFactureAvoirMap] = useState<Record<number, number>>({});

    const [dateFacture, setDateFacture] = useState(() => new Date().toISOString().split("T")[0]);
    const [dateEcheance, setDateEcheance] = useState(() => new Date().toISOString().split("T")[0]);
    const [clientId, setClientId] = useState<string>("");
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [showQuickAddClientDialog, setShowQuickAddClientDialog] = useState(false);
    const [pendingClientName, setPendingClientName] = useState("");
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [pdvId, setPdvId] = useState<string>("");
    const [commandeGrosId, setCommandeGrosId] = useState<string>("");
    const [devisGrosId, setDevisGrosId] = useState<string>("");
    const [banqueId, setBanqueId] = useState<string>("");
    const [modePaiement, setModePaiement] = useState<string>("");
    const [items, setItems] = useState<FactureGrosItemForm[]>([{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]);
    const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);

    const [fromCommande, setFromCommande] = useState(false);
    const [importedClientNom, setImportedClientNom] = useState("");
    const [importedBanqueNom, setImportedBanqueNom] = useState("");
    const [paymentModes, setPaymentModes] = useState<{ value: string; label: string }[]>([]);

    const productsGros = products.filter(isProductWholesaleGros);
    const paymentModeOptions = paymentModes.length > 0 ? paymentModes : FALLBACK_PAYMENT_MODES;

    const filterYears = useMemo(
        () => Array.from({ length: 8 }, (_, i) => (new Date().getFullYear() - i).toString()),
        []
    );

    const filteredList = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return list.filter((row) => {
            const matchesSearch =
                !q ||
                row.numero_facture?.toLowerCase().includes(q) ||
                (row.client_nom || "").toLowerCase().includes(q) ||
                (row.user_nom || "").toLowerCase().includes(q) ||
                (row.commande_gros_numero || "").toLowerCase().includes(q) ||
                (row.devis_gros_numero || "").toLowerCase().includes(q) ||
                (row.point_de_vente_nom || "").toLowerCase().includes(q) ||
                (row.sous_societe_nom || "").toLowerCase().includes(q);

            const date = parseListDate(String(row.date_facture ?? ""));
            const matchesMonth =
                filterMonth === "all" || (date != null && (date.getMonth() + 1).toString() === filterMonth);
            const matchesYear =
                filterYear === "all" || (date != null && date.getFullYear().toString() === filterYear);
            const matchesStatus =
                filterStatus === "all" ||
                (filterStatus === "regle"
                    ? isFactureGrosReglee(row)
                    : filterStatus === "non_regle"
                        ? !isFactureGrosReglee(row)
                        : normFactureGrosStatut(row.statut) === filterStatus);
            const matchesClient =
                filterClient === "all" || String(row.client_id ?? "") === filterClient;
            const matchesUser =
                filterUser === "all" ||
                (row.user_id != null && String(row.user_id) === filterUser);
            const matchesSousSociete = matchesSousSocieteListFilter(
                filterSousSociete,
                row.sous_societe_nom,
                row.numero_facture
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
    const commandesGrosDisponibles = useMemo(() => {
        const linkedCommandeIds = new Set(
            list
                .map((f) => Number(f.commande_gros_id))
                .filter((id) => Number.isFinite(id) && id > 0)
        );
        return commandesGrosOpts.filter(
            (c) => !linkedCommandeIds.has(c.id) || String(c.id) === String(commandeGrosId || "")
        );
    }, [list, commandesGrosOpts, commandeGrosId]);

    const totalTTC = useMemo(
        () => list.reduce((acc, f) => acc + factureGrosRowMontantTtc(f), 0),
        [list]
    );
    const totalPaid = useMemo(
        () => list.reduce((acc, f) => acc + (Number((f as any).total_regle) || 0), 0),
        [list]
    );
    const totalDraft = useMemo(
        () => list.filter((f) => String(f.statut || "").toLowerCase() === "brouillon").length,
        [list]
    );

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [rFac, rClients, rPdv, rCmd, rBanq, rProducts, rPm, rUsers] = await Promise.all([
                fetch("/api/factures-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/clients", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/pdv", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/commandes-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/banque", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/settings/payment-modes", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/users/all-users", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (rFac.ok) setList(await rFac.json());
            if (rClients.ok) setClients(await rClients.json());
            if (rPdv.ok) setPdvs(await rPdv.json());
            if (rCmd.ok) {
                const cg = await rCmd.json();
                setCommandesGrosOpts(
                    Array.isArray(cg)
                        ? cg.map((c: { id: number; numero_commande: string }) => ({
                              id: c.id,
                              numero_commande: c.numero_commande,
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
        } catch {
            toast.error("Erreur de chargement");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAvoirsGrosForFactures = async () => {
        try {
            const response = await fetch("/api/avoirs-gros", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            const data = await response.json();
            const ids: number[] = Array.from(
                new Set(
                    (Array.isArray(data) ? data : [])
                        .map((a: any) => Number(a.facture_gros_id))
                        .filter((id: number) => Number.isFinite(id) && id > 0)
                )
            );
            const map: Record<number, number> = {};
            (Array.isArray(data) ? data : []).forEach((a: any) => {
                const fId = Number(a.facture_gros_id);
                const aId = Number(a.id);
                if (Number.isFinite(fId) && fId > 0 && Number.isFinite(aId) && aId > 0) {
                    map[fId] = aId;
                }
            });
            setFactureIdsWithAvoir(ids);
            setFactureAvoirMap(map);
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        fetchAvoirsGrosForFactures();
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
        const state = location.state as { commandeGrosId?: number; editFactureGrosId?: number } | null;
        const editId = state?.editFactureGrosId;
        if (editId != null && Number.isFinite(Number(editId))) {
            if (loading) return;
            loadForEdit(Number(editId));
            setTab("form");
            window.history.replaceState({}, document.title);
            return;
        }
        const cid = state?.commandeGrosId;
        if (cid == null || !Number.isFinite(Number(cid))) return;
        if (loading) return;
        setCommandeGrosId(String(cid));
        setTab("form");
        setEditingId(null);
        window.history.replaceState({}, document.title);
    }, [location.state, location.key, loading]);

    const resetForm = () => {
        setEditingId(null);
        setDateFacture(new Date().toISOString().split("T")[0]);
        setDateEcheance(new Date().toISOString().split("T")[0]);
        setClientId("");
        setClientSearch("");
        setShowClientDropdown(false);
        setPdvId(pdvs[0]?.id ? String(pdvs[0].id) : "");
        setCommandeGrosId("");
        setDevisGrosId("");
        setBanqueId("");
        setModePaiement("");
        setItems([{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]);
        setFromCommande(false);
        setImportedClientNom("");
        setImportedBanqueNom("");
    };

    useEffect(() => {
        if (pdvs.length && !pdvId) setPdvId(String(pdvs[0].id));
    }, [pdvs]);

    useEffect(() => {
        if (!commandeGrosId) {
            if (fromCommande) setFromCommande(false);
            setImportedClientNom("");
            setImportedBanqueNom("");
            return;
        }
        /* Édition d'une facture existante : les lignes viennent de GET /factures-gros/:id (loadForEdit).
           Ne pas réimporter la commande, sinon les items de la facture sont remplacés par ceux de la commande. */
        if (editingId != null) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/commandes-gros/${commandeGrosId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok || cancelled) return;
                const d = await res.json();
                setFromCommande(true);
                setClientId(String(d.client_id || ""));
                setClientSearch(String(d.client_nom || clients.find((c) => String(c.id) === String(d.client_id))?.nom_complet || ""));
                setPdvId(String(d.point_de_vente_id || ""));
                setImportedClientNom(String(d.client_nom || "").trim() || "—");
                const importedBanqueIdRaw = d.banque_id ?? d.banqueId ?? d.banque?.id ?? null;
                const importedBanqueId =
                    importedBanqueIdRaw == null || importedBanqueIdRaw === "" ? "" : String(importedBanqueIdRaw);
                setBanqueId(importedBanqueId);
                const banqueNomFromApi = String(d.banque_nom || d.banqueNom || "").trim();
                const banqueNomFromList =
                    importedBanqueId && banques.length > 0
                        ? banques.find((b) => String(b.id) === importedBanqueId)?.nom_banque || ""
                        : "";
                setImportedBanqueNom(banqueNomFromApi || banqueNomFromList || "—");
                setModePaiement(d.mode_paiement || "virement");
                const raw = Array.isArray(d.items) ? d.items : [];
                const importedPdvId = resolveImportedItemsPdvId(raw);
                setItems(
                    raw.length
                        ? raw.map((it: any) => mapImportedGrosLine(it))
                        : [{ designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]
                );
                if (importedPdvId) setPdvId(importedPdvId);
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [commandeGrosId, editingId, token, banques]);

    const addLine = () => setItems((prev) => [...prev, { designation: "", grammage: "", prix_unitaire: "", reduction: "0", taux_tva: "0" }]);
    const removeLine = (index: number) =>
        setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

    const updateLine = (index: number, field: keyof FactureGrosItemForm, value: string | number | undefined) => {
        setItems((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value as never };
            return next;
        });
    };

    const mapImportedGrosLine = (it: any): FactureGrosItemForm => {
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
                ? String(netCandidate / grammageNum)
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
        const prixUnitaire = g > 0 ? net / g : net;
        updateLine(index, "prix_unitaire", String(prixUnitaire));
        updateLine(index, "reduction", "0");
        updateLine(index, "taux_tva", "0");
    };

    const resolveProductPdvId = (product: Product): string => {
        const raw = product.id_point_de_vente ?? product.point_de_vente_id;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? String(n) : "";
    };

    const resolveImportedItemsPdvId = (rawItems: any[]): string => {
        const pdvIds = new Set<string>();
        rawItems.forEach((it: any) => {
            const productId = Number(it?.produit_id);
            if (!Number.isFinite(productId) || productId <= 0) return;
            const p = products.find((prod) => Number(prod.id) === productId);
            if (!p) return;
            const pdv = resolveProductPdvId(p);
            if (pdv) pdvIds.add(pdv);
        });
        return pdvIds.size === 1 ? Array.from(pdvIds)[0] : "";
    };

    const applyProduct = (index: number, product: Product) => {
        const g = Number(product.grammage);
        const pTotal = Number(product.prix);
        const pu = Number.isFinite(pTotal) ? pTotal : 0;
        const productPdvId = resolveProductPdvId(product);
        updateLine(index, "produit_id", product.id);
        updateLine(index, "designation", product.nom);
        updateLine(index, "grammage", Number.isFinite(g) && g > 0 ? String(g) : "");
        updateLine(index, "prix_unitaire", String(pu));
        if (productPdvId) setPdvId(productPdvId);
        setActiveProductSearchIndex(null);
    };

    const loadForEdit = async (id: number) => {
        try {
            const res = await fetch(`/api/factures-gros/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error("Impossible de charger la facture");
                return;
            }
            const d = await res.json();
            setEditingId(id);
            setDateFacture(String(d.date_facture || "").split("T")[0]);
            setDateEcheance(d.date_echeance ? String(d.date_echeance).split("T")[0] : "");
            setClientId(String(d.client_id || ""));
            setPdvId(String(d.point_de_vente_id || ""));
            setCommandeGrosId(d.commande_gros_id ? String(d.commande_gros_id) : "");
            setDevisGrosId(d.devis_gros_id ? String(d.devis_gros_id) : "");
            setBanqueId(d.banque_id ? String(d.banque_id) : "");
            setModePaiement(d.mode_paiement || "virement");
            setFromCommande(Boolean(d.commande_gros_id));
            setImportedClientNom(d.client_nom ? String(d.client_nom) : "");
            if (d.commande_gros_id) {
                const banqueNomFromApi = String(d.banque_nom || d.banqueNom || "").trim();
                const banqueIdFromData = d.banque_id != null ? String(d.banque_id) : "";
                const banqueNomFromList =
                    banqueIdFromData && banques.length > 0
                        ? banques.find((b) => String(b.id) === banqueIdFromData)?.nom_banque || ""
                        : "";
                setImportedBanqueNom(banqueNomFromApi || banqueNomFromList || "—");
            } else {
                setImportedBanqueNom("");
            }
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
        if (!commandeGrosId && !clientId) {
            if (clientSearch.trim()) {
                setPendingClientName(clientSearch.trim());
                setShowQuickAddClientDialog(true);
                return;
            }
            toast.error("Choisissez un client ou une commande gros");
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

        const payloadJson: Record<string, unknown> = {
            date_facture: dateFacture,
            date_echeance: dateEcheance,
            items: payloadItems,
            commande_gros_id: commandeGrosId ? Number(commandeGrosId) : null,
            devis_gros_id: devisGrosId ? Number(devisGrosId) : null,
            banque_id: banqueId ? Number(banqueId) : null,
            mode_paiement: modePaiement || "virement",
            statut: "en_attente",
        };
        if (!commandeGrosId) {
            payloadJson.client_id = Number(clientId);
            payloadJson.point_de_vente_id = Number(effectivePdvId);
        }

        setSaving(true);
        try {
            const url = editingId ? `/api/factures-gros/${editingId}` : "/api/factures-gros";
            const method = editingId ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payloadJson),
            });
            if (res.ok) {
                const result = await res.json().catch(() => ({}));
                toast.success(editingId ? "Facture gros enregistrée" : "Facture gros créée");
                window.dispatchEvent(new CustomEvent("approvals-updated"));
                if (!editingId && result?.id) {
                    navigate("/dashboard/reglements-gros", { state: { factureGrosId: Number(result.id), openDialog: true } });
                }
                resetForm();
                setTab("list");
                fetchAll();
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

    const handleDownloadPdf = async (id: number) => {
        setPdfLoadingId(id);
        try {
            const res = await fetch(`/api/factures-gros/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error("Impossible de charger le document");
                return;
            }
            const data = await res.json();
            await generateFactureGrosPdfFromApiRow(data as Record<string, unknown>);
            toast.success("PDF téléchargé");
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        } finally {
            setPdfLoadingId(null);
        }
    };

    const statusBadge = (status: "regle" | "commence" | "non_regle") => {
        if (status === "commence")
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    <Clock className="h-3 w-3" /> Règlement commencé
                </span>
            );
        if (status === "non_regle")
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                    <FileText className="h-3 w-3" /> Non réglé
                </span>
            );
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Réglé
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Receipt className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Factures gros
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Facturation et suivi des paiements
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><FileText className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Facturé</p>
                        <p className="text-xl font-bold text-foreground">{totalTTC.toLocaleString("fr-FR")} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Encaissé</p>
                        <p className="text-xl font-bold text-foreground">{totalPaid.toLocaleString("fr-FR")} DH</p>
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

            <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "form")} className="w-full">
                <TabsList className="bg-muted/50 p-2 rounded-2xl mb-8 h-14">
                    <TabsTrigger value="list" className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold">
                        Liste des factures gros
                    </TabsTrigger>
                    <TabsTrigger value="form" className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm px-12 h-11 text-sm font-semibold">
                        {editingId ? "Modifier la facture gros" : "Nouvelle facture gros"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <div className="bg-card p-4 rounded-2xl border border-border shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
                            <div className="relative w-full max-w-md flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="N°, client, cmd/devis gros, PDV, utilisateur…"
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
                                        <SelectItem value="non_payee">Non payée</SelectItem>
                                        <SelectItem value="payee">Payée</SelectItem>
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
                                        <TableHead className="text-center py-4 px-6 whitespace-nowrap">Avoir</TableHead>
                                        <TableHead className="py-4 px-6">Date</TableHead>
                                        <TableHead className="py-4 px-6 whitespace-nowrap">Statut</TableHead>
                                        <TableHead className="py-4 px-6">Statut Règlement</TableHead>
                                        <TableHead className="py-4 px-6 whitespace-nowrap">Utilisateur</TableHead>
                                        <TableHead className="text-right py-4 px-6" aria-label="Actions" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredList.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                                                {list.length === 0 ? "Aucune facture gros" : "Aucun résultat"}
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
                                                                onClick={() => navigate(`/dashboard/factures-gros/${row.id}`)}
                                                                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                                            >
                                                                {row.numero_facture}
                                                            </button>
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/dashboard/factures-gros/${row.id}`);
                                                                }}
                                                                className="h-7 w-7 text-muted-foreground hover:text-indigo-600 hover:bg-muted/60"
                                                                title="Ouvrir"
                                                            >
                                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                        <div className="flex gap-2 mt-1">
                                                            {row.commande_gros_id ? (
                                                                <span
                                                                    className="text-[9px] text-blue-600 dark:text-blue-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() =>
                                                                        navigate(`/dashboard/commandes-gros/${row.commande_gros_id}`)
                                                                    }
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Commande
                                                                </span>
                                                            ) : null}
                                                            {row.devis_gros_id ? (
                                                                <span
                                                                    className="text-[9px] text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 font-bold uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() =>
                                                                        navigate(`/dashboard/devis-gros/${row.devis_gros_id}`)
                                                                    }
                                                                >
                                                                    <CheckCircle2 className="h-2.5 w-2.5" /> Devis
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
                                                    {factureGrosRowMontantTtc(row).toLocaleString("fr-FR", {
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
                                                <TableCell className="px-6 text-center">
                                                    {factureIdsWithAvoir.includes(row.id) ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span className="text-[10px] text-muted-foreground font-medium">Avoir déjà généré</span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    const avoirId = factureAvoirMap[row.id];
                                                                    if (avoirId) navigate(`/dashboard/avoirs-gros/${avoirId}`);
                                                                }}
                                                                className="h-8 px-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 gap-1"
                                                            >
                                                                <Download className="h-3.5 w-3.5" />
                                                                <span className="text-[10px] font-bold uppercase hidden sm:inline">Voir</span>
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => navigate("/dashboard/avoirs-gros", { state: { factureGrosId: row.id } })}
                                                            className="h-8 px-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 gap-1"
                                                        >
                                                            <RotateCcw className="h-3.5 w-3.5" />
                                                            <span className="text-[10px] font-bold uppercase hidden sm:inline">Générer</span>
                                                        </Button>
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-6 text-muted-foreground">
                                                    {new Date(row.date_facture).toLocaleDateString("fr-FR")}
                                                </TableCell>
                                                <TableCell className="px-6">
                                                    {normFactureGrosStatut(row.statut) === "en_attente" ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                                            <Clock className="h-3 w-3" /> En attente
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                                                            <CheckCircle2 className="h-3 w-3" /> Validée
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-6 text-center">
                                                    {(() => {
                                                        const totalRegle = Number((row as any).total_regle) || 0;
                                                        const mtTtc = factureGrosRowMontantTtc(row);
                                                        const resteCalc =
                                                            typeof (row as any).reste_a_payer !== "undefined"
                                                                ? Number((row as any).reste_a_payer)
                                                                : Math.max(mtTtc - totalRegle, 0);
                                                        const reste = Math.max(resteCalc, 0);
                                                        const isRegle = mtTtc > 0 && totalRegle >= mtTtc - 0.01;
                                                        const isReglementCommence = !isRegle && totalRegle > 0 && reste > 0;
                                                        const showResteUnderStatut = !isRegle && reste > 0;

                                                        return (
                                                            <div className="flex flex-col items-center gap-1">
                                                                {statusBadge(isRegle ? "regle" : isReglementCommence ? "commence" : "non_regle")}
                                                                {showResteUnderStatut && (
                                                                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                                                        Reste :{" "}
                                                                        {Number(reste).toLocaleString("fr-FR", {
                                                                            minimumFractionDigits: 2,
                                                                            maximumFractionDigits: 2,
                                                                        })}{" "}
                                                                        DH
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </TableCell>
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
                                                            {normFactureGrosStatut(row.statut) !== "payee" && (
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        navigate("/dashboard/reglements-gros", {
                                                                            state: { factureGrosId: row.id, openDialog: true },
                                                                        })
                                                                    }
                                                                >
                                                                    <Banknote className="h-4 w-4 mr-2" />
                                                                    Régler
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                    {!loading && filteredList.length > 0 && (
                                        <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 border-t-2 border-indigo-100 dark:border-indigo-900/30">
                                            <TableCell colSpan={4} className="px-6 py-4 font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider text-xs">
                                                Total Complet (Filtré)
                                            </TableCell>
                                            <TableCell className="px-4 py-4 font-black text-indigo-700 dark:text-indigo-300 text-base text-right">
                                                {filteredList
                                                    .reduce((acc, f) => acc + factureGrosRowMontantTtc(f), 0)
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
                                {editingId ? "Modification facture gros" : "Nouvelle facture gros"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-0">
                            <form onSubmit={submit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Commande gros (optionnel — importe client, banque et lignes)</Label>
                                        <Select
                                            value={commandeGrosId || "__none__"}
                                            onValueChange={(v) => {
                                                if (v === "__none__") {
                                                    setCommandeGrosId("");
                                                    setFromCommande(false);
                                                    setImportedClientNom("");
                                                } else setCommandeGrosId(v);
                                            }}
                                        >
                                            <SelectTrigger className="h-11 rounded-xl border-border max-w-xl">
                                                <SelectValue placeholder="—" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">—</SelectItem>
                                                {commandesGrosDisponibles.map((c) => (
                                                    <SelectItem key={c.id} value={String(c.id)}>
                                                        {c.numero_commande}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Date facture</Label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input type="date" value={dateFacture} onChange={(e) => setDateFacture(e.target.value)} required className="h-11 pl-10 border-border focus:border-indigo-500 rounded-xl" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Date échéance</Label>
                                        <Input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} className="h-11 border-border rounded-xl" />
                                    </div>
                                    {commandeGrosId ? (
                                        <div className="space-y-1.5 md:col-span-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase">Client & point de vente (commande gros)</Label>
                                            <div className="rounded-xl border border-indigo-200/90 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-800 p-4 space-y-1">
                                                <p className="text-lg font-semibold text-foreground">{importedClientNom || "Chargement…"}</p>
                                                <p className="text-[11px] text-muted-foreground pt-1">
                                                    Les champs mode de paiement et banque ci-dessous sont préremplis depuis la commande gros.
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Banque importée : <span className="font-semibold text-foreground">{importedBanqueNom || "—"}</span>
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
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
                                        </>
                                    )}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Mode de paiement</Label>
                                        <Select value={modePaiement || "virement"} onValueChange={setModePaiement}>
                                            <SelectTrigger className="h-11 rounded-xl border-border">
                                                <SelectValue placeholder="Mode" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {paymentModeOptions.map((m) => (
                                                    <SelectItem key={m.value} value={m.value}>
                                                        {m.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Banque (optionnel)</Label>
                                        <Select
                                            value={banqueId || "__none__"}
                                            onValueChange={(v) => setBanqueId(v === "__none__" ? "" : v)}
                                            disabled={Boolean(commandeGrosId) && fromCommande}
                                        >
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
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Lignes & grammage</h3>
                                        <Button type="button" onClick={addLine} size="sm" className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-xl" disabled={Boolean(commandeGrosId) && fromCommande}>
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
                                                                    disabled={Boolean(commandeGrosId) && fromCommande}
                                                                    className="h-10 rounded-lg border-border"
                                                                />
                                                                {activeProductSearchIndex === index &&
                                                                    !(Boolean(commandeGrosId) && fromCommande) &&
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
                                                                required
                                                                disabled={Boolean(commandeGrosId) && fromCommande}
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
                                                                disabled={Boolean(commandeGrosId) && fromCommande}
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
                                                                disabled={Boolean(commandeGrosId) && fromCommande}
                                                                className="h-11 border-transparent bg-transparent focus:bg-card focus:border-indigo-400 text-base text-right font-semibold"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2 pr-6">
                                                            <Button type="button" variant="ghost" size="icon" className="rounded-lg" onClick={() => removeLine(index)} disabled={items.length <= 1 || (Boolean(commandeGrosId) && fromCommande)}>
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
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Enregistrer" : "Créer la facture gros"}
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
