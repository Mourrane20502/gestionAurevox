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

const normalizeBlStatus = (status: string | null | undefined) => {
    const s = String(status || "").trim().toLowerCase();
    if (s === "livree" || s === "livré" || s === "livre" || s === "validee") return "livree";
    if (s === "annulee" || s === "annulée") return "annulee";
    return "en_attente";
};

export default function BonLivraisonDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [bl, setBl] = useState<BonLivraisonDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailData, setEmailData] = useState({ to: "", subject: "", message: "" });

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

    const normalizedStatus = useMemo(() => normalizeBlStatus(bl?.statut), [bl?.statut]);
    const formatDate = (value?: string) => String(value || "").slice(0, 10);

    const handlePrint = () => window.print();

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            toast.success("Lien copié");
        } catch {
            toast.error("Impossible de copier le lien");
        }
    };

    const handleSendEmail = () => {
        if (!emailData.to?.trim()) {
            toast.error("Veuillez renseigner un email");
            return;
        }
        const subject = encodeURIComponent(emailData.subject || "");
        const body = encodeURIComponent(`${emailData.message || ""}\n\nLien: ${window.location.href}`);
        window.location.href = `mailto:${emailData.to}?subject=${subject}&body=${body}`;
        setIsEmailModalOpen(false);
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
                        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate("/dashboard/bons-livraison")}>
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
                                    <Link to={`/dashboard/commandes/${bl.commande_id}`} className="text-[10px] text-indigo-600 flex items-center gap-1 font-bold uppercase bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">
                                        <CheckCircle2 className="h-3 w-3" /> Commande {bl.numero_commande || ""}
                                    </Link>
                                ) : <p className="text-xs text-muted-foreground">Aucune commande liée</p>}
                                {bl.devis_id ? (
                                    <Link to={`/dashboard/devis/${bl.devis_id}`} className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold uppercase bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                                        <CheckCircle2 className="h-3 w-3" /> Devis
                                    </Link>
                                ) : <p className="text-xs text-muted-foreground">Aucun devis lié</p>}
                                {bl.facture_id ? (
                                    <Link to={`/dashboard/factures/${bl.facture_id}`} className="text-[10px] text-blue-600 flex items-center gap-1 font-bold uppercase bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                                        <CheckCircle2 className="h-3 w-3" /> Facture
                                    </Link>
                                ) : <p className="text-xs text-muted-foreground">Aucune facture liée</p>}
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

