import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/common/ui/dialog";
import { Input } from "@/components/common/ui/input";
import { Textarea } from "@/components/common/ui/textarea";
import { Label } from "@/components/common/ui/label"; 
import { Button } from "@/components/common/ui/button";
import { 
    ShoppingCart, 
    User, 
    Calendar,
    ArrowUpRight, 
    Printer, 
    Clock, 
    CheckCircle2, 
    AlertTriangle, 
    XCircle, 
    ArrowLeft, 
    Hash, 
    Tag, 
    Info, 
    ExternalLink,
    FileText,
    Receipt,
    Truck,
    RefreshCcw,
    RotateCcw,
    Mail,
    Send,
    Link as LinkIcon,
    Check,
    Banknote
} from "lucide-react";
import { generateCommandePdf } from "@/components/pdf/CommandePdf";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildReglementCode } from "@/lib/reglementCode";

interface CommandeItem {
    id?: number;
    designation: string;
    reference?: string | null;
    produit_reference?: string | null;
    product_reference?: string | null;
    quantite: number;
    prix_unitaire: number;
    tva: number;
    reduction: number;
    montant_ht: number;
}

function formatDesignationWithReference(
    designation?: string | null,
    reference?: string | null
): string {
    const label = String(designation || "").trim() || "—";
    const ref = String(reference || "").trim();
    return ref ? `${label} (${ref})` : label;
}

interface CommandeDetails {
    id: number;
    numero_commande: string;
    date_commande: string;
    client_nom: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    statut: string;
    client_email?: string;
    reduction?: number;
    items?: CommandeItem[];
    devis_id?: number | null;
    total_regle?: number;
    reste_a_payer?: number;
}

interface ComparableDocument {
    id: number;
    numero?: string | null;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    reduction?: number;
    items?: CommandeItem[];
}

