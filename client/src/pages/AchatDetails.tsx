import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import { Button } from "@/components/common/ui/button";
import {
    User,
    Calendar,
    ArrowLeft,
    Printer,
    Clock,
    CheckCircle2,
    AlertCircle,
    Package,
    Tag,
    Truck,
    RefreshCcw,
    Info,
    Receipt,
    Banknote
} from "lucide-react";
import { toast } from "sonner";
import { generateBonCommandeFournisseurPdf } from "@/components/pdf/BonCommandeFournisseurPdf";

interface AchatItem {
    id: number;
    numero: string;
    gestionnaire_id: number;
    fournisseur_id: number;
    product_id: number | null;
    designation_libre: string | null;
    quantite: number;
    prix_unitaire: number | null;
    date_achat: string;
    statut: string | null;
    tva: number | null;
    gestionnaire_nom: string;
    fournisseur_nom: string;
    produit_nom: string;
    montant_paye?: number;
}

export default function AchatDetails() {
    const { numero } = useParams<{ numero: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [items, setItems] = useState<AchatItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!numero) return;
            setIsLoading(true);
            try {
                const res = await fetch(`/api/achats-fournisseurs/numero/${numero}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setItems(data);
                } else {
                    toast.error("Impossible de charger les détails de la commande");
                }
            } catch (error) {
                console.error(error);
                toast.error("Erreur lors du chargement des détails");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [numero, token]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent shadow-lg shadow-indigo-200"></div>
                <p className="text-muted-foreground text-sm font-medium animate-pulse">Chargement commande...</p>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Card className="max-w-md w-full p-8 text-center border-border shadow-2xl">
                    <div className="mx-auto h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <AlertCircle className="h-8 w-8" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Commande introuvable</h2>
                    <p className="text-muted-foreground mt-2">Le bon de commande fournisseur n&apos;existe plus ou a été déplacé.</p>
                    <Button className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={() => navigate(-1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Retourner à la liste
                    </Button>
                </Card>
            </div>
        );
    }

    const firstItem = items[0];
    const totalHT = items.reduce((acc, it) => acc + (Number(it.prix_unitaire || 0) * Number(it.quantite || 0)), 0);
    const totalTVA = items.reduce((acc, it) => acc + (Number(it.prix_unitaire || 0) * Number(it.quantite || 0) * (Number(it.tva || 0) / 100)), 0);
    const totalTTC = totalHT + totalTVA;

    const handlePrint = async () => {
        try {
            setIsProcessingPdf(true);
            await generateBonCommandeFournisseurPdf({
                numero: firstItem.numero,
                fournisseur_nom: firstItem.fournisseur_nom,
                gestionnaire_nom: firstItem.gestionnaire_nom,
                date_commande: firstItem.date_achat,
                statut: firstItem.statut || "en_attente",
                items: items.map(it => ({
                    produit_nom: it.produit_nom,
                    quantite: Number(it.quantite || 0),
                    prix_unitaire: Number(it.prix_unitaire || 0),
                    tva: Number(it.tva || 0),
                    montant_ht: Number(it.prix_unitaire || 0) * Number(it.quantite || 0)
                }))
            });
        } catch (error) {
            console.error(error);
            toast.error("Erreur génération PDF");
        } finally {
            setIsProcessingPdf(false);
        }
    };

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
                            <span className="text-muted-foreground font-mono">#{numero}</span>
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                            <Calendar className="h-3.5 w-3.5" />
                            Passée le {new Date(firstItem.date_achat).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2.5">
                    <Button
                        variant="outline"
                        disabled={isProcessingPdf}
                        onClick={handlePrint}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        {isProcessingPdf ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Bon de Commande PDF
                    </Button>
                </div>
            </div>

            {/* Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Truck className="h-3.5 w-3.5 text-indigo-500" /> Fournisseur
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground truncate">{firstItem.fournisseur_nom}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-wide">Partenaire</p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <User className="h-3.5 w-3.5 text-indigo-500" /> Gestionnaire
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground truncate">{firstItem.gestionnaire_nom}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-wide">Saisie de commande</p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Info className="h-3.5 w-3.5 text-indigo-500" /> Statut
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="mt-1">
                            {(() => {
                                const approved = ["approuve", "valide", "accepte"];
                                const allApproved = items.every((it) => approved.includes(String(it.statut ?? "")));
                                return allApproved ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                                        <CheckCircle2 className="h-3 w-3" /> Approuvé
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 shadow-sm animate-pulse">
                                        <Clock className="h-3 w-3" /> En attente
                                    </span>
                                );
                            })()}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Banknote className="h-3.5 w-3.5 text-emerald-500" /> Statut Règlement
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="mt-1">
                            {Number(firstItem.montant_paye || 0) >= totalTTC - 0.1 ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                                    <CheckCircle2 className="h-3 w-3" /> Payé
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200 shadow-sm">
                                    <AlertCircle className="h-3 w-3" /> Impayé
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Package className="h-3.5 w-3.5 text-indigo-500" /> Articles
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground">{items.length}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-wide">Lignes de commande</p>
                    </CardContent>
                </Card>
            </div>

            {/* Items Table */}
            <Card className="border border-border shadow-md overflow-hidden bg-card">
                <CardHeader className="bg-muted/30 border-b border-border py-4 px-6">
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                        <Receipt className="h-4 w-4" /> Liste des produits
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/10 border-b border-border">
                                    <TableHead className="pl-8 py-5 text-[10px] font-black uppercase tracking-widest text-foreground">Produit</TableHead>
                                    <TableHead className="text-center py-5 text-[10px] font-black uppercase tracking-widest text-foreground">Quantité</TableHead>
                                    <TableHead className="text-center py-5 text-[10px] font-black uppercase tracking-widest text-foreground">P.U.</TableHead>
                                    <TableHead className="text-center py-5 text-[10px] font-black uppercase tracking-widest text-foreground">TVA</TableHead>
                                    <TableHead className="text-right pr-8 py-5 text-[10px] font-black uppercase tracking-widest text-foreground">Total </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((it, idx) => (
                                    <TableRow key={idx} className="border-b border-border/50 hover:bg-muted/5 transition-all">
                                        <TableCell className="pl-8 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
                                                    <Tag className="h-5 w-5" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-foreground">{it.produit_nom}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter">
                                                        {it.designation_libre ? 'Saisie libre' : 'Référence stock'}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-black text-lg text-slate-800 dark:text-slate-200">
                                            {it.quantite}
                                        </TableCell>
                                        <TableCell className="text-center font-medium">
                                            {Number(it.prix_unitaire || 0).toLocaleString("fr-FR")} DH
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-[10px] font-bold text-slate-500">
                                                {Number(it.tva || 0).toFixed(0)}%
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right pr-8 font-extrabold text-indigo-600">
                                            {(Number(it.prix_unitaire || 0) * Number(it.quantite || 0)).toLocaleString("fr-FR")} DH
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Totals Summary */}
            <div className="flex flex-col items-end gap-4 mt-6">
                <Card className="w-full md:w-[320px] border border-border overflow-hidden bg-white dark:bg-zinc-900 shadow-xl relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 rounded-full -mr-16 -mt-16 transition-transform hover:scale-125" />
                    <CardContent className="p-6 space-y-4">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">TOTAL</span>
                                <span className="font-bold text-foreground">{totalHT.toLocaleString("fr-FR")} DH</span>
                            </div>
                            <div className="flex justify-between items-center group text-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">TVA Appliquée</span>
                                <span className="font-bold text-amber-500">+{totalTVA.toLocaleString("fr-FR")} DH</span>
                            </div>
                        </div>
                        
                        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />
                        
                        <div className="flex flex-col gap-1 items-end pt-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Montant Total</span>
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
                
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest border-t border-dashed border-border pt-4 pr-4">
                    Service Achats
                </p>
            </div>
        </div>
    );
}

