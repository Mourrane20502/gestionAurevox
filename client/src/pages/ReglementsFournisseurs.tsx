import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import { Label } from "@/components/common/ui/label";
import { Textarea } from "@/components/common/ui/textarea";
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
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/common/ui/sheet";
import { toast } from "sonner";
import {
    Truck,
    Search,
    Filter,
    RefreshCw,
    DollarSign,
    Clock,
    Hash,
    Banknote,
    Download,
    Eye,
    Package,
    CheckCircle2,
    AlertCircle,
    XCircle,
    Mail,
    Send,
    RefreshCcw,
    FileText,
    MoreVertical,
    X,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { generateRecuPaiementFournisseurPdf } from "@/components/pdf/RecuPaiementFournisseurPdf";
import { buildReglementCode } from "@/lib/reglementCode";
import { cn } from "@/lib/utils";

interface Fournisseur {
    id: number;
    nom: string;
}

interface AchatFournisseur {
    id: number;
    fournisseur_id: number;
    fournisseur_nom?: string;
    designation_libre?: string | null;
    produit_nom?: string | null;
    gestionnaire_nom?: string;
    quantite?: number;
    prix_unitaire?: number;
    tva?: number;
    montant_ttc?: number;
    taux_ras?: number;
    montant_ras?: number;
    net_fournisseur?: number;
    statut?: string | null;
    numero?: string | null;
    date_achat?: string;
    facture_fournisseur?: string | null;
}

interface ReglementFournisseur {
    id: number;
    fournisseur_id: number;
    fournisseur_nom?: string;
    achat_id?: number | null;
    achat_designation?: string | null;
    date_reglement: string;
    date_echeance?: string | null;
    montant: number;
    mode_paiement: string;
    banque_id?: number | null;
    banque_nom?: string | null;
    statut: string;
    commentaire?: string | null;
    created_by_nom?: string | null;
    approved_by_nom?: string | null;
}

interface SituationReglementFournisseur {
    montant_ttc: number;
    total_regle: number;
    reste_a_payer: number;
}

interface Banque {
    id: number;
    nom_banque: string;
}

// Computed row for each achat
interface AchatRow {
    achat: AchatFournisseur;
    fournisseurNom: string;
    designation: string;
    montantHT: number;
    montantTTC: number;
    tauxRas: number;
    montantRas: number;
    netFournisseur: number;
    totalRegle: number;
    resteAPayer: number;
    reglements: ReglementFournisseur[];
    isFullyPaid: boolean;
    hasPendingReglement: boolean;
}

function toNum(v: unknown): number {
    if (v == null || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function sortReglementsFournisseurDesc(reglements: ReglementFournisseur[]) {
    return reglements.slice().sort((a, b) => {
        const ad = a.date_reglement ? new Date(a.date_reglement).getTime() : 0;
        const bd = b.date_reglement ? new Date(b.date_reglement).getTime() : 0;
        if (bd !== ad) return bd - ad;
        return (b.id ?? 0) - (a.id ?? 0);
    });
}

export default function ReglementsFournisseurs() {
    const navigate = useNavigate();
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAdmin =
        role === "admin" || role === "responsable" || role === "directeur" || role === "superadmin";
    const isAuthorized = isAdmin || permissions.includes("fournisseurs_view");

    const token = localStorage.getItem("token");
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
    const location = useLocation();

    const [reglements, setReglements] = useState<ReglementFournisseur[]>([]);
    const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
    const [achats, setAchats] = useState<AchatFournisseur[]>([]);
    const [banques, setBanques] = useState<Banque[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState("");
    const [filterFournisseur, setFilterFournisseur] = useState<string>("all");
    const [filterStatut, setFilterStatut] = useState<string>("all");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [reglementDateFrom, setReglementDateFrom] = useState<string>("");
    const [reglementDateTo, setReglementDateTo] = useState<string>("");
    const [echeanceFrom, setEcheanceFrom] = useState<string>("");
    const [echeanceTo, setEcheanceTo] = useState<string>("");
    const [filterReglementStatut, setFilterReglementStatut] = useState<string>("all");
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [reglementHistoryPage, setReglementHistoryPage] = useState(1);
    const itemsPerPage = 10;
    const reglementHistoryItemsPerPage = 10;

    // New reglement dialog
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedFournisseurId, setSelectedFournisseurId] = useState<string>("");
    const [selectedAchatId, setSelectedAchatId] = useState<string>("");
    const [achatSearch, setAchatSearch] = useState("");
    const [showAchatDropdown, setShowAchatDropdown] = useState(false);
    const [situation, setSituation] = useState<SituationReglementFournisseur | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [emailTarget, setEmailTarget] = useState<ReglementFournisseur | null>(null);
    const [emailTo, setEmailTo] = useState("");
    const [emailSubject, setEmailSubject] = useState("");
    const [emailMessage, setEmailMessage] = useState("");
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const [paymentModes, setPaymentModes] = useState<{ label: string; value: string }[]>([]);

    // Detail popup
    const [detailDialogOpen, setDetailDialogOpen] = useState(false);
    const [detailAchatRow, setDetailAchatRow] = useState<AchatRow | null>(null);
    const [isUploadingFacture, setIsUploadingFacture] = useState(false);
    const [isDeletingFacture, setIsDeletingFacture] = useState(false);

    const hasHandledStateRef = useRef(false);

    const [reglementLines, setReglementLines] = useState<
        { mode_paiement: string; banque_id: string; montant: string; date_reglement: string; date_echeance: string; commentaire: string }[]
    >([
        {
            mode_paiement: "virement",
            banque_id: "none",
            montant: "",
            date_reglement: new Date().toISOString().split("T")[0],
            date_echeance: new Date().toISOString().split("T")[0],
            commentaire: "",
        },
    ]);

    const fetchAll = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const [regRes, fourRes, achatsRes, banquesRes, modesRes] = await Promise.all([
                fetch("/api/reglements-fournisseurs", {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch("/api/fournisseurs", {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch("/api/achats-fournisseurs", {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch("/api/banque", {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch("/api/settings/payment-modes", {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            if (regRes.ok) {
                const data = await regRes.json();
                setReglements(Array.isArray(data) ? data : []);
            } else {
                setReglements([]);
                toast.error("Erreur lors du chargement des règlements fournisseurs");
            }

            if (fourRes.ok) {
                const data = await fourRes.json();
                setFournisseurs(Array.isArray(data) ? data : []);
            }

            if (achatsRes.ok) {
                const data = await achatsRes.json();
                setAchats(Array.isArray(data) ? data : []);
            }

            if (banquesRes.ok) {
                const data = await banquesRes.json();
                setBanques(Array.isArray(data) ? data : []);
            }

            if (modesRes.ok) {
                const data = await modesRes.json();
                setPaymentModes(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
            toast.error("Erreur de connexion au serveur");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, [token]);

    // Build achat rows with reglement aggregation
    const achatRows: AchatRow[] = useMemo(() => {
        return achats.map((achat) => {
            const achatReglements = reglements.filter((r) => r.achat_id === achat.id);
            const qte = toNum(achat.quantite);
            const pu = toNum(achat.prix_unitaire);
            const tva = toNum(achat.tva);
            const montantHT = qte * pu;
            const montantTVA = montantHT * (tva / 100);
            const montantTTC = toNum(achat.montant_ttc) || (montantHT + montantTVA);
            const tauxRas = toNum(achat.taux_ras) || 100;
            const montantRas = toNum(achat.montant_ras) || (montantTVA * (tauxRas / 100));
            const netFournisseur = toNum(achat.net_fournisseur) || (montantTTC - montantRas);
            const totalRegle = achatReglements
                .filter((r) => r.statut === "approuve")
                .reduce((sum, r) => sum + toNum(r.montant), 0);
            const resteAPayer = Math.max(montantTTC - totalRegle, 0);

            const fournisseurNom =
                achat.fournisseur_nom ||
                fournisseurs.find((f) => f.id === achat.fournisseur_id)?.nom ||
                "—";

            const designation =
                achat.designation_libre || achat.produit_nom || `Achat #${String(achat.id).padStart(4, "0")}`;

            return {
                achat,
                fournisseurNom,
                designation,
                montantHT,
                montantTTC,
                tauxRas,
                montantRas,
                netFournisseur,
                totalRegle,
                resteAPayer,
                reglements: achatReglements,
                isFullyPaid: montantTTC > 0 && resteAPayer <= 0.01,
                hasPendingReglement: achatReglements.some((r) => r.statut === "en_attente" || r.statut === "pending"),
            };
        });
    }, [achats, reglements, fournisseurs]);

    // Statut au niveau commande (numéro) : Approuvé si toutes les lignes de ce numéro sont approuvées (aligné avec la page détail)
    const statutByNumero = useMemo(() => {
        const map: Record<string, boolean> = {};
        const approved = new Set(["approuve", "valide", "accepte"]);
        for (const a of achats) {
            const num = a.numero ?? `id_${a.id}`;
            if (map[num] === undefined) map[num] = true;
            if (!approved.has(String(a.statut || ""))) map[num] = false;
        }
        return map;
    }, [achats]);

    // Filter
    const filteredRows = useMemo(() => {
        const search = searchTerm.toLowerCase();
        return achatRows.filter((row) => {
            const matchesSearch =
                !search ||
                row.fournisseurNom.toLowerCase().includes(search) ||
                row.designation.toLowerCase().includes(search);

            const matchesFournisseur =
                filterFournisseur === "all" ||
                row.achat.fournisseur_id.toString() === filterFournisseur;

            const matchesStatut =
                filterStatut === "all" ||
                (filterStatut === "solde" && row.isFullyPaid) ||
                (filterStatut === "partiel" && !row.isFullyPaid && row.totalRegle > 0) ||
                (filterStatut === "non_regle" && !row.isFullyPaid && row.totalRegle <= 0);

            const rowDate = row.achat.date_achat ? row.achat.date_achat.split("T")[0] : "";
            const matchesDate =
                (!dateFrom || rowDate >= dateFrom) &&
                (!dateTo || rowDate <= dateTo);

            const matchesEcheance =
                (!echeanceFrom && !echeanceTo) ||
                row.reglements.some((r) => {
                    if (!r.date_echeance) return false;
                    const ech = r.date_echeance.split("T")[0];
                    return (
                        (!echeanceFrom || ech >= echeanceFrom) &&
                        (!echeanceTo || ech <= echeanceTo)
                    );
                });

            const matchesReglementDate =
                (!reglementDateFrom && !reglementDateTo) ||
                (row.reglements.length > 0 && row.reglements.some((r) => {
                    const rd = r.date_reglement.split("T")[0];
                    return (
                        (!reglementDateFrom || rd >= reglementDateFrom) &&
                        (!reglementDateTo || rd <= reglementDateTo)
                    );
                }));

            // If filters are active but there are no reglements, it shouldn't match
            const regDateFilterActive = !!(reglementDateFrom || reglementDateTo);
            if (regDateFilterActive && row.reglements.length === 0) return false;

            const matchesReglementStatut =
                filterReglementStatut === "all" ||
                (row.reglements.length > 0 && row.reglements.some((r) => r.statut === filterReglementStatut));

            const regStatutFilterActive = filterReglementStatut !== "all";
            if (regStatutFilterActive && row.reglements.length === 0) return false;

            return (
                matchesSearch &&
                matchesFournisseur &&
                matchesStatut &&
                matchesDate &&
                matchesEcheance &&
                matchesReglementDate &&
                matchesReglementStatut
            );
        });
    }, [achatRows, searchTerm, filterFournisseur, filterStatut, dateFrom, dateTo, echeanceFrom, echeanceTo, reglementDateFrom, reglementDateTo, filterReglementStatut]);

    const achatIdsMatchingFilters = useMemo(
        () => new Set(filteredRows.map((row) => row.achat.id)),
        [filteredRows]
    );

    const filteredReglementsFlat = useMemo(() => {
        return reglements.filter((r) => {
            if (r.achat_id == null || !achatIdsMatchingFilters.has(r.achat_id)) {
                return false;
            }
            if (filterReglementStatut !== "all" && r.statut !== filterReglementStatut) {
                return false;
            }
            const rd = r.date_reglement ? r.date_reglement.split("T")[0] : "";
            if (reglementDateFrom && rd < reglementDateFrom) return false;
            if (reglementDateTo && rd > reglementDateTo) return false;
            const echActive = !!(echeanceFrom || echeanceTo);
            if (echActive) {
                if (!r.date_echeance) return false;
                const ech = r.date_echeance.split("T")[0];
                if (echeanceFrom && ech < echeanceFrom) return false;
                if (echeanceTo && ech > echeanceTo) return false;
            }
            return true;
        });
    }, [
        reglements,
        achatIdsMatchingFilters,
        filterReglementStatut,
        reglementDateFrom,
        reglementDateTo,
        echeanceFrom,
        echeanceTo,
    ]);

    const paginatedReglementsFlat = useMemo(() => {
        const start = (reglementHistoryPage - 1) * reglementHistoryItemsPerPage;
        return filteredReglementsFlat.slice(start, start + reglementHistoryItemsPerPage);
    }, [filteredReglementsFlat, reglementHistoryPage]);

    const reglementHistoryTotalPages = Math.ceil(
        filteredReglementsFlat.length / reglementHistoryItemsPerPage
    );

    const totalMontantReglementsFlat = useMemo(
        () => filteredReglementsFlat.reduce((sum, r) => sum + toNum(r.montant), 0),
        [filteredReglementsFlat]
    );

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterFournisseur, filterStatut, dateFrom, dateTo, echeanceFrom, echeanceTo, reglementDateFrom, reglementDateTo, filterReglementStatut]);

    useEffect(() => {
        setReglementHistoryPage(1);
    }, [
        searchTerm,
        filterFournisseur,
        filterStatut,
        dateFrom,
        dateTo,
        echeanceFrom,
        echeanceTo,
        reglementDateFrom,
        reglementDateTo,
        filterReglementStatut,
        reglements.length,
    ]);

    const paginatedRows = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredRows.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredRows, currentPage]);

    const totalPages = Math.ceil(filteredRows.length / itemsPerPage);

    // Stats
    const totalRegleGlobal = useMemo(
        () => filteredRows.reduce((sum, r) => sum + r.totalRegle, 0),
        [filteredRows]
    );
    const totalResteGlobal = useMemo(
        () => filteredRows.reduce((sum, r) => sum + r.resteAPayer, 0),
        [filteredRows]
    );
    const totalTTCGlobal = useMemo(
        () => filteredRows.reduce((sum, r) => sum + r.montantTTC, 0),
        [filteredRows]
    );

    const achatsForSelectedFournisseur = useMemo(() => {
        if (!selectedFournisseurId) return [];
        // Ne proposer que les achats qui ne sont pas totalement payés
        return achatRows
            .filter(
                (row) =>
                    row.achat.fournisseur_id.toString() === selectedFournisseurId &&
                    !row.isFullyPaid
            )
            .map((row) => row.achat);
    }, [achatRows, selectedFournisseurId]);

    const handleAddLine = () => {
        setReglementLines((prev) => [
            ...prev,
            {
                mode_paiement: "virement",
                banque_id: "none",
                montant: "",
                date_reglement: new Date().toISOString().split("T")[0],
                date_echeance: new Date().toISOString().split("T")[0],
                commentaire: "",
            },
        ]);
    };

    const handleRemoveLine = (index: number) => {
        setReglementLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
    };

    const computeTotalSaisi = () =>
        reglementLines.reduce((sum, l) => sum + (parseFloat(l.montant || "0") || 0), 0);

    const buildDefaultReglementLine = (montant = "") => ({
        mode_paiement: "virement",
        banque_id: "none",
        montant,
        date_reglement: new Date().toISOString().split("T")[0],
        date_echeance: new Date().toISOString().split("T")[0],
        commentaire: "",
    });

    const openDialog = (achatId?: number) => {
        if (achatId) {
            const achat = achats.find((a) => a.id === achatId);
            if (achat) {
                const row = achatRows.find((r) => r.achat.id === achat.id);
                if (row && row.isFullyPaid) {
                    toast.error("Cette commande est déjà totalement réglée. Aucun nouveau règlement n'est autorisé.");
                    return;
                }
                const montantAuto = row ? Math.max(row.resteAPayer, 0).toFixed(2) : "";
                setSelectedFournisseurId(achat.fournisseur_id.toString());
                setSelectedAchatId(achat.id.toString());
                setAchatSearch(achat.numero || achat.designation_libre || achat.produit_nom || `Achat #${achat.id.toString().padStart(4, "0")}`);
                loadSituation(achat.id.toString());
                setReglementLines([buildDefaultReglementLine(montantAuto)]);
            }
        } else {
            setSelectedFournisseurId("");
            setSelectedAchatId("");
            setAchatSearch("");
            setSituation(null);
            setReglementLines([buildDefaultReglementLine("")]);
        }
        setDialogOpen(true);
    };

    const loadSituation = async (achatId: string) => {
        if (!token || !achatId) {
            setSituation(null);
            return;
        }
        try {
            const res = await fetch(
                `/api/reglements-fournisseurs/situation?achatId=${achatId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.ok) {
                const data = await res.json();
                const resteAPayer = Number(data.reste_a_payer) || 0;
                setSituation({
                    montant_ttc: Number(data.montant_ttc) || 0,
                    total_regle: Number(data.total_regle) || 0,
                    reste_a_payer: resteAPayer,
                });
                setReglementLines((prev) => {
                    if (!prev.length) return [buildDefaultReglementLine(Math.max(resteAPayer, 0).toFixed(2))];
                    return prev.map((line, index) =>
                        index === 0
                            ? { ...line, montant: Math.max(resteAPayer, 0).toFixed(2) }
                            : line
                    );
                });
            } else {
                setSituation(null);
            }
        } catch (e) {
            console.error(e);
            setSituation(null);
        }
    };

    const handleSubmitReglement = async () => {
        if (!token) return;
        if (!selectedFournisseurId || !selectedAchatId) {
            toast.error("Sélectionnez un fournisseur et un achat.");
            return;
        }

        const totalSaisi = computeTotalSaisi();
        if (totalSaisi <= 0) {
            toast.error("Veuillez saisir au moins un montant strictement positif.");
            return;
        }

        if (situation && totalSaisi > situation.reste_a_payer + 0.01) {
            toast.error("Le total saisi dépasse le reste à payer.");
            return;
        }
        if (situation && situation.reste_a_payer <= 0.01) {
            toast.error("Cette commande est déjà totalement réglée. Aucun nouveau règlement n'est autorisé.");
            return;
        }

        setIsSubmitting(true);
        try {
            const lignes = reglementLines
                .map((l) => ({
                    montant: parseFloat(l.montant || "0") || 0,
                    mode_paiement: l.mode_paiement,
                    banque_id: l.banque_id === "none" ? null : l.banque_id,
                    date_reglement: l.date_reglement,
                    date_echeance: l.date_echeance || null,
                    commentaire: l.commentaire || null,
                }))
                .filter((l) => l.montant > 0);

            if (!lignes.length) {
                toast.error("Aucun montant valide saisi.");
                setIsSubmitting(false);
                return;
            }

            const body: any = {
                fournisseur_id: parseInt(selectedFournisseurId),
                achat_id: parseInt(selectedAchatId),
                lignes,
            };

            const res = await fetch("/api/reglements-fournisseurs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(
                    err?.message || "Erreur lors de l'enregistrement du règlement fournisseur"
                );
                setIsSubmitting(false);
                return;
            }

            toast.success("Règlement fournisseur enregistré en attente d'approbation.");
            setDialogOpen(false);
            fetchAll();
        } catch (e) {
            console.error(e);
            toast.error("Erreur de connexion au serveur");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Navigate from FournisseursSituation with state
    useEffect(() => {
        if (hasHandledStateRef.current) return;
        const state = location.state as any;
        if (!state || !state.achatId || !achats.length) return;

        const achat = achats.find((a) => a.id === state.achatId);
        if (!achat) return;

        hasHandledStateRef.current = true;
        setSelectedFournisseurId(achat.fournisseur_id.toString());
        setSelectedAchatId(achat.id.toString());
        setAchatSearch(achat.numero || achat.designation_libre || achat.produit_nom || `Achat #${achat.id.toString().padStart(4, "0")}`);
        setDialogOpen(true);
        loadSituation(achat.id.toString());

        window.history.replaceState({}, document.title);
    }, [location.state, achats]);

    const openDetailDialog = (row: AchatRow) => {
        setDetailAchatRow({
            ...row,
            reglements: sortReglementsFournisseurDesc(row.reglements),
        });
        setDetailDialogOpen(true);
    };

    const factureUrlForAchat = (achat: AchatFournisseur | null | undefined): string | null => {
        const filename = achat?.facture_fournisseur;
        if (!filename) return null;
        return `${apiBaseUrl}/uploads/${encodeURIComponent(filename)}`;
    };

    const syncAchatFactureInState = (achatId: number, filename: string | null) => {
        setAchats((prev) =>
            prev.map((a) => (a.id === achatId ? { ...a, facture_fournisseur: filename } : a))
        );
        setDetailAchatRow((prev) => {
            if (!prev || prev.achat.id !== achatId) return prev;
            return { ...prev, achat: { ...prev.achat, facture_fournisseur: filename } };
        });
    };

    const handleUploadFactureFournisseur = async (file: File) => {
        if (!detailAchatRow?.achat.id) return;
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            toast.error("Veuillez choisir un fichier PDF");
            return;
        }
        const achatId = detailAchatRow.achat.id;
        setIsUploadingFacture(true);
        try {
            const body = new FormData();
            body.append("facture", file);
            const res = await fetch(`/api/achats-fournisseurs/${achatId}/facture`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` },
                body,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Erreur lors du téléversement");
            syncAchatFactureInState(achatId, data?.facture_fournisseur ?? null);
            toast.success("Facture fournisseur téléversée");
        } catch (e: any) {
            toast.error(e?.message || "Erreur lors du téléversement");
        } finally {
            setIsUploadingFacture(false);
        }
    };

    const handleDeleteFactureFournisseur = async () => {
        if (!detailAchatRow?.achat.id || !detailAchatRow.achat.facture_fournisseur) return;
        const achatId = detailAchatRow.achat.id;
        if (!window.confirm("Supprimer cette facture fournisseur ?")) return;
        setIsDeletingFacture(true);
        try {
            const res = await fetch(`/api/achats-fournisseurs/${achatId}/facture`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Erreur lors de la suppression");
            syncAchatFactureInState(achatId, null);
            toast.success("Facture fournisseur supprimée");
        } catch (e: any) {
            toast.error(e?.message || "Erreur lors de la suppression");
        } finally {
            setIsDeletingFacture(false);
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="max-w-md w-full shadow-2xl border-0 bg-card/80 backdrop-blur-sm p-8 text-center animate-in fade-in zoom-in duration-300">
                    <div className="mb-6 flex justify-center">
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                            <Truck className="h-12 w-12 text-red-500" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Accès Restreint</h2>
                    <p className="text-muted-foreground">
                        Seuls les utilisateurs autorisés peuvent consulter les règlements fournisseurs.
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Truck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                        Règlements fournisseurs
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Suivi des paiements fournisseurs par commande d&apos;achat. Cliquez sur &quot;Détail&quot; pour voir les transactions.
                    </p>
                </div>
                <Button
                    className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2"
                    onClick={() => openDialog()}
                >
                    <Banknote className="h-4 w-4" />
                    Nouveau règlement
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400">
                        <Hash className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Total commandes
                        </p>
                        <p className="text-2xl font-bold text-foreground">
                            {filteredRows.length}
                        </p>
                    </div>
                </div>
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                        <DollarSign className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Total réglé
                        </p>
                        <p className="text-2xl font-bold text-emerald-600">
                            {totalRegleGlobal.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                            MAD
                        </p>
                    </div>
                </div>
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400">
                        <Clock className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Reste à payer
                        </p>
                        <p className="text-2xl font-bold text-amber-600">
                            {totalResteGlobal.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                            MAD
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <Card className="border border-border shadow-sm">
                <CardHeader className="pb-3 px-6 pt-6">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-lg">
                            <Filter className="h-5 w-5 text-indigo-600" />
                            <span>Filtres &amp; recherche</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        >
                            {showAdvancedFilters ? "Masquer les filtres avancés" : "Afficher les filtres avancés"}
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-6 pb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher par fournisseur ou désignation..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 rounded-xl"
                            />
                        </div>

                        <Select value={filterFournisseur} onValueChange={setFilterFournisseur}>
                            <SelectTrigger className="h-10 rounded-xl">
                                <SelectValue placeholder="Filtrer par fournisseur" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les fournisseurs</SelectItem>
                                {fournisseurs.map((f) => (
                                    <SelectItem key={f.id} value={f.id.toString()}>
                                        {f.nom}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filterStatut} onValueChange={setFilterStatut}>
                            <SelectTrigger className="h-10 rounded-xl">
                                <SelectValue placeholder="Statut global d'achat" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les statuts d'achat</SelectItem>
                                <SelectItem value="solde">Soldé (Payé)</SelectItem>
                                <SelectItem value="partiel">Paiement partiel</SelectItem>
                                <SelectItem value="non_regle">Non réglé (Impayé)</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filterReglementStatut} onValueChange={setFilterReglementStatut}>
                            <SelectTrigger className="h-10 rounded-xl">
                                <SelectValue placeholder="Statut du règlement" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les statuts de règlement</SelectItem>
                                <SelectItem value="approuve">Approuvé</SelectItem>
                                <SelectItem value="en_attente">En attente / Pending</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {showAdvancedFilters && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-border animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase px-1">Date achat du</label>
                                <Input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="h-9 rounded-lg"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase px-1">Date achat au</label>
                                <Input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="h-9 rounded-lg"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase px-1">Échéance du</label>
                                <Input
                                    type="date"
                                    value={echeanceFrom}
                                    onChange={(e) => setEcheanceFrom(e.target.value)}
                                    className="h-9 rounded-lg"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase px-1">Échéance au</label>
                                <Input
                                    type="date"
                                    value={echeanceTo}
                                    onChange={(e) => setEcheanceTo(e.target.value)}
                                    className="h-9 rounded-lg"
                                />
                            </div>
                            <div className="space-y-1.5 border-l border-border pl-4">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase px-1">Date règlement du</label>
                                <Input
                                    type="date"
                                    value={reglementDateFrom}
                                    onChange={(e) => setReglementDateFrom(e.target.value)}
                                    className="h-9 rounded-lg"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase px-1">Date règlement au</label>
                                <Input
                                    type="date"
                                    value={reglementDateTo}
                                    onChange={(e) => setReglementDateTo(e.target.value)}
                                    className="h-9 rounded-lg"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 rounded-xl text-xs"
                            onClick={() => {
                                setSearchTerm("");
                                setFilterFournisseur("all");
                                setFilterStatut("all");
                                setFilterReglementStatut("all");
                                setDateFrom("");
                                setDateTo("");
                                setReglementDateFrom("");
                                setReglementDateTo("");
                                setEcheanceFrom("");
                                setEcheanceTo("");
                            }}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Réinitialiser
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Historique plat des règlements (même principe que Règlements clients) */}
            {/* Section masquée (retirée de l'UI) */}
            <div style={{ display: "none" }}>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-lg">
                        <span>Historique des règlements</span>
                        <span className="text-xs text-muted-foreground">
                            {filteredReglementsFlat.length} règlement(s) (filtres appliqués)
                        </span>
                    </CardTitle>
                    <CardDescription>
                        Cliquez sur le code pour ouvrir la fiche détail du règlement (comme pour les clients).
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="rounded-b-2xl overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/60 border-b border-border">
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 pl-6">
                                        Code
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 pl-6">
                                        Date
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                        Fournisseur
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                        Achat
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right">
                                        Montant
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                        Mode
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                        Statut
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right pr-6">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell colSpan={8} className="h-12" />
                                        </TableRow>
                                    ))
                                ) : paginatedReglementsFlat.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={8}
                                            className="py-12 text-center text-sm text-muted-foreground"
                                        >
                                            Aucun règlement ne correspond aux filtres (voir les commandes ci-dessous ou
                                            assouplir les critères).
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedReglementsFlat.map((r) => {
                                        const dateObj = new Date(r.date_reglement);
                                        const dateLabel = isNaN(dateObj.getTime())
                                            ? "—"
                                            : dateObj.toLocaleDateString("fr-FR");
                                        const achat = achats.find((a) => a.id === r.achat_id);
                                        const achatLabel =
                                            achat?.numero ||
                                            r.achat_designation ||
                                            achat?.designation_libre ||
                                            achat?.produit_nom ||
                                            (r.achat_id ? `Achat #${r.achat_id}` : "—");
                                        const statutLabel =
                                            r.statut === "approuve"
                                                ? "Approuvé"
                                                : r.statut === "en_attente"
                                                  ? "En attente"
                                                  : r.statut;

                                        return (
                                            <TableRow
                                                key={r.id}
                                                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors text-sm"
                                            >
                                                <TableCell className="pl-6">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            navigate(
                                                                `/dashboard/reglements/details/fournisseur/${r.id}`
                                                            )
                                                        }
                                                        className="font-bold text-indigo-600 hover:underline text-xs"
                                                    >
                                                        {buildReglementCode(
                                                            "fournisseur",
                                                            r.id,
                                                            r.date_reglement
                                                        )}
                                                    </button>
                                                </TableCell>
                                                <TableCell className="pl-6">{dateLabel}</TableCell>
                                                <TableCell>{r.fournisseur_nom || "—"}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        <span className="font-medium text-xs">{achatLabel}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    {toNum(r.montant).toLocaleString("fr-FR", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}{" "}
                                                    MAD
                                                </TableCell>
                                                <TableCell className="capitalize text-xs">
                                                    {r.mode_paiement || "—"}
                                                </TableCell>
                                                <TableCell>
                                                    <span
                                                        className={
                                                            r.statut === "approuve"
                                                                ? "inline-flex items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold"
                                                                : "inline-flex items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold"
                                                        }
                                                    >
                                                        {statutLabel}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                                                aria-label="Actions"
                                                            >
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-52">
                                                            <DropdownMenuItem
                                                                className="cursor-pointer"
                                                                onClick={() =>
                                                                    navigate(
                                                                        `/dashboard/reglements/details/fournisseur/${r.id}`
                                                                    )
                                                                }
                                                            >
                                                                <Eye className="h-4 w-4 mr-2" />
                                                                Voir le détail
                                                            </DropdownMenuItem>
                                                            {r.statut === "approuve" && (
                                                                <>
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer"
                                                                        onClick={async () => {
                                                                            try {
                                                                                await generateRecuPaiementFournisseurPdf(
                                                                                    {
                                                                                        id: r.id,
                                                                                        fournisseur_nom:
                                                                                            r.fournisseur_nom || "—",
                                                                                        achat_designation:
                                                                                            r.achat_designation ||
                                                                                            achatLabel,
                                                                                        montant: toNum(r.montant),
                                                                                        date_reglement:
                                                                                            r.date_reglement,
                                                                                        mode_paiement:
                                                                                            r.mode_paiement,
                                                                                        banque_nom:
                                                                                            r.banque_nom || null,
                                                                                    }
                                                                                );
                                                                            } catch (e) {
                                                                                console.error(e);
                                                                                toast.error(
                                                                                    "Erreur lors de la génération du reçu"
                                                                                );
                                                                            }
                                                                        }}
                                                                    >
                                                                        <Download className="h-4 w-4 mr-2" />
                                                                        Télécharger le reçu
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer"
                                                                        onClick={() => {
                                                                            setEmailTarget(r);
                                                                            setEmailTo("");
                                                                            setEmailSubject(
                                                                                `Reçu de paiement fournisseur - ${r.fournisseur_nom || ""} - #${r.id}`
                                                                            );
                                                                            setEmailMessage("");
                                                                            setEmailDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <Mail className="h-4 w-4 mr-2" />
                                                                        Envoyer par email
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                                {!isLoading && filteredReglementsFlat.length > 0 && (
                                    <TableRow className="bg-emerald-50/30 dark:bg-emerald-900/10 border-t-2 border-emerald-100 dark:border-emerald-900/30 font-bold">
                                        <TableCell
                                            colSpan={4}
                                            className="px-6 py-4 font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider text-xs"
                                        >
                                            Total (filtré)
                                        </TableCell>
                                        <TableCell className="px-4 py-4 font-black text-emerald-700 dark:text-emerald-300 text-base text-right">
                                            {totalMontantReglementsFlat.toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            MAD
                                        </TableCell>
                                        <TableCell colSpan={3} />
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {reglementHistoryTotalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
                            <div className="text-xs text-muted-foreground">
                                Affichage de{" "}
                                <span className="font-medium">
                                    {(reglementHistoryPage - 1) * reglementHistoryItemsPerPage + 1}
                                </span>{" "}
                                à{" "}
                                <span className="font-medium">
                                    {Math.min(
                                        reglementHistoryPage * reglementHistoryItemsPerPage,
                                        filteredReglementsFlat.length
                                    )}
                                </span>{" "}
                                sur{" "}
                                <span className="font-medium">{filteredReglementsFlat.length}</span> règlements
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-lg text-[11px]"
                                    onClick={() =>
                                        setReglementHistoryPage((p) => Math.max(1, p - 1))
                                    }
                                    disabled={reglementHistoryPage === 1}
                                >
                                    Précédent
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: reglementHistoryTotalPages }).map((_, i) => {
                                        const page = i + 1;
                                        if (
                                            page === 1 ||
                                            page === reglementHistoryTotalPages ||
                                            (page >= reglementHistoryPage - 1 &&
                                                page <= reglementHistoryPage + 1)
                                        ) {
                                            return (
                                                <Button
                                                    key={page}
                                                    variant={
                                                        reglementHistoryPage === page ? "default" : "outline"
                                                    }
                                                    size="sm"
                                                    className={`h-8 w-8 rounded-lg p-0 text-[11px] ${
                                                        reglementHistoryPage === page
                                                            ? "bg-emerald-600 hover:bg-emerald-700"
                                                            : ""
                                                    }`}
                                                    onClick={() => setReglementHistoryPage(page)}
                                                >
                                                    {page}
                                                </Button>
                                            );
                                        }
                                        if (
                                            (page === 2 && reglementHistoryPage > 3) ||
                                            (page === reglementHistoryTotalPages - 1 &&
                                                reglementHistoryPage < reglementHistoryTotalPages - 2)
                                        ) {
                                            return (
                                                <span key={page} className="px-1 text-muted-foreground">
                                                    ...
                                                </span>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-lg text-[11px]"
                                    onClick={() =>
                                        setReglementHistoryPage((p) =>
                                            Math.min(reglementHistoryTotalPages, p + 1)
                                        )
                                    }
                                    disabled={reglementHistoryPage === reglementHistoryTotalPages}
                                >
                                    Suivant
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </div>

            {/* Main Table — Achats Fournisseurs */}
            <Card className="border border-border shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-lg">
                        <span>Commandes d&apos;achat fournisseur</span>
                        <span className="text-xs text-muted-foreground">
                            {filteredRows.length} commande(s)
                        </span>
                    </CardTitle>
                    <CardDescription>
                        Chaque ligne représente une commande d&apos;achat. Utilisez le bouton &quot;Détail&quot; pour voir les paiements associés.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="rounded-b-2xl overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/60 border-b border-border">
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 pl-6">
                                        N° Commande
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                        Fournisseur
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                        Désignation
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right">
                                        Montant TTC
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right">
                                        Taux RAS
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right">
                                        Montant RAS
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right">
                                        Net fournisseur
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right">
                                        Total réglé
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right">
                                        Reste à payer
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-center">
                                        Règlement
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-center">
                                        Nb Reglts
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-center">
                                        Statut
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right pr-6">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
	                                {isLoading ? (
	                                    Array.from({ length: 6 }).map((_, i) => (
	                                        <TableRow key={i} className="animate-pulse border-b border-border">
	                                            <TableCell colSpan={13} className="h-12" />
	                                        </TableRow>
	                                    ))
	                                ) : paginatedRows.length === 0 ? (
	                                    <TableRow>
	                                        <TableCell colSpan={13} className="py-12 text-center text-sm text-muted-foreground">
	                                            Aucune commande d&apos;achat fournisseur trouvée.
	                                        </TableCell>
	                                    </TableRow>
	                                ) : (
                                    paginatedRows.map((row) => (
                                        <TableRow
                                            key={row.achat.id}
                                            className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors text-sm"
                                        >
                                            <TableCell className="pl-6">
                                                <button
                                                    type="button"
                                                    onClick={() => openDetailDialog(row)}
                                                    className={cn(
                                                        "font-mono text-[11px] font-bold px-2 py-1 rounded-md transition-colors text-left lowercase",
                                                        row.achat.numero
                                                            ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                                                            : "text-muted-foreground bg-muted hover:bg-muted/80"
                                                    )}
                                                >
                                                    {row.achat.numero || `#${row.achat.id}`}
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2.5">
                                                    <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center shrink-0">
                                                        <Package className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                                                    </div>
                                                    <span className="font-semibold text-foreground">{row.fournisseurNom}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-foreground">{row.designation}</span>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                                {row.montantTTC.toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                MAD
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                                {row.tauxRas.toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                %
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-rose-600 dark:text-rose-400">
                                                {row.montantRas.toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                MAD
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-blue-600 dark:text-blue-400">
                                                {row.netFournisseur.toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                MAD
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                                {row.totalRegle.toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                MAD
                                            </TableCell>
	                                            <TableCell className="text-right font-semibold text-amber-600 dark:text-amber-400">
	                                                {row.resteAPayer.toLocaleString("fr-FR", {
	                                                    minimumFractionDigits: 2,
	                                                    maximumFractionDigits: 2,
	                                                })}{" "}
	                                                MAD
	                                            </TableCell>
	                                            <TableCell className="text-center">
	                                                {row.isFullyPaid ? (
	                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200">
	                                                        <CheckCircle2 className="h-2.5 w-2.5" /> Payé
	                                                    </span>
	                                                ) : (
	                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200">
	                                                        <AlertCircle className="h-2.5 w-2.5" /> Impayé
	                                                    </span>
	                                                )}
	                                            </TableCell>
	                                            <TableCell className="text-center">
	                                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
	                                                    {row.reglements.length}
	                                                </span>
	                                            </TableCell>
                                            <TableCell className="text-center">
                                                {statutByNumero[row.achat.numero ?? `id_${row.achat.id}`] ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 px-2.5 py-0.5 text-[11px] font-semibold">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Approuvé
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2.5 py-0.5 text-[11px] font-semibold">
                                                        <Clock className="h-3 w-3" />
                                                        En attente
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <div className="flex items-center justify-end gap-1">
                                                    {row.achat.facture_fournisseur && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                                            title="Télécharger facture fournisseur"
                                                            onClick={() => {
                                                                const url = factureUrlForAchat(row.achat);
                                                                if (!url) return;
                                                                window.open(url, "_blank", "noopener,noreferrer");
                                                            }}
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuItem onClick={() => openDetailDialog(row)} className="cursor-pointer">
                                                            <Eye className="h-4 w-4" />
                                                            Voir les transactions
                                                        </DropdownMenuItem>
                                                        {!row.isFullyPaid && !row.hasPendingReglement && (
                                                            <DropdownMenuItem onClick={() => openDialog(row.achat.id)} className="cursor-pointer">
                                                                <Banknote className="h-4 w-4" />
                                                                Régler
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                                {!isLoading && filteredRows.length > 0 && (
                                    <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 border-t-2 border-indigo-100 dark:border-indigo-900/30 font-bold">
                                        <TableCell colSpan={3} className="px-6 py-4 text-indigo-700 dark:text-indigo-300 uppercase tracking-wider text-xs">
                                            Total Complet (Filtré)
                                        </TableCell>
                                        <TableCell className="text-right px-4 py-4 text-indigo-700 dark:text-indigo-300">
                                            {totalTTCGlobal.toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            MAD
                                        </TableCell>
                                        <TableCell className="text-right px-4 py-4 text-emerald-600 dark:text-emerald-400">
                                            {totalRegleGlobal.toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            MAD
                                        </TableCell>
                                        <TableCell className="text-right px-4 py-4 text-amber-600 dark:text-amber-400">
                                            {totalResteGlobal.toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            MAD
                                        </TableCell>
	                                        <TableCell colSpan={4} />
	                                    </TableRow>
	                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
                            <div className="text-xs text-muted-foreground">
                                Affichage de <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> à{" "}
                                <span className="font-medium">
                                    {Math.min(currentPage * itemsPerPage, filteredRows.length)}
                                </span>{" "}
                                sur <span className="font-medium">{filteredRows.length}</span> achats
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-lg text-[11px]"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Précédent
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: totalPages }).map((_, i) => {
                                        const page = i + 1;
                                        if (
                                            page === 1 ||
                                            page === totalPages ||
                                            (page >= currentPage - 1 && page <= currentPage + 1)
                                        ) {
                                            return (
                                                <Button
                                                    key={page}
                                                    variant={currentPage === page ? "default" : "outline"}
                                                    size="sm"
                                                    className={`h-8 w-8 rounded-lg p-0 text-[11px] ${currentPage === page ? "bg-emerald-600 hover:bg-emerald-700" : ""
                                                        }`}
                                                    onClick={() => setCurrentPage(page)}
                                                >
                                                    {page}
                                                </Button>
                                            );
                                        } else if (
                                            (page === 2 && currentPage > 3) ||
                                            (page === totalPages - 1 && currentPage < totalPages - 2)
                                        ) {
                                            return <span key={page} className="px-1 text-muted-foreground">...</span>;
                                        }
                                        return null;
                                    })}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-lg text-[11px]"
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Suivant
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ===== DÉTAIL ACHAT — panneau latéral droit ===== */}
            <Sheet open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
                <SheetContent
                    side="right"
                    className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg"
                >
                    {detailAchatRow ? (
                        <>
                            <SheetHeader className="space-y-3 border-b border-border p-6 pb-4 text-left">
                                <SheetTitle className="flex items-center gap-2 pr-8">
                                    <Eye className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                    Détail de l&apos;achat fournisseur
                                </SheetTitle>
                                <SheetDescription>
                                    Synthèse identique pour les commandes payées ou en attente de règlement.
                                </SheetDescription>
                                <div className="space-y-3 pt-2">
                                    {!detailAchatRow.achat.facture_fournisseur ? (
                                        <div>
                                            <Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                Facture fournisseur (PDF)
                                            </Label>
                                            <Input
                                                type="file"
                                                accept="application/pdf,.pdf"
                                                className="h-9"
                                                disabled={isUploadingFacture}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleUploadFactureFournisseur(file);
                                                    e.currentTarget.value = "";
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5"
                                                onClick={() => {
                                                    const url = factureUrlForAchat(detailAchatRow.achat);
                                                    if (!url) return;
                                                    window.open(url, "_blank", "noopener,noreferrer");
                                                }}
                                            >
                                                <Download className="h-3.5 w-3.5" />
                                                Télécharger facture PDF
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                title="Supprimer la facture"
                                                disabled={isDeletingFacture}
                                                onClick={handleDeleteFactureFournisseur}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                    <div>
                                        {detailAchatRow.isFullyPaid ? (
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-tighter text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                <CheckCircle2 className="h-2.5 w-2.5" /> Payé
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-tighter text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
                                                <XCircle className="h-2.5 w-2.5" /> Impayé
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </SheetHeader>

                            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-6">
                                {(() => {
                                    const row = detailAchatRow;
                                    const a = row.achat;
                                    const tvaPct = toNum(a.tva);
                                    const montantTva = row.montantTTC - row.montantHT;
                                    const fmtMoney = (n: number) =>
                                        `${n.toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })} MAD`;
                                    return (
                                        <>
                                            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                    Référence
                                                </h3>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">N° commande</span>
                                                        <span className="text-right font-mono text-xs font-semibold">
                                                            {a.numero || "—"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">ID interne</span>
                                                        <span className="font-mono text-xs font-semibold">#{a.id}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Fournisseur</span>
                                                        <span className="text-right font-medium">{row.fournisseurNom}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Statut document</span>
                                                        <span className="text-right capitalize">
                                                            {a.statut || "en_attente"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                    Ligne d&apos;achat
                                                </h3>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Désignation</span>
                                                        <span className="text-right font-medium">{row.designation}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Gestionnaire</span>
                                                        <span className="text-right text-muted-foreground">
                                                            {a.gestionnaire_nom || "—"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Quantité</span>
                                                        <span className="font-semibold">{toNum(a.quantite)}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Prix unitaire</span>
                                                        <span className="font-semibold">
                                                            {a.prix_unitaire != null
                                                                ? `${toNum(a.prix_unitaire).toLocaleString("fr-FR", {
                                                                      minimumFractionDigits: 2,
                                                                      maximumFractionDigits: 2,
                                                                  })} MAD`
                                                                : "—"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">TVA</span>
                                                        <span>
                                                            {a.tva != null ? `${tvaPct.toFixed(2)} %` : "—"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                    Montants
                                                </h3>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Total</span>
                                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                            {fmtMoney(row.montantHT)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">
                                                            Montant TVA ({tvaPct.toFixed(2)} %)
                                                        </span>
                                                        <span className="font-medium">{fmtMoney(montantTva)}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 border-t border-border pt-2">
                                                        <span className="text-muted-foreground">Total TTC</span>
                                                        <span className="font-bold text-foreground">
                                                            {fmtMoney(row.montantTTC)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">
                                                            Total réglé (approuvé)
                                                        </span>
                                                        <span className="font-semibold">{fmtMoney(row.totalRegle)}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 border-t border-border pt-2">
                                                        <span className="text-muted-foreground">Reste à payer (TTC)</span>
                                                        <span
                                                            className={cn(
                                                                "font-bold",
                                                                row.resteAPayer > 0.01
                                                                    ? "text-amber-600 dark:text-amber-400"
                                                                    : "text-emerald-600 dark:text-emerald-400"
                                                            )}
                                                        >
                                                            {fmtMoney(row.resteAPayer)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                    Règlements liés
                                                </h3>
                                            </div>

                            <div className="overflow-x-auto rounded-xl border border-border">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 border-b border-border">
                                            <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 pl-4">
                                                Code
                                            </TableHead>
                                            <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 pl-4">
                                                Date
                                            </TableHead>
                                            <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right">
                                                Montant
                                            </TableHead>
                                            <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                                Mode
                                            </TableHead>
                                            <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                                Banque
                                            </TableHead>
                                            <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                                Échéance
                                            </TableHead>
                                            <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-center">
                                                Statut
                                            </TableHead>
                                            <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-right pr-4">
                                                Reçu
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {detailAchatRow.reglements.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                                                    Aucun règlement enregistré pour cette commande.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            detailAchatRow.reglements.map((r) => {
                                                const dateObj = new Date(r.date_reglement);
                                                const dateLabel = isNaN(dateObj.getTime())
                                                    ? "—"
                                                    : dateObj.toLocaleDateString("fr-FR");
                                                const echeanceLabel = r.date_echeance
                                                    ? new Date(r.date_echeance).toLocaleDateString("fr-FR")
                                                    : "—";

                                                return (
                                                    <TableRow
                                                        key={r.id}
                                                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors text-sm"
                                                    >
                                                        <TableCell className="pl-4">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setDetailDialogOpen(false);
                                                                    navigate(
                                                                        `/dashboard/reglements/details/fournisseur/${r.id}`
                                                                    );
                                                                }}
                                                                className="font-bold text-indigo-600 hover:underline text-xs"
                                                            >
                                                                {buildReglementCode("fournisseur", r.id, r.date_reglement)}
                                                            </button>
                                                        </TableCell>
                                                        <TableCell className="pl-4">
                                                            <span className="font-semibold text-xs">
                                                                {dateLabel}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right font-semibold">
                                                            {Number(r.montant || 0).toLocaleString("fr-FR", {
                                                                minimumFractionDigits: 2,
                                                                maximumFractionDigits: 2,
                                                            })}{" "}
                                                            MAD
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="capitalize text-xs">{r.mode_paiement}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="text-xs text-muted-foreground">{r.banque_nom || "—"}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="text-xs">{echeanceLabel}</span>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span
                                                                className={
                                                                    r.statut === "approuve"
                                                                        ? "inline-flex items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold"
                                                                        : "inline-flex items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold"
                                                                }
                                                            >
                                                                {r.statut === "approuve" ? "Approuvé" : "En attente"}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right pr-4">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button
                                                                    type="button"
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    disabled={r.statut !== "approuve"}
                                                                    className="h-7 w-7 text-indigo-600 hover:bg-indigo-50 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-indigo-900/20"
                                                                    title={
                                                                        r.statut === "approuve"
                                                                            ? "Télécharger le reçu"
                                                                            : "Disponible une fois le règlement approuvé"
                                                                    }
                                                                    onClick={async () => {
                                                                        if (r.statut !== "approuve") return;
                                                                        try {
                                                                            await generateRecuPaiementFournisseurPdf({
                                                                                id: r.id,
                                                                                fournisseur_nom:
                                                                                    r.fournisseur_nom ||
                                                                                    detailAchatRow.fournisseurNom,
                                                                                achat_designation:
                                                                                    r.achat_designation ||
                                                                                    detailAchatRow.designation,
                                                                                montant: Number(r.montant) || 0,
                                                                                date_reglement: r.date_reglement,
                                                                                mode_paiement: r.mode_paiement,
                                                                                banque_nom: r.banque_nom || null,
                                                                            });
                                                                        } catch (e) {
                                                                            console.error(e);
                                                                            toast.error(
                                                                                "Erreur lors de la génération du reçu fournisseur"
                                                                            );
                                                                        }
                                                                    }}
                                                                >
                                                                    <Download className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    disabled={r.statut !== "approuve"}
                                                                    className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-emerald-900/20"
                                                                    title={
                                                                        r.statut === "approuve"
                                                                            ? "Envoyer le reçu par email"
                                                                            : "Disponible une fois le règlement approuvé"
                                                                    }
                                                                    onClick={() => {
                                                                        if (r.statut !== "approuve") return;
                                                                        setEmailTarget(r);
                                                                        setEmailTo("");
                                                                        setEmailSubject(
                                                                            `Reçu de paiement fournisseur - ${detailAchatRow.fournisseurNom} - #${r.id}`
                                                                        );
                                                                        setEmailMessage("");
                                                                        setEmailDialogOpen(true);
                                                                    }}
                                                                >
                                                                    <Mail className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            <SheetFooter className="mt-0 flex flex-col gap-2 border-t border-border p-4 sm:flex-col">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    disabled={!detailAchatRow.achat.numero}
                                    title={
                                        !detailAchatRow.achat.numero
                                            ? "Aucun numéro de commande pour ouvrir la fiche"
                                            : undefined
                                    }
                                    onClick={() => {
                                        if (!detailAchatRow.achat.numero) return;
                                        setDetailDialogOpen(false);
                                        navigate(`/dashboard/achats/${detailAchatRow.achat.numero}`);
                                    }}
                                >
                                    Fiche commande achat
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    disabled={!detailAchatRow.reglements[0]?.id}
                                    title={
                                        !detailAchatRow.reglements[0]?.id
                                            ? "Aucun règlement à afficher"
                                            : undefined
                                    }
                                    onClick={() => {
                                        const id = detailAchatRow.reglements[0]?.id;
                                        if (!id) return;
                                        setDetailDialogOpen(false);
                                        navigate(`/dashboard/reglements/details/fournisseur/${id}`);
                                    }}
                                >
                                    Détail du règlement
                                </Button>
                                <Button
                                    type="button"
                                    className="w-full"
                                    disabled={
                                        detailAchatRow.isFullyPaid || detailAchatRow.hasPendingReglement
                                    }
                                    title={
                                        detailAchatRow.isFullyPaid
                                            ? "Achat déjà entièrement réglé"
                                            : detailAchatRow.hasPendingReglement
                                              ? "Un règlement est en attente d'approbation"
                                              : undefined
                                    }
                                    onClick={() => {
                                        setDetailDialogOpen(false);
                                        openDialog(detailAchatRow.achat.id);
                                    }}
                                >
                                    <Banknote className="mr-2 h-4 w-4" />
                                    Régler cet achat
                                </Button>
                            </SheetFooter>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>

            {/* ===== NEW REGLEMENT DIALOG ===== */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nouveau règlement fournisseur</DialogTitle>
                        <DialogDescription>
                            Saisissez un ou plusieurs paiements pour ce bon de commande fournisseur. Les montants ne
                            doivent pas dépasser le reste à payer.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Fournisseur</label>
                                <Select
                                    value={selectedFournisseurId}
                                    onValueChange={(value) => {
                                        setSelectedFournisseurId(value);
                                        setSelectedAchatId("");
                                        setSituation(null);
                                    }}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Sélectionner un fournisseur" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fournisseurs.map((f) => (
                                            <SelectItem key={f.id} value={f.id.toString()}>
                                                {f.nom}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Bon de commande</label>
                                <div className="relative">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder={selectedFournisseurId ? "Rechercher un achat..." : "Choisissez d'abord un fournisseur"}
                                            value={achatSearch}
                                            onChange={(e) => {
                                                setAchatSearch(e.target.value);
                                                setShowAchatDropdown(true);
                                            }}
                                            onFocus={() => {
                                                if (selectedFournisseurId) setShowAchatDropdown(true);
                                            }}
                                            onBlur={() => setTimeout(() => setShowAchatDropdown(false), 200)}
                                            disabled={!selectedFournisseurId}
                                            className="pl-9 h-9"
                                        />
                                        {selectedAchatId && (
                                            <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-emerald-500" />
                                        )}
                                    </div>

                                    {showAchatDropdown && selectedFournisseurId && (
                                        <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                            {achatsForSelectedFournisseur
                                                .filter((a) => {
                                                    const search = achatSearch.toLowerCase();
                                                    const label = (a.numero || a.designation_libre || a.produit_nom || `Achat #${a.id}`).toLowerCase();
                                                    return !search || label.includes(search);
                                                })
                                                .map((a) => {
                                                    const label = a.numero || a.designation_libre || a.produit_nom || `Achat #${a.id.toString().padStart(4, "0")}`;
                                                    return (
                                                        <div
                                                            key={a.id}
                                                            onMouseDown={() => {
                                                                setSelectedAchatId(a.id.toString());
                                                                setAchatSearch(label);
                                                                loadSituation(a.id.toString());
                                                                const row = achatRows.find((r) => r.achat.id === a.id);
                                                                setReglementLines([
                                                                    buildDefaultReglementLine(
                                                                        row ? Math.max(row.resteAPayer, 0).toFixed(2) : ""
                                                                    ),
                                                                ]);
                                                                setShowAchatDropdown(false);
                                                            }}
                                                            className="px-4 py-2 hover:bg-muted cursor-pointer text-sm font-medium text-foreground flex items-center justify-between"
                                                        >
                                                            <span>{label}</span>
                                                        </div>
                                                    );
                                                })}
                                            {achatsForSelectedFournisseur.filter((a) => {
                                                const search = achatSearch.toLowerCase();
                                                const label = (a.numero || a.designation_libre || a.produit_nom || `Achat #${a.id}`).toLowerCase();
                                                return !search || label.includes(search);
                                            }).length === 0 && (
                                                    <div className="px-4 py-2 text-sm text-muted-foreground">Aucun résultat</div>
                                                )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {situation && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                                        Montant TTC
                                    </p>
                                    <p className="text-sm font-bold">
                                        {situation.montant_ttc.toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </p>
                                </div>
                                <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                                        Total réglé
                                    </p>
                                    <p className="text-sm font-bold text-emerald-600">
                                        {situation.total_regle.toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </p>
                                </div>
                                <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                                        Reste à payer
                                    </p>
                                    <p className="text-sm font-bold text-amber-600">
                                        {situation.reste_a_payer.toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                    Lignes de règlement
                                </p>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                                    Ajouter une ligne
                                </Button>
                            </div>

                            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                {reglementLines.map((line, index) => (
                                    <div
                                        key={index}
                                        className="space-y-3 border border-border rounded-xl p-3 bg-background/60"
                                    >
                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                            <span className="font-semibold">
                                                Ligne {index + 1}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-red-500 hover:text-red-600"
                                                onClick={() => handleRemoveLine(index)}
                                                disabled={reglementLines.length === 1}
                                            >
                                                ×
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                            <div className="space-y-1 md:col-span-3">
                                                <label className="text-[11px] font-medium text-muted-foreground">
                                                    Montant
                                                </label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={line.montant}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        setReglementLines((prev) =>
                                                            prev.map((l, i) =>
                                                                i === index ? { ...l, montant: value } : l
                                                            )
                                                        );
                                                    }}
                                                />
                                            </div>

                                            <div className="space-y-1 md:col-span-3">
                                                <label className="text-[11px] font-medium text-muted-foreground">
                                                    Mode de paiement
                                                </label>
                                                <Select
                                                    value={line.mode_paiement}
                                                    onValueChange={(value) =>
                                                        setReglementLines((prev) =>
                                                            prev.map((l, i) =>
                                                                i === index ? { ...l, mode_paiement: value } : l
                                                            )
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger className="h-9">
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
                                                                <SelectItem value="virement">Virement</SelectItem>
                                                                <SelectItem value="cheque">Chèque</SelectItem>
                                                                <SelectItem value="espece">Espèce</SelectItem>
                                                                <SelectItem value="effet">Effet</SelectItem>
                                                            </>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1 md:col-span-3">
                                                <label className="text-[11px] font-medium text-muted-foreground">
                                                    Banque
                                                </label>
                                                <Select
                                                    value={line.banque_id}
                                                    onValueChange={(value) =>
                                                        setReglementLines((prev) =>
                                                            prev.map((l, i) =>
                                                                i === index ? { ...l, banque_id: value } : l
                                                            )
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">Aucune</SelectItem>
                                                        {banques.map((b) => (
                                                            <SelectItem key={b.id} value={b.id.toString()}>
                                                                {b.nom_banque}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1 md:col-span-3">
                                                <label className="text-[11px] font-medium text-muted-foreground">
                                                    Date règlement
                                                </label>
                                                <Input
                                                    type="date"
                                                    value={line.date_reglement}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        setReglementLines((prev) =>
                                                            prev.map((l, i) =>
                                                                i === index ? { ...l, date_reglement: value } : l
                                                            )
                                                        );
                                                    }}
                                                />
                                            </div>

                                            <div className="space-y-1 md:col-span-3">
                                                <label className="text-[11px] font-medium text-muted-foreground">
                                                    Date échéance
                                                </label>
                                                <Input
                                                    type="date"
                                                    value={line.date_echeance}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        setReglementLines((prev) =>
                                                            prev.map((l, i) =>
                                                                i === index ? { ...l, date_echeance: value } : l
                                                            )
                                                        );
                                                    }}
                                                />
                                            </div>

                                            <div className="space-y-1 md:col-span-9">
                                                <label className="text-[11px] font-medium text-muted-foreground">
                                                    Commentaire
                                                </label>
                                                <Input
                                                    value={line.commentaire}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        setReglementLines((prev) =>
                                                            prev.map((l, i) =>
                                                                i === index ? { ...l, commentaire: value } : l
                                                            )
                                                        );
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end text-xs text-muted-foreground pt-1">
                                <span>
                                    Total saisi :{" "}
                                    <span className="font-semibold text-foreground">
                                        {computeTotalSaisi().toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDialogOpen(false)}
                            disabled={isSubmitting}
                        >
                            Annuler
                        </Button>
                        <Button type="button" onClick={handleSubmitReglement} disabled={isSubmitting}>
                            {isSubmitting ? "Enregistrement..." : "Enregistrer le règlement"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Email Dialog */}
            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-emerald-600">
                            <Mail className="h-5 w-5" />
                            Envoyer le reçu fournisseur
                        </DialogTitle>
                        <DialogDescription>
                            Le reçu de paiement sera généré en PDF et joint automatiquement à l'email.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="recu-email-to">Email du fournisseur <span className="text-red-500">*</span></Label>
                            <Input
                                id="recu-email-to"
                                type="email"
                                placeholder="fournisseur@exemple.com"
                                value={emailTo}
                                onChange={(e) => setEmailTo(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="recu-email-subject">Sujet</Label>
                            <Input
                                id="recu-email-subject"
                                value={emailSubject}
                                onChange={(e) => setEmailSubject(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="recu-email-message">Message</Label>
                            <Textarea
                                id="recu-email-message"
                                rows={5}
                                value={emailMessage}
                                onChange={(e) => setEmailMessage(e.target.value)}
                                className="resize-none"
                            />
                        </div>
                        <div className="pt-2">
                            <span className="text-sm font-semibold mb-2 block">Pièce jointe</span>
                            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded bg-emerald-100 text-emerald-600">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate">
                                        Recu_Fournisseur_{emailTarget ? emailTarget.id : ""}.pdf
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Reçu de paiement PDF généré automatiquement
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="sm:justify-between">
                        <Button
                            variant="ghost"
                            onClick={() => setEmailDialogOpen(false)}
                            disabled={isSendingEmail}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={async () => {
                                if (!emailTarget || !emailTo || !token) return;
                                setIsSendingEmail(true);
                                try {
                                    const res = await fetch(`/api/reglements-fournisseurs/${emailTarget.id}/send-email`, {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                        },
                                        body: JSON.stringify({
                                            to: emailTo,
                                            subject: emailSubject,
                                            message: emailMessage,
                                        }),
                                    });
                                    if (!res.ok) {
                                        const body = await res.json().catch(() => ({}));
                                        toast.error(body.message || "Erreur lors de l'envoi de l'email");
                                    } else {
                                        toast.success("Email envoyé avec succès");
                                        setEmailDialogOpen(false);
                                    }
                                } catch (e) {
                                    console.error(e);
                                    toast.error("Erreur lors de l'envoi de l'email");
                                } finally {
                                    setIsSendingEmail(false);
                                }
                            }}
                            disabled={isSendingEmail || !emailTo}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        >
                            {isSendingEmail ? (
                                <>
                                    <RefreshCcw className="h-4 w-4 animate-spin" />
                                    Envoi en cours...
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4" />
                                    Envoyer l'email
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
