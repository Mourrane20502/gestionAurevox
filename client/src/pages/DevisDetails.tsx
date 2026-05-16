import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Button } from "@/components/common/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/common/ui/dialog";
import { Input } from "@/components/common/ui/input";
import { Textarea } from "@/components/common/ui/textarea";
import { Label } from "@/components/common/ui/label";
import { 
    FileText, 
    ArrowUpRight, 
    Calendar, 
    User, 
    Printer, 
    AlertTriangle, 
    ArrowLeft, 
    Hash, 
    CheckCircle2, 
    Clock, 
    Tag, 
    Info, 
    ExternalLink,
    ShoppingCart,
    Receipt,
    Truck,
    RefreshCcw,
    XCircle,
    Mail,
    Send,
    Link as LinkIcon,
    Check
} from "lucide-react";
import { toast } from "sonner";
import { generateDevisPdf } from "@/components/pdf/DevisPdf";
import { cn } from "@/lib/utils";
import { buildReglementCode } from "@/lib/reglementCode";
import { formatLineTotalPuQty } from "@/lib/documentLineTotal";

interface DevisItem {
    id?: number;
    designation: string;
    reference?: string | null;
    produit_reference?: string | null;
    product_reference?: string | null;
    photo?: string | null;
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
    if (ref) return `${label} (${ref})`;
    return label;
}

interface DevisDetails {
    id: number;
    numero_devis: string;
    date_devis: string;
    montant_ht: number;
    taux_tva: number;
    montant_tva: number;
    montant_ttc?: number;
    statuts_devis: string;
    client_nom: string;
    items?: DevisItem[];
    reduction?: number;
    total_reduction?: number;
    bon_livraison_id?: number | null;
    numero_bon_livraison_linked?: string | null;
}

