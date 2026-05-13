import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
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
import { toast } from "sonner";
import {
    Banknote,
    Filter,
    Search,
    CalendarRange,
    DollarSign,
    CheckCircle2,
    Clock,
    FileText,
    Download,
    AlertTriangle,
    Mail,
    Send,
    RefreshCcw,
    Trash2,
    MoreVertical,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { generateRecuPaiementPdf } from "@/components/pdf/RecuPaiementPdf";
import { buildReglementCode } from "@/lib/reglementCode";
import { metalTypeLabelFromProductTypeName } from "@/lib/metalTypeLabel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ReglementClient {
    id: number;
    numero_recu?: number | null;
    client_id: number;
    client_nom?: string;
    facture_id?: number | null;
    numero_facture?: string | null;
    facture_montant_ttc?: number | null;
    commande_id?: number | null;
    numero_commande?: string | null;
    commande_montant_ttc?: number | null;
    date_reglement: string;
    montant: number;
    mode_paiement: string;
    banque_id?: number | null;
    banque_nom?: string | null;
    statut: string;
    commentaire?: string | null;
    created_by?: number;
    created_by_nom?: string | null;
    approved_by?: number | null;
    approved_by_nom?: string | null;
    point_de_vente_id?: number | null;
    point_de_vente_nom?: string | null;
    sous_societe_nom?: string | null;
}

interface SituationReglement {
    type: "facture" | "commande";
    montant_ttc: number;
    total_regle: number;
    reste_a_payer: number;
}

interface Client {
    id: number;
    nom_complet: string;
}

interface Facture {
    id: number;
    numero_facture: string;
    client_id: number;
    client_nom: string;
    montant_ttc: number;
    statut: string;
    commande_id?: number | null;
    mode_paiement?: string;
    banque_id?: number | null;
}

interface Commande {
    id: number;
    numero_commande: string;
    client_id: number;
    client_nom: string;
    montant_ttc: number;
    statut: string;
    facture_id?: number | null;
    mode_paiement?: string;
    banque_id?: number | null;
}

interface Banque {
    id: number;
    nom_banque?: string | null;
}

