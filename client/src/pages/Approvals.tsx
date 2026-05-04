import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/common/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
    RefreshCcw, ShieldCheck, FileText, 
    ShoppingCart, Receipt, RotateCcw, Package, MessageSquare, 
    Banknote, Loader2,  Sparkles, Download
} from "lucide-react";
import { Input } from "@/components/common/ui/input";
import { toast } from "sonner";
import { DeleteSvgIcon, ValidateSvgIcon, RejectSvgIcon } from "@/components/icons/actionSvgIcons";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { buildReglementCode } from "@/lib/reglementCode";
import { generateAvoirGrosPdfFromApiRow } from "@/components/pdf/GrosDocumentPdf";

/** new Date("YYYY-MM-DD") = minuit UTC → la date civile locale peut être J-1 ; on parse en calendrier local. */


/**
 * Parse SQL datetime strings like `YYYY-MM-DD HH:mm:ss` as a local calendar date/time.
 * This avoids the browser treating it as UTC and shifting the day.
 */
function parseSqlDateTimeLocalMs(value: unknown): number | null {
    if (value == null) return null;
    const s = String(value).trim();
    // `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DDTHH:mm:ss`
    const m =
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(s);
    if (!m) {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const da = Number(m[3]);
    const hh = m[4] != null ? Number(m[4]) : 0;
    const mm = m[5] != null ? Number(m[5]) : 0;
    const ss = m[6] != null ? Number(m[6]) : 0;
    if (![y, mo, da, hh, mm, ss].every(Number.isFinite)) return null;
    const d = new Date(y, mo, da, hh, mm, ss, 0);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}



function clearDevisApprovalLocalTimers(devisId: number) {
    try {
        localStorage.removeItem(`devisLifetimeStart_${devisId}`);
        localStorage.removeItem(`devisJourRenewed_${devisId}`);
    } catch {
        /* ignore */
    }
}

const ActionButton = ({ 
    onClick, 
    isLoading, 
    type,
    label
}: { 
    onClick: (e: React.MouseEvent) => void; 
    isLoading: boolean;
    type: 'approve' | 'reject';
    label: string;
}) => {
    const isApprove = type === 'approve';
    
    return (
        <motion.button
            whileHover={{ scale: 1.25, rotate: isApprove ? 5 : -5 }}
            whileTap={{ scale: 0.85 }}
            onClick={onClick}
            disabled={isLoading}
            className={cn(
                "relative group flex items-center justify-center p-1.5 rounded-xl transition-all duration-300",
                isApprove 
                    ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" 
                    : "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm"
            )}
            title={label}
        >
            {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                isApprove ? <ValidateSvgIcon className="h-6 w-6 stroke-[2.5]" /> : <RejectSvgIcon className="h-6 w-6 stroke-[2.5]" />
            )}
            
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileHover={{ opacity: 1, scale: 1 }}
                className={cn(
                    "absolute -inset-1 rounded-xl filter blur-md -z-10 transition-opacity duration-300",
                    isApprove ? "bg-emerald-400/25" : "bg-red-400/25"
                )}
            />
        </motion.button>
    );
};

interface Devis {
    id: number;
    numero_devis: string;
    date_devis: string;
    client_nom: string;
    statuts_devis: string;
    user_nom?: string | null;
    reduction?: number;
}

interface Commande {
    id: number;
    numero_commande: string;
    date_commande: string;
    client_nom: string;
    statut: string;
    user_nom?: string | null;
    reduction?: number | null;
}

interface Facture {
    id: number;
    numero_facture: string;
    date_facture: string;
    client_nom: string;
    statut: string;
    user_nom?: string | null;
    reduction?: number | null;
}

interface BonLivraisonApproval {
    id: number;
    numero_bon_livraison: string;
    date_bon_livraison: string;
    commande_id?: number | null;
    numero_commande?: string | null;
    client_nom?: string | null;
    statut: string;
}

const isPendingBlStatus = (status: string | null | undefined) => {
    const s = String(status || "").trim().toLowerCase();
    return s === "en_attente" || s === "en attente" || s === "brouillon";
};

interface DevisGrosApproval {
    id: number;
    numero_devis: string;
    date_devis: string;
    client_nom: string;
    statuts_devis: string;
    user_nom?: string | null;
}

interface CommandeGrosApproval {
    id: number;
    numero_commande: string;
    date_commande: string;
    client_nom: string;
    statut: string;
    user_nom?: string | null;
}

interface FactureGrosApproval {
    id: number;
    numero_facture: string;
    date_facture: string;
    client_nom: string;
    statut: string;
    user_nom?: string | null;
}

interface Avoir {
    id: number;
    numero_avoir: string;
    date_avoir: string;
    client_nom: string;
    statut: string;
    user_nom?: string | null;
}

interface AvoirGrosApproval {
    id: number;
    numero_avoir: string;
    date_avoir: string;
    client_nom: string;
    statut: string;
    user_nom?: string | null;
}

interface InventoryVerification {
    id: number;
    product_id: number;
    product_nom: string;
    stock_systeme: number;
    stock_reel: number;
    ecart: number;
    justification: string | null;
    user_id: number | null;
    user_nom?: string | null;
    user_prenom?: string | null;
    statut: string;
    admin_message: string | null;
    created_at: string;
    updated_at: string;
}

interface AchatFournisseurApproval {
    id: number;
    gestionnaire_nom: string;
    fournisseur_nom: string;
    produit_nom: string;
    quantite: number;
    prix_unitaire: number | null;
    tva: number | null;
    statut: string | null;
    created_by_nom?: string | null;
}

interface ReglementClientApproval {
    id: number;
    numero_recu?: number | null;
    client_id: number;
    client_nom?: string;
    facture_id?: number | null;
    numero_facture?: string | null;
    commande_id?: number | null;
    numero_commande?: string | null;
    date_reglement: string;
    montant: number;
    mode_paiement: string;
    statut: string;
    created_by_nom?: string | null;
}

interface ReglementClientGrosApproval {
    id: number;
    numero_recu?: number | null;
    client_id: number;
    client_nom?: string;
    facture_gros_id?: number | null;
    numero_facture?: string | null;
    commande_gros_id?: number | null;
    numero_commande?: string | null;
    date_reglement: string;
    montant: number;
    mode_paiement: string;
    statut: string;
    created_by_nom?: string | null;
}

interface ReglementFournisseurApproval {
    id: number;
    fournisseur_id: number;
    fournisseur_nom?: string;
    achat_id?: number | null;
    achat_designation?: string | null;
    date_reglement: string;
    montant: number;
    mode_paiement: string;
    statut: string;
    created_by_nom?: string | null;
}

interface RemboursementApproval {
    id: number;
    commande_id: number;
    numero_commande: string;
    client_nom: string;
    montant: number;
    motif: string;
    statut: string;
    created_at: string;
    created_by_prenom?: string;
    created_by_nom?: string;
    commande_statut?: string | null;
    commande_montant_ttc?: number | string | null;
    commande_total_regle?: number | string | null;
    commande_reste_a_payer?: number | string | null;
}

