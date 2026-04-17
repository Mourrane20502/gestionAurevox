import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Button } from "@/components/common/ui/button";
import {
    RotateCcw,
    User,
    Calendar,
    ArrowUpRight,
    Clock,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    ArrowLeft,
    Hash,
    ExternalLink,
    Info,
    Tag,
    RefreshCcw,
    Printer,
} from "lucide-react";
import { toast } from "sonner";
import { generateAvoirGrosPdfFromApiRow } from "@/components/pdf/GrosDocumentPdf";

interface AvoirGrosItem {
    id?: number;
    designation?: string;
    produit_nom?: string;
    reference?: string | null;
    produit_reference?: string | null;
    product_reference?: string | null;
    grammage: number;
    prix_unitaire: number;
    taux_tva: number;
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

interface AvoirGrosDetails {
    id: number;
    numero_avoir: string;
    date_avoir: string;
    client_nom: string;
    grammage: number;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    statut: string;
    facture_gros_id?: number | null;
    facture_gros_numero?: string | null;
    items?: AvoirGrosItem[];
}

export default function AvoirGrosDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [doc, setDoc] = useState<AvoirGrosDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);

    const token = localStorage.getItem("token");

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return;
            setIsLoading(true);
            try {
                const res = await fetch(`/api/avoirs-gros/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    setDoc(await res.json());
                } else {
                    toast.error("Impossible de charger l'avoir gros");
                }
            } catch {
                toast.error("Erreur lors du chargement de l'avoir gros");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [id, token]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-600 border-t-transparent shadow-lg shadow-orange-200" />
                <p className="text-muted-foreground text-sm font-medium animate-pulse">Chargement avoir gros...</p>
            </div>
        );
    }

    if (!doc) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Card className="max-w-md w-full p-8 text-center border-border shadow-2xl">
                    <div className="mx-auto h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle className="h-8 w-8" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Avoir gros introuvable</h2>
                    <p className="text-muted-foreground mt-2">Ce document n&apos;existe plus ou a été déplacé.</p>
                    <Button className="mt-6 w-full bg-orange-600 hover:bg-orange-700 shadow-md" onClick={() => navigate(-1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Retourner à la liste
                    </Button>
                </Card>
            </div>
        );
    }

    const items = doc.items || [];

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(-1)}
                        className="rounded-full h-12 w-12 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 transition-all border border-transparent hover:border-orange-100"
                    >
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                            <span className="text-orange-600">Avoir Gros</span>
                            <span className="text-muted-foreground font-mono">#{doc.numero_avoir}</span>
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                            <Calendar className="h-3.5 w-3.5" />
                            Émis le {new Date(doc.date_avoir).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {doc.statut === "valide" && (
                        <Button
                            variant="outline"
                            disabled={isProcessingPdf}
                            onClick={async () => {
                                try {
                                    setIsProcessingPdf(true);
                                    await generateAvoirGrosPdfFromApiRow(doc as unknown as Record<string, unknown>);
                                } catch {
                                    toast.error("Erreur lors de la génération du PDF");
                                } finally {
                                    setIsProcessingPdf(false);
                                }
                            }}
                            className="gap-2 h-11 px-5 border-orange-200 text-orange-600 hover:bg-orange-50 hover:border-orange-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                        >
                            {isProcessingPdf ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            Imprimer PDF
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={() => navigate("/dashboard/avoirs-gros", { state: { editAvoirGrosId: doc.id } })}
                        className="h-11 px-6 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-200 dark:shadow-none transition-all active:scale-95 gap-2"
                    >
                        Modifier Avoir Gros
                        <ArrowUpRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {doc.statut === "en_attente" && (
                <Card className="border-l-4 border-l-amber-500 border-amber-100 bg-amber-50/40 dark:bg-amber-900/10 overflow-hidden shadow-none rounded-xl">
                    <CardContent className="py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-start gap-4 text-center sm:text-left">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
                                <Clock className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-black uppercase tracking-wider text-amber-700">En attente d&apos;approbation</span>
                                <span className="text-xs text-amber-800/80 font-medium">Cet avoir gros est en cours de validation par un administrateur.</span>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 shadow-sm font-bold text-xs h-10 px-6 rounded-lg transition-transform active:scale-95"
                            onClick={() => navigate("/dashboard/approvals", { state: { fromDetails: true, type: "gros", id: doc.id } })}
                        >
                            Menu Approbations
                        </Button>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <User className="h-3.5 w-3.5 text-orange-500" /> Client
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground truncate">{doc.client_nom}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium italic underline decoration-orange-200">Bénéficiaire</p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Info className="h-3.5 w-3.5 text-orange-500" /> Statut
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="mt-1">
                            {doc.statut === "valide" ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                                    <CheckCircle2 className="h-3 w-3" /> Validé
                                </span>
                            ) : doc.statut === "en_attente" ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 shadow-sm animate-pulse">
                                    <Clock className="h-3 w-3" /> En attente
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200 shadow-sm">
                                    <XCircle className="h-3 w-3" /> {doc.statut || "Rejeté"}
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <ExternalLink className="h-3.5 w-3.5 text-orange-500" /> Documents Liés
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        {doc.facture_gros_id ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                onClick={() => navigate(`/dashboard/factures-gros/${doc.facture_gros_id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <RotateCcw className="h-3 w-3" />
                                    <span>Facture {doc.facture_gros_numero || doc.facture_gros_id}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : (
                            <p className="text-[10px] text-muted-foreground italic mt-2">Aucune facture liée</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <RotateCcw className="h-3.5 w-3.5 text-orange-500" /> Type
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground">Avoir Gros</p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-wide">Retour ou correction</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-border shadow-md overflow-hidden bg-card">
                <CardHeader className="bg-muted/30 border-b border-border py-4 px-6 flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-orange-700 flex items-center gap-2">
                            <Hash className="h-4 w-4" /> Détail de l&apos;avoir gros
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground font-semibold">Produits retournés ou corrections</p>
                    </div>
                    <span className="text-[11px] font-black bg-orange-100 text-orange-700 px-3 py-1 rounded-full border border-orange-200">
                        {items.length} Article(s)
                    </span>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/10 border-b border-border">
                                    <TableHead className="w-[32%] text-[10px] font-black uppercase tracking-widest py-5 pl-8 text-foreground">Désignation</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">Prix / g</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">Grammage</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-right py-5 pr-8 text-foreground">Prix Net</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, idx) => (
                                    <TableRow key={item.id || idx} className="border-b border-border/50 hover:bg-muted/5 transition-all">
                                        <TableCell className="pl-8 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-slate-400">
                                                    <Tag className="h-4 w-4" />
                                                </div>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                                    {formatDesignationWithReference(
                                                        item.designation || item.produit_nom || "—",
                                                        item.reference || item.produit_reference || item.product_reference || null
                                                    )}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-medium text-slate-600 dark:text-slate-400">
                                            {Number(item.prix_unitaire).toLocaleString("fr-FR")} DH
                                        </TableCell>
                                        <TableCell className="text-center font-black text-slate-700 dark:text-slate-300">
                                            {Number(item.grammage).toLocaleString("fr-FR")} g
                                        </TableCell>
                                        <TableCell className="text-right pr-8 font-extrabold text-slate-800 dark:text-slate-200">
                                            {(
                                                (Number(item.montant_ht) || 0) +
                                                ((Number(item.montant_ht) || 0) * (Number(item.taux_tva) || 0)) / 100
                                            ).toLocaleString("fr-FR")}{" "}
                                            DH
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2 opacity-30">
                                                <RotateCcw className="h-12 w-12" />
                                                <p className="text-sm font-bold uppercase tracking-widest">Aucune ligne pour cet avoir gros</p>
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
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/5 rounded-full -mr-16 -mt-16 transition-transform hover:scale-125" />
                    <CardContent className="p-6 space-y-4">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-orange-600 transition-colors">Sous-total HT</span>
                                <span className="font-bold text-foreground">{Number(doc.montant_ht).toLocaleString("fr-FR")} DH</span>
                            </div>
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-orange-600 transition-colors">TVA</span>
                                <span className="font-bold text-orange-500">+{Number(doc.montant_tva).toLocaleString("fr-FR")} DH</span>
                            </div>
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-orange-600 transition-colors">Grammage</span>
                                <span className="font-bold text-foreground">{Number(doc.grammage).toLocaleString("fr-FR")} g</span>
                            </div>
                        </div>

                        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />

                        <div className="flex flex-col gap-1 items-end pt-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 mb-1">Montant Avoir TTC</span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-3xl font-black text-orange-700 tracking-tight">
                                    {Number(doc.montant_ttc).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-sm font-black text-orange-600/60 uppercase">DH</span>
                            </div>
                        </div>
                    </CardContent>
                    <div className="bg-orange-600 h-1.5 w-full" />
                </Card>
            </div>
        </div>
    );
}