export default function Reglements() {
    const MAX_REGLEMENT_LINE_AMOUNT = 20000;
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAdmin = role === "admin" || role === "responsable" || role === "directeur";
    const isStrictAdmin = role === "admin" || role === "superadmin";
    const isAuthorized = isAdmin || permissions.includes("reglements_view");

    const token = localStorage.getItem("token");
    const location = useLocation();
    const navigate = useNavigate();

    const [reglements, setReglements] = useState<ReglementClient[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [factures, setFactures] = useState<Facture[]>([]);
    const [commandes, setCommandes] = useState<Commande[]>([]);
    const [banques, setBanques] = useState<Banque[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterClient, setFilterClient] = useState<string>("all");
    const [filterStatut, setFilterStatut] = useState<string>("all");
    const [filterType, setFilterType] = useState<string>("all"); // facture / commande
    const [filterCommandeFacturee, setFilterCommandeFacturee] = useState<string>("all"); // all / facturee / non_facturee
    const [filterPointDeVente, setFilterPointDeVente] = useState<string>("all");
    const [filterSousSociete, setFilterSousSociete] = useState<string>("all");
    const [filterModePaiement, setFilterModePaiement] = useState<string>("all");
    const [filterMonth, setFilterMonth] = useState<string>("all");
    const [filterYear, setFilterYear] = useState<string>("all");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogContext, setDialogContext] = useState<{
        type: "facture" | "commande" | null;
        documentId: number | null;
        numero?: string | null;
        clientNom?: string | null;
    }>({ type: null, documentId: null });
    const [situation, setSituation] = useState<SituationReglement | null>(null);

    const [reglementLines, setReglementLines] = useState<
        { mode_paiement: string; banque_id: string; montant: string; date_reglement: string; commentaire: string; facture_id?: string }[]
    >([
        {
            mode_paiement: "espece",
            banque_id: "none",
            montant: "",
            date_reglement: new Date().toISOString().split("T")[0],
            commentaire: "",
            facture_id: "none",
        },
    ]);

    const [impayeDialogOpen, setImpayeDialogOpen] = useState(false);
    const [impayeTarget, setImpayeTarget] = useState<ReglementClient | null>(null);
    const [impayeComment, setImpayeComment] = useState<string>("");

    const [reapproveDialogOpen, setReapproveDialogOpen] = useState(false);
    const [reapproveTarget, setReapproveTarget] = useState<ReglementClient | null>(null);
    const [reapproveComment, setReapproveComment] = useState<string>("");
    const [reapproveContext, setReapproveContext] = useState<{
        type: "facture" | "commande";
        documentId: number;
    } | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ReglementClient | null>(null);
    const [isDeletingReglement, setIsDeletingReglement] = useState(false);
    const [editTarget, setEditTarget] = useState<ReglementClient | null>(null);

    const [docSearch, setDocSearch] = useState("");
    const [showDocDropdown, setShowDocDropdown] = useState(false);
    const [selectedDocType, setSelectedDocType] = useState<"facture" | "commande">("facture");

    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [emailTarget, setEmailTarget] = useState<ReglementClient | null>(null);
    const [emailTo, setEmailTo] = useState("");
    const [emailSubject, setEmailSubject] = useState("");
    const [emailMessage, setEmailMessage] = useState("");
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const [paymentModes, setPaymentModes] = useState<{ label: string; value: string }[]>([]);

    const commandeToFacture = useMemo(() => {
        const map = new Map<number, Facture>();
        factures.forEach((f) => {
            const cmdId = Number((f as any).commande_id);
            if (Number.isFinite(cmdId) && Number.isFinite(Number(f.id))) {
                map.set(cmdId, f);
            }
        });
        return map;
    }, [factures]);
    const commandeToFactures = useMemo(() => {
        const map = new Map<number, Facture[]>();
        factures.forEach((f) => {
            const cmdId = Number((f as any).commande_id);
            if (!Number.isFinite(cmdId) || !Number.isFinite(Number((f as any).id))) return;
            const current = map.get(cmdId) || [];
            current.push(f);
            map.set(cmdId, current);
        });
        return map;
    }, [factures]);
    const linkedFacturesForDialog = useMemo(() => {
        if (dialogContext.type !== "commande" || !dialogContext.documentId) return [] as Facture[];
        return commandeToFactures.get(Number(dialogContext.documentId)) || [];
    }, [commandeToFactures, dialogContext.documentId, dialogContext.type]);

    const reglementHasLinkedFacture = (r: ReglementClient) =>
        Boolean(
            r.facture_id ||
                (r.commande_id != null && commandeToFacture.has(Number(r.commande_id)))
        );

    const toDateOnly = (value?: string | null) => {
        const d = new Date(String(value || ""));
        if (Number.isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };

    const getFactureLabelFromReglement = (r: ReglementClient) => {
        if (r.numero_facture) return r.numero_facture;
        if (r.facture_id != null) return `Facture #${r.facture_id}`;
        if (r.commande_id != null) {
            const linked = commandeToFacture.get(Number(r.commande_id));
            if (linked?.numero_facture) return linked.numero_facture;
            if (linked?.id != null) return `Facture #${linked.id}`;
        }
        return "Facture associée";
    };

    const cleanReglementCommentForEdit = (raw: unknown) => {
        return String(raw || "")
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line && !/^\[(PAY[EÉ]|IMPAY[EÉ]|REFUS[EÉ])\]/i.test(line))
            .join("\n")
            .trim();
    };

    const locationState = (location.state || {}) as any;

    const getPendingReglementForDocument = (type: "facture" | "commande", id: number) => {
        if (type === "facture") {
            return reglements.find((r) => r.statut === "en_attente" && r.facture_id === id) || null;
        }

        const linkedFactureId =
            factures.find((f: any) => f.commande_id === id)?.id ?? null;

        return (
            reglements.find(
                (r) =>
                    r.statut === "en_attente" &&
                    (r.commande_id === id || (linkedFactureId !== null && r.facture_id === linkedFactureId))
            ) || null
        );
    };

    const loadSituation = async (type: "facture" | "commande", id: number) => {
        if (!token) return null;
        try {
            const queryParam = type === "facture" ? `factureId=${id}` : `commandeId=${id}`;
            const res = await fetch(`/api/reglements-clients/situation?${queryParam}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSituation({
                    type: data.type,
                    montant_ttc: Number(data.montant_ttc) || 0,
                    total_regle: Number(data.total_regle) || 0,
                    reste_a_payer: Number(data.reste_a_payer) || 0,
                });
                return {
                    type: data.type,
                    montant_ttc: Number(data.montant_ttc) || 0,
                    total_regle: Number(data.total_regle) || 0,
                    reste_a_payer: Number(data.reste_a_payer) || 0,
                };
            } else {
                setSituation(null);
                return null;
            }
        } catch (e) {
            console.error(e);
            setSituation(null);
            return null;
        }
    };

    const openReapproveDialog = (
        target: ReglementClient,
        ctx?: {
            type: "facture" | "commande";
            documentId: number;
        }
    ) => {
        setReapproveTarget(target);
        setReapproveComment("");
        setReapproveContext(ctx ?? null);
        setReapproveDialogOpen(true);
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!token) return;
            setIsLoading(true);
            try {
                const [regRes, clientRes, facRes, cmdRes, modesRes, banquesRes] = await Promise.all([
                    fetch("/api/reglements-clients", {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch("/api/clients", {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch("/api/factures", {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch("/api/commandes", {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch("/api/settings/payment-modes", {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch("/api/banque", {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                ]);

                if (regRes.ok) {
                    const data = await regRes.json();
                    setReglements(Array.isArray(data) ? data : []);
                } else {
                    setReglements([]);
                    toast.error("Erreur lors du chargement des règlements");
                }

                if (clientRes.ok) {
                    const data = await clientRes.json();
                    setClients(Array.isArray(data) ? data : []);
                }

                if (facRes.ok) {
                    const data = await facRes.json();
                    setFactures(Array.isArray(data) ? data : []);
                }

                if (cmdRes.ok) {
                    const data = await cmdRes.json();
                    setCommandes(Array.isArray(data) ? data : []);
                }

                if (modesRes.ok) {
                    const data = await modesRes.json();
                    setPaymentModes(Array.isArray(data) ? data : []);
                }
                if (banquesRes.ok) {
                    const data = await banquesRes.json();
                    setBanques(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                console.error(e);
                toast.error("Erreur de connexion au serveur");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [token]);

    const openDialog = async (type: "facture" | "commande", id: number) => {
        const pendingReglement = getPendingReglementForDocument(type, id);
        if (pendingReglement) {
            toast.error(
                "Un règlement en attente existe déjà pour ce document. Veuillez l'approuver ou le traiter avant d'en saisir un nouveau."
            );
            return;
        }

        const currentSituation = await loadSituation(type, id);

        let numero: string | null = null;
        let clientNom: string | null = null;
        let defaultMode: string = "espece";
        let defaultBanque: string = "none";

        if (type === "facture") {
            const local = factures.find(f => f.id === id);
            if (local) {
                numero = local.numero_facture;
                clientNom = local.client_nom || null;
                if (local.mode_paiement) defaultMode = local.mode_paiement;
                if (local.banque_id) defaultBanque = local.banque_id.toString();
            } else {
                try {
                    const res = await fetch(`/api/factures/${id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        const f = await res.json();
                        numero = f.numero_facture || null;
                        clientNom = f.client_nom || null;
                        if (f.mode_paiement) defaultMode = f.mode_paiement;
                        if (f.banque_id) defaultBanque = f.banque_id.toString();
                    }
                } catch {
                    // ignore, we'll keep null labels
                }
            }
        } else {
            const local = commandes.find(c => c.id === id);
            if (local) {
                numero = local.numero_commande;
                clientNom = (local as any).client_nom || null;
                if (local.mode_paiement) defaultMode = local.mode_paiement;
                if (local.banque_id) defaultBanque = local.banque_id.toString();
            } else {
                try {
                    const res = await fetch(`/api/commandes/${id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        const c = await res.json();
                        numero = c.numero_commande || null;
                        clientNom = c.client_nom || null;
                        if (c.mode_paiement) defaultMode = c.mode_paiement;
                        if (c.banque_id) defaultBanque = c.banque_id.toString();
                    }
                } catch {
                    // ignore, we'll keep null labels
                }
            }
        }

        setDialogContext({
            type,
            documentId: id,
            numero,
            clientNom,
        });

        const defaultLineFactureId =
            type === "commande" && (commandeToFactures.get(Number(id)) || []).length === 1
                ? String((commandeToFactures.get(Number(id)) || [])[0].id)
                : "none";

        if (currentSituation && currentSituation.reste_a_payer > 0) {
            setReglementLines([{
                mode_paiement: defaultMode,
                banque_id: defaultBanque,
                montant: currentSituation.reste_a_payer.toString(),
                date_reglement: new Date().toISOString().split("T")[0],
                commentaire: "",
                facture_id: defaultLineFactureId,
            }]);
        } else {
            setReglementLines([{
                mode_paiement: defaultMode,
                banque_id: defaultBanque,
                montant: "",
                date_reglement: new Date().toISOString().split("T")[0],
                commentaire: "",
                facture_id: defaultLineFactureId,
            }]);
        }

        if (type === "facture") {
            if (numero) {
                setDocSearch(numero);
            }
            setSelectedDocType("facture");
        } else {
            if (numero) {
                setDocSearch(numero);
            }
            setSelectedDocType("commande");
        }

        setDialogOpen(true);
    };

    useEffect(() => {
        (async () => {
            // Ouverture automatique seulement si on a explicitement demandé openDialog dans le state
            if (!locationState?.openDialog) return;

            if (locationState?.factureId) {
                const sit = await loadSituation("facture", locationState.factureId);
                // N'ouvrir automatiquement le dialogue que s'il reste à payer.
                if (sit && sit.reste_a_payer > 0.01) {
                    await openDialog("facture", locationState.factureId);
                }
                window.history.replaceState({}, document.title);
            } else if (locationState?.commandeId) {
                const sit = await loadSituation("commande", locationState.commandeId);
                if (sit && sit.reste_a_payer > 0.01) {
                    await openDialog("commande", locationState.commandeId);
                }
                window.history.replaceState({}, document.title);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (locationState?.filterStatut) {
            setFilterStatut(locationState.filterStatut);
            window.history.replaceState({}, document.title);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredReglements = useMemo(() => {
        const search = searchTerm.toLowerCase();
        return reglements.filter((r) => {
            const matchesSearch =
                !search ||
                (r.client_nom && r.client_nom.toLowerCase().includes(search)) ||
                (r.numero_facture && r.numero_facture.toLowerCase().includes(search)) ||
                (r.numero_commande && r.numero_commande.toLowerCase().includes(search));

            const matchesClient =
                filterClient === "all" || r.client_id.toString() === filterClient;

            const matchesStatut =
                filterStatut === "all" || r.statut === filterStatut;

            const hasFacture = reglementHasLinkedFacture(r);
            const hasCommande = !!r.commande_id;

            const matchesType =
                filterType === "all" ||
                (filterType === "facture" && hasFacture) ||
                (filterType === "commande" && hasCommande);

            const matchesCommandeFacturee =
                filterCommandeFacturee === "all" ||
                (filterCommandeFacturee === "facturee" && hasFacture) ||
                (filterCommandeFacturee === "non_facturee" && !hasFacture && hasCommande);

            const matchesPointDeVente =
                filterPointDeVente === "all" ||
                String(r.point_de_vente_nom || "").trim() === filterPointDeVente;

            const matchesSousSociete =
                filterSousSociete === "all" ||
                String(r.sous_societe_nom || "").trim() === filterSousSociete;

            const matchesModePaiement =
                filterModePaiement === "all" ||
                String(r.mode_paiement || "").trim() === filterModePaiement;

            const parsedDate = new Date(r.date_reglement);
            const isValidDate = !Number.isNaN(parsedDate.getTime());
            const recordMonth = isValidDate ? String(parsedDate.getMonth() + 1) : "";
            const recordYear = isValidDate ? String(parsedDate.getFullYear()) : "";
            const recordDateOnly = toDateOnly(r.date_reglement);
            const matchesMonth = filterMonth === "all" || recordMonth === filterMonth;
            const matchesYear = filterYear === "all" || recordYear === filterYear;
            const matchesDateFrom =
                !dateFrom || (recordDateOnly !== null && recordDateOnly >= dateFrom);
            const matchesDateTo =
                !dateTo || (recordDateOnly !== null && recordDateOnly <= dateTo);

            return (
                matchesSearch &&
                matchesClient &&
                matchesStatut &&
                matchesType &&
                matchesCommandeFacturee &&
                matchesPointDeVente &&
                matchesSousSociete &&
                matchesModePaiement &&
                matchesMonth &&
                matchesYear &&
                matchesDateFrom &&
                matchesDateTo
            );
        });
    }, [reglements, searchTerm, filterClient, filterStatut, filterType, filterCommandeFacturee, filterPointDeVente, filterSousSociete, filterModePaiement, filterMonth, filterYear, dateFrom, dateTo, commandeToFacture]);

    const pointDeVenteOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    reglements
                        .map((r) => String(r.point_de_vente_nom || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [reglements]
    );

    const sousSocieteOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    reglements
                        .map((r) => String(r.sous_societe_nom || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [reglements]
    );

    const modePaiementOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    reglements
                        .map((r) => String(r.mode_paiement || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
        [reglements]
    );

    const yearOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    reglements
                        .map((r) => {
                            const d = new Date(r.date_reglement);
                            return Number.isNaN(d.getTime()) ? null : String(d.getFullYear());
                        })
                        .filter((v): v is string => Boolean(v))
                )
            ).sort((a, b) => Number(b) - Number(a)),
        [reglements]
    );

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterClient, filterStatut, filterType, filterCommandeFacturee, filterPointDeVente, filterSousSociete, filterModePaiement, filterMonth, filterYear, dateFrom, dateTo]);

    const paginatedReglements = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredReglements.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredReglements, currentPage]);

    const totalPages = Math.ceil(filteredReglements.length / itemsPerPage);

    const totalMontant = useMemo(
        () => filteredReglements.reduce((sum, r) => sum + (Number(r.montant) || 0), 0),
        [filteredReglements]
    );

    const totalApprouves = useMemo(
        () =>
            filteredReglements
                .filter((r) => r.statut === "approuve")
                .reduce((sum, r) => sum + (Number(r.montant) || 0), 0),
        [filteredReglements]
    );

    const exportToPDF = async () => {
        try {
            const doc = new jsPDF({ orientation: "landscape" });
            const pageWidth = doc.internal.pageSize.getWidth();
            const formatMadAmount = (value: number) => {
                const fixed = (Number(value) || 0).toFixed(2);
                const [intPart, decPart] = fixed.split(".");
                const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
                return `${groupedInt},${decPart}`;
            };

            const loadImgToBase64 = (url: string) =>
                new Promise<string | null>((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.src = url;
                    img.onload = () => {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) {
                            resolve(null);
                            return;
                        }
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL("image/jpeg", 0.7));
                    };
                    img.onerror = () => resolve(null);
                });

            let gestionnaireName = "Gestionnaire";
            let gestionnaireLogoUrl: string | null = null;
            try {
                const localToken = localStorage.getItem("token");
                const response = await fetch("/api/gestionnaires", {
                    headers: localToken ? { Authorization: `Bearer ${localToken}` } : {},
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
                // Keep fallback values for PDF header.
            }

            const logoImgData = gestionnaireLogoUrl ? await loadImgToBase64(gestionnaireLogoUrl) : null;

            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageWidth, 40, "F");
            if (logoImgData) {
                doc.addImage(logoImgData, "JPEG", 14, 8, 20, 20);
            }

            doc.setFontSize(20);
            doc.setTextColor(67, 56, 202);
            doc.setFont("helvetica", "bold");
            doc.text(gestionnaireName, 40, 18);

            doc.setFontSize(12);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text("Liste des Règlements Clients", 40, 24);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(
                `Exporté le : ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
                pageWidth - 14,
                18,
                { align: "right" }
            );
            doc.text(`Total : ${filteredReglements.length} règlement(s)`, pageWidth - 14, 24, { align: "right" });

            const tableData = filteredReglements.map((r) => {
                const dateObj = new Date(r.date_reglement);
                const dateLabel = isNaN(dateObj.getTime()) ? "—" : dateObj.toLocaleDateString("fr-FR");
                const isFacture = reglementHasLinkedFacture(r);
                const docLabel = isFacture
                    ? getFactureLabelFromReglement(r)
                    : (r.numero_commande || `Commande #${r.commande_id}`);
                const statutLabel =
                    r.statut === "approuve"
                        ? "Approuvé"
                        : r.statut === "en_attente"
                          ? "En attente"
                          : r.statut === "impaye"
                            ? "Impayé"
                            : r.statut;
                const montantLabel = `${formatMadAmount(Number(r.montant) || 0)} MAD`;

                return [
                    buildReglementCode("client", r.id, r.date_reglement, r.numero_recu, (r as any).sous_societe_nom, (r as any).numero_facture || (r as any).numero_commande),
                    dateLabel,
                    r.client_nom || "—",
                    r.sous_societe_nom || "—",
                    r.point_de_vente_nom || "—",
                    docLabel,
                    montantLabel,
                    r.mode_paiement || "—",
                    statutLabel,
                    r.created_by_nom || "—",
                ];
            });

            autoTable(doc, {
                startY: 45,
                head: [[
                    "Code",
                    "Date",
                    "Client",
                    "Société",
                    "Point de vente",
                    "Document",
                    "Montant",
                    "Mode",
                    "Statut",
                    "Utilisateur",
                ]],
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
                    1: { halign: "center" },
                    6: { halign: "right", fontStyle: "bold" },
                    8: { halign: "center" },
                },
                margin: { left: 14, right: 14 },
            });

            const totalMontantPdf = filteredReglements.reduce((sum, r) => sum + (Number(r.montant) || 0), 0);
            const totalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 53;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(31, 41, 55);
            doc.text(
                `Total : ${formatMadAmount(totalMontantPdf)} MAD`,
                pageWidth - 14,
                totalY,
                { align: "right" }
            );
            doc.setFont("helvetica", "normal");

            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Page ${i} / ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, {
                    align: "center",
                });
            }

            doc.save(`reglements_clients_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            console.error("Erreur export PDF:", error);
            toast.error("Erreur lors de l'export PDF");
        }
    };

    const handleAddLine = () => {
        setReglementLines((prev) => [
            ...prev,
            {
                mode_paiement: prev[0]?.mode_paiement || "espece",
                banque_id:
                    (editTarget?.banque_id != null
                        ? String(editTarget.banque_id)
                        : prev[0]?.banque_id) || "none",
                montant: "",
                date_reglement: prev[0]?.date_reglement || new Date().toISOString().split("T")[0],
                commentaire: "",
                facture_id:
                    prev[0]?.facture_id ||
                    (linkedFacturesForDialog.length === 1 ? String(linkedFacturesForDialog[0].id) : "none"),
            },
        ]);
    };

    const handleRemoveLine = (index: number) => {
        setReglementLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
    };

    const computeTotalSaisi = () =>
        reglementLines.reduce((sum, l) => sum + (parseFloat(l.montant || "0") || 0), 0);

    const handleSubmitReglement = async () => {
        if (!token || !dialogContext.type || !dialogContext.documentId) return;

        const pendingReglement = getPendingReglementForDocument(dialogContext.type, dialogContext.documentId);
        if (!editTarget && pendingReglement) {
            toast.error(
                "Un règlement en attente existe déjà pour ce document. Veuillez l'approuver ou le traiter avant d'en saisir un nouveau."
            );
            return;
        }

        const totalSaisi = computeTotalSaisi();
        if (totalSaisi <= 0) {
            toast.error("Veuillez saisir au moins un montant strictement positif.");
            return;
        }

        if (!editTarget && situation && totalSaisi > situation.reste_a_payer + 0.01) {
            toast.error("Le total saisi dépasse le reste à payer.");
            return;
        }

        setIsSubmitting(true);
        try {
            const hasLineOverLimit = reglementLines.some((l) => {
                const isEspece = String(l.mode_paiement || "").toLowerCase() === "espece";
                return isEspece && (parseFloat(l.montant || "0") || 0) > MAX_REGLEMENT_LINE_AMOUNT;
            });
            if (hasLineOverLimit) {
                toast.error(
                    `Impossible de dépasser ${MAX_REGLEMENT_LINE_AMOUNT.toLocaleString("fr-FR")} MAD par ligne en mode espèce.`
                );
                setIsSubmitting(false);
                return;
            }

            const lignes = reglementLines
                .map((l) => ({
                    montant: parseFloat(l.montant || "0") || 0,
                    mode_paiement: l.mode_paiement,
                    banque_id: l.banque_id === "none" ? null : l.banque_id,
                    date_reglement: l.date_reglement,
                    commentaire: l.commentaire || null,
                    facture_id:
                        dialogContext.type === "commande"
                            ? l.facture_id && l.facture_id !== "none"
                                ? Number(l.facture_id)
                                : null
                            : null,
                }))
                .filter((l) => l.montant > 0);

            if (dialogContext.type === "commande" && linkedFacturesForDialog.length > 0) {
                const hasMissingFacture = lignes.some((l) => !l.facture_id);
                if (hasMissingFacture) {
                    toast.error("Veuillez sélectionner la facture liée pour chaque ligne de règlement.");
                    setIsSubmitting(false);
                    return;
                }
            }

            if (!lignes.length) {
                toast.error("Aucun montant valide saisi.");
                setIsSubmitting(false);
                return;
            }

            let res: Response;
            if (editTarget) {
                res = await fetch(`/api/reglements-clients/${editTarget.id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ lignes }),
                });
            } else {
                const body: any = { lignes };
                if (dialogContext.type === "facture") {
                    body.facture_id = dialogContext.documentId;
                } else {
                    body.commande_id = dialogContext.documentId;
                }
                res = await fetch("/api/reglements-clients", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(body),
                });
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err?.message || "Erreur lors de l'enregistrement du règlement");
                setIsSubmitting(false);
                return;
            }

            toast.success(editTarget ? "Règlement modifié avec succès." : "Règlement enregistré en attente d'approbation.");
            window.dispatchEvent(new CustomEvent("approvals-updated"));
            setDialogOpen(false);
            setEditTarget(null);

            if (
                !editTarget &&
                locationState?.autoCreateFactureAfterReglement &&
                dialogContext.type === "commande" &&
                dialogContext.documentId
            ) {
                try {
                    const commandeId = Number(dialogContext.documentId);
                    if (Number.isFinite(commandeId) && commandeId > 0) {
                        const commandeRes = await fetch(`/api/commandes/${commandeId}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (commandeRes.ok) {
                            const commandeData = await commandeRes.json();
                            const today = new Date();
                            const dateFacture = today.toISOString().split("T")[0];
                            const dateEcheance = new Date(
                                today.getTime() + 30 * 24 * 60 * 60 * 1000
                            )
                                .toISOString()
                                .split("T")[0];
                            const firstMode =
                                String(lignes[0]?.mode_paiement || "").trim().toLowerCase() || "virement";

                            const factureBody = {
                                date_facture: dateFacture,
                                date_echeance: dateEcheance,
                                client_id: commandeData?.client_id,
                                commande_id: commandeId,
                                devis_id: commandeData?.devis_id || "none",
                                mode_paiement: firstMode,
                                reduction: Number(commandeData?.reduction || 0),
                                statut: "en_attente",
                                items: Array.isArray(commandeData?.items)
                                    ? commandeData.items.map((it: any) => ({
                                        produit_id: it?.produit_id || null,
                                        designation: it?.designation || "",
                                        quantite: Number(it?.quantite) || 0,
                                        prix_unitaire: Number(it?.prix_unitaire) || 0,
                                        tva: Number(it?.tva) || 0,
                                        reduction: Number(it?.reduction) || 0,
                                    }))
                                    : [],
                            };

                            const factureRes = await fetch("/api/factures", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify(factureBody),
                            });

                            if (factureRes.ok) {
                                toast.success("Facture créée automatiquement après saisie du règlement.");
                            } else {
                                const factureErr = await factureRes.json().catch(() => ({}));
                                toast.error(
                                    factureErr?.message ||
                                        "Règlement enregistré, mais la création automatique de facture a échoué."
                                );
                            }
                        } else {
                            toast.error("Règlement enregistré, mais impossible de charger la commande pour créer la facture.");
                        }
                    }
                } catch {
                    toast.error("Règlement enregistré, mais la création automatique de facture a échoué.");
                }
            }

            const refreshed = await fetch("/api/reglements-clients", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (refreshed.ok) {
                const data = await refreshed.json();
                setReglements(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
            toast.error("Erreur de connexion au serveur");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteReglement = async () => {
        if (!token || !deleteTarget) return;
        setIsDeletingReglement(true);
        try {
            const res = await fetch(`/api/reglements-clients/${deleteTarget.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(body?.message || "Impossible de supprimer ce règlement.");
                return;
            }
            setReglements((prev) => prev.filter((x) => x.id !== deleteTarget.id));
            toast.success("Règlement supprimé.");
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
        } catch {
            toast.error("Erreur lors de la suppression du règlement.");
        } finally {
            setIsDeletingReglement(false);
        }
    };

    const openEditDialog = async (r: ReglementClient) => {
        setEditTarget(r);
        setDialogContext({
            type: r.facture_id ? "facture" : "commande",
            documentId: (r.facture_id || r.commande_id || null) as number | null,
            numero: r.numero_facture || r.numero_commande || null,
            clientNom: r.client_nom || null,
        });
        if (r.facture_id) {
            await loadSituation("facture", Number(r.facture_id));
            setSelectedDocType("facture");
            setDocSearch(r.numero_facture || "");
        } else if (r.commande_id) {
            await loadSituation("commande", Number(r.commande_id));
            setSelectedDocType("commande");
            setDocSearch(r.numero_commande || "");
        }
        setReglementLines([
            {
                mode_paiement: String(r.mode_paiement || "espece"),
                banque_id: r.banque_id != null ? String(r.banque_id) : "none",
                montant: String(r.montant ?? ""),
                date_reglement: String(r.date_reglement || "").split("T")[0],
                commentaire: cleanReglementCommentForEdit(r.commentaire),
                facture_id: r.facture_id != null ? String(r.facture_id) : "none",
            },
        ]);
        setDialogOpen(true);
    };

    if (!isAuthorized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="max-w-md w-full shadow-2xl border-0 bg-card/80 backdrop-blur-sm p-8 text-center">
                    <h2 className="text-2xl font-bold text-foreground mb-2">Accès Restreint</h2>
                    <p className="text-muted-foreground">
                        Vous n'êtes pas autorisé à consulter les règlements clients.
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
                        <Banknote className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                        Règlements Clients
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Suivi détaillé des encaissements sur commandes et factures clients.
                    </p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <Banknote className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Nombre de règlements
                            </p>
                            <p className="text-2xl font-bold text-foreground">{filteredReglements.length}</p>
                        </div>
                    </div>
                    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                            <DollarSign className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Montant saisi
                            </p>
                            <p className="text-2xl font-bold text-foreground">
                                {totalMontant.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}{" "}
                                MAD
                            </p>
                        </div>
                    </div>
                    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Montant approuvé
                            </p>
                            <p className="text-2xl font-bold text-foreground">
                                {totalApprouves.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}{" "}
                                MAD
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="outline"
                        className="h-10 rounded-xl text-xs font-semibold flex items-center gap-2"
                        onClick={exportToPDF}
                        disabled={filteredReglements.length === 0}
                    >
                        <Download className="h-4 w-4" />
                        PDF
                    </Button>
                    <Button
                        className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2"
                        onClick={() => {
                            setDialogContext({ type: null, documentId: null, numero: undefined, clientNom: undefined });
                            setSituation(null);
                            setDocSearch("");
                            setSelectedDocType("facture");
                            setDialogOpen(true);
                        }}
                    >
                        <Banknote className="h-4 w-4" />
                        Nouveau règlement
                    </Button>
                </div>
            </div>

            <Card className="border border-border shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Filter className="h-5 w-5 text-muted-foreground" />
                        <span>Filtres & recherche</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">Periode rapide :</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                                const now = new Date();
                                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                                setDateFrom(start.toISOString().split("T")[0]);
                                setDateTo(now.toISOString().split("T")[0]);
                            }}
                        >
                            Ce mois
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                                const now = new Date();
                                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                                const end = new Date(now.getFullYear(), now.getMonth(), 0);
                                setDateFrom(start.toISOString().split("T")[0]);
                                setDateTo(end.toISOString().split("T")[0]);
                            }}
                        >
                            Mois dernier
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                                const now = new Date();
                                setDateFrom(`${now.getFullYear()}-01-01`);
                                setDateTo(now.toISOString().split("T")[0]);
                            }}
                        >
                            Cette annee
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                        <div className="relative md:col-span-2 xl:col-span-3 2xl:col-span-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher par client, facture ou commande..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Client</Label>
                            <Select value={filterClient} onValueChange={setFilterClient}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Tous les clients" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les clients</SelectItem>
                                    {clients.map((c) => (
                                        <SelectItem key={c.id} value={c.id.toString()}>
                                            {c.nom_complet}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Type document</Label>
                            <Select value={filterType} onValueChange={setFilterType}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Type de document" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Commandes & Factures</SelectItem>
                                    <SelectItem value="commande">Commandes</SelectItem>
                                    <SelectItem value="facture">Factures</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Commande</Label>
                            <Select value={filterCommandeFacturee} onValueChange={setFilterCommandeFacturee}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Toutes les commandes" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Toutes les commandes</SelectItem>
                                    <SelectItem value="facturee">Commandes facturées</SelectItem>
                                    <SelectItem value="non_facturee">Commandes non facturées</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Statut</Label>
                            <Select value={filterStatut} onValueChange={setFilterStatut}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Tous les statuts" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les statuts</SelectItem>
                                    <SelectItem value="en_attente">En attente</SelectItem>
                                    <SelectItem value="approuve">Approuvé</SelectItem>
                                    <SelectItem value="impaye">Impayé</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Point de vente</Label>
                            <Select value={filterPointDeVente} onValueChange={setFilterPointDeVente}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Tous les points de vente" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les points de vente</SelectItem>
                                    {pointDeVenteOptions.map((name) => (
                                        <SelectItem key={name} value={name}>
                                            {name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Société</Label>
                            <Select value={filterSousSociete} onValueChange={setFilterSousSociete}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Toutes les sociétés" />
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

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Mode paiement</Label>
                            <Select value={filterModePaiement} onValueChange={setFilterModePaiement}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Tous les modes de paiement" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les modes de paiement</SelectItem>
                                    {modePaiementOptions.map((mode) => (
                                        <SelectItem key={mode} value={mode}>
                                            {mode}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Mois
                            </Label>
                            <Select value={filterMonth} onValueChange={setFilterMonth}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Tous les mois" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les mois</SelectItem>
                                    <SelectItem value="1">Janvier</SelectItem>
                                    <SelectItem value="2">Fevrier</SelectItem>
                                    <SelectItem value="3">Mars</SelectItem>
                                    <SelectItem value="4">Avril</SelectItem>
                                    <SelectItem value="5">Mai</SelectItem>
                                    <SelectItem value="6">Juin</SelectItem>
                                    <SelectItem value="7">Juillet</SelectItem>
                                    <SelectItem value="8">Aout</SelectItem>
                                    <SelectItem value="9">Septembre</SelectItem>
                                    <SelectItem value="10">Octobre</SelectItem>
                                    <SelectItem value="11">Novembre</SelectItem>
                                    <SelectItem value="12">Decembre</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Annee
                            </Label>
                            <Select value={filterYear} onValueChange={setFilterYear}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Toutes les annees" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Toutes les annees</SelectItem>
                                    {yearOptions.map((year) => (
                                        <SelectItem key={year} value={year}>
                                            {year}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Date du
                            </Label>
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="h-10"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Date au
                            </Label>
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="h-10"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-lg">
                        <span>Historique des règlements</span>
                        <span className="text-xs text-muted-foreground">
                            {filteredReglements.length} règlement(s) trouvé(s)
                        </span>
                    </CardTitle>
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
                                        Client
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                        Point de vente
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                        Document
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
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell colSpan={9} className="h-12" />
                                        </TableRow>
                                    ))
                                ) : paginatedReglements.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={9}
                                            className="py-12 text-center text-sm text-muted-foreground"
                                        >
                                            Aucun règlement trouvé avec ces critères.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedReglements.map((r) => {
                                        const dateObj = new Date(r.date_reglement);
                                        const dateLabel = isNaN(dateObj.getTime())
                                            ? "-"
                                            : dateObj.toLocaleDateString("fr-FR");
                                        const linkedFacturesForCommande =
                                            r.commande_id != null
                                                ? (commandeToFactures.get(Number(r.commande_id)) || [])
                                                : [];
                                        const pickFactureByAmount = (() => {
                                            if (!linkedFacturesForCommande.length) return null;
                                            const regMontant = Number(r.montant) || 0;
                                            if (regMontant <= 0) return null;
                                            const matches = linkedFacturesForCommande.filter(
                                                (f: any) => Math.abs((Number(f?.montant_ttc) || 0) - regMontant) <= 0.01
                                            );
                                            return matches.length === 1 ? matches[0] : null;
                                        })();
                                        const directFactureForRow =
                                            (r.facture_id != null
                                                ? factures.find((f: any) => Number(f?.id) === Number(r.facture_id))
                                                : null) ||
                                            (r.numero_facture
                                                ? factures.find(
                                                      (f: any) =>
                                                          String(f?.numero_facture || "").trim() ===
                                                          String(r.numero_facture || "").trim()
                                                  )
                                                : null);
                                        const linkedFactureForRow =
                                            directFactureForRow ||
                                            pickFactureByAmount ||
                                            (r.facture_id != null
                                                ? linkedFacturesForCommande.find((f: any) => Number(f.id) === Number(r.facture_id))
                                                : null) ||
                                            (r.numero_facture
                                                ? linkedFacturesForCommande.find(
                                                      (f: any) =>
                                                          String(f?.numero_facture || "").trim() ===
                                                          String(r.numero_facture || "").trim()
                                                  )
                                                : null) ||
                                            (linkedFacturesForCommande.length === 1 ? linkedFacturesForCommande[0] : null);
                                        const factureCodeForRow =
                                            String(r.numero_facture || "").trim() ||
                                            (r.facture_id != null ? `Facture #${r.facture_id}` : "") ||
                                            (linkedFactureForRow
                                                ? String(linkedFactureForRow.numero_facture || `Facture #${linkedFactureForRow.id}`)
                                                : "");
                                        const docLabel = r.numero_commande || `Commande #${r.commande_id}`;
                                        const docSubLabel = null;
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
                                                    <div className="flex flex-col items-start">
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/dashboard/reglements/details/client/${r.id}`)}
                                                            className="font-bold text-indigo-600 hover:underline"
                                                        >
                                                            {buildReglementCode("client", r.id, r.date_reglement, r.numero_recu, (r as any).sous_societe_nom, (r as any).numero_facture || (r as any).numero_commande)}
                                                        </button>
                                                    </div>
                                                </TableCell>
                                            <TableCell className="pl-6">{dateLabel}</TableCell>
                                                <TableCell>{r.client_nom || "-"}</TableCell>
                                                <TableCell>{r.point_de_vente_nom || "—"}</TableCell>
                                                <TableCell className="flex items-center gap-2">
                                                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-medium">{docLabel}</span>
                                                        {docSubLabel && (
                                                            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Non facturé</span>
                                                        )}
                                                        {factureCodeForRow && (
                                                            <button
                                                                type="button"
                                                                className="mt-1 w-fit text-[10px] rounded-full border px-2 py-0.5 hover:bg-muted/50 text-indigo-700"
                                                                onClick={() => {
                                                                    const factId =
                                                                        (r.facture_id != null ? Number(r.facture_id) : null) ||
                                                                        (linkedFactureForRow ? Number(linkedFactureForRow.id) : null);
                                                                    if (factId) navigate(`/dashboard/factures/${factId}`);
                                                                }}
                                                            >
                                                                {factureCodeForRow}
                                                            </button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    {(Number(r.montant) || 0).toLocaleString("fr-FR", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}{" "}
                                                    MAD
                                                </TableCell>
                                                <TableCell>{r.mode_paiement}</TableCell>
                                                <TableCell>
                                                    <span
                                                        className={
                                                            r.statut === "approuve"
                                                                ? "inline-flex items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold"
                                                                : r.statut === "impaye"
                                                                    ? "inline-flex items-center rounded-full bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300 px-2 py-0.5 text-[11px] font-semibold"
                                                                    : "inline-flex items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold"
                                                        }
                                                    >
                                                        {statutLabel}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-56">
                                                            {r.statut === "approuve" && (
                                                                <>
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer"
                                                                        onClick={async () => {
                                                                            try {
                                                                                const designation = "";
                                                                                const poids = "";
                                                                                let prixTotal = 0;
                                                                                let resteAPayer = 0;
                                                                                const docType = r.facture_id ? "factures" : "commandes";
                                                                                const docId = r.facture_id || r.commande_id;
                                                                                const [docRes, sitRes] = await Promise.all([
                                                                                    fetch(`/api/${docType}/${docId}`, { headers: { Authorization: `Bearer ${token}` } }),
                                                                                    fetch(`/api/reglements-clients/situation?${r.facture_id ? "factureId=" + r.facture_id : "commandeId=" + r.commande_id}`, { headers: { Authorization: `Bearer ${token}` } })
                                                                                ]);
                                                                                let recuItems: { designation: string; type_or_silver?: string; quantite?: number; poids?: string; montant_ht?: number; image_url?: string }[] = [];
                                                                                if (docRes.ok) {
                                                                                    const docData = await docRes.json();
                                                                                    prixTotal = Number(docData.montant_ttc) || 0;
                                                                                    if (docData.items && docData.items.length > 0) {
                                                                                        recuItems = docData.items.map((it: any) => ({
                                                                                            designation: it.designation || "—",
                                                                                            type_or_silver: metalTypeLabelFromProductTypeName(it.product_type_name) ?? undefined,
                                                                                            quantite: Number(it.quantite) || undefined,
                                                                                            poids:
                                                                                                it.grammage != null && it.grammage !== ""
                                                                                                    ? `${it.grammage} G`
                                                                                                    : undefined,
                                                                                            montant_ht: Number(it.montant_ht) || 0,
                                                                                            image_url: it.photo
                                                                                                ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(it.photo)}`
                                                                                                : undefined,
                                                                                        }));
                                                                                    }
                                                                                }
                                                                                if (sitRes.ok) {
                                                                                    const sitData = await sitRes.json();
                                                                                    resteAPayer = Number(sitData.reste_a_payer) || 0;
                                                                                }
                                                                                const initials = (r.client_nom || "CL").split(" ").map(n => n[0]).join("").toUpperCase();
                                                                                const clientCode = `${initials}${r.client_id}GT`;
                                                                                await generateRecuPaiementPdf({
                                                                                    id: r.id,
                                                                                    numero_recu: r.numero_recu ?? null,
                                                                                    client_nom: r.client_nom || "Client",
                                                                                    client_code: clientCode,
                                                                                    document_type: r.facture_id ? "facture" : "commande",
                                                                                    document_numero: r.numero_facture || r.numero_commande || "",
                                                                                    montant: Number(r.montant) || 0,
                                                                                    date_reglement: r.date_reglement,
                                                                                    mode_paiement: r.mode_paiement,
                                                                                    banque_nom: r.banque_nom || null,
                                                                                    items: recuItems.length > 0 ? recuItems : undefined,
                                                                                    designation: recuItems.length === 0 ? designation : undefined,
                                                                                    poids: recuItems.length === 0 ? poids : undefined,
                                                                                    prix_total: prixTotal,
                                                                                    reste_a_payer: resteAPayer
                                                                                });
                                                                            } catch (e: any) {
                                                                                console.error(e);
                                                                                toast.error("Erreur lors de la génération du reçu");
                                                                            }
                                                                        }}
                                                                    >
                                                                        <Download className="h-4 w-4" />
                                                                        Télécharger le reçu
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer"
                                                                        onClick={() => {
                                                                            setEmailTarget(r);
                                                                            setEmailTo("");
                                                                            setEmailSubject(`Reçu de paiement - ${r.numero_facture || r.numero_commande || "#" + r.id}`);
                                                                            setEmailMessage("");
                                                                            setEmailDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <Mail className="h-4 w-4" />
                                                                        Envoyer le reçu par email
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            {r.statut === "approuve" && (
                                                                <DropdownMenuItem
                                                                    variant="destructive"
                                                                    className="cursor-pointer text-red-600 focus:text-red-600"
                                                                    onClick={() => {
                                                                        setImpayeTarget(r);
                                                                        setImpayeComment("");
                                                                        setImpayeDialogOpen(true);
                                                                    }}
                                                                >
                                                                    <AlertTriangle className="h-4 w-4" />
                                                                    Marquer comme impayé
                                                                </DropdownMenuItem>
                                                            )}
                                                            {r.statut === "impaye" && (
                                                                <DropdownMenuItem
                                                                    className="cursor-pointer text-emerald-600 focus:text-emerald-600"
                                                                    onClick={() => openReapproveDialog(r)}
                                                                >
                                                                    <CheckCircle2 className="h-4 w-4" />
                                                                    Remettre approuvé
                                                                </DropdownMenuItem>
                                                            )}
                                                            {isStrictAdmin && (
                                                                <>
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer"
                                                                        onClick={() => openEditDialog(r)}
                                                                    >
                                                                        <FileText className="h-4 w-4" />
                                                                        Modifier
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        variant="destructive"
                                                                        className="cursor-pointer text-red-600 focus:text-red-600"
                                                                        onClick={() => {
                                                                            setDeleteTarget(r);
                                                                            setDeleteDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                        Supprimer
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
                                {!isLoading && filteredReglements.length > 0 && (
                                    <TableRow className="bg-emerald-50/30 dark:bg-emerald-900/10 border-t-2 border-emerald-100 dark:border-emerald-900/30">
                                        <TableCell colSpan={5} className="px-6 py-4 font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider text-xs">
                                            Total Complet (Filtré)
                                        </TableCell>
                                        <TableCell className="px-4 py-4 font-black text-emerald-700 dark:text-emerald-300 text-base text-right">
                                            {totalMontant.toLocaleString("fr-FR", {
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

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
                            <div className="text-xs text-muted-foreground">
                                Affichage de <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> à{" "}
                                <span className="font-medium">
                                    {Math.min(currentPage * itemsPerPage, filteredReglements.length)}
                                </span>{" "}
                                sur <span className="font-medium">{filteredReglements.length}</span> règlements
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-lg"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Précédent
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: totalPages }).map((_, i) => {
                                        const page = i + 1;
                                        // Simple logic to show current, first, last and 1 around current
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
                                                    className={`h-8 w-8 rounded-lg p-0 ${currentPage === page ? "bg-emerald-600 hover:bg-emerald-700" : ""
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
                                    className="h-8 rounded-lg"
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

            <Dialog open={impayeDialogOpen} onOpenChange={setImpayeDialogOpen}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Marquer le règlement comme impayé
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Utilisez ce formulaire pour indiquer qu'un paiement est devenu <span className="font-semibold">impayé</span>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        {impayeTarget && (
                            <div className="rounded-lg bg-muted/60 border border-border px-3 py-2 text-xs">
                                <p className="font-semibold text-foreground">
                                    Client : <span className="text-muted-foreground">{impayeTarget.client_nom || "?"}</span>
                                </p>
                                <p className="text-muted-foreground">
                                    Document :{" "}
                                    <span className="font-medium">
                                        {reglementHasLinkedFacture(impayeTarget)
                                            ? getFactureLabelFromReglement(impayeTarget)
                                            : `${impayeTarget.numero_commande || `Commande #${impayeTarget.commande_id}`} (Non facturé)`}
                                    </span>
                                </p>
                                <p className="text-muted-foreground">
                                    Montant :{" "}
                                    <span className="font-semibold">
                                        {(Number(impayeTarget.montant) || 0).toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </span>
                                </p>
                                <p className="text-muted-foreground">
                                    Mode de paiement : <span className="font-medium">{impayeTarget.mode_paiement}</span>
                                </p>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">
                                Motif de l'impayé (optionnel)
                            </label>
                            <textarea
                                className="w-full min-h-[80px] text-sm rounded-md border border-border bg-background px-2.5 py-2 resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                                placeholder="Ex: Chèque retourné impayé, virement rejeté par la banque..."
                                value={impayeComment}
                                onChange={(e) => setImpayeComment(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter className="mt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setImpayeDialogOpen(false);
                                setImpayeTarget(null);
                                setImpayeComment("");
                            }}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={!impayeTarget}
                            onClick={async () => {
                                if (!impayeTarget || !token) return;
                                try {
                                    const res = await fetch(`/api/reglements-clients/${impayeTarget.id}/impaye`, {
                                        method: "PUT",
                                        headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                        },
                                        body: JSON.stringify({ commentaire: impayeComment || "" }),
                                    });
                                    if (!res.ok) {
                                        const body = await res.json().catch(() => ({}));
                                        toast.error(body.message || "Erreur lors du marquage en impayé");
                                        return;
                                    }
                                    toast.success("Règlement marqué comme impayé");
                                    const refreshed = await fetch("/api/reglements-clients", {
                                        headers: { Authorization: `Bearer ${token}` },
                                    });
                                    if (refreshed.ok) {
                                        const data = await refreshed.json();
                                        setReglements(Array.isArray(data) ? data : []);
                                    }
                                    window.dispatchEvent(new CustomEvent("approvals-updated"));
                                    setImpayeDialogOpen(false);
                                    setImpayeTarget(null);
                                    setImpayeComment("");
                                } catch (e) {
                                    console.error(e);
                                    toast.error("Erreur lors du marquage en impayé");
                                }
                            }}
                        >
                            Confirmer l'impayé
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={reapproveDialogOpen} onOpenChange={setReapproveDialogOpen}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            Remettre le règlement comme payé
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Utilisez ce formulaire pour indiquer que le paiement redevient <span className="font-semibold">payé</span>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 text-sm">
                        {reapproveTarget && (
                            <div className="rounded-lg bg-muted/60 border border-border px-3 py-2 text-xs">
                                <p className="font-semibold text-foreground">
                                    Client : <span className="text-muted-foreground">{reapproveTarget.client_nom || "?"}</span>
                                </p>
                                <p className="text-muted-foreground">
                                    Document :{" "}
                                    <span className="font-medium">
                                        {reglementHasLinkedFacture(reapproveTarget)
                                            ? getFactureLabelFromReglement(reapproveTarget)
                                            : `${reapproveTarget.numero_commande || `Commande #${reapproveTarget.commande_id}`} (Non facturé)`}
                                    </span>
                                </p>
                                <p className="text-muted-foreground">
                                    Montant :{" "}
                                    <span className="font-semibold">
                                        {(Number(reapproveTarget.montant) || 0).toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </span>
                                </p>
                                <p className="text-muted-foreground">
                                    Mode de paiement : <span className="font-medium">{reapproveTarget.mode_paiement}</span>
                                </p>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">Motif du paiement (optionnel)</label>
                            <textarea
                                className="w-full min-h-[80px] text-sm rounded-md border border-border bg-background px-2.5 py-2 resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                                placeholder="Ex: Virement confirmé, chèque encaissé, etc."
                                value={reapproveComment}
                                onChange={(e) => setReapproveComment(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter className="mt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setReapproveDialogOpen(false);
                                setReapproveTarget(null);
                                setReapproveComment("");
                                setReapproveContext(null);
                            }}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={!reapproveTarget}
                            onClick={async () => {
                                if (!reapproveTarget || !token) return;
                                try {
                                    const res = await fetch(`/api/reglements-clients/${reapproveTarget.id}/approve`, {
                                        method: "PUT",
                                        headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                        },
                                        body: JSON.stringify({ commentaire: reapproveComment || "" }),
                                    });
                                    if (!res.ok) {
                                        const body = await res.json().catch(() => ({}));
                                        toast.error(body.message || "Erreur lors du changement de statut");
                                        return;
                                    }

                                    toast.success("Règlement remis en statut approuvé.");

                                    const refreshed = await fetch("/api/reglements-clients", {
                                        headers: { Authorization: `Bearer ${token}` },
                                    });
                                    if (refreshed.ok) {
                                        const data = await refreshed.json();
                                        setReglements(Array.isArray(data) ? data : []);
                                    }

                                    if (reapproveContext) {
                                        await loadSituation(reapproveContext.type, reapproveContext.documentId);
                                    }

                                    window.dispatchEvent(new CustomEvent("approvals-updated"));

                                    setReapproveDialogOpen(false);
                                    setReapproveTarget(null);
                                    setReapproveComment("");
                                    setReapproveContext(null);
                                } catch (e) {
                                    console.error(e);
                                    toast.error("Erreur lors du changement de statut");
                                }
                            }}
                        >
                            Confirmer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setEditTarget(null);
                }}
            >
                <DialogContent className="sm:max-w-2xl w-[90vw] max-h-[90vh] p-0 overflow-hidden rounded-3xl border-none shadow-2xl flex flex-col">
                    <div className="h-1.5 bg-emerald-600" />
                    <DialogHeader className="px-6 pt-4 pb-2 text-center shrink-0">
                        <DialogTitle className="flex flex-col items-center gap-2">
                            <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-2">
                                <Banknote className="h-6 w-6" />
                            </div>
                            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                                {editTarget ? "Modifier un règlement client" : dialogContext.documentId ? "Saisir un règlement" : "Nouveau règlement client"}
                            </span>
                        </DialogTitle>
                        <DialogDescription className="px-1 pt-2 text-sm text-muted-foreground">
                            {editTarget
                                ? "Modifiez le règlement sélectionné et ajoutez autant de lignes que nécessaire."
                                : "Enregistrez un paiement partiel ou total associé à une facture ou une commande."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-4 space-y-5 overflow-y-auto min-h-0 flex-1">
                        {!dialogContext.documentId ? (
                            <div className="space-y-4 bg-muted/30 p-4 rounded-2xl border border-border/50">
                                <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
                                    <button
                                        onClick={() => setSelectedDocType("facture")}
                                        className={`py-1.5 text-xs font-bold rounded-lg transition-all ${selectedDocType === "facture"
                                            ? "bg-white dark:bg-zinc-800 shadow-sm text-emerald-600"
                                            : "text-muted-foreground hover:text-foreground"
                                            }`}
                                    >
                                        Factures
                                    </button>
                                    <button
                                        onClick={() => setSelectedDocType("commande")}
                                        className={`py-1.5 text-xs font-bold rounded-lg transition-all ${selectedDocType === "commande"
                                            ? "bg-white dark:bg-zinc-800 shadow-sm text-emerald-600"
                                            : "text-muted-foreground hover:text-foreground"
                                            }`}
                                    >
                                        Commandes
                                    </button>
                                </div>

                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder={`Rechercher une ${selectedDocType}...`}
                                        value={docSearch}
                                        onChange={(e) => {
                                            setDocSearch(e.target.value);
                                            setShowDocDropdown(true);
                                        }}
                                        onFocus={() => setShowDocDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowDocDropdown(false), 200)}
                                        className="pl-9 h-10 rounded-xl bg-background"
                                    />
                                    {showDocDropdown && (
                                        <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-xl rounded-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                            {(selectedDocType === "facture" ? factures : commandes)
                                                .filter((d: any) => {
                                                    // Filter by search term
                                                    const search = docSearch.toLowerCase();
                                                    const num = (d.numero_facture || d.numero_commande || "").toLowerCase();
                                                    const client = (d.client_nom || "").toLowerCase();
                                                    const matchesSearch = !search || num.includes(search) || client.includes(search);

                                                    // For commandes: only non-invoiced (no facture linked)
                                                    if (selectedDocType === "commande") {
                                                        return matchesSearch && !d.facture_id;
                                                    }

                                                    // For factures: only unpaid (reste_a_payer > 0), same logic as commandes non réglées
                                                    if (selectedDocType === "facture") {
                                                        const reste = Number(d.reste_a_payer) ?? (Number(d.montant_ttc) || 0) - (Number(d.total_regle) || 0);
                                                        return matchesSearch && reste > 0.01;
                                                    }

                                                    return matchesSearch;
                                                })
                                                .map((d: any) => (
                                                    <div
                                                        key={d.id}
                                                        onMouseDown={() => {
                                                            const pendingReglement = getPendingReglementForDocument(selectedDocType, d.id);
                                                            if (pendingReglement) {
                                                                toast.error(
                                                                    "Un règlement en attente existe déjà pour ce document. Veuillez l'approuver ou le traiter avant d'en saisir un nouveau."
                                                                );
                                                                setShowDocDropdown(false);
                                                                return;
                                                            }
                                                            const num = d.numero_facture || d.numero_commande;
                                                            setDocSearch(num);
                                                            setDialogContext({
                                                                type: selectedDocType,
                                                                documentId: d.id,
                                                                numero: num,
                                                                clientNom: d.client_nom,
                                                            });
                                                            loadSituation(selectedDocType, d.id);
                                                            setShowDocDropdown(false);
                                                        }}
                                                        className="px-4 py-2 hover:bg-muted cursor-pointer transition-colors"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-foreground">
                                                                {d.numero_facture || d.numero_commande}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground flex justify-between">
                                                                <span>{d.client_nom}</span>
                                                                <span>{Number(d.montant_ttc).toLocaleString("fr-FR")} MAD</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center text-emerald-600 shadow-sm">
                                        <FileText className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none mb-1">
                                            Document sélectionné
                                        </p>
                                        <p className="text-sm font-bold text-foreground">
                                            {dialogContext.numero}
                                            {dialogContext.type === "commande" &&
                                            !commandeToFacture.has(Number(dialogContext.documentId))
                                                ? " (Non facturé)"
                                                : ""}{" "}
                                            — {dialogContext.clientNom}
                                        </p>
                                    </div>
                                </div>
                                {!editTarget && !locationState?.factureId && !locationState?.commandeId && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setDialogContext({ type: null, documentId: null });
                                            setSituation(null);
                                            setDocSearch("");
                                        }}
                                        className="text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                    >
                                        Modifier
                                    </Button>
                                )}
                            </div>
                        )}

                        {dialogContext.type === "facture" && dialogContext.documentId && (() => {
                            const impayes = reglements.filter(
                                (r) => r.facture_id === dialogContext.documentId && r.statut === "impaye"
                            );
                            if (impayes.length === 0) return null;
                            return (
                                <div className="space-y-2 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                                        Règlement(s) impayé(s) pour cette facture
                                    </p>
                                    {impayes.map((r) => (
                                        <div
                                            key={r.id}
                                            className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-background border border-border"
                                        >
                                            <span className="text-sm text-muted-foreground">
                                                Règlement du {r.date_reglement} — {(Number(r.montant) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD ({r.mode_paiement})
                                            </span>
                                            <Button
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                                                onClick={() =>
                                                    openReapproveDialog(r, {
                                                        type: "facture",
                                                        documentId: dialogContext.documentId as number,
                                                    })
                                                }
                                            >
                                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                                Remettre approuvé
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {situation && (
                            <div className="grid grid-cols-3 gap-3 text-xs">
                                <Card className="p-3 border border-border bg-muted/40">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Total TTC
                                    </p>
                                    <p className="text-sm font-bold text-foreground">
                                        {situation.montant_ttc.toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </p>
                                </Card>
                                <Card className="p-3 border border-border bg-muted/40">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Déjà réglé
                                    </p>
                                    <p className="text-sm font-bold text-emerald-600">
                                        {situation.total_regle.toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </p>
                                </Card>
                                <Card className="p-3 border border-border bg-muted/40">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Reste à payer
                                    </p>
                                    <p className="text-sm font-bold text-amber-600">
                                        {situation.reste_a_payer.toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </p>
                                </Card>
                            </div>
                        )}

                        <div className="space-y-3">
                            {reglementLines.map((l, idx) => (
                                <div
                                    key={idx}
                                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-border rounded-xl p-3 bg-muted/30"
                                >
                                    <div className="space-y-1 md:col-span-2 min-w-0">
                                        <p className="text-[11px] font-semibold text-muted-foreground">
                                            Montant
                                        </p>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={l.montant}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                const parsed = parseFloat(raw || "0") || 0;
                                                const isEspece =
                                                    String(l.mode_paiement || "").toLowerCase() === "espece";
                                                if (isEspece && parsed > MAX_REGLEMENT_LINE_AMOUNT) {
                                                    toast.error(
                                                        `Impossible de dépasser ${MAX_REGLEMENT_LINE_AMOUNT.toLocaleString("fr-FR")} MAD par ligne en mode espèce.`
                                                    );
                                                    return;
                                                }
                                                setReglementLines((prev) =>
                                                    prev.map((p, i) =>
                                                        i === idx
                                                            ? { ...p, montant: raw }
                                                            : p
                                                    )
                                                );
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1 md:col-span-2 min-w-0">
                                        <p className="text-[11px] font-semibold text-muted-foreground">
                                            Mode
                                        </p>
                                        <Select
                                            value={l.mode_paiement}
                                            onValueChange={(val) =>
                                                setReglementLines((prev) =>
                                                    prev.map((p, i) =>
                                                        i === idx
                                                            ? { ...p, mode_paiement: val }
                                                            : p
                                                    )
                                                )
                                            }
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Mode de paiement" />
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
                                                        <SelectItem value="carte">Carte Bancaire (ou TPE)</SelectItem>
                                                        <SelectItem value="effet">Effet</SelectItem>
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1 md:col-span-2 min-w-0">
                                        <p className="text-[11px] font-semibold text-muted-foreground">
                                            Date
                                        </p>
                                        <Input
                                            type="date"
                                            value={l.date_reglement}
                                            onChange={(e) =>
                                                setReglementLines((prev) =>
                                                    prev.map((p, i) =>
                                                        i === idx
                                                            ? {
                                                                ...p,
                                                                date_reglement: e.target.value,
                                                            }
                                                            : p
                                                    )
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="space-y-1 md:col-span-2 min-w-0">
                                        <p className="text-[11px] font-semibold text-muted-foreground">
                                            Banque
                                        </p>
                                        <Select
                                            value={l.banque_id || "none"}
                                            onValueChange={(val) =>
                                                setReglementLines((prev) =>
                                                    prev.map((p, i) =>
                                                        i === idx
                                                            ? { ...p, banque_id: val }
                                                            : p
                                                    )
                                                )
                                            }
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Banque (optionnel)" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Aucune banque</SelectItem>
                                                {banques.map((b) => (
                                                    <SelectItem key={b.id} value={String(b.id)}>
                                                        {String(b.nom_banque || `Banque #${b.id}`)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1 md:col-span-2 min-w-0">
                                        <p className="text-[11px] font-semibold text-muted-foreground">
                                            Facture liée
                                        </p>
                                        {dialogContext.type === "commande" && linkedFacturesForDialog.length > 0 ? (
                                            <Select
                                                value={l.facture_id || "none"}
                                                onValueChange={(val) =>
                                                    setReglementLines((prev) =>
                                                        prev.map((p, i) =>
                                                            i === idx ? { ...p, facture_id: val } : p
                                                        )
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="Choisir une facture" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Choisir...</SelectItem>
                                                    {linkedFacturesForDialog.map((f) => (
                                                        <SelectItem key={f.id} value={String(f.id)}>
                                                            {f.numero_facture || `Facture #${f.id}`}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Input
                                                value={
                                                    dialogContext.type === "facture"
                                                        ? dialogContext.numero || "Facture sélectionnée"
                                                        : "—"
                                                }
                                                readOnly
                                                className="h-9 bg-muted/40"
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-1 md:col-span-2 min-w-0">
                                        <p className="text-[11px] font-semibold text-muted-foreground">
                                            Commentaire
                                        </p>
                                        <div className="flex gap-2">
                                            <Input
                                                value={l.commentaire}
                                                onChange={(e) =>
                                                    setReglementLines((prev) =>
                                                        prev.map((p, i) =>
                                                            i === idx
                                                                ? {
                                                                    ...p,
                                                                    commentaire: e.target.value,
                                                                }
                                                                : p
                                                        )
                                                    )
                                                }
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => handleRemoveLine(idx)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    onClick={handleAddLine}
                                >
                                    + Ajouter une ligne
                                </Button>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
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
                    </div>
                    <DialogFooter className="px-6 pb-4 flex gap-2 shrink-0 border-t border-border/60 bg-card">
                        <Button
                            type="button"
                            variant="ghost"
                            className="flex-1 h-10 rounded-xl text-xs font-semibold"
                            onClick={() => {
                                setDialogOpen(false);
                                setEditTarget(null);
                            }}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white"
                            disabled={isSubmitting}
                            onClick={handleSubmitReglement}
                        >
                            {isSubmitting ? "Enregistrement..." : editTarget ? "Enregistrer les modifications" : "Enregistrer le règlement"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    setDeleteDialogOpen(open);
                    if (!open) setDeleteTarget(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Supprimer le règlement</DialogTitle>
                        <DialogDescription>
                            Vous voulez supprimer ce règlement ?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-sm">
                        <p>
                            <span className="font-semibold">Code:</span>{" "}
                            {deleteTarget
                                ? buildReglementCode("client", deleteTarget.id, deleteTarget.date_reglement, deleteTarget.numero_recu, (deleteTarget as any).sous_societe_nom, (deleteTarget as any).numero_facture || (deleteTarget as any).numero_commande)
                                : "—"}
                        </p>
                        <p>
                            <span className="font-semibold">Montant:</span>{" "}
                            {deleteTarget
                                ? `${(Number(deleteTarget.montant) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`
                                : "—"}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setDeleteDialogOpen(false);
                                setDeleteTarget(null);
                            }}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDeleteReglement}
                            disabled={isDeletingReglement || !deleteTarget}
                        >
                            {isDeletingReglement ? "Suppression..." : "Supprimer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-emerald-600">
                            <Mail className="h-5 w-5" />
                            Envoyer le reçu de paiement
                        </DialogTitle>
                        <DialogDescription>
                            Le reçu sera généré en PDF et joint automatiquement à l'email.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="recu-email-to">Email du destinataire <span className="text-red-500">*</span></Label>
                            <Input
                                id="recu-email-to"
                                type="email"
                                placeholder="client@exemple.com"
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
                                        Recu_{emailTarget ? emailTarget.id : ""}.pdf
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
                                    const res = await fetch(`/api/reglements-clients/${emailTarget.id}/send-email`, {
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