export default function Approvals() {
    const role = (localStorage.getItem("role")?.toLowerCase() || "user") as any;
    const token = localStorage.getItem("token");
    const userPermissions: string[] = JSON.parse(localStorage.getItem("permissions") || "[]");

    const [isLoading, setIsLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
    const [pendingDevis, setPendingDevis] = useState<Devis[]>([]);
    const [pendingCommandes, setPendingCommandes] = useState<Commande[]>([]);
    const [pendingFactures, setPendingFactures] = useState<Facture[]>([]);
    const [pendingBonsLivraison, setPendingBonsLivraison] = useState<BonLivraisonApproval[]>([]);
    const [pendingDevisGros, setPendingDevisGros] = useState<DevisGrosApproval[]>([]);
    const [pendingCommandesGros, setPendingCommandesGros] = useState<CommandeGrosApproval[]>([]);
    const [pendingFacturesGros, setPendingFacturesGros] = useState<FactureGrosApproval[]>([]);
    const [pendingAvoirsGros, setPendingAvoirsGros] = useState<AvoirGrosApproval[]>([]);
    const [pendingAvoirs, setPendingAvoirs] = useState<Avoir[]>([]);
    const [pendingInventory, setPendingInventory] = useState<InventoryVerification[]>([]);
    const [pendingReglementsFournisseurs, setPendingReglementsFournisseurs] = useState<ReglementFournisseurApproval[]>([]);
    const [pendingAchatsFournisseurs, setPendingAchatsFournisseurs] = useState<AchatFournisseurApproval[]>([]);
    const [pendingReglementsClients, setPendingReglementsClients] = useState<ReglementClientApproval[]>([]);
    const [pendingReglementsClientsGros, setPendingReglementsClientsGros] = useState<ReglementClientGrosApproval[]>([]);
    const [pendingRemboursements, setPendingRemboursements] = useState<RemboursementApproval[]>([]);
    const [myApprovalRights, setMyApprovalRights] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<"devis" | "commandes" | "bons_livraison" | "factures" | "gros" | "avoirs" | "inventaire" | "achats_fournisseurs" | "reglements" | "remboursements">("devis");
    const [activeGrosTab, setActiveGrosTab] = useState<"devis_gros" | "commandes_gros" | "factures_gros" | "avoirs_gros" | "reglements_gros">("devis_gros");
    const [inventoryMessageMap, setInventoryMessageMap] = useState<Record<number, string>>({});
    const [inventoryActionLoadingId, setInventoryActionLoadingId] = useState<number | null>(null);
    const [highDiscountDevis, setHighDiscountDevis] = useState<Devis | null>(null);
    const [highDiscountCommande, setHighDiscountCommande] = useState<Commande | null>(null);
    const [highDiscountFacture, setHighDiscountFacture] = useState<Facture | null>(null);

    const location = useLocation();
    const navigate = useNavigate();

    const isAdminOrResponsable = role === "admin" || role === "responsable" || role === "directeur" || role === "superadmin" || userPermissions.includes('approvals_view');
    const [maxDevisDiscount] = useState<number>(() => {
        const stored = localStorage.getItem("maxDevisDiscount");
        const n = stored != null ? Number(stored) : 0;
        return Number.isFinite(n) ? n : 0;
    });
    const [devisLifetimeValue] = useState<number>(() => {
        const stored = localStorage.getItem("devisLifetimeValue");
        const n = stored != null ? Number(stored) : 0;
        return Number.isFinite(n) ? Math.max(0, n) : 0;
    });
    const [devisLifetimeUnit] = useState<"minutes" | "heures" | "jours">(() => {
        const stored = localStorage.getItem("devisLifetimeUnit") as "minutes" | "heures" | "jours" | null;
        return stored || "jours";
    });

    const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
    };

    const renderReductionBadge = (value?: number | null) => {
        const reductionValue = value != null ? Number(value) : NaN;
        if (Number.isNaN(reductionValue) || reductionValue <= 0) {
            return <span className="text-xs text-muted-foreground">—</span>;
        }

        const isHigh =
            (maxDevisDiscount > 0 && reductionValue > maxDevisDiscount) ||
            (maxDevisDiscount <= 0 && reductionValue > 0);

        return (
            <span
                className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black tracking-wide border shadow-sm",
                    isHigh
                        ? "bg-gradient-to-r from-red-500/15 via-red-400/20 to-red-500/15 border-red-300 text-red-700 dark:text-red-300 animate-pulse"
                        : "bg-gradient-to-r from-amber-500/10 via-yellow-400/15 to-amber-500/10 border-amber-300 text-amber-700 dark:text-amber-300"
                )}
                title={isHigh ? `Dépasse la limite configurée (${maxDevisDiscount}%)` : "Réduction appliquée"}
            >
                <Sparkles className={cn("h-3.5 w-3.5", isHigh ? "text-red-500" : "text-amber-500")} />
                {reductionValue.toFixed(2)}%
            </span>
        );
    };

    const fetchAll = async () => {
        setIsLoading(true);
        try {
            // Fetch rights first
            let rights = myApprovalRights;
            if (rights.length === 0 && role !== "superadmin") {
                const rightsRes = await fetch("/api/settings/my-approval-rights", { headers });
                if (rightsRes.ok) {
                    rights = await rightsRes.json();
                    setMyApprovalRights(rights);
                }
            }

            const canApproveEverything = role === "superadmin" || role === "admin";

            const canSeeInventory = canApproveEverything || rights.includes('inventaire');
            const canSeeAchats = canApproveEverything || rights.includes('achats_fournisseurs');
            const canSeeReglements = canApproveEverything || rights.includes('reglements');
            const canSeeRemboursements = canApproveEverything || rights.includes('remboursements');

            const [devisRes, cmdRes, blRes, facRes, devisGrosRes, cmdGrosRes, facGrosRes, avRes, avGrosRes, invRes, achatsRes, regCliRes, regCliGrosRes, regFourRes, rembRes] = await Promise.all([
                (canApproveEverything || rights.includes('devis')) ? fetch("/api/devis", { headers }) : Promise.resolve(null),
                (canApproveEverything || rights.includes('commande')) ? fetch("/api/commandes", { headers }) : Promise.resolve(null),
                (canApproveEverything || rights.includes('commande')) ? fetch("/api/bons-livraison", { headers }) : Promise.resolve(null),
                (canApproveEverything || rights.includes('facture')) ? fetch("/api/factures", { headers }) : Promise.resolve(null),
                (canApproveEverything || rights.includes('devis')) ? fetch("/api/devis-gros", { headers }) : Promise.resolve(null),
                (canApproveEverything || rights.includes('commande')) ? fetch("/api/commandes-gros", { headers }) : Promise.resolve(null),
                (canApproveEverything || rights.includes('facture')) ? fetch("/api/factures-gros", { headers }) : Promise.resolve(null),
                (canApproveEverything || rights.includes('avoir')) ? fetch("/api/avoirs", { headers }) : Promise.resolve(null),
                (canApproveEverything || rights.includes('avoir')) ? fetch("/api/avoirs-gros", { headers }) : Promise.resolve(null),
                canSeeInventory ? fetch("/api/inventory-verifications", { headers }) : Promise.resolve(null),
                canSeeAchats ? fetch("/api/achats-fournisseurs", { headers }) : Promise.resolve(null),
                canSeeReglements ? fetch("/api/reglements-clients", { headers }) : Promise.resolve(null),
                canSeeReglements ? fetch("/api/reglements-clients-gros", { headers }) : Promise.resolve(null),
                canSeeReglements ? fetch("/api/reglements-fournisseurs", { headers }) : Promise.resolve(null),
                canSeeRemboursements ? fetch("/api/remboursements", { headers }) : Promise.resolve(null),
            ]);

            if (devisRes && devisRes.ok) {
                const data: Devis[] = await devisRes.json();
                let filteredDevis = data;
                // Auto-refus des devis expirés si une durée de vie est définie
                if (devisLifetimeValue > 0) {
                    // Cas jours: on peut se baser sur la date du devis (stockée sans heure)
                    if (devisLifetimeUnit === "jours") {
                        const nowMs = Date.now();
                        const oneDayMs = 24 * 60 * 60 * 1000;
                        const lifetimeMs = devisLifetimeValue * oneDayMs;

                        const toExpire = data.filter(d => {
                            if (d.statuts_devis !== "en attente") return false;
                            if (Number((d as any).has_commande) === 1 || Number((d as any).has_facture) === 1) return false;

                            const createdAtGuardMs =
                                d && (d as any).created_at
                                    ? parseSqlDateTimeLocalMs((d as any).created_at)
                                    : null;
                            // Garde-fou : devis fraîchement créé -> jamais auto-refus immédiat.
                            if (createdAtGuardMs != null && nowMs - createdAtGuardMs < lifetimeMs) return false;

                            const key = `devisLifetimeStartDays_${d.id}`;
                            const numero = d.numero_devis || `id:${d.id}`;
                            const raw = localStorage.getItem(key);

                            const renewalRaw = localStorage.getItem(`devisJourRenewed_${d.id}`);
                            const renewalMs = renewalRaw ? Number(renewalRaw) : NaN;

                            let startMs: number;
                            if (!raw) {
                                const createdAtMs =
                                    d && (d as any).created_at
                                        ? parseSqlDateTimeLocalMs((d as any).created_at)
                                        : null;
                                startMs =
                                    Number.isFinite(renewalMs) ? renewalMs : createdAtMs != null ? createdAtMs : nowMs;
                                localStorage.setItem(key, JSON.stringify({ t: startMs, n: numero }));
                                return false;
                            }

                            try {
                                const o = JSON.parse(raw) as { t?: number; n?: string };
                                if (
                                    o &&
                                    typeof o === "object" &&
                                    typeof o.t === "number" &&
                                    o.n === numero
                                ) {
                                    startMs = o.t;
                                } else if (
                                    o &&
                                    typeof o === "object" &&
                                    typeof o.t === "number" &&
                                    o.n !== numero
                                ) {
                                    // Même id, autre numéro : redémarre compteur
                                    const createdAtMs =
                                        d && (d as any).created_at
                                            ? parseSqlDateTimeLocalMs((d as any).created_at)
                                            : null;
                                    startMs =
                                        Number.isFinite(renewalMs) ? renewalMs : createdAtMs != null ? createdAtMs : nowMs;
                                    localStorage.setItem(key, JSON.stringify({ t: startMs, n: numero }));
                                    return false;
                                } else {
                                    throw new Error("invalid shape");
                                }
                            } catch {
                                // Ancien format : redémarrer
                                const createdAtMs =
                                    d && (d as any).created_at
                                        ? parseSqlDateTimeLocalMs((d as any).created_at)
                                        : null;
                                startMs =
                                    Number.isFinite(renewalMs) ? renewalMs : createdAtMs != null ? createdAtMs : nowMs;
                                localStorage.setItem(key, JSON.stringify({ t: startMs, n: numero }));
                                return false;
                            }

                            const createdAtMs =
                                d && (d as any).created_at
                                    ? parseSqlDateTimeLocalMs((d as any).created_at)
                                    : null;
                            if (createdAtMs != null && createdAtMs > startMs) {
                                startMs = createdAtMs;
                                localStorage.setItem(key, JSON.stringify({ t: startMs, n: numero }));
                            }

                            if (Number.isFinite(renewalMs) && renewalMs > startMs) {
                                startMs = renewalMs;
                                localStorage.setItem(key, JSON.stringify({ t: startMs, n: numero }));
                            }

                            const diff = nowMs - startMs;
                            return diff >= lifetimeMs;
                        });

                        if (toExpire.length > 0) {
                            toExpire.forEach(d => {
                                fetch(`/api/devis/${d.id}/reject`, {
                                    method: "PUT",
                                    headers: {
                                        "Content-Type": "application/json",
                                        ...headers,
                                    },
                                })
                                    .then(res => {
                                        if (res.ok) clearDevisApprovalLocalTimers(d.id);
                                    })
                                    .catch(() => {
                                        // On ignore les erreurs ici, l'admin peut toujours gérer manuellement
                                    });
                            });
                            filteredDevis = data.filter(d => !toExpire.some(exp => exp.id === d.id));
                        }
                    } else {
                        // Cas minutes / heures: on se base sur un "start" stocké côté navigateur
                        const nowMs = Date.now();
                        const unitMs =
                            devisLifetimeUnit === "minutes"
                                ? 60 * 1000
                                : 60 * 60 * 1000; // heures
                        const lifetimeMs = devisLifetimeValue * unitMs;

                        const toExpire = data.filter(d => {
                            if (d.statuts_devis !== "en attente") return false;
                            if (Number((d as any).has_commande) === 1 || Number((d as any).has_facture) === 1) return false;

                            const createdAtGuardMs =
                                d && (d as any).created_at
                                    ? parseSqlDateTimeLocalMs((d as any).created_at)
                                    : null;
                            // Garde-fou : devis fraîchement créé -> jamais auto-refus immédiat.
                            if (createdAtGuardMs != null && nowMs - createdAtGuardMs < lifetimeMs) return false;

                            const key = `devisLifetimeStart_${d.id}`;
                            const numero = d.numero_devis || `id:${d.id}`;
                            const raw = localStorage.getItem(key);
                            let startMs: number;
                            if (!raw) {
                                const createdAtMs =
                                    d && (d as any).created_at
                                        ? parseSqlDateTimeLocalMs((d as any).created_at)
                                        : null;
                                const start =
                                    createdAtMs != null ? createdAtMs : nowMs;
                                localStorage.setItem(key, JSON.stringify({ t: start, n: numero }));
                                return false;
                            }
                            try {
                                const o = JSON.parse(raw) as { t?: number; n?: string };
                                if (
                                    o &&
                                    typeof o === "object" &&
                                    typeof o.t === "number" &&
                                    o.n === numero
                                ) {
                                    startMs = o.t;
                                } else if (
                                    o &&
                                    typeof o === "object" &&
                                    typeof o.t === "number" &&
                                    o.n !== numero
                                ) {
                                    // Même id, autre numéro (réutilisation) : redémarrer le compteur
                                    localStorage.setItem(key, JSON.stringify({ t: nowMs, n: numero }));
                                    return false;
                                } else {
                                    throw new Error("invalid shape");
                                }
                            } catch {
                                // Ancien format nombre seul : on repart de maintenant (évite faux refus)
                                localStorage.setItem(key, JSON.stringify({ t: nowMs, n: numero }));
                                return false;
                            }
                            const createdAtMs =
                                d && (d as any).created_at
                                    ? parseSqlDateTimeLocalMs((d as any).created_at)
                                    : null;
                            if (createdAtMs != null && createdAtMs > startMs) {
                                startMs = createdAtMs;
                                localStorage.setItem(key, JSON.stringify({ t: startMs, n: numero }));
                            }
                            const diff = nowMs - startMs;
                            return diff >= lifetimeMs;
                        });

                        if (toExpire.length > 0) {
                            toExpire.forEach(d => {
                                fetch(`/api/devis/${d.id}/reject`, {
                                    method: "PUT",
                                    headers: {
                                        "Content-Type": "application/json",
                                        ...headers,
                                    },
                                })
                                    .then(res => {
                                        if (res.ok) clearDevisApprovalLocalTimers(d.id);
                                    })
                                    .catch(() => {
                                        // On ignore les erreurs ici, l'admin peut toujours gérer manuellement
                                    });
                            });
                            filteredDevis = data.filter(d => !toExpire.some(exp => exp.id === d.id));
                        }
                    }
                }

                setPendingDevis(filteredDevis.filter(d => d.statuts_devis === "en attente"));
            } else {
                setPendingDevis([]);
            }

            if (cmdRes && cmdRes.ok) {
                const data: Commande[] = await cmdRes.json();
                setPendingCommandes(data.filter(c => c.statut === "en_attente"));
            } else {
                setPendingCommandes([]);
            }

            if (blRes && blRes.ok) {
                const data: BonLivraisonApproval[] = await blRes.json();
                setPendingBonsLivraison(data.filter((b) => isPendingBlStatus(b.statut)));
            } else {
                setPendingBonsLivraison([]);
            }

            if (facRes && facRes.ok) {
                const data: Facture[] = await facRes.json();
                // On affiche ici les factures en attente de validation
                setPendingFactures(data.filter(f => f.statut === "en_attente"));
            } else {
                setPendingFactures([]);
            }

            if (devisGrosRes && devisGrosRes.ok) {
                const data: DevisGrosApproval[] = await devisGrosRes.json();
                setPendingDevisGros(data.filter((d) => d.statuts_devis === "en attente"));
            } else {
                setPendingDevisGros([]);
            }

            if (cmdGrosRes && cmdGrosRes.ok) {
                const data: CommandeGrosApproval[] = await cmdGrosRes.json();
                setPendingCommandesGros(data.filter((c) => c.statut === "en_attente"));
            } else {
                setPendingCommandesGros([]);
            }

            if (facGrosRes && facGrosRes.ok) {
                const data: FactureGrosApproval[] = await facGrosRes.json();
                setPendingFacturesGros(data.filter((f) => f.statut === "en_attente"));
            } else {
                setPendingFacturesGros([]);
            }

            if (avRes && avRes.ok) {
                const data: Avoir[] = await avRes.json();
                setPendingAvoirs(data.filter(a => a.statut === "en_attente"));
            } else {
                setPendingAvoirs([]);
            }

            if (avGrosRes && avGrosRes.ok) {
                const data: AvoirGrosApproval[] = await avGrosRes.json();
                setPendingAvoirsGros(data.filter((a) => a.statut === "en_attente"));
            } else {
                setPendingAvoirsGros([]);
            }

            if (invRes && invRes.ok) {
                const data: InventoryVerification[] = await invRes.json();
                setPendingInventory(data);
            } else {
                setPendingInventory([]);
            }

            if (achatsRes && achatsRes.ok) {
                const data: AchatFournisseurApproval[] = await achatsRes.json();
                setPendingAchatsFournisseurs(
                    data.filter((a) => !a.statut || a.statut === "en_attente")
                );
            } else {
                setPendingAchatsFournisseurs([]);
            }

            if (regCliRes && regCliRes.ok) {
                const data: ReglementClientApproval[] = await regCliRes.json();
                setPendingReglementsClients(
                    data.filter((r) => r.statut === "en_attente")
                );
            } else {
                setPendingReglementsClients([]);
            }

            if (regCliGrosRes && regCliGrosRes.ok) {
                const data: ReglementClientGrosApproval[] = await regCliGrosRes.json();
                setPendingReglementsClientsGros(
                    data.filter((r) => r.statut === "en_attente")
                );
            } else {
                setPendingReglementsClientsGros([]);
            }

            if (regFourRes && regFourRes.ok) {
                const data: ReglementFournisseurApproval[] = await regFourRes.json();
                setPendingReglementsFournisseurs(
                    data.filter((r) => r.statut === "en_attente")
                );
            } else {
                setPendingReglementsFournisseurs([]);
            }

            if (rembRes && rembRes.ok) {
                const data: RemboursementApproval[] = await rembRes.json();
                setPendingRemboursements(data.filter((r) => r.statut === "en_attente"));
            } else {
                setPendingRemboursements([]);
            }
        } catch (error) {
            console.error("Error fetching approvals data:", error);
            toast.error("Erreur lors du chargement des éléments à approuver");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!token || !isAdminOrResponsable) return;

        fetchAll();

        const handler = () => {
            fetchAll();
        };
        const focusHandler = () => {
            fetchAll();
        };
        const intervalId = window.setInterval(() => {
            fetchAll();
        }, 10000);

        window.addEventListener("approvals-updated", handler);
        window.addEventListener("focus", focusHandler);
        document.addEventListener("visibilitychange", focusHandler);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("approvals-updated", handler);
            window.removeEventListener("focus", focusHandler);
            document.removeEventListener("visibilitychange", focusHandler);
        };
    }, [token, role, isAdminOrResponsable]);

    // Initialize active tab based on navigation state (coming from details pages)
    useEffect(() => {
        const state = location.state as any;
            if (state?.fromDetails && state?.type) {
                if (["devis", "commandes", "bons_livraison", "factures", "gros", "avoirs", "inventaire", "achats_fournisseurs", "reglements", "remboursements"].includes(state.type)) {
                    setActiveTab(state.type);
                }
            // clear history state so back/refresh doesn't re-force tab
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const handleApprove = async (
        type: "commande" | "bon_livraison" | "facture" | "avoir" | "avoir_gros" | "achat_fournisseur" | "devis_gros" | "commande_gros" | "facture_gros" | "reglement_client_gros",
        id: number
    ) => {
        setActionLoadingId(id);
        
        // Optimistic update
        if (type === "commande") setPendingCommandes(prev => prev.filter(c => c.id !== id));
        else if (type === "bon_livraison") setPendingBonsLivraison(prev => prev.filter(b => b.id !== id));
        else if (type === "facture") setPendingFactures(prev => prev.filter(f => f.id !== id));
        else if (type === "avoir") setPendingAvoirs(prev => prev.filter(a => a.id !== id));
        else if (type === "achat_fournisseur") setPendingAchatsFournisseurs(prev => prev.filter(a => a.id !== id));
        else if (type === "devis_gros") setPendingDevisGros(prev => prev.filter(d => d.id !== id));
        else if (type === "commande_gros") setPendingCommandesGros(prev => prev.filter(c => c.id !== id));
        else if (type === "facture_gros") setPendingFacturesGros(prev => prev.filter(f => f.id !== id));
        else if (type === "avoir_gros") setPendingAvoirsGros(prev => prev.filter(a => a.id !== id));
        else if (type === "reglement_client_gros") setPendingReglementsClientsGros(prev => prev.filter(r => r.id !== id));

        try {
            let url = "";
            if (type === "commande") url = `/api/commandes/${id}/approve`;
            if (type === "bon_livraison") url = `/api/bons-livraison/${id}/approve`;
            if (type === "facture") url = `/api/factures/${id}/approve`;
            if (type === "avoir") url = `/api/avoirs/${id}/approve`;
            if (type === "achat_fournisseur") url = `/api/achats-fournisseurs/${id}/approve`;
            if (type === "devis_gros") url = `/api/devis-gros/${id}/approve`;
            if (type === "commande_gros") url = `/api/commandes-gros/${id}/approve`;
            if (type === "facture_gros") url = `/api/factures-gros/${id}/approve`;
            if (type === "avoir_gros") url = `/api/avoirs-gros/${id}/approve`;
            if (type === "reglement_client_gros") url = `/api/reglements-clients-gros/${id}/approve`;

            const res = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...headers
                }
            });

            if (res.ok) {
                toast.success(type === "facture" ? "Facture validée" : "Validation effectuée");
                window.dispatchEvent(new CustomEvent("approvals-updated"));
            } else {
                fetchAll(); // Restore item on failure
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || "Erreur lors de la validation");
            }
        } catch {
            fetchAll(); // Restore item on error
            toast.error("Erreur serveur");
        } finally {
            setActionLoadingId(null);
        }
    };

    const approveDevis = async (devis: Devis) => {
        setActionLoadingId(devis.id);
        
        // Optimistic update
        setPendingDevis(prev => prev.filter(d => d.id !== devis.id));

        try {
            const res = await fetch(`/api/devis/${devis.id}/approve`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...headers
                }
            });

            if (res.ok) {
                clearDevisApprovalLocalTimers(devis.id);
                toast.success("Devis accepté");
                window.dispatchEvent(new CustomEvent("approvals-updated"));
            } else {
                fetchAll(); // Restore item on failure
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || "Erreur lors de la validation du devis");
            }
        } catch {
            fetchAll(); // Restore item on error
            toast.error("Erreur serveur");
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleApproveDevisClick = (devis: Devis) => {
        const reductionValue = devis.reduction != null ? Number(devis.reduction) : 0;
        const hasHighDiscount =
            !Number.isNaN(reductionValue) &&
            (
                (maxDevisDiscount > 0 && reductionValue > maxDevisDiscount) ||
                (maxDevisDiscount <= 0 && reductionValue > 0)
            );

        if (hasHighDiscount) {
            setHighDiscountDevis(devis);
        } else {
            approveDevis(devis);
        }
    };

    const handleApproveCommandeClick = (commande: Commande) => {
        const reductionValue = commande.reduction != null ? Number(commande.reduction) : 0;
        const hasHighDiscount =
            !Number.isNaN(reductionValue) &&
            (
                (maxDevisDiscount > 0 && reductionValue > maxDevisDiscount) ||
                (maxDevisDiscount <= 0 && reductionValue > 0)
            );

        if (hasHighDiscount) {
            setHighDiscountCommande(commande);
        } else {
            handleApprove("commande", commande.id);
        }
    };

    const handleApproveFactureClick = (facture: Facture) => {
        const reductionValue = facture.reduction != null ? Number(facture.reduction) : 0;
        const hasHighDiscount =
            !Number.isNaN(reductionValue) &&
            (
                (maxDevisDiscount > 0 && reductionValue > maxDevisDiscount) ||
                (maxDevisDiscount <= 0 && reductionValue > 0)
            );

        if (hasHighDiscount) {
            setHighDiscountFacture(facture);
        } else {
            handleApprove("facture", facture.id);
        }
    };

    const handleRejectDevis = async (id: number) => {
        setActionLoadingId(id);
        
        // Optimistic update
        setPendingDevis(prev => prev.filter(d => d.id !== id));

        try {
            const res = await fetch(`/api/devis/${id}/reject`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...headers
                }
            });
            if (res.ok) {
                clearDevisApprovalLocalTimers(id);
                toast.success("Devis rejeté");
                window.dispatchEvent(new CustomEvent("approvals-updated"));
            } else {
                fetchAll();
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || "Erreur lors du rejet du devis");
            }
        } catch {
            fetchAll();
            toast.error("Erreur serveur");
        } finally {
            setActionLoadingId(null);
        }
    };


    const handleReject = async (
        type: "commande" | "bon_livraison" | "facture" | "avoir" | "avoir_gros" | "achat_fournisseur" | "devis_gros" | "commande_gros" | "facture_gros" | "reglement_client_gros",
        id: number
    ) => {
        setActionLoadingId(id);
        
        // Optimistic update
        if (type === "commande") setPendingCommandes(prev => prev.filter(c => c.id !== id));
        else if (type === "bon_livraison") setPendingBonsLivraison(prev => prev.filter(b => b.id !== id));
        else if (type === "facture") setPendingFactures(prev => prev.filter(f => f.id !== id));
        else if (type === "avoir") setPendingAvoirs(prev => prev.filter(a => a.id !== id));
        else if (type === "achat_fournisseur") setPendingAchatsFournisseurs(prev => prev.filter(a => a.id !== id));
        else if (type === "devis_gros") setPendingDevisGros(prev => prev.filter(d => d.id !== id));
        else if (type === "commande_gros") setPendingCommandesGros(prev => prev.filter(c => c.id !== id));
        else if (type === "facture_gros") setPendingFacturesGros(prev => prev.filter(f => f.id !== id));
        else if (type === "avoir_gros") setPendingAvoirsGros(prev => prev.filter(a => a.id !== id));
        else if (type === "reglement_client_gros") setPendingReglementsClientsGros(prev => prev.filter(r => r.id !== id));

        try {
            let url = "";
            if (type === "commande") url = `/api/commandes/${id}/reject`;
            if (type === "bon_livraison") url = `/api/bons-livraison/${id}/reject`;
            if (type === "facture") url = `/api/factures/${id}/reject`;
            if (type === "avoir") url = `/api/avoirs/${id}/reject`;
            if (type === "achat_fournisseur") url = `/api/achats-fournisseurs/${id}/reject`;
            if (type === "devis_gros") url = `/api/devis-gros/${id}/reject`;
            if (type === "commande_gros") url = `/api/commandes-gros/${id}/reject`;
            if (type === "facture_gros") url = `/api/factures-gros/${id}/reject`;
            if (type === "avoir_gros") url = `/api/avoirs-gros/${id}/reject`;
            if (type === "reglement_client_gros") url = `/api/reglements-clients-gros/${id}/reject`;

            const res = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...headers
                }
            });

            if (res.ok) {
                toast.success("Demande rejetée");
                window.dispatchEvent(new CustomEvent("approvals-updated"));
            } else {
                fetchAll(); // Restore data on failure
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || "Erreur lors du rejet");
            }
        } catch {
            fetchAll(); // Restore data on error
            toast.error("Erreur serveur");
        } finally {
            setActionLoadingId(null);
        }
    };

    if (!isAdminOrResponsable) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Card className="max-w-md w-full text-center">
                    <CardHeader>
                        <CardTitle>Accès restreint</CardTitle>
                        <CardDescription>
                            Cette page est réservée aux administrateurs, directeurs et responsables autorisés à valider les opérations.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    const totalPending =
        (pendingDevis?.length || 0) +
        (pendingCommandes?.length || 0) +
        (pendingBonsLivraison?.length || 0) +
        (pendingFactures?.length || 0) +
        (pendingDevisGros?.length || 0) +
        (pendingCommandesGros?.length || 0) +
        (pendingFacturesGros?.length || 0) +
        (pendingAvoirs?.length || 0) +
        (pendingInventory?.length || 0) +
        (pendingAchatsFournisseurs?.length || 0) +
        (pendingReglementsClients?.length || 0) +
        (pendingReglementsClientsGros?.length || 0) +
        (pendingReglementsFournisseurs?.length || 0) +
        (pendingRemboursements?.length || 0);

    const handleInventoryUpdate = async (id: number, payload: { admin_message?: string; statut?: string }) => {
        setInventoryActionLoadingId(id);
        try {
            const res = await fetch(`/api/inventory-verifications/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                toast.success(payload.statut === "verifie" ? "Vérification marquée comme traitée." : payload.statut === "a_revoir" ? "Marqué à revoir." : "Message enregistré.");
                setPendingInventory(prev => prev.filter(v => v.id !== id));
                setInventoryMessageMap(prev => { const next = { ...prev }; delete next[id]; return next; });
                fetchAll();
                window.dispatchEvent(new CustomEvent("approvals-updated"));
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || "Erreur lors de la mise à jour.");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setInventoryActionLoadingId(null);
        }
    };

    const handleInventoryDelete = async (id: number) => {
            if (!window.confirm("Voulez-vous vraiment supprimer cette vérification ?")) return;
            setInventoryActionLoadingId(id);
            try {
                const res = await fetch(`/api/inventory-verifications/${id}`, {
                    method: "DELETE",
                    headers: headers
                });
                if (res.ok) {
                    toast.success("Vérification supprimée.");
                    setPendingInventory(prev => prev.filter(v => v.id !== id));
                    fetchAll();
                } else {
                    toast.error("Erreur lors de la suppression.");
                }
            } catch {
                toast.error("Erreur serveur");
            } finally {
                setInventoryActionLoadingId(null);
            }
    };

    return (
            <div className="space-y-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <ShieldCheck className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                            Approbations
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Centralisez toutes les demandes en attente de validation (devis, commandes, factures, avoirs).
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={fetchAll}
                        disabled={isLoading}
                    >
                        <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                        Actualiser
                    </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <Card className="border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-background to-indigo-50/30 dark:to-indigo-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Devis
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black tabular-nums">{pendingDevis.length}</span>
                                <span className="text-xs text-muted-foreground font-medium">en attente</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-background to-amber-50/30 dark:to-amber-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                <ShoppingCart className="h-4 w-4" />
                                Commandes
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black tabular-nums">{pendingCommandes.length}</span>
                                <span className="text-xs text-muted-foreground font-medium">à valider</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-background to-emerald-50/30 dark:to-emerald-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                                <Receipt className="h-4 w-4" />
                                Factures
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black tabular-nums">{pendingFactures.length}</span>
                                <span className="text-xs text-muted-foreground font-medium">à traiter</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-background to-rose-50/30 dark:to-rose-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-2">
                                <RotateCcw className="h-4 w-4" />
                                Avoirs
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black tabular-nums">{pendingAvoirs.length}</span>
                                <span className="text-xs text-muted-foreground font-medium">retours</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-sky-500 shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-background to-sky-50/30 dark:to-sky-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Inventaire
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black tabular-nums">{pendingInventory.length}</span>
                                <span className="text-xs text-muted-foreground font-medium">écarts</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-orange-500 shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-background to-orange-50/30 dark:to-orange-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider flex items-center gap-2">
                                <ShoppingCart className="h-4 w-4" />
                                Achats FR
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black tabular-nums">{pendingAchatsFournisseurs.length}</span>
                                <span className="text-xs text-muted-foreground font-medium">offres</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base">File d&apos;approbation</CardTitle>
                                <CardDescription>
                                    {totalPending === 0
                                        ? "Aucun élément en attente de validation pour le moment."
                                        : `${totalPending} élément(s) en attente de votre décision.`}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                            <TabsList className="w-full flex flex-wrap !h-auto p-1 bg-muted/60 rounded-xl gap-1 mb-8">
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('devis')) && (
                                    <TabsTrigger 
                                        value="devis"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <FileText className="h-5 w-5 mb-1.5 text-indigo-500 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Devis</span>
                                        {pendingDevis.length > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-indigo-600 text-[10px] animate-in zoom-in">
                                                {pendingDevis.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('commande')) && (
                                    <TabsTrigger 
                                        value="commandes"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <ShoppingCart className="h-5 w-5 mb-1.5 text-amber-500 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Commandes</span>
                                        {pendingCommandes.length > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-amber-600 text-[10px] animate-in zoom-in">
                                                {pendingCommandes.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('commande')) && (
                                    <TabsTrigger 
                                        value="bons_livraison"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <FileText className="h-5 w-5 mb-1.5 text-violet-500 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Bons livraison</span>
                                        {pendingBonsLivraison.length > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-violet-600 text-[10px] animate-in zoom-in">
                                                {pendingBonsLivraison.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('facture')) && (
                                    <TabsTrigger 
                                        value="factures"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <Receipt className="h-5 w-5 mb-1.5 text-emerald-500 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Factures</span>
                                        {pendingFactures.length > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-emerald-600 text-[10px] animate-in zoom-in">
                                                {pendingFactures.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('avoir')) && (
                                    <TabsTrigger 
                                        value="avoirs"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <RotateCcw className="h-5 w-5 mb-1.5 text-rose-500 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Avoirs</span>
                                        {pendingAvoirs.length > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-rose-600 text-[10px] animate-in zoom-in">
                                                {pendingAvoirs.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('inventaire')) && (
                                    <TabsTrigger 
                                        value="inventaire"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <Package className="h-5 w-5 mb-1.5 text-sky-500 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Inventaire</span>
                                        {pendingInventory.length > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-sky-600 text-[10px] animate-in zoom-in">
                                                {pendingInventory.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('achats_fournisseurs')) && (
                                    <TabsTrigger 
                                        value="achats_fournisseurs"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <ShoppingCart className="h-5 w-5 mb-1.5 text-orange-500 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Achats FR</span>
                                        {pendingAchatsFournisseurs.length > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-orange-600 text-[10px] animate-in zoom-in">
                                                {pendingAchatsFournisseurs.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('reglements')) && (
                                    <TabsTrigger 
                                        value="reglements"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <Banknote className="h-5 w-5 mb-1.5 text-emerald-600 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Règlements</span>
                                        {(pendingReglementsClients.length + pendingReglementsFournisseurs.length) > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-emerald-600 text-[10px] animate-in zoom-in">
                                                {pendingReglementsClients.length + pendingReglementsFournisseurs.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                                {(role === 'superadmin' || role === 'admin' || myApprovalRights.includes('remboursements')) && (
                                    <TabsTrigger 
                                        value="remboursements"
                                        className="flex-1 relative flex flex-col items-center justify-center py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group"
                                    >
                                        <RotateCcw className="h-5 w-5 mb-1.5 text-violet-500 group-data-[state=active]:animate-pulse" />
                                        <span className="text-[13px] font-medium">Remboursements</span>
                                        {pendingRemboursements.length > 0 && (
                                            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-violet-600 text-[10px] animate-in zoom-in">
                                                {pendingRemboursements.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                )}
                            </TabsList>

                            <TabsContent value="devis" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Numéro</TableHead>
                                            <TableHead>Client</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Utilisateur</TableHead>
                                            <TableHead>Statut</TableHead>
                                            <TableHead>Réduction</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingDevis.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                                                    Aucun devis en attente
                                                </TableCell>
                                            </TableRow>
                                        ) : pendingDevis.map(d => (
                                            <TableRow key={d.id}>
                                                <TableCell>
                                                    <button
                                                        type="button"
                                                        className="text-indigo-600 hover:underline font-semibold"
                                                        onClick={() => window.open(`/dashboard/devis/${d.id}`, "_blank", "noopener,noreferrer")}
                                                    >
                                                        {d.numero_devis}
                                                    </button>
                                                </TableCell>
                                                <TableCell>{d.client_nom}</TableCell>
                                                <TableCell>{new Date(d.date_devis).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{d.user_nom ?? "—"}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                                                        {d.statuts_devis}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {renderReductionBadge(d.reduction)}
                                                </TableCell>
                                                <TableCell className="flex items-center gap-2">
                                                    <ActionButton 
                                                        type="approve"
                                                        label="Accepter le devis"
                                                        isLoading={actionLoadingId === d.id}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleApproveDevisClick(d);
                                                        }}
                                                    />
                                                    <ActionButton 
                                                        type="reject"
                                                        label="Rejeter le devis"
                                                        isLoading={actionLoadingId === d.id}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleRejectDevis(d.id);
                                                        }}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="commandes" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Numéro</TableHead>
                                            <TableHead>Client</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Utilisateur</TableHead>
                                            <TableHead>Réduction</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingCommandes.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                                                    Aucune commande en attente
                                                </TableCell>
                                            </TableRow>
                                        ) : pendingCommandes.map(c => (
                                            <TableRow key={c.id}>
                                                <TableCell>
                                                    <button
                                                        type="button"
                                                        className="text-indigo-600 hover:underline font-semibold"
                                                        onClick={() => window.open(`/dashboard/commandes/${c.id}`, "_blank", "noopener,noreferrer")}
                                                    >
                                                        {c.numero_commande}
                                                    </button>
                                                </TableCell>
                                                <TableCell>{c.client_nom}</TableCell>
                                                <TableCell>{new Date(c.date_commande).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{c.user_nom ?? "—"}</TableCell>
                                                <TableCell>
                                                    {renderReductionBadge(c.reduction)}
                                                </TableCell>
                                                <TableCell className="flex items-center gap-2">
                                                    <ActionButton 
                                                        type="approve"
                                                        label="Valider la commande"
                                                        isLoading={actionLoadingId === c.id}
                                                        onClick={() => handleApproveCommandeClick(c)}
                                                    />
                                                    <ActionButton 
                                                        type="reject"
                                                        label="Rejeter la commande"
                                                        isLoading={actionLoadingId === c.id}
                                                        onClick={() => handleReject("commande", c.id)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="bons_livraison" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Numéro BL</TableHead>
                                            <TableHead>Commande</TableHead>
                                            <TableHead>Client</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Statut</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingBonsLivraison.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                                                    Aucun bon de livraison en attente
                                                </TableCell>
                                            </TableRow>
                                        ) : pendingBonsLivraison.map((b) => (
                                            <TableRow key={b.id}>
                                                <TableCell>
                                                    <button
                                                        type="button"
                                                        className="text-indigo-600 hover:underline font-semibold"
                                                        onClick={() => window.open(`/dashboard/bons-livraison/${b.id}`, "_blank", "noopener,noreferrer")}
                                                    >
                                                        {b.numero_bon_livraison}
                                                    </button>
                                                </TableCell>
                                                <TableCell>
                                                    {b.commande_id ? (
                                                        <button
                                                            type="button"
                                                            className="text-indigo-600 hover:underline font-semibold"
                                                            onClick={() => window.open(`/dashboard/commandes/${b.commande_id}`, "_blank", "noopener,noreferrer")}
                                                        >
                                                            {b.numero_commande || `CMD #${b.commande_id}`}
                                                        </button>
                                                    ) : (
                                                        b.numero_commande || "—"
                                                    )}
                                                </TableCell>
                                                <TableCell>{b.client_nom || "—"}</TableCell>
                                                <TableCell>{new Date(b.date_bon_livraison).toLocaleDateString()}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                                                        {b.statut}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="flex items-center gap-2">
                                                    <ActionButton
                                                        type="approve"
                                                        label="Valider le bon de livraison"
                                                        isLoading={actionLoadingId === b.id}
                                                        onClick={() => handleApprove("bon_livraison", b.id)}
                                                    />
                                                    <ActionButton
                                                        type="reject"
                                                        label="Rejeter le bon de livraison"
                                                        isLoading={actionLoadingId === b.id}
                                                        onClick={() => handleReject("bon_livraison", b.id)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="factures" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Numéro</TableHead>
                                            <TableHead>Client</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Utilisateur</TableHead>
                                            <TableHead>Statut</TableHead>
                                            <TableHead>Réduction</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingFactures.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                                                    Aucune facture à traiter
                                                </TableCell>
                                            </TableRow>
                                        ) : pendingFactures.map(f => (
                                            <TableRow key={f.id}>
                                                <TableCell>
                                                    <button
                                                        type="button"
                                                        className="text-indigo-600 hover:underline font-semibold"
                                                        onClick={() => window.open(`/dashboard/factures/${f.id}`, "_blank", "noopener,noreferrer")}
                                                    >
                                                        {f.numero_facture}
                                                    </button>
                                                </TableCell>
                                                <TableCell>{f.client_nom}</TableCell>
                                                <TableCell>{new Date(f.date_facture).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{f.user_nom ?? "—"}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700">
                                                        {f.statut === "non_payee" ? "non payée" : f.statut}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {renderReductionBadge(f.reduction)}
                                                </TableCell>
                                                <TableCell className="flex items-center gap-2">
                                                    <ActionButton 
                                                        type="approve"
                                                        label="Valider la facture"
                                                        isLoading={actionLoadingId === f.id}
                                                        onClick={() => handleApproveFactureClick(f)}
                                                    />
                                                    <ActionButton 
                                                        type="reject"
                                                        label="Rejeter la facture"
                                                        isLoading={actionLoadingId === f.id}
                                                        onClick={() => handleReject("facture", f.id)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="reglements" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                    <Card className="border border-border shadow-sm">
                                        <CardHeader className="pb-3 pt-5 px-6">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Banknote className="h-5 w-5 text-emerald-600" />
                                                Règlements clients en attente
                                            </CardTitle>
                                            <CardDescription className="text-sm">
                                                Validez les paiements enregistrés sur les commandes et factures clients.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="px-6 pb-6">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>Code</TableHead>
                                                        <TableHead>Client</TableHead>
                                                        <TableHead>Document</TableHead>
                                                        <TableHead className="text-right">Montant</TableHead>
                                                        <TableHead>Utilisateur</TableHead>
                                                        <TableHead>Action</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {pendingReglementsClients.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                colSpan={7}
                                                                className="text-center text-xs text-muted-foreground py-6"
                                                            >
                                                                Aucun règlement client en attente
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        pendingReglementsClients.map((r) => {
                                                            const dateLabel = new Date(r.date_reglement).toLocaleDateString("fr-FR");
                                                            const isFacture = !!r.facture_id;
                                                            const docLabel = isFacture
                                                                ? r.numero_facture || `Facture #${r.facture_id}`
                                                                : r.numero_commande || `Commande #${r.commande_id}`;
                                                            return (
                                                                <TableRow key={r.id}>
                                                                    <TableCell>{dateLabel}</TableCell>
                                                                    <TableCell>
                                                                        <button
                                                                            type="button"
                                                                            className="text-indigo-600 hover:underline font-semibold"
                                                                            onClick={() => navigate(`/dashboard/reglements/details/client/${r.id}`)}
                                                                        >
                                                                            {buildReglementCode("client", r.id, r.date_reglement, r.numero_recu, (r as any).sous_societe_nom, (r as any).numero_facture || (r as any).numero_commande)}
                                                                        </button>
                                                                    </TableCell>
                                                                    <TableCell>{r.client_nom || "—"}</TableCell>
                                                                    <TableCell>
                                                                        <button
                                                                            type="button"
                                                                            className="text-indigo-600 hover:underline font-semibold"
                                                                            onClick={() => {
                                                                                if (isFacture && r.facture_id) {
                                                                                    window.open(
                                                                                        `/dashboard/factures/${r.facture_id}`,
                                                                                        "_blank",
                                                                                        "noopener,noreferrer"
                                                                                    );
                                                                                } else if (!isFacture && r.commande_id) {
                                                                                    window.open(
                                                                                        `/dashboard/commandes/${r.commande_id}`,
                                                                                        "_blank",
                                                                                        "noopener,noreferrer"
                                                                                    );
                                                                                }
                                                                            }}
                                                                        >
                                                                            {docLabel}
                                                                        </button>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {(Number(r.montant) || 0).toLocaleString("fr-FR", {
                                                                            minimumFractionDigits: 2,
                                                                            maximumFractionDigits: 2,
                                                                        })}{" "}
                                                                        MAD
                                                                    </TableCell>
                                                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.created_by_nom ?? "—"}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <ActionButton 
                                                                                type="approve"
                                                                                label="Approuver le règlement"
                                                                                isLoading={actionLoadingId === r.id}
                                                                                onClick={async () => {
                                                                                    if (!token) return;
                                                                                    setActionLoadingId(r.id);
                                                                                    try {
                                                                                        const res = await fetch(
                                                                                            `/api/reglements-clients/${r.id}/approve`,
                                                                                            {
                                                                                                method: "PUT",
                                                                                                headers,
                                                                                            }
                                                                                        );
                                                                                        if (!res.ok) {
                                                                                            const err = await res.json().catch(() => ({}));
                                                                                            toast.error(
                                                                                                err?.message ||
                                                                                                    "Erreur lors de l'approbation du règlement client"
                                                                                            );
                                                                                        } else {
                                                                                            toast.success("Règlement client approuvé");
                                                                                            setPendingReglementsClients((prev) =>
                                                                                                prev.filter((x) => x.id !== r.id)
                                                                                            );
                                                                                            window.dispatchEvent(new CustomEvent("approvals-updated"));
                                                                                        }
                                                                                    } catch (e) {
                                                                                        console.error(e);
                                                                                        toast.error("Erreur de connexion au serveur");
                                                                                    } finally {
                                                                                        setActionLoadingId(null);
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <ActionButton
                                                                                type="reject"
                                                                                label="Refuser le règlement"
                                                                                isLoading={actionLoadingId === r.id}
                                                                                onClick={async () => {
                                                                                    if (!token) return;
                                                                                    setActionLoadingId(r.id);
                                                                                    try {
                                                                                        const res = await fetch(
                                                                                            `/api/reglements-clients/${r.id}/reject`,
                                                                                            {
                                                                                                method: "PUT",
                                                                                                headers,
                                                                                            }
                                                                                        );
                                                                                        if (!res.ok) {
                                                                                            const err = await res.json().catch(() => ({}));
                                                                                            toast.error(
                                                                                                err?.message ||
                                                                                                    "Erreur lors du refus du règlement client"
                                                                                            );
                                                                                        } else {
                                                                                            toast.success("Règlement client refusé");
                                                                                            setPendingReglementsClients((prev) =>
                                                                                                prev.filter((x) => x.id !== r.id)
                                                                                            );
                                                                                            window.dispatchEvent(new CustomEvent("approvals-updated"));
                                                                                        }
                                                                                    } catch (e) {
                                                                                        console.error(e);
                                                                                        toast.error("Erreur de connexion au serveur");
                                                                                    } finally {
                                                                                        setActionLoadingId(null);
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>

                                    <Card className="border border-border shadow-sm">
                                        <CardHeader className="pb-3 pt-5 px-6">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Banknote className="h-5 w-5 text-amber-600" />
                                                Règlements fournisseurs en attente
                                            </CardTitle>
                                            <CardDescription className="text-sm">
                                                Validez les paiements vers les fournisseurs (achats fournisseurs).
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="px-6 pb-6">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>Code</TableHead>
                                                        <TableHead>Fournisseur</TableHead>
                                                        <TableHead>Achat</TableHead>
                                                        <TableHead className="text-right">Montant</TableHead>
                                                        <TableHead>Utilisateur</TableHead>
                                                        <TableHead>Action</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {pendingReglementsFournisseurs.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                colSpan={7}
                                                                className="text-center text-xs text-muted-foreground py-6"
                                                            >
                                                                Aucun règlement fournisseur en attente
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        pendingReglementsFournisseurs.map((r) => {
                                                            const dateLabel = new Date(r.date_reglement).toLocaleDateString("fr-FR");
                                                            return (
                                                                <TableRow key={r.id}>
                                                                    <TableCell>{dateLabel}</TableCell>
                                                                    <TableCell>
                                                                        <button
                                                                            type="button"
                                                                            className="text-indigo-600 hover:underline font-semibold"
                                                                            onClick={() => navigate(`/dashboard/reglements/details/fournisseur/${r.id}`)}
                                                                        >
                                                                            {buildReglementCode("fournisseur", r.id, r.date_reglement)}
                                                                        </button>
                                                                    </TableCell>
                                                                    <TableCell>{r.fournisseur_nom || "—"}</TableCell>
                                                                    <TableCell>{r.achat_designation || `Achat #${r.achat_id}`}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        {(Number(r.montant) || 0).toLocaleString("fr-FR", {
                                                                            minimumFractionDigits: 2,
                                                                            maximumFractionDigits: 2,
                                                                        })}{" "}
                                                                        MAD
                                                                    </TableCell>
                                                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.created_by_nom ?? "—"}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <ActionButton 
                                                                                type="approve"
                                                                                label="Approuver le règlement fournisseur"
                                                                                isLoading={actionLoadingId === r.id}
                                                                                onClick={async () => {
                                                                                    if (!token) return;
                                                                                    setActionLoadingId(r.id);
                                                                                    try {
                                                                                        const res = await fetch(
                                                                                            `/api/reglements-fournisseurs/${r.id}/approve`,
                                                                                            {
                                                                                                method: "PUT",
                                                                                                headers,
                                                                                            }
                                                                                        );
                                                                                        if (!res.ok) {
                                                                                            const err = await res.json().catch(() => ({}));
                                                                                            toast.error(
                                                                                                err?.message ||
                                                                                                    "Erreur lors de l'approbation du règlement fournisseur"
                                                                                            );
                                                                                        } else {
                                                                                            toast.success("Règlement fournisseur approuvé");
                                                                                            setPendingReglementsFournisseurs((prev) =>
                                                                                                prev.filter((x) => x.id !== r.id)
                                                                                            );
                                                                                            window.dispatchEvent(new CustomEvent("approvals-updated"));
                                                                                        }
                                                                                    } catch (e) {
                                                                                        console.error(e);
                                                                                        toast.error("Erreur de connexion au serveur");
                                                                                    } finally {
                                                                                        setActionLoadingId(null);
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <ActionButton
                                                                                type="reject"
                                                                                label="Refuser le règlement fournisseur"
                                                                                isLoading={actionLoadingId === r.id}
                                                                                onClick={async () => {
                                                                                    if (!token) return;
                                                                                    setActionLoadingId(r.id);
                                                                                    try {
                                                                                        const res = await fetch(
                                                                                            `/api/reglements-fournisseurs/${r.id}/reject`,
                                                                                            {
                                                                                                method: "PUT",
                                                                                                headers,
                                                                                            }
                                                                                        );
                                                                                        if (!res.ok) {
                                                                                            const err = await res.json().catch(() => ({}));
                                                                                            toast.error(
                                                                                                err?.message ||
                                                                                                    "Erreur lors du refus du règlement fournisseur"
                                                                                            );
                                                                                        } else {
                                                                                            toast.success("Règlement fournisseur refusé");
                                                                                            setPendingReglementsFournisseurs((prev) =>
                                                                                                prev.filter((x) => x.id !== r.id)
                                                                                            );
                                                                                            window.dispatchEvent(new CustomEvent("approvals-updated"));
                                                                                        }
                                                                                    } catch (e) {
                                                                                        console.error(e);
                                                                                        toast.error("Erreur de connexion au serveur");
                                                                                    } finally {
                                                                                        setActionLoadingId(null);
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                </div>
                            </TabsContent>

                            <TabsContent value="remboursements" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Card className="border border-border shadow-sm">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-sm">
                                            <RotateCcw className="h-4 w-4 text-violet-600" />
                                            Demandes de remboursement en attente
                                        </CardTitle>
                                        <CardDescription className="text-xs">
                                            Validez ou rejetez les demandes de remboursement (commandes payées non facturées).
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Commande</TableHead>
                                                    <TableHead>Client</TableHead>
                                                    <TableHead className="text-right">Montant</TableHead>
                                                    <TableHead>Motif</TableHead>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Utilisateur</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {pendingRemboursements.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                                                            Aucune demande de remboursement en attente
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    pendingRemboursements.map((r) => (
                                                        <TableRow key={r.id}>
                                                            <TableCell>
                                                                {(() => {
                                                                    const commandeApprouveeAdmin = (r.commande_statut || "").toLowerCase() === "validee";
                                                                    const resteAPayer = Number(r.commande_reste_a_payer);
                                                                    const commandeReglee = Number.isFinite(resteAPayer) ? resteAPayer <= 0 : false;
                                                                    const canOpenCommandeForRefund = commandeApprouveeAdmin && commandeReglee;

                                                                    return canOpenCommandeForRefund ? (
                                                                        <button
                                                                            type="button"
                                                                            className="text-indigo-600 hover:underline font-semibold text-sm"
                                                                            onClick={() =>
                                                                                window.open(
                                                                                    `/dashboard/commandes/${r.commande_id}`,
                                                                                    "_blank",
                                                                                    "noopener,noreferrer"
                                                                                )
                                                                            }
                                                                        >
                                                                            {r.numero_commande}
                                                                        </button>
                                                                    ) : (
                                                                        <span
                                                                            className="text-sm font-semibold text-muted-foreground cursor-not-allowed"
                                                                            title="Cliquable uniquement si la commande est approuvée par l’admin et déjà réglée."
                                                                        >
                                                                            {r.numero_commande}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </TableCell>
                                                            <TableCell className="text-sm">{r.client_nom || "—"}</TableCell>
                                                            <TableCell className="text-right font-medium">
                                                                {(Number(r.montant) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH
                                                            </TableCell>
                                                            <TableCell className="max-w-[200px] truncate text-sm" title={r.motif}>{r.motif}</TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                                {[r.created_by_prenom, r.created_by_nom].filter(Boolean).join(" ").trim() || "—"}
                                                            </TableCell>
                                                            <TableCell className="text-right flex items-center justify-end gap-2">
                                                                <ActionButton 
                                                                    type="approve"
                                                                    label="Valider le remboursement"
                                                                    isLoading={actionLoadingId === r.id}
                                                                    onClick={async () => {
                                                                        setActionLoadingId(r.id);
                                                                        try {
                                                                            const res = await fetch(`/api/remboursements/${r.id}/valider`, { method: "PUT", headers });
                                                                            if (res.ok) {
                                                                                toast.success("Remboursement validé");
                                                                                setPendingRemboursements((prev) => prev.filter((x) => x.id !== r.id));
                                                                                window.dispatchEvent(new CustomEvent("approvals-updated"));
                                                                            } else {
                                                                                const err = await res.json().catch(() => ({}));
                                                                                toast.error(err?.message || "Erreur lors de la validation");
                                                                            }
                                                                        } catch {
                                                                            toast.error("Erreur de connexion");
                                                                        } finally {
                                                                            setActionLoadingId(null);
                                                                        }
                                                                    }}
                                                                />
                                                                <ActionButton 
                                                                    type="reject"
                                                                    label="Rejeter le remboursement"
                                                                    isLoading={actionLoadingId === r.id}
                                                                    onClick={async () => {
                                                                        setActionLoadingId(r.id);
                                                                        try {
                                                                            const res = await fetch(`/api/remboursements/${r.id}/rejeter`, { method: "PUT", headers });
                                                                            if (res.ok) {
                                                                                toast.success("Remboursement rejeté");
                                                                                setPendingRemboursements((prev) => prev.filter((x) => x.id !== r.id));
                                                                                window.dispatchEvent(new CustomEvent("approvals-updated"));
                                                                            } else {
                                                                                const err = await res.json().catch(() => ({}));
                                                                                toast.error(err?.message || "Erreur lors du rejet");
                                                                            }
                                                                        } catch {
                                                                            toast.error("Erreur de connexion");
                                                                        } finally {
                                                                            setActionLoadingId(null);
                                                                        }
                                                                    }}
                                                                />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="avoirs" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Numéro</TableHead>
                                            <TableHead>Client</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Utilisateur</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingAvoirs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                                                    Aucun avoir en attente
                                                </TableCell>
                                            </TableRow>
                                        ) : pendingAvoirs.map(a => (
                                            <TableRow key={a.id}>
                                                <TableCell>
                                                    <button
                                                        type="button"
                                                        className="text-indigo-600 hover:underline font-semibold"
                                                        onClick={() => window.open(`/dashboard/avoirs/${a.id}`, "_blank", "noopener,noreferrer")}
                                                    >
                                                        {a.numero_avoir}
                                                    </button>
                                                </TableCell>
                                                <TableCell>{a.client_nom}</TableCell>
                                                <TableCell>{new Date(a.date_avoir).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{a.user_nom ?? "—"}</TableCell>
                                                <TableCell className="flex items-center gap-2">
                                                    <ActionButton 
                                                        type="approve"
                                                        label="Valider l'avoir"
                                                        isLoading={actionLoadingId === a.id}
                                                        onClick={() => handleApprove("avoir", a.id)}
                                                    />
                                                    <ActionButton 
                                                        type="reject"
                                                        label="Rejeter l'avoir"
                                                        isLoading={actionLoadingId === a.id}
                                                        onClick={() => handleReject("avoir", a.id)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="inventaire" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Produit</TableHead>
                                            <TableHead className="text-right">Stock système</TableHead>
                                            <TableHead className="text-right">Stock réel</TableHead>
                                            <TableHead className="text-right">Écart</TableHead>
                                            <TableHead>Justification</TableHead>
                                            <TableHead>Utilisateur</TableHead>
                                            <TableHead>Message admin</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingInventory.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                                                    Aucun écart inventaire en attente de vérification
                                                </TableCell>
                                            </TableRow>
                                        ) : pendingInventory.map(v => (
                                            <TableRow key={v.id}>
                                                <TableCell className="font-medium">{v.product_nom}</TableCell>
                                                <TableCell className="text-right">{v.stock_systeme}</TableCell>
                                                <TableCell className="text-right">{v.stock_reel}</TableCell>
                                                <TableCell className={`text-right font-semibold ${v.ecart > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                                    {v.ecart > 0 ? "+" : ""}{v.ecart}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={v.justification || ""}>
                                                    {v.justification || "—"}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                    {(v.user_nom != null || v.user_prenom != null) ? [v.user_prenom, v.user_nom].filter(Boolean).join(" ").trim() || "—" : "—"}
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        className="h-8 text-xs min-w-[160px]"
                                                        placeholder="Ex: Vérifier encore ce stock"
                                                        value={inventoryMessageMap[v.id] ?? ""}
                                                        onChange={e => setInventoryMessageMap(prev => ({ ...prev, [v.id]: e.target.value }))}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1 flex-wrap">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 text-xs gap-1"
                                                            disabled={inventoryActionLoadingId === v.id}
                                                            onClick={() => handleInventoryUpdate(v.id, {
                                                                admin_message: inventoryMessageMap[v.id] || undefined,
                                                                statut: "verifie",
                                                            })}
                                                        >
                                                            {inventoryActionLoadingId === v.id ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <ValidateSvgIcon className="h-4 w-4" />
                                                            )}
                                                            Vérifié
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 text-xs gap-1"
                                                            disabled={inventoryActionLoadingId === v.id}
                                                            onClick={() => handleInventoryUpdate(v.id, {
                                                                admin_message: inventoryMessageMap[v.id] || "À revoir.",
                                                                statut: "a_revoir",
                                                            })}
                                                        >
                                                            {inventoryActionLoadingId === v.id ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <MessageSquare className="h-3.5 w-3.5" />
                                                            )}
                                                            À revoir
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 text-xs gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                            disabled={inventoryActionLoadingId === v.id}
                                                            onClick={() => handleInventoryDelete(v.id)}
                                                            title="Supprimer la vérification"
                                                        >
                                                            {inventoryActionLoadingId === v.id ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <DeleteSvgIcon className="h-3.5 w-3.5" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="achats_fournisseurs" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fournisseur</TableHead>
                                            <TableHead>Produit</TableHead>
                                            <TableHead>Gestionnaire</TableHead>
                                            <TableHead>Utilisateur</TableHead>
                                            <TableHead className="text-right">Qté</TableHead>
                                            <TableHead className="text-right">Prix unitaire</TableHead>
                                            <TableHead className="text-right">TVA</TableHead>
                                            <TableHead>Statut</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingAchatsFournisseurs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">
                                                    Aucun achat fournisseur en attente
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            pendingAchatsFournisseurs.map((a) => (
                                                <TableRow key={a.id}>
                                                    <TableCell>{a.fournisseur_nom}</TableCell>
                                                    <TableCell>{a.produit_nom}</TableCell>
                                                    <TableCell>{a.gestionnaire_nom}</TableCell>
                                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{a.created_by_nom ?? "—"}</TableCell>
                                                    <TableCell className="text-right">{a.quantite}</TableCell>
                                                    <TableCell className="text-right">
                                                        {a.prix_unitaire != null
                                                            ? `${Number(a.prix_unitaire).toFixed(2)} DH`
                                                            : "—"}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {a.tva != null ? `${Number(a.tva).toFixed(2)} %` : "—"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                                                            {a.statut || "en_attente"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <ActionButton 
                                                                type="approve"
                                                                label="Approuver l'achat"
                                                                isLoading={actionLoadingId === a.id}
                                                                onClick={() => handleApprove("achat_fournisseur", a.id)}
                                                            />
                                                            <ActionButton
                                                                type="reject"
                                                                label="Rejeter l'achat"
                                                                isLoading={actionLoadingId === a.id}
                                                                onClick={() => handleReject("achat_fournisseur", a.id)}
                                                            />
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl mt-6">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base">File d&apos;approbation Gros</CardTitle>
                                <CardDescription>
                                    {pendingDevisGros.length + pendingCommandesGros.length + pendingFacturesGros.length + pendingAvoirsGros.length + pendingReglementsClientsGros.length === 0
                                        ? "Aucun document gros en attente de validation."
                                        : `${pendingDevisGros.length + pendingCommandesGros.length + pendingFacturesGros.length + pendingAvoirsGros.length + pendingReglementsClientsGros.length} document(s) gros en attente.`}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Tabs value={activeGrosTab} onValueChange={(v) => setActiveGrosTab(v as any)} className="w-full">
                            <TabsList className="w-full flex flex-wrap !h-auto p-1 bg-muted/60 rounded-xl gap-1 mb-8">
                                <TabsTrigger value="devis_gros" className="flex-1 min-w-[120px] h-[72px] relative flex flex-col items-center justify-center py-2 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group">
                                    <FileText className="h-5 w-5 mb-1.5 text-indigo-500 group-data-[state=active]:animate-pulse" />
                                    <span className="text-[12px] font-medium leading-none">Devis Gros</span>
                                    {pendingDevisGros.length > 0 && (
                                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-indigo-600 text-[10px] animate-in zoom-in">
                                            {pendingDevisGros.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="commandes_gros" className="flex-1 min-w-[120px] h-[72px] relative flex flex-col items-center justify-center py-2 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group">
                                    <ShoppingCart className="h-5 w-5 mb-1.5 text-amber-500 group-data-[state=active]:animate-pulse" />
                                    <span className="text-[12px] font-medium leading-none">Commandes Gros</span>
                                    {pendingCommandesGros.length > 0 && (
                                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-amber-600 text-[10px] animate-in zoom-in">
                                            {pendingCommandesGros.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="factures_gros" className="flex-1 min-w-[120px] h-[72px] relative flex flex-col items-center justify-center py-2 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group">
                                    <Receipt className="h-5 w-5 mb-1.5 text-emerald-500 group-data-[state=active]:animate-pulse" />
                                    <span className="text-[12px] font-medium leading-none">Factures Gros</span>
                                    {pendingFacturesGros.length > 0 && (
                                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-emerald-600 text-[10px] animate-in zoom-in">
                                            {pendingFacturesGros.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="avoirs_gros" className="flex-1 min-w-[120px] h-[72px] relative flex flex-col items-center justify-center py-2 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group">
                                    <RotateCcw className="h-5 w-5 mb-1.5 text-rose-500 group-data-[state=active]:animate-pulse" />
                                    <span className="text-[12px] font-medium leading-none">Avoirs Gros</span>
                                    {pendingAvoirsGros.length > 0 && (
                                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-rose-600 text-[10px] animate-in zoom-in">
                                            {pendingAvoirsGros.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="reglements_gros" className="flex-1 min-w-[120px] h-[72px] relative flex flex-col items-center justify-center py-2 px-2 data-[state=active]:bg-background data-[state=active]:shadow-md transition-all duration-200 rounded-lg group">
                                    <Banknote className="h-5 w-5 mb-1.5 text-emerald-600 group-data-[state=active]:animate-pulse" />
                                    <span className="text-[12px] font-medium leading-none">Règlements Gros</span>
                                    {pendingReglementsClientsGros.length > 0 && (
                                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-emerald-600 text-[10px] animate-in zoom-in">
                                            {pendingReglementsClientsGros.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="devis_gros" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Numéro</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Utilisateur</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {pendingDevisGros.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Aucun devis gros en attente</TableCell></TableRow>
                                        ) : pendingDevisGros.map((d) => (
                                            <TableRow key={`dg-${d.id}`}>
                                                <TableCell>{d.numero_devis}</TableCell><TableCell>{d.client_nom}</TableCell><TableCell>{new Date(d.date_devis).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{d.user_nom ?? "—"}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <ActionButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleApprove("devis_gros", d.id);
                                                            }}
                                                            isLoading={actionLoadingId === d.id}
                                                            type="approve"
                                                            label="Valider le devis gros"
                                                        />
                                                        <ActionButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReject("devis_gros", d.id);
                                                            }}
                                                            isLoading={actionLoadingId === d.id}
                                                            type="reject"
                                                            label="Rejeter le devis gros"
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="commandes_gros" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Numéro</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Utilisateur</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {pendingCommandesGros.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Aucune commande gros en attente</TableCell></TableRow>
                                        ) : pendingCommandesGros.map((c) => (
                                            <TableRow key={`cg-${c.id}`}>
                                                <TableCell>{c.numero_commande}</TableCell><TableCell>{c.client_nom}</TableCell><TableCell>{new Date(c.date_commande).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{c.user_nom ?? "—"}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <ActionButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleApprove("commande_gros", c.id);
                                                            }}
                                                            isLoading={actionLoadingId === c.id}
                                                            type="approve"
                                                            label="Valider la commande gros"
                                                        />
                                                        <ActionButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReject("commande_gros", c.id);
                                                            }}
                                                            isLoading={actionLoadingId === c.id}
                                                            type="reject"
                                                            label="Rejeter la commande gros"
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="factures_gros" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Numéro</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Utilisateur</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {pendingFacturesGros.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Aucune facture gros en attente</TableCell></TableRow>
                                        ) : pendingFacturesGros.map((f) => (
                                            <TableRow key={`fg-${f.id}`}>
                                                <TableCell>{f.numero_facture}</TableCell><TableCell>{f.client_nom}</TableCell><TableCell>{new Date(f.date_facture).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{f.user_nom ?? "—"}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <ActionButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleApprove("facture_gros", f.id);
                                                            }}
                                                            isLoading={actionLoadingId === f.id}
                                                            type="approve"
                                                            label="Valider la facture gros"
                                                        />
                                                        <ActionButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReject("facture_gros", f.id);
                                                            }}
                                                            isLoading={actionLoadingId === f.id}
                                                            type="reject"
                                                            label="Rejeter la facture gros"
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            <TabsContent value="avoirs_gros" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Numéro</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Utilisateur</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {pendingAvoirsGros.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Aucun avoir gros en attente</TableCell></TableRow>
                                        ) : pendingAvoirsGros.map((a) => (
                                            <TableRow key={`ag-${a.id}`}>
                                                <TableCell>
                                                    <button
                                                        type="button"
                                                        className="text-indigo-600 hover:underline font-semibold"
                                                        onClick={() => window.open(`/dashboard/avoirs-gros/${a.id}`, "_blank", "noopener,noreferrer")}
                                                    >
                                                        {a.numero_avoir}
                                                    </button>
                                                </TableCell>
                                                <TableCell>{a.client_nom}</TableCell>
                                                <TableCell>{new Date(a.date_avoir).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{a.user_nom ?? "—"}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2 items-center">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 gap-1"
                                                            disabled={actionLoadingId === a.id}
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                setActionLoadingId(a.id);
                                                                try {
                                                                    const res = await fetch(`/api/avoirs-gros/${a.id}`, {
                                                                        headers,
                                                                    });
                                                                    if (!res.ok) {
                                                                        toast.error("Impossible de charger l'avoir gros");
                                                                        return;
                                                                    }
                                                                    const data = await res.json();
                                                                    await generateAvoirGrosPdfFromApiRow(data as Record<string, unknown>);
                                                                    toast.success("PDF généré");
                                                                } catch {
                                                                    toast.error("Erreur lors de la génération du PDF");
                                                                } finally {
                                                                    setActionLoadingId(null);
                                                                }
                                                            }}
                                                        >
                                                            {actionLoadingId === a.id ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Download className="h-3.5 w-3.5" />
                                                            )}
                                                            PDF
                                                        </Button>
                                                        <ActionButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleApprove("avoir_gros", a.id);
                                                            }}
                                                            isLoading={actionLoadingId === a.id}
                                                            type="approve"
                                                            label="Valider l'avoir gros"
                                                        />
                                                        <ActionButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReject("avoir_gros", a.id);
                                                            }}
                                                            isLoading={actionLoadingId === a.id}
                                                            type="reject"
                                                            label="Rejeter l'avoir gros"
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>
                            <TabsContent value="reglements_gros" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 outline-none">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Code</TableHead><TableHead>Client</TableHead><TableHead>Document</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Utilisateur</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {pendingReglementsClientsGros.length === 0 ? (
                                            <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Aucun règlement client gros en attente</TableCell></TableRow>
                                        ) : pendingReglementsClientsGros.map((r) => {
                                            const isFacture = !!r.facture_gros_id;
                                            const docLabel = isFacture
                                                ? r.numero_facture || `Facture gros #${r.facture_gros_id}`
                                                : r.numero_commande || `Commande gros #${r.commande_gros_id}`;
                                            return (
                                                <TableRow key={`rcg-${r.id}`}>
                                                    <TableCell>{new Date(r.date_reglement).toLocaleDateString("fr-FR")}</TableCell>
                                                    <TableCell className="font-semibold text-indigo-600">
                                                        <button
                                                            type="button"
                                                            className="text-indigo-600 hover:underline font-semibold"
                                                            onClick={() => navigate(`/dashboard/reglements/details/client_gros/${r.id}`)}
                                                        >
                                                            {buildReglementCode("client_gros", r.id, r.date_reglement, r.numero_recu, (r as any).sous_societe_nom, (r as any).numero_facture || (r as any).numero_commande)}
                                                        </button>
                                                    </TableCell>
                                                    <TableCell>{r.client_nom || "—"}</TableCell>
                                                    <TableCell>
                                                        <button
                                                            type="button"
                                                            className="text-indigo-600 hover:underline font-semibold"
                                                            onClick={() => {
                                                                if (isFacture && r.facture_gros_id) {
                                                                    window.open(`/dashboard/factures-gros/${r.facture_gros_id}`, "_blank", "noopener,noreferrer");
                                                                } else if (!isFacture && r.commande_gros_id) {
                                                                    window.open(`/dashboard/commandes-gros/${r.commande_gros_id}`, "_blank", "noopener,noreferrer");
                                                                }
                                                            }}
                                                        >
                                                            {docLabel}
                                                        </button>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {(Number(r.montant) || 0).toLocaleString("fr-FR", {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        })}{" "}
                                                        MAD
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.created_by_nom ?? "—"}</TableCell>
                                                    <TableCell>
                                                        <div className="flex gap-2">
                                                            <ActionButton
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleApprove("reglement_client_gros", r.id);
                                                                }}
                                                                isLoading={actionLoadingId === r.id}
                                                                type="approve"
                                                                label="Approuver le règlement gros"
                                                            />
                                                            <ActionButton
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleReject("reglement_client_gros", r.id);
                                                                }}
                                                                isLoading={actionLoadingId === r.id}
                                                                type="reject"
                                                                label="Refuser le règlement gros"
                                                            />
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                {highDiscountDevis && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
                            <h2 className="text-lg font-semibold">
                                Attention : remise au-delà de la limite autorisée
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                La remise saisie dépasse la limite autorisée. Une approbation est requise pour valider ce devis.
                            </p>
                            <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-3">
                                Limite configurée : <span className="font-semibold">{maxDevisDiscount} %</span>
                                {" · "}
                                Devis <span className="font-semibold">{highDiscountDevis.numero_devis}</span> : remise de{" "}
                                <span className="font-semibold">
                                    {highDiscountDevis.reduction != null
                                        ? Number(highDiscountDevis.reduction).toFixed(2)
                                        : "—"
                                    }
                                    %
                                </span>
                            </p>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setHighDiscountDevis(null)}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => {
                                        if (highDiscountDevis) {
                                            approveDevis(highDiscountDevis);
                                        }
                                        setHighDiscountDevis(null);
                                    }}
                                >
                                    Valider quand même
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
                {highDiscountCommande && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
                            <h2 className="text-lg font-semibold">
                                Attention : remise au-delà de la limite autorisée
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                La remise saisie dépasse la limite autorisée. Une approbation est requise pour valider cette commande.
                            </p>
                            <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-3">
                                Limite configurée : <span className="font-semibold">{maxDevisDiscount} %</span>
                                {" · "}
                                Commande <span className="font-semibold">{highDiscountCommande.numero_commande}</span> : remise de{" "}
                                <span className="font-semibold">
                                    {highDiscountCommande.reduction != null
                                        ? Number(highDiscountCommande.reduction).toFixed(2)
                                        : "—"
                                    }
                                    %
                                </span>
                            </p>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setHighDiscountCommande(null)}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => {
                                        if (highDiscountCommande) {
                                            handleApprove("commande", highDiscountCommande.id);
                                        }
                                        setHighDiscountCommande(null);
                                    }}
                                >
                                    Valider quand même
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
                {highDiscountFacture && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
                            <h2 className="text-lg font-semibold">
                                Attention : remise au-delà de la limite autorisée
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                La remise saisie dépasse la limite autorisée. Une approbation est requise pour valider cette facture.
                            </p>
                            <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-3">
                                Limite configurée : <span className="font-semibold">{maxDevisDiscount} %</span>
                                {" · "}
                                Facture <span className="font-semibold">{highDiscountFacture.numero_facture}</span> : remise de{" "}
                                <span className="font-semibold">
                                    {highDiscountFacture.reduction != null
                                        ? Number(highDiscountFacture.reduction).toFixed(2)
                                        : "—"
                                    }
                                    %
                                </span>
                            </p>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setHighDiscountFacture(null)}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => {
                                        if (highDiscountFacture) {
                                            handleApprove("facture", highDiscountFacture.id);
                                        }
                                        setHighDiscountFacture(null);
                                    }}
                                >
                                    Valider quand même
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
}
