import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Textarea } from "@/components/common/ui/textarea";
import {
    Banknote,
    ArrowLeft,
    ArrowUpRight,
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    ExternalLink,
    FileText,
    Hash,
    Info,
    Link as LinkIcon,
    Mail,
    Printer,
    Receipt,
    RefreshCcw,
    Send,
    ShoppingCart,
    Tag,
    Truck,
    User,
    AlertTriangle,
    XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildReglementCode } from "@/lib/reglementCode";

type BlItem = {
    id?: number;
    designation?: string;
    reference?: string | null;
    produit_reference?: string | null;
    product_reference?: string | null;
    quantite?: number;
    prix_unitaire?: number;
    tva?: number;
    reduction?: number;
    montant_ht?: number;
    photo?: string | null;
};

type BonLivraison = {
    id: number;
    numero_bon_livraison?: string;
    date_bon_livraison?: string;
    commande_id?: number;
    numero_commande?: string;
    devis_id?: number | null;
    facture_id?: number | null;
    numero_devis?: string | null;
    numero_facture?: string | null;
    client_nom?: string;
    client_email?: string | null;
    statut?: string;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    user_nom?: string | null;
    point_de_vente_nom?: string | null;
    sous_societe_nom?: string | null;
    items?: BlItem[];
    /** Dernier règlement client lié (commande ou facture), enrichi par l’API détail */
    reglement_lie?: { id: number; date_reglement?: string; numero_recu?: number | null } | null;
};

function formatDesignationWithReference(
    designation?: string | null,
    reference?: string | null
): string {
    const label = String(designation || "").trim() || "—";
    const ref = String(reference || "").trim();
    if (ref) return `${label} (${ref})`;
    return label;
}

const roundMoney = (v: number) => Math.round(v * 100) / 100;

const lineMontantHt = (item: BlItem) => roundMoney(Number(item.montant_ht) || 0);

/** TTC ligne = montant HT × (1 + TVA % / 100) */
const lineMontantTtc = (item: BlItem) => {
    const ht = lineMontantHt(item);
    const tvaPct = Number(item.tva) || 0;
    if (Math.abs(tvaPct) < 0.005) return ht;
    return roundMoney(ht * (1 + tvaPct / 100));
};

