import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Button } from "@/components/common/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/common/ui/dialog";
import { Input } from "@/components/common/ui/input";
import { Textarea } from "@/components/common/ui/textarea";
import { Label } from "@/components/common/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, CheckCircle2, FileText, Truck, User, Printer, Mail, Send, Link as LinkIcon, ExternalLink, Package } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildReglementCode } from "@/lib/reglementCode";

interface BonLivraisonItem {
    id: number;
    designation?: string;
    quantite?: number;
    prix_unitaire?: number;
    tva?: number;
    reduction?: number;
    montant_ht?: number;
}

interface BonLivraisonDetails {
    id: number;
    numero_bon_livraison: string;
    date_bon_livraison: string;
    numero_commande?: string;
    commande_id?: number;
    devis_id?: number | null;
    facture_id?: number | null;
    client_nom?: string;
    user_nom?: string;
    point_de_vente_nom?: string;
    sous_societe_nom?: string;
    statut?: string;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    items?: BonLivraisonItem[];
}

interface ReglementLink {
    id: number;
    numero_recu?: number | null;
    statut?: string;
    facture_id?: number | null;
    commande_id?: number | null;
    date_reglement?: string | null;
    created_at?: string | null;
    sous_societe_nom?: string | null;
    numero_facture?: string | null;
    numero_commande?: string | null;
}

const normalizeBlStatus = (status: string | null | undefined) => {
    const s = String(status || "").trim().toLowerCase();
    if (s === "livree" || s === "livré" || s === "livre" || s === "validee") return "livree";
    if (s === "annulee" || s === "annulée" || s === "annule" || s === "annulé") return "annulee";
    return "en_attente";
};