export default function DevisDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [devis, setDevis] = useState<DevisDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);
    const [linkedCommandes, setLinkedCommandes] = useState<{ id: number; numero_commande?: string }[]>([]);
    const [linkedCommandeIds, setLinkedCommandeIds] = useState<number[]>([]);
    const [linkedFactures, setLinkedFactures] = useState<{ id: number; numero_facture?: string }[]>([]);
    const [linkedReglements, setLinkedReglements] = useState<any[]>([]);

    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailData, setEmailData] = useState({ to: '', subject: '', message: '' });
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isLinkCopied, setIsLinkCopied] = useState(false);

    const token = localStorage.getItem("token");
    const getProductPhotoUrl = (photo?: string | null) => {
        const p = String(photo || "").trim();
        if (!p) return null;
        if (/^https?:\/\//i.test(p)) return p;
        const base = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
        return `${base}/uploads/${encodeURIComponent(p)}`;
    };



    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return;
            setIsLoading(true);
            try {
                const res = await fetch(`/api/devis/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setDevis(data);
                    setEmailData({
                        to: data.client_email || '',
                        subject: `[Devis] ${data.numero_devis}`,
                        message: `Bonjour,\n\nVeuillez trouver ci-joint votre devis ${data.numero_devis}.\n\nCordialement,`
                    });
                    
                    const headers = { Authorization: `Bearer ${token}` };
                    Promise.all([
                        fetch("/api/commandes", { headers }).then(r => r.ok ? r.json() : []),
                        fetch("/api/factures", { headers }).then(r => r.ok ? r.json() : []),
                    ])
                        .then(([cmds, facts]) => {
                            const relatedCommandes = (Array.isArray(cmds) ? cmds : [])
                                .filter((c: any) => Number(c?.devis_id) === Number(data.id));
                            const ids = relatedCommandes
                                .map((c: any) => Number(c?.id))
                                .filter((n) => Number.isFinite(n) && n > 0);
                            setLinkedCommandeIds(ids);
                            setLinkedCommandes(
                                relatedCommandes.map((c: any) => ({
                                    id: Number(c.id),
                                    numero_commande: c.numero_commande,
                                }))
                            );

                            const cmdIds = new Set(ids);
                            const list = (Array.isArray(facts) ? facts : [])
                                .filter((f: any) =>
                                    Number(f?.devis_id) === Number(data.id) ||
                                    cmdIds.has(Number(f?.commande_id))
                                )
                                .map((f: any) => ({ id: Number(f.id), numero_facture: f.numero_facture }))
                                .filter((f) => Number.isFinite(f.id) && f.id > 0);
                            const seen = new Set<number>();
                            const deduped = list.filter((f) => {
                                if (seen.has(f.id)) return false;
                                seen.add(f.id);
                                return true;
                            });
                            setLinkedFactures(deduped);
                        })
                        .catch(() => { /* ignore */ });
                } else {
                    toast.error("Impossible de charger le devis");
                }
            } catch {
                toast.error("Erreur lors du chargement du devis");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [id, token]);

    useEffect(() => {
        if (!token) return;
        if (linkedCommandeIds.length === 0 && linkedFactures.length === 0) {
            setLinkedReglements([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const requests: Promise<any>[] = [
                    ...linkedCommandeIds.map((commandeId) =>
                        fetch(`/api/reglements-clients?commandeId=${commandeId}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        }).then((r) => (r.ok ? r.json() : []))
                    ),
                    ...linkedFactures.map((f) =>
                        fetch(`/api/reglements-clients?factureId=${f.id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        }).then((r) => (r.ok ? r.json() : []))
                    ),
                ];
                const rows = await Promise.all(requests);
                if (cancelled) return;
                const rowsMerged = [
                    ...((rows || []).flat()),
                ];
                const seen = new Set<number>();
                const deduped = rowsMerged.filter((r: any) => {
                    const idNum = Number(r?.id);
                    if (!Number.isFinite(idNum)) return true;
                    if (seen.has(idNum)) return false;
                    seen.add(idNum);
                    return true;
                });
                setLinkedReglements(deduped);
            } catch {
                if (!cancelled) {
                    setLinkedReglements([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [linkedCommandeIds, linkedFactures, token]);

    const handleSendEmail = async () => {
        if (!emailData.to) {
            toast.error("Veuillez renseigner l'adresse email du destinataire.");
            return;
        }
        setIsSendingEmail(true);
        try {
            const res = await fetch(`/api/devis/${id}/send-email`, {
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
        const downloadUrl = `${window.location.origin}/api/devis/${id}/pdf/download`;
        navigator.clipboard.writeText(downloadUrl)
            .then(() => {
                setIsLinkCopied(true);
                toast.success("Lien de téléchargement sécurisé copié");
                setTimeout(() => setIsLinkCopied(false), 3000);
            })
            .catch(() => toast.error("Échec de la copie du lien"));
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent shadow-lg shadow-indigo-200"></div>
                <p className="text-muted-foreground text-sm font-medium animate-pulse">Chargement en cours...</p>
            </div>
        );
    }

    if (!devis) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Card className="max-w-md w-full p-8 text-center border-border shadow-2xl">
                    <div className="mx-auto h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle className="h-8 w-8" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Devis introuvable</h2>
                    <p className="text-muted-foreground mt-2">Le document que vous recherchez n&apos;existe pas ou a été supprimé.</p>
                    <Button className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={() => navigate(-1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Retourner à la liste
                    </Button>
                </Card>
            </div>
        );
    }

    const items = devis.items || [];
    const totalHT = items.reduce((acc, it) => acc + (Number(it.montant_ht) || 0), 0);
    const totalTVA = devis.montant_tva || 0;
    const totalTTC = devis.montant_ttc ?? (totalHT + totalTVA);
    const reductionAmountDh =
        items.length > 0
            ? items.reduce((acc, it) => {
                  const bruteHT = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
                  const redPct = Number(it.reduction) || 0;
                  return acc + (bruteHT * redPct) / 100;
              }, 0)
            : Number(devis.total_reduction) || 0;

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500">
            {/* Header section with back button and actions */}
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
                            <span className="text-indigo-600">Devis</span>
                            <span className="text-muted-foreground font-mono">#{devis.numero_devis}</span>
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                            <Calendar className="h-3.5 w-3.5" />
                            Créé le {new Date(devis.date_devis).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2.5 flex-wrap">
                    <Button
                        variant="outline"
                        onClick={handleCopyLink}
                        disabled={devis?.statuts_devis !== "accepté"}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                        title={devis?.statuts_devis !== "accepté" ? "Le lien de téléchargement est réservé aux devis acceptés par l'admin." : undefined}
                    >
                        {isLinkCopied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
                        {isLinkCopied ? "Lien copié!" : "Générer lien"}
                    </Button>
                    
                    <Button
                        variant="outline"
                        disabled={isProcessingPdf || devis?.statuts_devis !== "accepté"}
                        onClick={async () => {
                            if (devis?.statuts_devis !== "accepté") return;
                            try {
                                setIsProcessingPdf(true);
                                await generateDevisPdf(devis as any);
                            } catch (error) {
                                console.error("Erreur génération PDF devis:", error);
                                toast.error("Erreur lors de la génération du PDF");
                            } finally {
                                setIsProcessingPdf(false);
                            }
                        }}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                        title={devis?.statuts_devis !== "accepté" ? "Le téléchargement est réservé aux devis acceptés par l'admin." : undefined}
                    >
                        {isProcessingPdf ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Télécharger / Imprimer PDF
                    </Button>
                    
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
                        onClick={() => navigate("/dashboard/devis", { state: { devisId: devis.id } })}
                        className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 gap-2"
                    >
                        Modifier Devis
                        <ArrowUpRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Warning if pending */}
            {devis.statuts_devis === "en attente" && (
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
                                    Ce document n&apos;est pas encore validé. Vous pouvez le gérer via le menu des approbations.
                                </span>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 shadow-sm font-bold text-xs h-10 px-6 rounded-lg transition-transform active:scale-95"
                            onClick={() => navigate("/dashboard/approvals", { state: { fromDetails: true, type: "devis", id: devis.id } })}
                        >
                            Menu Approbations
                        </Button>
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
                        <p className="text-lg font-black text-foreground truncate">{devis.client_nom}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium italic underline decoration-indigo-200">Destinataire du devis</p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Info className="h-3.5 w-3.5 text-indigo-500" /> Statut
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="mt-1">
                            {devis.statuts_devis === "accepté" ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                                    <CheckCircle2 className="h-3 w-3" /> Devis Accepté
                                </span>
                            ) : (devis.statuts_devis === "rejeté" || devis.statuts_devis === "refusé") ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200 shadow-sm">
                                    <XCircle className="h-3 w-3" /> Devis Refusé
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">
                                    <Clock className="h-3 w-3" /> En Validation
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
                            devis.reduction ? "text-amber-600" : "text-muted-foreground/50"
                        )}>
                            {devis.reduction ? `-${Number(devis.reduction).toFixed(1).replace('.', ',')}%` : "0,0 %"}
                        </p>
                        <p className="text-xs font-bold text-amber-700">
                            {`(${reductionAmountDh.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH)`}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-wide">Remise globale</p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <ExternalLink className="h-3.5 w-3.5 text-indigo-500" /> Documents Liés
                    </CardHeader>
                    <CardContent className="p-4 pt-1 space-y-1.5">
                        {linkedCommandes.length > 0 ? (
                            linkedCommandes.map((c) => (
                                <button
                                    key={`linked-cmd-${c.id}`}
                                    type="button"
                                    className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                    onClick={() => navigate(`/dashboard/commandes/${c.id}`)}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <ShoppingCart className="h-3 w-3" />
                                        <span>Commande {c.numero_commande || c.id}</span>
                                    </div>
                                    <ArrowUpRight className="h-3 w-3" />
                                </button>
                            ))
                        ) : (
                            <p className="text-[10px] text-muted-foreground italic mt-2">Aucune commande liée</p>
                        )}
                        {linkedFactures.map((f) => (
                            <button
                                key={`linked-fac-${f.id}`}
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                                onClick={() => navigate(`/dashboard/factures/${f.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Receipt className="h-3 w-3" />
                                    <span>Facture {f.numero_facture || f.id}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ))}
                        {devis && Number(devis.bon_livraison_id) > 0 ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-100 transition-colors"
                                onClick={() => navigate(`/dashboard/bons-livraison/${devis.bon_livraison_id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Truck className="h-3 w-3" />
                                    <span>
                                        Bon de livraison {devis.numero_bon_livraison_linked || `#${devis.bon_livraison_id}`}
                                    </span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                        {linkedReglements.map((r: any) => (
                            <button
                                key={`linked-reg-${r.id}`}
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-100 transition-colors"
                                onClick={() => navigate(`/dashboard/reglements/details/client/${r.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Receipt className="h-3 w-3" />
                                    <span>
                                        Règlement {buildReglementCode("client", Number(r.id), String(r.date_reglement || r.created_at || ""), Number(r.numero_recu || 0) || null, r.sous_societe_nom, r.numero_facture || r.numero_commande)}
                                    </span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* Items Table */}
            <Card className="border border-border shadow-md overflow-hidden bg-card">
                <CardHeader className="bg-muted/30 border-b border-border py-4 px-6 flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                            <Hash className="h-4 w-4" /> Détails du devis
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground font-semibold">Liste détaillée des produits et prestations</p>
                    </div>
                    <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
                        {items.length} Ligne(s)
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
                                            <div className="flex items-center gap-3 group/img">
                                                <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-slate-400 overflow-hidden">
                                                    {getProductPhotoUrl(item.photo) ? (
                                                        <>
                                                            <img src={getProductPhotoUrl(item.photo) || ""} alt={item.designation || "Produit"} className="h-full w-full object-cover cursor-zoom-in transition-opacity hover:opacity-80" />
                                                            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden group-hover/img:flex z-[9999] pointer-events-none items-center justify-center">
                                                                <div className="w-80 h-80 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.4)] border-8 border-white dark:border-slate-800 p-1 animate-in fade-in zoom-in duration-300">
                                                                    <img src={getProductPhotoUrl(item.photo) || ""} alt={item.designation || "Produit"} className="w-full h-full object-cover rounded-xl" />
                                                                    <div className="absolute -bottom-10 left-0 right-0 py-2 text-white text-sm font-bold uppercase tracking-widest text-center bg-indigo-600/90 backdrop-blur-sm rounded-lg shadow-xl">
                                                                        {item.designation || "Produit"}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <Tag className="h-4 w-4" />
                                                    )}
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
                                        <TableCell className="text-right pr-8 font-extrabold text-slate-800 dark:text-slate-200 tabular-nums">
                                            {formatLineTotalPuQty(item)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2 opacity-30">
                                                <FileText className="h-12 w-12" />
                                                <p className="text-sm font-bold uppercase tracking-widest">Aucun article trouvé</p>
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
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">Total HT</span>
                                <span className="text-sm font-bold text-foreground tabular-nums">
                                    {totalHT.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                                </span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">TVA Appliquée</span>
                                <span className="text-sm font-bold text-amber-500">+{totalTVA.toLocaleString("fr-FR")} DH</span>
                            </div>
                        </div>
                        
                        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />
                        
                        <div className="flex flex-col gap-1 items-end pt-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Total net à payer TTC</span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-3xl font-black text-indigo-700 tracking-tight">
                                    {totalTTC.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-600">
                            <Mail className="h-5 w-5" />
                            Envoyer le devis par email
                        </DialogTitle>
                        <DialogDescription>
                            Veuillez vérifier les informations ci-dessous avant d'envoyer.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="to" className="font-bold">À (Email) *</Label>
                            <Input
                                id="to"
                                value={emailData.to}
                                onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                                placeholder="client@exemple.com"
                                className="border-indigo-100 focus-visible:ring-indigo-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="subject" className="font-bold">Objet du message</Label>
                            <Input
                                id="subject"
                                value={emailData.subject}
                                onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                                className="border-indigo-100 focus-visible:ring-indigo-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="message" className="font-bold">Message (Ci-joint vous trouverez...)</Label>
                            <Textarea
                                id="message"
                                value={emailData.message}
                                onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
                                rows={5}
                                className="border-indigo-100 focus-visible:ring-indigo-500 resize-none"
                            />
                        </div>
                        <div className="pt-2">
                            <span className="text-sm font-semibold mb-2 block">Pièce(s) jointe(s)</span>
                            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded bg-red-100 text-red-600">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate">Devis_{devis.numero_devis}.pdf</p>
                                    <p className="text-xs text-muted-foreground">Document PDF généré automatiquement</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEmailModalOpen(false)}>Annuler</Button>
                        <Button 
                            onClick={handleSendEmail} 
                            disabled={isSendingEmail}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {isSendingEmail ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Envoyer l'email
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}