const formatRemboursementCode = (remb: { id: number; created_at: string }) => {
    const d = new Date(remb.created_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `RM/${y}${m}${day}/${remb.id}`;
};

export default function CommandeDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [commande, setCommande] = useState<CommandeDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);
    const [linkedDevisNumero, setLinkedDevisNumero] = useState<string | null>(null);
    const [linkedFacture, setLinkedFacture] = useState<{ id: number; numero_facture?: string } | null>(null);

    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailData, setEmailData] = useState({ to: '', subject: '', message: '' });
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isLinkCopied, setIsLinkCopied] = useState(false);
    const [reglements, setReglements] = useState<any[]>([]);
    const [isReglementsModalOpen, setIsReglementsModalOpen] = useState(false);
    const [remboursementsHistory, setRemboursementsHistory] = useState<any[]>([]);
    const [isRemboursementsModalOpen, setIsRemboursementsModalOpen] = useState(false);
    const [isRembourse, setIsRembourse] = useState(false);
    const [linkedRemboursement, setLinkedRemboursement] = useState<{ id: number; montant: number; created_at: string } | null>(null);
    const [hasAvoir, setHasAvoir] = useState(false);
    const [linkedAvoir, setLinkedAvoir] = useState<{ id: number; numero_avoir?: string } | null>(null);
    const [linkedDevis, setLinkedDevis] = useState<ComparableDocument | null>(null);
    const [linkedFactureDoc, setLinkedFactureDoc] = useState<ComparableDocument | null>(null);
    const linkedReglement = ((reglements as any[]) || []).find((r: any) => String(r?.statut || "").toLowerCase() === "valide") || ((reglements as any[]) || [])[0] || null;

    const token = localStorage.getItem("token");
    const mergeReglements = (rowsA: any[], rowsB: any[]) => {
        const merged = [...(Array.isArray(rowsA) ? rowsA : []), ...(Array.isArray(rowsB) ? rowsB : [])];
        const seen = new Set<number>();
        return merged.filter((r: any) => {
            const idNum = Number(r?.id);
            if (!Number.isFinite(idNum)) return true;
            if (seen.has(idNum)) return false;
            seen.add(idNum);
            return true;
        });
    };

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return;
            setIsLoading(true);
            try {
                const res = await fetch(`/api/commandes/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setCommande(data);
                    
                    setEmailData({
                        to: data.client_email || '',
                        subject: `[Commande] ${data.numero_commande}`,
                        message: `Bonjour,\n\nVeuillez trouver ci-joint le bon de commande ${data.numero_commande}.\n\nCordialement,`
                    });
                    
                    if (data.devis_id) {
                        fetch(`/api/devis/${data.devis_id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        })
                            .then(r => r.ok ? r.json() : null)
                            .then(d => {
                                if (d && d.numero_devis) setLinkedDevisNumero(d.numero_devis);
                                if (d) {
                                    setLinkedDevis({
                                        id: Number(d.id) || Number(data.devis_id),
                                        numero: d.numero_devis || null,
                                        montant_ht: Number(d.montant_ht) || 0,
                                        montant_tva: Number(d.montant_tva) || 0,
                                        montant_ttc: Number(d.montant_ttc) || 0,
                                        reduction: Number(d.reduction) || 0,
                                        items: Array.isArray(d.items) ? d.items : [],
                                    });
                                } else {
                                    setLinkedDevis(null);
                                }
                            })
                            .catch(() => { /* ignore */ });
                    } else {
                        setLinkedDevis(null);
                    }
                    
                    fetch("/api/factures", {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                        .then(r => r.ok ? r.json() : [])
                        .then((facts: any[]) => {
                            const linked = facts.find((f: any) => f.commande_id === data.id);
                            if (linked) {
                                setLinkedFacture({ id: linked.id, numero_facture: linked.numero_facture });
                                fetch(`/api/factures/${linked.id}`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                })
                                    .then((rf) => (rf.ok ? rf.json() : null))
                                    .then((full) => {
                                        if (!full) {
                                            setLinkedFactureDoc(null);
                                            return;
                                        }
                                        setLinkedFactureDoc({
                                            id: Number(full.id) || Number(linked.id),
                                            numero: full.numero_facture || linked.numero_facture || null,
                                            montant_ht: Number(full.montant_ht) || 0,
                                            montant_tva: Number(full.montant_tva) || 0,
                                            montant_ttc: Number(full.montant_ttc) || 0,
                                            reduction: Number(full.reduction) || 0,
                                            items: Array.isArray(full.items) ? full.items : [],
                                        });
                                    })
                                    .catch(() => setLinkedFactureDoc(null));
                            } else {
                                setLinkedFactureDoc(null);
                            }

                            Promise.all([
                                fetch(`/api/reglements-clients?commandeId=${data.id}`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                }).then((rc) => (rc.ok ? rc.json() : [])),
                                linked
                                    ? fetch(`/api/reglements-clients?factureId=${linked.id}`, {
                                          headers: { Authorization: `Bearer ${token}` },
                                      }).then((rf) => (rf.ok ? rf.json() : []))
                                    : Promise.resolve([]),
                            ])
                                .then(([regCommande, regFacture]) => {
                                    setReglements(mergeReglements(regCommande, regFacture));
                                })
                                .catch(() => { /* ignore */ });

                            // Fetch Avoirs to get linked avoir (commande or facture)
                            fetch("/api/avoirs", {
                                headers: { Authorization: `Bearer ${token}` },
                            })
                                .then(r => r.ok ? r.json() : [])
                                .then((avos: any[]) => {
                                    const avoir = avos.find((a: any) => 
                                        a.commande_id === data.id || (linked && a.facture_id === linked.id)
                                    );
                                    if (avoir) {
                                        setHasAvoir(true);
                                        setLinkedAvoir({ id: avoir.id, numero_avoir: avoir.numero_avoir });
                                    }
                                })
                                .catch(() => {});
                        })
                        .catch(() => { /* ignore */ });

                    // Fetch Remboursements to check if command is refunded
                    fetch("/api/remboursements", {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                        .then(r => r.ok ? r.json() : [])
                        .then((rembs: any[]) => {
                            const targetCommandeId = Number(data.id);
                            const linkedRemboursements = (Array.isArray(rembs) ? rembs : [])
                                .filter((rem: any) => Number(rem.commande_id) === targetCommandeId)
                                .sort((a: any, b: any) =>
                                    new Date(b.created_at || b.createdAt || 0).getTime() -
                                    new Date(a.created_at || a.createdAt || 0).getTime()
                                );
                            setRemboursementsHistory(linkedRemboursements);
                            setIsRembourse(false);
                            setLinkedRemboursement(null);
                            const found = linkedRemboursements.find((rem: any) => 
                                Number(rem.commande_id) === targetCommandeId &&
                                ["valide", "approuve", "approuvé"].includes(
                                    String(rem.statut || "").toLowerCase()
                                )
                            );
                            if (found) {
                                setIsRembourse(true);
                                setLinkedRemboursement({ id: found.id, montant: Number(found.montant) || 0, created_at: found.created_at });
                            }
                        })
                        .catch(() => {});
                } else {
                    toast.error("Impossible de charger la commande");
                }
            } catch (error) {
                console.error("error fetching details", error);
                toast.error("Erreur lors du chargement de la commande");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [id, token]);

    const handleSendEmail = async () => {
        if (!emailData.to) {
            toast.error("Veuillez renseigner l'adresse email du destinataire.");
            return;
        }
        setIsSendingEmail(true);
        try {
            const res = await fetch(`/api/commandes/${id}/send-email`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(emailData)
            });
            if (res.ok) {
                toast.success("Email envoyé avec succès");
                setIsEmailModalOpen(false);
            } else {
                const data = await res.json();
                toast.error(data.message || "Erreur lors de l'envoi de l'email");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleCopyLink = () => {
        const downloadUrl = `${window.location.origin}/api/commandes/${id}/pdf/download`;
        navigator.clipboard.writeText(downloadUrl)
            .then(() => {
                setIsLinkCopied(true);
                toast.success("Lien de téléchargement sécurisé copié");
                setTimeout(() => setIsLinkCopied(false), 3000);
            })
            .catch(() => toast.error("Échec de la copie du lien"));
    };

    const anomalyMessages = useMemo(() => {
        if (!commande) return [] as string[];

        const epsilon = 0.01;
        const formatDh = (v: number) =>
            `${Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
        const formatPct = (v: number) =>
            `${Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
        const normalize = (s: string) => (s || "").trim().toLowerCase();
        const keyOf = (it: CommandeItem) =>
            [
                normalize(it.designation || ""),
                Number(it.prix_unitaire || 0).toFixed(2),
                Number(it.tva || 0).toFixed(2),
                Number(it.reduction || 0).toFixed(2),
            ].join("|");
        const quantityByKey = (list: CommandeItem[]) => {
            const map = new Map<string, number>();
            for (const it of list || []) {
                const k = keyOf(it);
                map.set(k, (map.get(k) || 0) + Number(it.quantite || 0));
            }
            return map;
        };

        const messages: string[] = [];
        const cmdItems = Array.isArray(commande.items) ? commande.items : [];
        const refs: Array<{ label: string; doc: ComparableDocument | null }> = [
            { label: "Devis", doc: linkedDevis },
            { label: "Facture", doc: linkedFactureDoc },
        ];

        for (const { label, doc } of refs) {
            if (!doc) continue;

            const refReduction = Number(doc.reduction || 0);
            const cmdReduction = Number(commande.reduction || 0);
            if (Math.abs(refReduction - cmdReduction) > epsilon) {
                messages.push(
                    `${label}: écart de réduction (${formatPct(refReduction)} vs commande ${formatPct(cmdReduction)}).`
                );
            }

            const refHt = Number(doc.montant_ht || 0);
            const refTva = Number(doc.montant_tva || 0);
            const refTtc = Number(doc.montant_ttc || 0);
            const cmdHt = Number(commande.montant_ht || 0);
            const cmdTva = Number(commande.montant_tva || 0);
            const cmdTtc = Number(commande.montant_ttc || 0);

            if (Math.abs(refHt - cmdHt) > epsilon) {
                messages.push(`${label}: écart montant HT (${formatDh(refHt)} vs commande ${formatDh(cmdHt)}).`);
            }
            if (Math.abs(refTva - cmdTva) > epsilon) {
                messages.push(`${label}: écart montant TVA (${formatDh(refTva)} vs commande ${formatDh(cmdTva)}).`);
            }
            if (Math.abs(refTtc - cmdTtc) > epsilon) {
                messages.push(`${label}: écart montant TTC (${formatDh(refTtc)} vs commande ${formatDh(cmdTtc)}).`);
            }

            const refItems = Array.isArray(doc.items) ? doc.items : [];
            if (refItems.length !== cmdItems.length) {
                messages.push(
                    `${label}: nombre de lignes différent (${refItems.length} vs commande ${cmdItems.length}).`
                );
            }

            const refMap = quantityByKey(refItems);
            const cmdMap = quantityByKey(cmdItems);
            const allKeys = new Set<string>([...refMap.keys(), ...cmdMap.keys()]);
            for (const k of allKeys) {
                const rq = Number(refMap.get(k) || 0);
                const cq = Number(cmdMap.get(k) || 0);
                if (Math.abs(rq - cq) > epsilon) {
                    const [designation, pu, tva, red] = k.split("|");
                    messages.push(
                        `${label}: ligne "${designation || "article"}" (PU ${pu}, TVA ${tva}%, Red ${red}%) quantité ${rq} vs commande ${cq}.`
                    );
                }
            }
        }

        return messages;
    }, [commande, linkedDevis, linkedFactureDoc]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent shadow-lg shadow-indigo-200"></div>
                <p className="text-muted-foreground text-sm font-medium animate-pulse">Chargement commande...</p>
            </div>
        );
    }

    if (!commande) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Card className="max-w-md w-full p-8 text-center border-border shadow-2xl">
                    <div className="mx-auto h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle className="h-8 w-8" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Commande introuvable</h2>
                    <p className="text-muted-foreground mt-2">Ce document n&apos;existe plus ou a été déplacé.</p>
                    <Button className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={() => navigate(-1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Retourner à la liste
                    </Button>
                </Card>
            </div>
        );
    }

    const reductionAmountDh = (commande.items || []).reduce((acc, it) => {
        const bruteHT = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
        const redPct = Number(it.reduction) || 0;
        return acc + (bruteHT * redPct) / 100;
    }, 0);

    const items = commande.items || [];

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(-1)}
                        className="rounded-full h-12 w-12 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                    >
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                            <span className="text-indigo-600">Commande</span>
                            <span className="text-muted-foreground font-mono">#{commande.numero_commande}</span>
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                            <Calendar className="h-3.5 w-3.5" />
                            Validée le {new Date(commande.date_commande).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2.5 flex-wrap">
                    <Button
                        variant="outline"
                        onClick={handleCopyLink}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        {isLinkCopied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
                        {isLinkCopied ? "Lien copié!" : "Générer lien"}
                    </Button>
                    
                    {(commande.statut === 'validee' || commande.statut === 'livree') && (
                        <Button
                            variant="outline"
                            disabled={isProcessingPdf}
                            onClick={async () => {
                                try {
                                    setIsProcessingPdf(true);
                                    await generateCommandePdf(commande as any);
                                } catch (error) {
                                    console.error("Erreur génération PDF commande:", error);
                                    toast.error("Erreur lors de la génération du PDF");
                                } finally {
                                    setIsProcessingPdf(false);
                                }
                            }}
                            className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                        >
                            {isProcessingPdf ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            Imprimer PDF
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        onClick={() => setIsEmailModalOpen(true)}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        <Mail className="h-4 w-4" />
                        Envoyer par Email
                    </Button>
                    
                    <Button
                        size="sm"
                        onClick={() => navigate("/dashboard/commandes", { state: { commandeId: commande.id } })}
                        className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 gap-2"
                    >
                        Modifier Commande
                        <ArrowUpRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {commande && (() => {
                const montantTtc = Number(commande.montant_ttc) || 0;
                // Source de vérité : somme des règlements approuvés quand on a la liste, sinon total_regle du backend
                const totalRegleFromReglements = (reglements as { statut?: string; montant?: number }[])
                    .filter((r) => r.statut === "approuve")
                    .reduce((sum, r) => sum + Number(r.montant || 0), 0);
                const totalRegle = Math.max(Number(commande.total_regle) || 0, totalRegleFromReglements);
                const bruteReste =
                    typeof commande.reste_a_payer !== "undefined"
                        ? Math.max(Number(commande.reste_a_payer), montantTtc - totalRegle, 0)
                        : Math.max(montantTtc - totalRegle, 0);

                // Une commande est considérée réglée uniquement si :
                // - les montants réels couvrent le TTC (paidByAmounts), OU
                // - le backend indique explicitement un statut de paiement (paye / payee / reglee).
                // On n'utilise PAS "valide"/"validee"/"validée" qui signifient "commande approuvée", pas "payée".
                const paidByAmounts = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
                const isRegle =
                    commande.statut === "paye" ||
                    commande.statut === "payee" ||
                    commande.statut === "reglee" ||
                    paidByAmounts;

                const reste = isRegle ? 0 : Math.max(bruteReste, 0);
                const isReglementCommence = !isRegle && totalRegle > 0 && totalRegle < montantTtc - 0.01;
                return (
                    <Card className={cn(
                        "border rounded-xl overflow-hidden shadow-sm",
                        isRegle ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10" : isReglementCommence ? "border-amber-200 bg-amber-50/50 dark:bg-amber-900/10" : "border-red-200 bg-red-50/50 dark:bg-red-900/10"
                    )}>
                        <CardContent className="py-3 px-5 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                                <span className={cn(
                                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold uppercase",
                                    isRegle ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : isReglementCommence ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                )}>
                                    {isRegle ? <CheckCircle2 className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                                    {isRegle ? "Payé (réglé)" : isReglementCommence ? "Règlement commencé" : "Impayé (non réglé)"}
                                </span>
                                {reste > 0 && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Reste à payer</span>
                                        <span className="text-sm font-black text-foreground">{reste.toLocaleString()} DH</span>
                                    </div>
                                )}
                                {totalRegle > 0 && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Déjà réglé</span>
                                        <span className="text-sm font-bold text-indigo-600">{totalRegle.toLocaleString()} DH <span className="text-muted-foreground font-normal">/ {montantTtc.toLocaleString()} DH</span></span>
                                    </div>
                                )}

                                {/* Status supplémentaires (Remboursement / Avoir) */}
                                {!linkedFacture && isRembourse && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Flux Retour</span>
                                        <span className="text-sm font-black text-emerald-600 flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Remboursé
                                        </span>
                                    </div>
                                )}
                                {linkedFacture && hasAvoir && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Note de crédit</span>
                                        <span className="text-sm font-black text-purple-600 flex items-center gap-1">
                                            <RotateCcw className="h-3 w-3" /> Avoir existe
                                        </span>
                                    </div>
                                )}
                                {!linkedFacture && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-red-600 uppercase font-bold text-muted-foreground tracking-wider">Aucune facture liée</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {!isRegle && !isRembourse && (
                                    linkedFacture ? (
                                        <Button 
                                            variant="default" 
                                            size="sm" 
                                            onClick={() => navigate("/dashboard/reglements", { state: { factureId: linkedFacture.id, openDialog: true } })}
                                            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 rounded-lg transition-all shadow-md"
                                        >
                                            <Banknote className="h-4 w-4" />
                                            Payer / Terminer le règlement
                                        </Button>
                                    ) : (
                                        reste > 0 && (
                                            <Button 
                                                variant="default" 
                                                size="sm" 
                                                onClick={() => navigate("/dashboard/reglements", { state: { commandeId: commande.id, openDialog: true } })}
                                                className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 rounded-lg transition-all shadow-md"
                                            >
                                                <Banknote className="h-4 w-4" />
                                                Payer / Terminer le règlement
                                            </Button>
                                        )
                                    )
                                )}

                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setIsReglementsModalOpen(true)}
                                    className="h-9 px-4 border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold gap-2 rounded-lg transition-all"
                                >
                                    <Clock className="h-4 w-4" />
                                    Historique règlements
                                </Button>
                                {remboursementsHistory.length > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsRemboursementsModalOpen(true)}
                                        className="h-9 px-4 border-rose-200 text-rose-700 hover:bg-rose-50 font-bold gap-2 rounded-lg transition-all"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        Historique remboursements
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );
            })()}

            {/* Approval Warning if pending */}
            {commande?.statut === 'en_attente' && (
                <Card className="border-l-4 border-l-amber-500 border-amber-100 bg-amber-50/40 dark:bg-amber-900/10 overflow-hidden shadow-none rounded-xl">
                    <CardContent className="py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-start gap-4 text-center sm:text-left">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-black uppercase tracking-wider text-amber-700">
                                    En attente d&apos;approbation
                                </span>
                                <span className="text-xs text-amber-800/80 font-medium">
                                    Cette commande est en cours de validation par un administrateur. 
                                </span>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 shadow-sm font-bold text-xs h-10 px-6 rounded-lg transition-transform active:scale-95"
                            onClick={() => navigate("/dashboard/approvals", { state: { fromDetails: true, type: "commandes", id: commande.id } })}
                        >
                            Menu Approbations
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Audit anomalies between devis / commande / facture */}
            {anomalyMessages.length > 0 && (
                <Card className="border-l-4 border-l-red-500 border-red-200 bg-red-50/40 dark:bg-red-900/10 overflow-hidden shadow-none rounded-xl">
                    <CardContent className="py-4 px-6 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-red-100 flex items-center justify-center text-red-600 shadow-sm">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-black uppercase tracking-wider text-red-700">
                                    Anomalies détectées entre devis / commande / facture
                                </p>
                                <p className="text-xs text-red-700/80 font-medium">
                                    Vérifiez ces écarts avant validation finale ({anomalyMessages.length} écart{anomalyMessages.length > 1 ? "s" : ""}).
                                </p>
                            </div>
                        </div>
                        <ul className="space-y-1 pl-2">
                            {anomalyMessages.map((msg, idx) => (
                                <li key={`${idx}-${msg}`} className="text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                                    <span>{msg}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {/* Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <User className="h-3.5 w-3.5 text-indigo-500" /> Client
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground truncate">{commande?.client_nom}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium italic underline decoration-indigo-200">Acheteur</p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Info className="h-3.5 w-3.5 text-indigo-500" /> Statut
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="mt-1">
                            {commande?.statut === 'validee' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                                    <CheckCircle2 className="h-3 w-3" /> Validée
                                </span>
                            ) : commande.statut === 'en_attente' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 shadow-sm animate-pulse">
                                    <Clock className="h-3 w-3" /> En attente
                                </span>
                            ) : commande.statut === 'livree' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-blue-100 text-blue-700 border border-blue-200 shadow-sm">
                                    <Truck className="h-3 w-3" /> Livrée
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200 shadow-sm">
                                    <XCircle className="h-3 w-3" /> Annulée
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Tag className="h-3.5 w-3.5 text-indigo-500" /> Réduction
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className={cn(
                            "text-lg font-black",
                            commande?.reduction ? "text-amber-600" : "text-muted-foreground/50"
                        )}>
                            {commande?.reduction ? `-${Number(commande.reduction).toFixed(1).replace('.', ',')}%` : "0,0 %"}
                        </p>
                        <p className="text-xs font-bold text-amber-700">
                            {`(${reductionAmountDh.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH)`}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-wide">Remise accordée</p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <ExternalLink className="h-3.5 w-3.5 text-indigo-500" /> Documents Liés
                    </CardHeader>
                    <CardContent className="p-4 pt-1 space-y-1.5">
                        {commande?.devis_id ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                onClick={() => navigate(`/dashboard/devis/${commande.devis_id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <FileText className="h-3 w-3" />
                                    <span>Devis {linkedDevisNumero || commande.devis_id}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                        {linkedFacture ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                                onClick={() => navigate(`/dashboard/factures/${linkedFacture.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Receipt className="h-3 w-3" />
                                    <span>Facture {linkedFacture.numero_facture || linkedFacture.id}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : (
                            <p className="text-[10px] text-muted-foreground italic mt-2">Aucune facture liée</p>
                        )}
                        {linkedReglement ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-100 transition-colors"
                                onClick={() => navigate(`/dashboard/reglements/details/client/${linkedReglement.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <FileText className="h-3 w-3" />
                                    <span>
                                        Règlement {buildReglementCode("client", Number(linkedReglement.id), String(linkedReglement.date_reglement || linkedReglement.created_at || ""), Number(linkedReglement.numero_recu || 0) || null, linkedReglement.sous_societe_nom, linkedReglement.numero_facture || linkedReglement.numero_commande)}
                                    </span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                        {linkedAvoir ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100 transition-colors"
                                onClick={() => navigate(`/dashboard/avoirs/${linkedAvoir.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <RotateCcw className="h-3 w-3" />
                                    <span>Avoir {linkedAvoir.numero_avoir || linkedAvoir.id}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                        {linkedRemboursement ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100 transition-colors"
                                onClick={() => navigate(`/dashboard/remboursements/${linkedRemboursement.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <RotateCcw className="h-3 w-3" />
                                    <span>Remboursement {formatRemboursementCode(linkedRemboursement)}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            {/* Items Table */}
            <Card className="border border-border shadow-md overflow-hidden bg-card">
                <CardHeader className="bg-muted/30 border-b border-border py-4 px-6 flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                            <Hash className="h-4 w-4" /> Detail de la commande
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground font-semibold">Produits et services inclus dans cet achat</p>
                    </div>
                    <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
                        {items.length} Article(s)
                    </span>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/10 border-b border-border">
                                    <TableHead className="w-[40%] text-[10px] font-black uppercase tracking-widest py-5 pl-8 text-foreground">Désignation</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">Qté</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">P.U</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">TVA</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">Remise</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-right py-5 pr-8 text-foreground">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, idx) => (
                                    <TableRow key={idx} className="border-b border-border/50 hover:bg-muted/5 transition-all">
                                        <TableCell className="pl-8 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-slate-400 group-hover:bg-white group-hover:text-indigo-600 transition-colors">
                                                    <Tag className="h-4 w-4" />
                                                </div>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                                    {formatDesignationWithReference(
                                                        item.designation,
                                                        item.reference || item.produit_reference || item.product_reference || null
                                                    )}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-black text-slate-700 dark:text-slate-300">
                                            {Number(item.quantite).toLocaleString("fr-FR")}
                                        </TableCell>
                                        <TableCell className="text-center font-medium text-slate-600 dark:text-slate-400">
                                            {Number(item.prix_unitaire).toLocaleString("fr-FR")} DH
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-[10px] font-bold text-slate-500">
                                                {Number(item.tva).toFixed(0)}%
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={cn(
                                                "px-2.5 py-1 rounded text-[10px] font-bold",
                                                item.reduction > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-50 text-slate-300"
                                            )}>
                                                {Number(item.reduction).toFixed(1).replace('.', ',')}%
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right pr-8 font-extrabold text-slate-800 dark:text-slate-200">
                                            {(
                                                (Number(item.montant_ht) || 0) *
                                                (1 + (Number(item.tva) || 0) / 100)
                                            ).toLocaleString("fr-FR")}{" "}
                                            DH
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2 opacity-30">
                                                <ShoppingCart className="h-12 w-12" />
                                                <p className="text-sm font-bold uppercase tracking-widest">Aucun article dans cette commande</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Totals Summary */}
            <div className="flex flex-col items-end gap-4">
                <Card className="w-full md:w-[320px] border border-border overflow-hidden bg-white dark:bg-zinc-900 shadow-xl relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 rounded-full -mr-16 -mt-16 transition-transform hover:scale-125" />
                    <CardContent className="p-6 space-y-4">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">TOTAL</span>
                                <span className="font-bold text-foreground">{Number(commande?.montant_ht).toLocaleString("fr-FR")} DH</span>
                            </div>
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">TVA Appliquée</span>
                                <span className="font-bold text-amber-500">+{Number(commande?.montant_tva).toLocaleString("fr-FR")} DH</span>
                            </div>
                        </div>
                        
                        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />
                        
                        <div className="flex flex-col gap-1 items-end pt-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Montant Net à Payer</span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-3xl font-black text-indigo-700 tracking-tight">
                                    {Number(commande?.montant_ttc).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-sm font-black text-indigo-600/60 uppercase">DH</span>
                            </div>
                        </div>
                    </CardContent>
                    <div className="bg-indigo-600 h-1.5 w-full" />
                </Card>
                
              
            </div>

            {/* Email Modal */}
            <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-600">
                            <Mail className="h-5 w-5" />
                            Envoyer la commande par email
                        </DialogTitle>
                        <DialogDescription>
                            Envoyez ce document directement au client. Le PDF sera joint automatiquement.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="to">Email du destinataire <span className="text-red-500">*</span></Label>
                            <Input
                                id="to"
                                type="email"
                                placeholder="client@exemple.com"
                                value={emailData.to}
                                onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="subject">Sujet</Label>
                            <Input
                                id="subject"
                                value={emailData.subject}
                                onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="message">Message</Label>
                            <Textarea
                                id="message"
                                rows={5}
                                value={emailData.message}
                                onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
                                className="resize-none"
                            />
                        </div>
                        <div className="pt-2">
                            <span className="text-sm font-semibold mb-2 block">Pièce(s) jointe(s)</span>
                            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded bg-indigo-100 text-indigo-600">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate">Commande_{commande?.numero_commande}.pdf</p>
                                    <p className="text-xs text-muted-foreground">Document PDF généré automatiquement</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="sm:justify-between">
                        <Button
                            variant="ghost"
                            onClick={() => setIsEmailModalOpen(false)}
                            disabled={isSendingEmail}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleSendEmail}
                            disabled={isSendingEmail || !emailData.to}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {isSendingEmail ? (
                                <>
                                    <RefreshCcw className="h-4 w-4 animate-spin" />
                                    Envoi en cours...
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4" />
                                    Envoyer
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Remboursements History Modal */}
            <Dialog open={isRemboursementsModalOpen} onOpenChange={setIsRemboursementsModalOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-700">
                            <RotateCcw className="h-5 w-5" />
                            Historique des remboursements
                        </DialogTitle>
                        <DialogDescription>
                            Liste de tous les remboursements liés à la commande #{commande?.numero_commande}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Référence</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Montant</TableHead>
                                    <TableHead className="text-center">Statut</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {remboursementsHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground font-medium">
                                            <div className="flex flex-col items-center gap-2 opacity-40">
                                                <RotateCcw className="h-8 w-8" />
                                                <span>Aucun remboursement lié à cette commande.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    remboursementsHistory.map((r) => {
                                        const statut = String(r.statut || "").toLowerCase();
                                        const statutLabel =
                                            statut === "valide" || statut === "approuve" || statut === "approuvé"
                                                ? "Validé"
                                                : statut === "rejete" || statut === "rejeté"
                                                    ? "Rejeté"
                                                    : "En attente";
                                        const statutClass =
                                            statut === "valide" || statut === "approuve" || statut === "approuvé"
                                                ? "bg-emerald-100 text-emerald-700"
                                                : statut === "rejete" || statut === "rejeté"
                                                    ? "bg-red-100 text-red-700"
                                                    : "bg-amber-100 text-amber-700";

                                        return (
                                            <TableRow key={r.id}>
                                                <TableCell className="font-semibold text-xs text-indigo-600">
                                                    {formatRemboursementCode({
                                                        id: Number(r.id),
                                                        created_at: String(r.created_at || new Date().toISOString()),
                                                    })}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {new Date(r.created_at).toLocaleDateString("fr-FR")}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-xs">
                                                    {Number(r.montant || 0).toLocaleString("fr-FR", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}{" "}
                                                    DH
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", statutClass)}>
                                                        {statutLabel}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Reglements History Modal */}
            <Dialog open={isReglementsModalOpen} onOpenChange={setIsReglementsModalOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-600">
                            <Clock className="h-5 w-5" />
                            Historique des règlements
                        </DialogTitle>
                        <DialogDescription>
                            Liste de tous les règlements enregistrés pour la commande #{commande?.numero_commande}.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Référence</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Mode de paiement</TableHead>
                                    <TableHead className="text-right">Montant</TableHead>
                                    <TableHead className="text-center">Statut</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reglements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-medium">
                                            <div className="flex flex-col items-center gap-2 opacity-40">
                                                <Receipt className="h-8 w-8" />
                                                <span>Aucun règlement saisi pour cette commande.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    reglements.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="text-xs font-semibold">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/dashboard/reglements/details/client/${r.id}`)}
                                                    className="text-indigo-700 hover:underline"
                                                >
                                                    {buildReglementCode("client", Number(r.id), String(r.date_reglement || r.created_at || ""), Number(r.numero_recu || 0) || null, (r as any).sous_societe_nom, (r as any).numero_facture || (r as any).numero_commande)}
                                                </button>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {new Date(r.date_reglement).toLocaleDateString("fr-FR")}
                                            </TableCell>
                                            <TableCell className="text-xs font-semibold capitalize">
                                                {r.mode_paiement}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-sm">
                                                {Number(r.montant).toLocaleString()} DH
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {r.statut === 'approuve' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">
                                                        Validé
                                                    </span>
                                                ) : r.statut === 'en_attente' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                                                        En attente
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700">
                                                        {r.statut}
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsReglementsModalOpen(false)}>Fermer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );


}