export default function BonLivraisonDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [bl, setBl] = useState<BonLivraisonDetails | null>(null);
    const [linkedReglements, setLinkedReglements] = useState<ReglementLink[]>([]);
    const [linkedDevisCode, setLinkedDevisCode] = useState<string | null>(null);
    const [linkedFactureCode, setLinkedFactureCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailData, setEmailData] = useState({ to: "", subject: "", message: "" });
    const [autoDownloadHandled, setAutoDownloadHandled] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id || !token) return;
            setIsLoading(true);
            try {
                const res = await fetch(`/api/bons-livraison/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error();
                const data = await res.json();
                setBl(data);
                setEmailData({
                    to: "",
                    subject: `[BL] ${data.numero_bon_livraison || ""}`,
                    message: `Bonjour,\n\nVeuillez trouver le bon de livraison ${data.numero_bon_livraison || ""}.\n\nCordialement,`,
                });
            } catch {
                toast.error("Impossible de charger le détail du bon de livraison");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [id, token]);

    useEffect(() => {
        const fetchLinkedDocumentCodes = async () => {
            if (!token || !bl) {
                setLinkedDevisCode(null);
                setLinkedFactureCode(null);
                return;
            }
            try {
                if (bl.devis_id) {
                    const devisRes = await fetch(`/api/devis/${bl.devis_id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (devisRes.ok) {
                        const devisData = await devisRes.json();
                        setLinkedDevisCode(devisData?.numero_devis || null);
                    } else {
                        setLinkedDevisCode(null);
                    }
                } else {
                    setLinkedDevisCode(null);
                }

                if (bl.facture_id) {
                    const facRes = await fetch(`/api/factures/${bl.facture_id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (facRes.ok) {
                        const facData = await facRes.json();
                        setLinkedFactureCode(facData?.numero_facture || null);
                    } else {
                        setLinkedFactureCode(null);
                    }
                } else {
                    setLinkedFactureCode(null);
                }
            } catch {
                setLinkedDevisCode(null);
                setLinkedFactureCode(null);
            }
        };
        fetchLinkedDocumentCodes();
    }, [bl, token]);

    useEffect(() => {
        const fetchLinkedReglements = async () => {
            if (!token || !bl) {
                setLinkedReglements([]);
                return;
            }
            if (!bl.commande_id && !bl.facture_id) {
                setLinkedReglements([]);
                return;
            }
            try {
                const res = await fetch("/api/reglements-clients", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error();
                const rows = (await res.json()) as ReglementLink[];
                const filtered = (rows || []).filter((r) => {
                    const byFacture = bl.facture_id && Number(r.facture_id) === Number(bl.facture_id);
                    const byCommande = bl.commande_id && Number(r.commande_id) === Number(bl.commande_id);
                    return Boolean(byFacture || byCommande);
                });
                setLinkedReglements(filtered);
            } catch {
                setLinkedReglements([]);
            }
        };
        fetchLinkedReglements();
    }, [bl, token]);

    const normalizedStatus = useMemo(() => normalizeBlStatus(bl?.statut), [bl?.statut]);
    const formatDate = (value?: string) => String(value || "").slice(0, 10);

    const downloadBlPdf = async () => {
        if (!id || !token) return;
        try {
            const res = await fetch(`/api/bons-livraison/${id}/pdf/download`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Bon_Livraison_${bl?.numero_bon_livraison || id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success("PDF généré avec succès");
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        }
    };

    useEffect(() => {
        if (!id || !bl || autoDownloadHandled) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("downloadPdf") !== "1") return;
        setAutoDownloadHandled(true);
        downloadBlPdf();
        params.delete("downloadPdf");
        const nextQuery = params.toString();
        const cleanUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
        window.history.replaceState({}, document.title, cleanUrl);
    }, [id, bl, autoDownloadHandled]);

    const handlePrint = async () => downloadBlPdf();
    const handleCopyLink = async () => {
        if (!id) return;
        const link = `${window.location.origin}/dashboard/bons-livraison/${id}?downloadPdf=1`;
        try {
            await navigator.clipboard.writeText(link);
            toast.success("Lien de téléchargement copié");
        } catch {
            toast.error("Impossible de copier le lien");
        }
    };

    const handleSendEmail = async () => {
        if (!emailData.to?.trim()) {
            toast.error("Veuillez renseigner un email");
            return;
        }
        if (!id || !token) {
            toast.error("Session invalide");
            return;
        }
        try {
            const res = await fetch(`/api/bons-livraison/${id}/send-email`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    to: emailData.to.trim(),
                    subject: emailData.subject || "",
                    message: emailData.message || "",
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Erreur lors de l'envoi de l'email");
            toast.success("Email envoyé avec succès");
            setIsEmailModalOpen(false);
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de l'envoi");
        }
    };

    return (
        <div className="space-y-6">
            {!isLoading && bl && (
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/bons-livraison")} className="mt-1">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-black text-indigo-600 flex items-center gap-2 leading-tight">
                                <Truck className="h-8 w-8" />
                                Bon de livraison
                                <span className="text-foreground">#{bl.numero_bon_livraison}</span>
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                {formatDate(bl.date_bon_livraison)}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={handleCopyLink}>
                            <LinkIcon className="h-4 w-4 mr-2" />
                            Générer lien
                        </Button>
                        <Button variant="outline" onClick={handlePrint}>
                            <Printer className="h-4 w-4 mr-2" />
                            Imprimer PDF
                        </Button>
                        <Button variant="outline" onClick={() => setIsEmailModalOpen(true)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Envoyer par Email
                        </Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700"
                            onClick={() =>
                                bl?.id
                                    ? navigate("/dashboard/bons-livraison", { state: { editBonId: bl.id } })
                                    : toast.error("BL introuvable")
                            }
                        >
                            Modifier BL
                            <ExternalLink className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <Card><CardContent className="h-24" /></Card>
            ) : !bl ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground">Bon de livraison introuvable.</CardContent></Card>
            ) : (
                <>
                    <Card className={cn(
                        "border-l-4 shadow-none rounded-xl",
                        normalizedStatus === "livree"
                            ? "border-l-emerald-500 border-emerald-100 bg-emerald-50/40"
                            : normalizedStatus === "annulee"
                                ? "border-l-red-500 border-red-100 bg-red-50/40"
                                : "border-l-amber-500 border-amber-100 bg-amber-50/40"
                    )}>
                        <CardContent className="py-3 px-5 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-6">
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-[11px] uppercase font-bold",
                                        normalizedStatus === "livree"
                                            ? "border-emerald-300 text-emerald-700 bg-emerald-50/70"
                                            : normalizedStatus === "annulee"
                                                ? "border-red-300 text-red-700 bg-red-50/70"
                                                : "border-amber-300 text-amber-700 bg-amber-50/70"
                                    )}
                                >
                                    {normalizedStatus === "livree" ? "livré" : normalizedStatus === "annulee" ? "annulé" : "en attente"}
                                </Badge>
                                <div>
                                    <p className="text-[10px] uppercase font-black text-muted-foreground">Déjà livré</p>
                                    <p className="font-black text-indigo-700">{Number(bl.montant_ttc || 0).toFixed(2)} MAD</p>
                                </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                <span className="font-medium">Utilisateur:</span> {bl.user_nom || "—"}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <Card className="border border-border shadow-sm bg-card">
                            <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                <User className="h-3.5 w-3.5" /> Client
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <p className="text-2xl font-black text-foreground">{bl.client_nom || "—"}</p>
                                <p className="text-xs text-muted-foreground mt-1">PDV : {bl.point_de_vente_nom || "—"}</p>
                                <p className="text-xs text-muted-foreground">Société : {bl.sous_societe_nom || "—"}</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border shadow-sm bg-card">
                            <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                <FileText className="h-3.5 w-3.5" /> Statut
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] uppercase font-bold",
                                        normalizedStatus === "livree"
                                            ? "border-emerald-300 text-emerald-700 bg-emerald-50/70"
                                            : normalizedStatus === "annulee"
                                                ? "border-red-300 text-red-700 bg-red-50/70"
                                                : "border-amber-300 text-amber-700 bg-amber-50/70"
                                    )}
                                >
                                    {normalizedStatus === "livree" ? "livré" : normalizedStatus === "annulee" ? "annulé" : "en attente"}
                                </Badge>
                            </CardContent>
                        </Card>
                        <Card className="border border-border shadow-sm bg-card">
                            <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                <Package className="h-3.5 w-3.5" /> Totaux
                            </CardHeader>
                            <CardContent className="p-4 pt-1 space-y-1">
                                <p className="text-sm"><span className="text-muted-foreground">HT:</span> <span className="font-bold">{Number(bl.montant_ht || 0).toFixed(2)} MAD</span></p>
                                <p className="text-sm"><span className="text-muted-foreground">TVA:</span> <span className="font-bold">{Number(bl.montant_tva || 0).toFixed(2)} MAD</span></p>
                                <p className="text-sm"><span className="text-muted-foreground">TTC:</span> <span className="font-black text-indigo-600">{Number(bl.montant_ttc || 0).toFixed(2)} MAD</span></p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border shadow-sm bg-card">
                            <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Documents liés
                            </CardHeader>
                            <CardContent className="p-4 pt-1 space-y-1.5">
                                {bl.commande_id ? (
                                    <Link
                                        to={`/dashboard/commandes/${bl.commande_id}`}
                                        className="text-[10px] text-indigo-600 flex items-center justify-between gap-2 font-bold uppercase bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20 hover:bg-indigo-500/20 hover:underline cursor-pointer transition-colors"
                                        title="Ouvrir la commande liée"
                                    >
                                        <span className="flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" /> Commande {bl.numero_commande || ""}
                                        </span>
                                        <ExternalLink className="h-3 w-3" />
                                    </Link>
                                ) : <p className="text-xs text-muted-foreground">Aucune commande liée</p>}
                                {bl.devis_id ? (
                                    <Link
                                        to={`/dashboard/devis/${bl.devis_id}`}
                                        className="text-[10px] text-emerald-600 flex items-center justify-between gap-2 font-bold uppercase bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 hover:bg-emerald-500/20 hover:underline cursor-pointer transition-colors"
                                        title="Ouvrir le devis lié"
                                    >
                                        <span className="flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" /> Devis {linkedDevisCode || `#${bl.devis_id}`}
                                        </span>
                                        <ExternalLink className="h-3 w-3" />
                                    </Link>
                                ) : <p className="text-xs text-muted-foreground">Aucun devis lié</p>}
                                {bl.facture_id ? (
                                    <Link
                                        to={`/dashboard/factures/${bl.facture_id}`}
                                        className="text-[10px] text-blue-600 flex items-center justify-between gap-2 font-bold uppercase bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 hover:bg-blue-500/20 hover:underline cursor-pointer transition-colors"
                                        title="Ouvrir la facture liée"
                                    >
                                        <span className="flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" /> Facture {linkedFactureCode || `#${bl.facture_id}`}
                                        </span>
                                        <ExternalLink className="h-3 w-3" />
                                    </Link>
                                ) : <p className="text-xs text-muted-foreground">Aucune facture liée</p>}
                                {linkedReglements.length > 0 ? (
                                    linkedReglements.slice(0, 3).map((reg) => (
                                        <Link
                                            key={reg.id}
                                            to={`/dashboard/reglements/details/client/${reg.id}`}
                                            className="text-[10px] text-violet-600 flex items-center justify-between gap-2 font-bold uppercase bg-violet-500/10 px-2 py-1 rounded border border-violet-500/20 hover:bg-violet-500/20 hover:underline cursor-pointer transition-colors"
                                            title="Ouvrir le règlement lié"
                                        >
                                            <span className="flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Règlement {buildReglementCode(
                                                    "client",
                                                    reg.id,
                                                    String(reg.date_reglement || reg.created_at || ""),
                                                    Number(reg.numero_recu || 0) || null,
                                                    reg.sous_societe_nom,
                                                    reg.numero_facture || reg.numero_commande
                                                )}
                                            </span>
                                            <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    ))
                                ) : (
                                    <p className="text-xs text-muted-foreground">Aucun règlement lié</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="border border-border shadow-sm overflow-x-auto">
                        <CardHeader>
                            <CardTitle className="text-lg">Éléments du bon de livraison</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead>Désignation</TableHead>
                                        <TableHead className="text-center">Qté</TableHead>
                                        <TableHead className="text-right">Prix unitaire</TableHead>
                                        <TableHead className="text-center">TVA</TableHead>
                                        <TableHead className="text-center">Réduction</TableHead>
                                        <TableHead className="text-right pr-6">Montant HT</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(bl.items || []).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Aucun élément.</TableCell>
                                        </TableRow>
                                    ) : (
                                        (bl.items || []).map((it) => (
                                            <TableRow key={it.id}>
                                                <TableCell className="font-medium">{it.designation || "—"}</TableCell>
                                                <TableCell className="text-center">{Number(it.quantite || 0)}</TableCell>
                                                <TableCell className="text-right">{Number(it.prix_unitaire || 0).toFixed(2)}</TableCell>
                                                <TableCell className="text-center">{Number(it.tva || 20).toFixed(2)} %</TableCell>
                                                <TableCell className="text-center">{Number(it.reduction || 0).toFixed(2)} %</TableCell>
                                                <TableCell className="text-right pr-6 font-semibold">{Number(it.montant_ht || 0).toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                </>
            )}

            <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Envoyer BL par email</DialogTitle>
                        <DialogDescription>Préparez un email avec le lien du BL.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label>Destinataire</Label>
                            <Input
                                value={emailData.to}
                                onChange={(e) => setEmailData((p) => ({ ...p, to: e.target.value }))}
                                placeholder="client@email.com"
                            />
                        </div>
                        <div>
                            <Label>Objet</Label>
                            <Input
                                value={emailData.subject}
                                onChange={(e) => setEmailData((p) => ({ ...p, subject: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Message</Label>
                            <Textarea
                                value={emailData.message}
                                onChange={(e) => setEmailData((p) => ({ ...p, message: e.target.value }))}
                                rows={5}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsEmailModalOpen(false)}>Annuler</Button>
                        <Button onClick={handleSendEmail} className="bg-indigo-600 hover:bg-indigo-700">
                            <Send className="h-4 w-4 mr-2" />
                            Envoyer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