export default function BonLivraisonDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [bl, setBl] = useState<BonLivraison | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailData, setEmailData] = useState({ to: "", subject: "", message: "" });
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isLinkCopied, setIsLinkCopied] = useState(false);

    const getProductPhotoUrl = (photo?: string | null) => {
        const p = String(photo || "").trim();
        if (!p) return null;
        if (/^https?:\/\//i.test(p)) return p;
        const base = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
        return `${base}/uploads/${encodeURIComponent(p)}`;
    };

    const load = async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/bons-livraison/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setBl(data);
            setEmailData({
                to: String(data?.client_email || "").trim(),
                subject: `[Bon de livraison] ${data?.numero_bon_livraison || ""}`,
                message: `Bonjour,\n\nVeuillez trouver ci-joint le bon de livraison ${data?.numero_bon_livraison || ""}.\n\nCordialement,`,
            });
        } catch {
            toast.error("Bon de livraison introuvable.");
            setBl(null);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [id, token]);

    const handleCopyLink = () => {
        const downloadUrl = `${window.location.origin}/api/bons-livraison/${id}/pdf/download`;
        navigator.clipboard
            .writeText(downloadUrl)
            .then(() => {
                setIsLinkCopied(true);
                toast.success("Lien de téléchargement sécurisé copié");
                setTimeout(() => setIsLinkCopied(false), 3000);
            })
            .catch(() => toast.error("Échec de la copie du lien"));
    };

    const downloadPdf = async () => {
        if (!id) return;
        setIsProcessingPdf(true);
        try {
            const res = await fetch(`/api/bons-livraison/${id}/pdf/download`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || "PDF impossible");
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Bon_Livraison_${bl?.numero_bon_livraison || id}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("PDF téléchargé");
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Erreur PDF");
        } finally {
            setIsProcessingPdf(false);
        }
    };

    const handleSendEmail = async () => {
        if (!emailData.to.trim()) {
            toast.error("Veuillez renseigner l'adresse email du destinataire.");
            return;
        }
        setIsSendingEmail(true);
        try {
            const res = await fetch(`/api/bons-livraison/${id}/send-email`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(emailData),
            });
            const d = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success(d.message || "Email envoyé avec succès");
                setIsEmailModalOpen(false);
            } else {
                toast.error(d.message || "Erreur lors de l'envoi de l'email");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setIsSendingEmail(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent shadow-lg shadow-indigo-200" />
                <p className="text-muted-foreground text-sm font-medium animate-pulse">Chargement bon de livraison...</p>
            </div>
        );
    }

    if (!bl) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Card className="max-w-md w-full p-8 text-center border-border shadow-2xl">
                    <div className="mx-auto h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle className="h-8 w-8" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Bon de livraison introuvable</h2>
                    <p className="text-muted-foreground mt-2">Ce document n&apos;existe plus ou a été déplacé.</p>
                    <Button
                        className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md"
                        onClick={() => navigate("/dashboard/bons-livraison")}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Retourner à la liste
                    </Button>
                </Card>
            </div>
        );
    }

    const items = bl.items || [];
    const statutNorm = String(bl.statut || "").toLowerCase().replace(/\s+/g, "_");
    const isAnnule =
        statutNorm === "annulé" ||
        statutNorm === "annulée" ||
        statutNorm === "annulee" ||
        statutNorm === "annule";
    const isLivree =
        statutNorm === "livré" ||
        statutNorm === "livree" ||
        statutNorm === "livre" ||
        statutNorm === "validee" ||
        statutNorm === "validée";
    const showApprovalsBanner = statutNorm === "en_attente" || statutNorm === "brouillon";

    const dateBl = bl.date_bon_livraison
        ? new Date(String(bl.date_bon_livraison).slice(0, 10)).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : "—";

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500">
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
                        <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2 flex-wrap">
                            <span className="text-indigo-600">Bon de livraison</span>
                            <span className="text-muted-foreground font-mono">#{bl.numero_bon_livraison || bl.id}</span>
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                            <Calendar className="h-3.5 w-3.5" />
                            {dateBl}
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

                    <Button
                        variant="outline"
                        disabled={isProcessingPdf}
                        onClick={downloadPdf}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        {isProcessingPdf ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Télécharger PDF
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => setIsEmailModalOpen(true)}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        <Mail className="h-4 w-4" />
                        Envoyer par Email
                    </Button>
                </div>
            </div>

            {showApprovalsBanner && (
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
                                    Ce bon de livraison est en cours de validation par un administrateur.
                                </span>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 shadow-sm font-bold text-xs h-10 px-6 rounded-lg transition-transform active:scale-95"
                            onClick={() =>
                                navigate("/dashboard/approvals", {
                                    state: { fromDetails: true, type: "bons_livraison", id: bl.id },
                                })
                            }
                        >
                            Menu Approbations
                        </Button>
                    </CardContent>
                </Card>
            )}

            <Card
                className={cn(
                    "border rounded-xl overflow-hidden shadow-sm",
                    isLivree
                        ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10"
                        : isAnnule
                          ? "border-slate-200 bg-slate-50/60 dark:bg-slate-900/20"
                          : "border-amber-200 bg-amber-50/50 dark:bg-amber-900/10"
                )}
            >
                <CardContent className="py-3 px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <span
                            className={cn(
                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold uppercase",
                                isLivree
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : isAnnule
                                      ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            )}
                        >
                            {isLivree ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4" /> Livré
                                </>
                            ) : isAnnule ? (
                                <>
                                    <XCircle className="h-4 w-4" /> Annulé
                                </>
                            ) : (
                                <>
                                    <Clock className="h-4 w-4" /> En attente
                                </>
                            )}
                        </span>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Montant TTC</span>
                            <span className="text-sm font-black text-foreground">
                                {Number(bl.montant_ttc || 0).toLocaleString("fr-FR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}{" "}
                                DH
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Truck className="h-5 w-5 text-indigo-500" />
                        <span className="text-xs font-semibold">Document de sortie stock / livraison</span>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <User className="h-3.5 w-3.5 text-indigo-500" /> Client
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground truncate">{bl.client_nom || "—"}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium italic underline decoration-indigo-200">
                            Destinataire
                        </p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Info className="h-3.5 w-3.5 text-indigo-500" /> Statut
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="mt-1">
                            {isLivree ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                                    <CheckCircle2 className="h-3 w-3" /> Livré
                                </span>
                            ) : isAnnule ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-slate-200 text-slate-700 border border-slate-300 shadow-sm">
                                    <XCircle className="h-3 w-3" /> Annulé
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 shadow-sm animate-pulse">
                                    <Clock className="h-3 w-3" /> En attente
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Truck className="h-3.5 w-3.5 text-indigo-500" /> Point de vente
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground truncate">{bl.point_de_vente_nom || "—"}</p>
                        {bl.sous_societe_nom ? (
                            <p className="text-xs text-muted-foreground mt-1 font-medium">{bl.sous_societe_nom}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground mt-1 font-medium italic">Sous-société</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <ExternalLink className="h-3.5 w-3.5 text-indigo-500" /> Documents liés
                    </CardHeader>
                    <CardContent className="p-4 pt-1 space-y-1.5">
                        {bl.commande_id ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100 transition-colors"
                                onClick={() => navigate(`/dashboard/commandes/${bl.commande_id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <ShoppingCart className="h-3 w-3" />
                                    <span>
                                        Commande {String(bl.numero_commande || "").trim() || `#${bl.commande_id}`}
                                    </span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                        {bl.devis_id ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                onClick={() => navigate(`/dashboard/devis/${bl.devis_id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <FileText className="h-3 w-3" />
                                    <span>
                                        Devis{" "}
                                        {String(bl.numero_devis || "").trim() || `#${bl.devis_id}`}
                                    </span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                        {bl.facture_id ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                                onClick={() => navigate(`/dashboard/factures/${bl.facture_id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Receipt className="h-3 w-3" />
                                    <span>
                                        Facture{" "}
                                        {String(bl.numero_facture || "").trim() || `#${bl.facture_id}`}
                                    </span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : (
                            <p className="text-[10px] text-muted-foreground italic mt-2">Aucune facture liée</p>
                        )}
                        {bl.reglement_lie?.id ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-100 transition-colors dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900"
                                onClick={() =>
                                    navigate(`/dashboard/reglements/details/client/${bl.reglement_lie!.id}`)
                                }
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <Banknote className="h-3 w-3 shrink-0" />
                                    <span className="truncate text-left">
                                        Règlement{" "}
                                        {buildReglementCode(
                                            "client",
                                            bl.reglement_lie.id,
                                            bl.reglement_lie.date_reglement,
                                            bl.reglement_lie.numero_recu ?? null,
                                            bl.sous_societe_nom ?? null,
                                            bl.numero_facture || bl.numero_commande || null
                                        )}
                                    </span>
                                </div>
                                <ArrowUpRight className="h-3 w-3 shrink-0" />
                            </button>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            {bl.user_nom ? (
                <p className="text-xs text-muted-foreground -mt-2">
                    <span className="font-bold text-foreground/80">Commercial :</span> {bl.user_nom}
                </p>
            ) : null}

            <Card className="border border-border shadow-md overflow-hidden bg-card">
                <CardHeader className="bg-muted/30 border-b border-border py-4 px-6 flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                            <Hash className="h-4 w-4" /> Détail du bon de livraison
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground font-semibold">Articles inclus dans cette livraison</p>
                    </div>
                    <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
                        {items.length} article(s)
                    </span>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/10 border-b border-border">
                                    <TableHead className="w-[40%] text-[10px] font-black uppercase tracking-widest py-5 pl-8 text-foreground">
                                        Désignation
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                                        Qté
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                                        P.U
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                                        Prix HT
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                                        TVA
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                                        Remise
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-right py-5 pr-8 text-foreground">
                                        Total TTC
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, idx) => (
                                    <TableRow key={item.id ?? idx} className="border-b border-border/50 hover:bg-muted/5 transition-all">
                                        <TableCell className="pl-8 py-4">
                                            <div className="flex items-center gap-3 group/img">
                                                <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-slate-400 overflow-hidden">
                                                    {getProductPhotoUrl(item.photo) ? (
                                                        <img
                                                            src={getProductPhotoUrl(item.photo) || ""}
                                                            alt={item.designation || "Produit"}
                                                            className="h-full w-full object-cover"
                                                        />
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
                                        <TableCell className="text-center font-bold tabular-nums">
                                            {Number(item.quantite || 0).toLocaleString("fr-FR", {
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 2,
                                            })}
                                        </TableCell>
                                        <TableCell className="text-center tabular-nums font-medium text-slate-600 dark:text-slate-400">
                                            {Number(item.prix_unitaire || 0).toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            DH
                                        </TableCell>
                                        <TableCell className="text-center font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                                            {lineMontantHt(item).toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            DH
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-[10px] font-bold text-slate-500">
                                                {Number(item.tva || 0).toFixed(0)}%
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span
                                                className={cn(
                                                    "px-2.5 py-1 rounded text-[10px] font-bold",
                                                    Number(item.reduction) > 0
                                                        ? "bg-amber-100 text-amber-600"
                                                        : "bg-slate-50 text-slate-300"
                                                )}
                                            >
                                                {Number(item.reduction || 0).toFixed(1).replace(".", ",")}%
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right pr-8 font-extrabold text-slate-800 dark:text-slate-200 tabular-nums">
                                            {lineMontantTtc(item).toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            DH
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2 opacity-30">
                                                <Truck className="h-12 w-12" />
                                                <p className="text-sm font-bold uppercase tracking-widest">Aucun article sur ce BL</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-col items-end gap-4">
                <Card className="w-full md:w-[320px] border border-border overflow-hidden bg-white dark:bg-zinc-900 shadow-xl relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 rounded-full -mr-16 -mt-16 transition-transform hover:scale-125" />
                    <CardContent className="p-6 space-y-4">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">
                                    Total HT
                                </span>
                                <span className="font-bold text-foreground tabular-nums">
                                    {Number(bl.montant_ht || 0).toLocaleString("fr-FR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}{" "}
                                    DH
                                </span>
                            </div>
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">
                                    TVA appliquée
                                </span>
                                <span className="font-bold text-amber-500 tabular-nums">
                                    +{Number(bl.montant_tva || 0).toLocaleString("fr-FR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}{" "}
                                    DH
                                </span>
                            </div>
                        </div>

                        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />

                        <div className="flex flex-col gap-1 items-end pt-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Total net à payer TTC</span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-3xl font-black text-indigo-700 tracking-tight">
                                    {Number(bl.montant_ttc || 0).toLocaleString("fr-FR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                                <span className="text-sm font-black text-indigo-600/60 uppercase">DH</span>
                            </div>
                        </div>
                    </CardContent>
                    <div className="bg-indigo-600 h-1.5 w-full" />
                </Card>
            </div>

            <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-600">
                            <Mail className="h-5 w-5" />
                            Envoyer le bon de livraison par email
                        </DialogTitle>
                        <DialogDescription>
                            Envoyez ce document directement au client. Le PDF sera joint automatiquement.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="bl-to">
                                Email du destinataire <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="bl-to"
                                type="email"
                                placeholder="client@exemple.com"
                                value={emailData.to}
                                onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bl-subject">Sujet</Label>
                            <Input
                                id="bl-subject"
                                value={emailData.subject}
                                onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bl-message">Message</Label>
                            <Textarea
                                id="bl-message"
                                rows={5}
                                value={emailData.message}
                                onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
                                className="resize-none"
                            />
                        </div>
                        <div className="pt-2">
                            <span className="text-sm font-semibold mb-2 block">Pièce jointe</span>
                            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded bg-indigo-100 text-indigo-600">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate">
                                        Bon_Livraison_{bl.numero_bon_livraison || id}.pdf
                                    </p>
                                    <p className="text-xs text-muted-foreground">Document PDF généré automatiquement</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsEmailModalOpen(false)}>
                            Annuler
                        </Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                            onClick={handleSendEmail}
                            disabled={isSendingEmail}
                        >
                            {isSendingEmail ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Envoyer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
