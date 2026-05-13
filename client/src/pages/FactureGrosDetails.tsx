import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Button } from "@/components/common/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/common/ui/dialog";
import {
    ArrowLeft,
    ArrowUpRight,
    Calendar,
    CheckCircle2,
    Clock,
    FileText,
    User,
    XCircle,
    AlertTriangle,
    Info,
    Tag,
    ExternalLink,
    ShoppingCart,
    FileDigit,
    Receipt,
    Printer,
    RefreshCcw,
    AlertCircle,
    Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateFactureGrosPdfFromApiRow } from "@/components/pdf/GrosDocumentPdf";
import { buildReglementCode } from "@/lib/reglementCode";

interface FactureGrosItem {
    id?: number;
    designation?: string;
    produit_nom?: string;
    reference?: string | null;
    produit_reference?: string | null;
    product_reference?: string | null;
    grammage: number;
    prix_unitaire: number;
    reduction: number;
    taux_tva: number;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
}

function formatDesignationWithReference(
    designation?: string | null,
    reference?: string | null
): string {
    const label = String(designation || "").trim() || "—";
    const ref = String(reference || "").trim();
    return ref ? `${label} (${ref})` : label;
}

interface FactureGrosDetails {
    id: number;
    numero_facture: string;
    date_facture: string;
    date_echeance?: string | null;
    client_id?: number;
    client_nom?: string;
    user_nom?: string | null;
    point_de_vente_nom?: string;
    commande_gros_id?: number | null;
    commande_gros_numero?: string | null;
    devis_gros_id?: number | null;
    devis_gros_numero?: string | null;
    banque_nom?: string | null;
    mode_paiement?: string | null;
    grammage: number;
    statut: string;
    prix_total?: number;
    reduction?: number;
    montant_ht: number;
    taux_tva?: number;
    montant_tva: number;
    montant_ttc: number;
    total_regle?: number;
    reste_a_payer?: number;
    items?: FactureGrosItem[];
}

interface ComparableDocument {
    id: number;
    numero?: string | null;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    reduction?: number;
    items?: FactureGrosItem[];
}

function fmtDh(n: number) {
    return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
}

function fmtDhExact(value: unknown) {
    const raw = String(value ?? "").trim();
    if (!raw) return "0 DH";
    return `${raw} DH`;
}

function resolvePrixParGrammeExact(it: FactureGrosItem) {
    const grammage = Number(it.grammage) || 0;
    const net =
        (Number((it as any).montant_ttc) || 0) ||
        ((Number(it.montant_ht) || 0) + (Number((it as any).montant_tva) || 0));
    if (grammage > 0 && net > 0) return `${net / grammage} DH`;
    return fmtDhExact(it.prix_unitaire);
}

function modeLabel(raw: string | undefined | null) {
    if (!raw) return "—";
    const m: Record<string, string> = {
        espece: "Espèce",
        cheque: "Chèque",
        virement: "Virement",
        carte: "Carte bancaire",
        effet: "Effet",
    };
    return m[String(raw).toLowerCase()] || raw;
}

export default function FactureGrosDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [doc, setDoc] = useState<FactureGrosDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [linkedAvoirGros, setLinkedAvoirGros] = useState<{ id: number; numero_avoir?: string } | null>(null);
    const [linkedCommandeDoc, setLinkedCommandeDoc] = useState<ComparableDocument | null>(null);
    const [linkedDevisDoc, setLinkedDevisDoc] = useState<ComparableDocument | null>(null);
    const [reglements, setReglements] = useState<any[]>([]);
    const linkedReglements = useMemo(
        () =>
            (Array.isArray(reglements) ? reglements : [])
                .slice()
                .sort((a: any, b: any) => {
                    const aMs = new Date(a?.date_reglement || a?.created_at || 0).getTime();
                    const bMs = new Date(b?.date_reglement || b?.created_at || 0).getTime();
                    return (Number.isNaN(bMs) ? 0 : bMs) - (Number.isNaN(aMs) ? 0 : aMs);
                }),
        [reglements]
    );
    const [isReglementsModalOpen, setIsReglementsModalOpen] = useState(false);

    useEffect(() => {
        const run = async () => {
            if (!id) return;
            setLoading(true);
            try {
                const res = await fetch(`/api/factures-gros/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    toast.error("Impossible de charger la facture gros");
                    return;
                }
                const data = await res.json();
                setDoc(data);
                if (data.commande_gros_id) {
                    const rc = await fetch(`/api/commandes-gros/${data.commande_gros_id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (rc.ok) {
                        const c = await rc.json();
                        setLinkedCommandeDoc({
                            id: Number(c.id) || Number(data.commande_gros_id),
                            numero: c.numero_commande || null,
                            montant_ht: Number(c.montant_ht) || 0,
                            montant_tva: Number(c.montant_tva) || 0,
                            montant_ttc: Number(c.montant_ttc) || 0,
                            reduction: Number(c.reduction) || 0,
                            items: Array.isArray(c.items) ? c.items : [],
                        });
                    }
                } else {
                    setLinkedCommandeDoc(null);
                }
                if (data.devis_gros_id) {
                    const rd = await fetch(`/api/devis-gros/${data.devis_gros_id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (rd.ok) {
                        const d = await rd.json();
                        setLinkedDevisDoc({
                            id: Number(d.id) || Number(data.devis_gros_id),
                            numero: d.numero_devis || null,
                            montant_ht: Number(d.montant_ht) || 0,
                            montant_tva: Number(d.montant_tva) || 0,
                            montant_ttc: Number(d.montant_ttc) || 0,
                            reduction: Number(d.reduction) || 0,
                            items: Array.isArray(d.items) ? d.items : [],
                        });
                    }
                } else {
                    setLinkedDevisDoc(null);
                }
                const avoRes = await fetch("/api/avoirs-gros", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (avoRes.ok) {
                    const avos = await avoRes.json();
                    const linked = avos.find((a: any) => Number(a.facture_gros_id) === Number(data.id));
                    if (linked) setLinkedAvoirGros({ id: linked.id, numero_avoir: linked.numero_avoir });
                }

                const regFacture = await fetch(`/api/reglements-clients-gros?factureGrosId=${data.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : []));
                setReglements(Array.isArray(regFacture) ? regFacture : []);
            } catch {
                toast.error("Erreur lors du chargement");
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [id, token]);

    const items = useMemo(() => (Array.isArray(doc?.items) ? doc!.items : []), [doc]);

    const anomalyMessages = useMemo(() => {
        if (!doc) return [] as string[];
        const epsilon = 0.01;
        const formatDh = (v: number) =>
            `${Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
        const formatPct = (v: number) =>
            `${Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
        const normalize = (s: string) => (s || "").trim().toLowerCase();
        const keyOf = (it: FactureGrosItem) =>
            [
                normalize(it.designation || it.produit_nom || ""),
                Number(it.prix_unitaire || 0).toFixed(2),
                Number(it.taux_tva || 0).toFixed(2),
                Number(it.reduction || 0).toFixed(2),
            ].join("|");
        const grammageByKey = (list: FactureGrosItem[]) => {
            const map = new Map<string, number>();
            for (const it of list || []) {
                const k = keyOf(it);
                map.set(k, (map.get(k) || 0) + Number(it.grammage || 0));
            }
            return map;
        };

        const messages: string[] = [];
        const facItems = Array.isArray(doc.items) ? doc.items : [];
        const refs: Array<{ label: string; doc: ComparableDocument | null }> = [
            { label: "Commande gros", doc: linkedCommandeDoc },
            { label: "Devis gros", doc: linkedDevisDoc },
        ];

        for (const { label, doc: refDoc } of refs) {
            if (!refDoc) continue;
            const refReduction = Number(refDoc.reduction || 0);
            const facReduction = Number(doc.reduction || 0);
            if (Math.abs(refReduction - facReduction) > epsilon) {
                messages.push(`${label}: écart de réduction (${formatPct(refReduction)} vs facture ${formatPct(facReduction)}).`);
            }
            const refHt = Number(refDoc.montant_ht || 0);
            const refTva = Number(refDoc.montant_tva || 0);
            const refTtc = Number(refDoc.montant_ttc || 0);
            const facHt = Number(doc.montant_ht || 0);
            const facTva = Number(doc.montant_tva || 0);
            const facTtc = Number(doc.montant_ttc || 0);
            if (Math.abs(refHt - facHt) > epsilon) messages.push(`${label}: écart montant HT (${formatDh(refHt)} vs facture ${formatDh(facHt)}).`);
            if (Math.abs(refTva - facTva) > epsilon) messages.push(`${label}: écart montant TVA (${formatDh(refTva)} vs facture ${formatDh(facTva)}).`);
            if (Math.abs(refTtc - facTtc) > epsilon) messages.push(`${label}: écart montant (${formatDh(refTtc)} vs facture ${formatDh(facTtc)}).`);

            const refItems = Array.isArray(refDoc.items) ? refDoc.items : [];
            if (refItems.length !== facItems.length) {
                messages.push(`${label}: nombre de lignes différent (${refItems.length} vs facture ${facItems.length}).`);
            }
            const refMap = grammageByKey(refItems);
            const facMap = grammageByKey(facItems);
            const allKeys = new Set<string>([...refMap.keys(), ...facMap.keys()]);
            for (const k of allKeys) {
                const rg = Number(refMap.get(k) || 0);
                const fg = Number(facMap.get(k) || 0);
                if (Math.abs(rg - fg) > epsilon) {
                    const [designation, pu, tva, red] = k.split("|");
                    messages.push(`${label}: ligne "${designation || "article"}" (PU ${pu}, TVA ${tva}%, Red ${red}%) grammage ${rg} vs facture ${fg}.`);
                }
            }
        }
        return messages;
    }, [doc, linkedCommandeDoc, linkedDevisDoc]);

    const handlePdf = async () => {
        if (!doc || !token) return;
        setPdfLoading(true);
        try {
            const res = await fetch(`/api/factures-gros/${doc.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error("Impossible de charger le document");
                return;
            }
            const data = await res.json();
            await generateFactureGrosPdfFromApiRow(data as Record<string, unknown>);
            toast.success("PDF téléchargé");
        } catch {
            toast.error("Erreur lors de la génération du PDF");
        } finally {
            setPdfLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent shadow-lg shadow-indigo-200" />
                <p className="text-muted-foreground text-sm font-medium animate-pulse">Chargement facture...</p>
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
                    <h2 className="text-xl font-bold text-foreground">Facture gros introuvable</h2>
                    <p className="text-muted-foreground mt-2">Ce document n&apos;existe plus ou a été déplacé.</p>
                    <Button className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={() => navigate(-1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Retourner à la liste
                    </Button>
                </Card>
            </div>
        );
    }

    const v = String(doc.statut || "").toLowerCase().trim();
    const isPending = v.includes("attente");
    const isUnpaid = v.includes("non_pay") || v === "non payée" || v === "non payee";
    const isPaid = v === "payee" || v === "payée" || v === "paye" || v === "reglee";

    const totalHT = Number(doc.montant_ht) || 0;
    const totalTVA = Number(doc.montant_tva) || 0;
    const totalTTC = Number(doc.montant_ttc) || totalHT + totalTVA;

    const echeance = doc.date_echeance ? new Date(doc.date_echeance) : null;
    const echeancePassed =
        echeance && !Number.isNaN(echeance.getTime()) ? echeance < new Date() && isUnpaid : false;

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
                            <span className="text-indigo-600">Facture gros</span>
                            <span className="text-muted-foreground font-mono">#{doc.numero_facture}</span>
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium flex-wrap">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            Émise le{" "}
                            {new Date(doc.date_facture).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                            })}
                            {doc.date_echeance ? (
                                <>
                                    <span className="text-border mx-1">|</span>
                                    <span className="text-foreground/80">
                                        Échéance :{" "}
                                        {new Date(doc.date_echeance).toLocaleDateString("fr-FR", {
                                            day: "numeric",
                                            month: "long",
                                            year: "numeric",
                                        })}
                                    </span>
                                </>
                            ) : null}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <Button
                        variant="outline"
                        disabled={pdfLoading}
                        onClick={handlePdf}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        {pdfLoading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Télécharger / Imprimer PDF
                    </Button>
                    <Button
                        size="sm"
                        onClick={() =>
                            navigate("/dashboard/factures-gros", { state: { editFactureGrosId: doc.id } })
                        }
                        className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 gap-2"
                    >
                        Modifier la facture gros
                        <ArrowUpRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {(() => {
                const montantTtc = Number(doc.montant_ttc) || 0;
                const totalRegleFromReglements = reglements
                    .filter((r: any) => r.statut === "approuve")
                    .reduce((sum: number, r: any) => sum + (Number(r.montant) || 0), 0);
                const totalRegle = Math.max(Number(doc.total_regle) || 0, totalRegleFromReglements);
                const rawReste =
                    typeof doc.reste_a_payer !== "undefined"
                        ? Math.max(Number(doc.reste_a_payer), montantTtc - totalRegle, 0)
                        : Math.max(montantTtc - totalRegle, 0);
                const isRegle =
                    v === "payee" ||
                    v === "payée" ||
                    v === "paye" ||
                    v === "reglee" ||
                    (montantTtc > 0 && totalRegle >= montantTtc - 0.01);
                const isReglementCommence = !isRegle && totalRegle > 0 && totalRegle < montantTtc - 0.01;
                const reste = isRegle ? 0 : Math.max(rawReste, 0);

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
                                    <div className="flex flex-col min-w-[130px]">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                            Reste à payer
                                        </span>
                                        <span className="text-base font-black text-foreground">
                                            {reste.toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            DH
                                        </span>
                                    </div>
                                )}
                                {!doc.commande_gros_id && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-red-600 uppercase font-bold tracking-wider">Aucune commande liée</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {!isRegle && (
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => navigate("/dashboard/reglements-gros", { state: { factureGrosId: doc.id, openDialog: true } })}
                                        className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 rounded-lg transition-all shadow-md"
                                    >
                                        <Banknote className="h-4 w-4" />
                                        Payer / Terminer le règlement
                                    </Button>
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
                            </div>
                        </CardContent>
                    </Card>
                );
            })()}

            {isPending && (
                <Card className="border-l-4 border-l-amber-500 border-amber-100 bg-amber-50/40 dark:bg-amber-900/10 overflow-hidden shadow-none rounded-xl">
                    <CardContent className="py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-start gap-4 text-center sm:text-left">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-black uppercase tracking-wider text-amber-700">
                                    En attente de validation
                                </span>
                                <span className="text-xs text-amber-800/80 font-medium">
                                    Cette facture gros est en cours de validation.
                                </span>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 shadow-sm font-bold text-xs h-10 px-6 rounded-lg transition-transform active:scale-95"
                            onClick={() =>
                                navigate("/dashboard/approvals", {
                                    state: { fromDetails: true, type: "factures", id: doc.id },
                                })
                            }
                        >
                            Menu Approbations
                        </Button>
                    </CardContent>
                </Card>
            )}

            {anomalyMessages.length > 0 && (
                <Card className="border-l-4 border-l-red-500 border-red-200 bg-red-50/40 dark:bg-red-900/10 overflow-hidden shadow-none rounded-xl">
                    <CardContent className="py-4 px-6 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-red-100 flex items-center justify-center text-red-600 shadow-sm">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-black uppercase tracking-wider text-red-700">
                                    Anomalies détectées entre devis / commande / facture gros
                                </p>
                                <p className="text-xs text-red-700/80 font-medium">
                                    Vérifiez ces écarts ({anomalyMessages.length} écart{anomalyMessages.length > 1 ? "s" : ""}).
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <User className="h-3.5 w-3.5 text-indigo-500" /> Client
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-lg font-black text-foreground truncate">{doc.client_nom || "—"}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                {modeLabel(doc.mode_paiement)}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Info className="h-3.5 w-3.5 text-indigo-500" /> Statut
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="mt-1">
                            {isPaid ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                                    <CheckCircle2 className="h-3 w-3" /> Payée
                                </span>
                            ) : isPending ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 shadow-sm animate-pulse">
                                    <Clock className="h-3 w-3" /> En attente
                                </span>
                            ) : isUnpaid ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200 shadow-sm">
                                    <AlertCircle className="h-3 w-3" /> Impayée
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-slate-100 text-slate-700 border border-slate-200 shadow-sm">
                                    <XCircle className="h-3 w-3" /> {doc.statut || "—"}
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Échéance
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p
                            className={cn(
                                "text-lg font-black",
                                echeancePassed ? "text-red-600" : "text-foreground"
                            )}
                        >
                            {doc.date_echeance
                                ? new Date(doc.date_echeance).toLocaleDateString("fr-FR")
                                : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-wide">
                            Date limite de paiement
                        </p>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <ExternalLink className="h-3.5 w-3.5 text-indigo-500" /> Documents liés
                    </CardHeader>
                    <CardContent className="p-4 pt-1 space-y-1.5">
                        {doc.devis_gros_id ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                onClick={() => navigate(`/dashboard/devis-gros/${doc.devis_gros_id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <FileDigit className="h-3 w-3" />
                                    <span>Devis {doc.devis_gros_numero || doc.devis_gros_id}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                        {doc.commande_gros_id ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                                onClick={() => navigate(`/dashboard/commandes-gros/${doc.commande_gros_id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <ShoppingCart className="h-3 w-3" />
                                    <span>Commande {doc.commande_gros_numero || doc.commande_gros_id}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : (
                            <p className="text-[10px] text-muted-foreground italic mt-2">Aucune commande liée</p>
                        )}
                        {linkedAvoirGros ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-100 transition-colors"
                                onClick={() => navigate(`/dashboard/avoirs-gros/${linkedAvoirGros.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Receipt className="h-3 w-3" />
                                    <span>Avoir gros {linkedAvoirGros.numero_avoir || linkedAvoirGros.id}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : null}
                        {linkedReglements.length > 0 ? (
                            <div className="space-y-1.5">
                                {linkedReglements.map((r: any) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-100 transition-colors"
                                        onClick={() => navigate(`/dashboard/reglements/details/client_gros/${r.id}`)}
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <Receipt className="h-3 w-3 shrink-0" />
                                            <span className="truncate">
                                                Règlement {buildReglementCode("client_gros", Number(r.id), String(r.date_reglement || r.created_at || ""), Number(r.numero_recu || 0) || null, r.sous_societe_nom, r.numero_facture || r.numero_commande)}
                                            </span>
                                        </div>
                                        <ArrowUpRight className="h-3 w-3 shrink-0" />
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-border shadow-md overflow-hidden bg-card">
                <CardHeader className="bg-muted/30 border-b border-border py-4 px-6 flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                            <Receipt className="h-4 w-4" /> Détail de la facture gros
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground font-semibold">
                            Récapitulatif des lignes au grammage
                        </p>
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
                                    <TableHead className="w-[28%] text-[10px] font-black uppercase tracking-widest py-5 pl-8 text-foreground">
                                        Désignation
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                                        Prix / g
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                                        Grammage
                                    </TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                                        Prix Net
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((it, idx) => (
                                    <TableRow key={it.id ?? idx} className="border-b border-border/50 hover:bg-muted/5 transition-all">
                                        <TableCell className="pl-8 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-slate-400">
                                                    <Tag className="h-4 w-4" />
                                                </div>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                                    {formatDesignationWithReference(
                                                        it.designation || it.produit_nom || "—",
                                                        it.reference || it.produit_reference || it.product_reference || null
                                                    )}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-medium text-slate-600 dark:text-slate-400">
                                            {resolvePrixParGrammeExact(it)}
                                        </TableCell>
                                        <TableCell className="text-center font-black text-slate-700 dark:text-slate-300">
                                            {Number(it.grammage || 0).toLocaleString("fr-FR")} g
                                        </TableCell>
                                        <TableCell className="text-right pr-8 font-extrabold text-slate-800 dark:text-slate-200">
                                            {fmtDh(
                                                (Number(it.montant_ttc) || 0) ||
                                                    (Number(it.montant_ht) || 0) + (Number(it.montant_tva) || 0)
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2 opacity-30">
                                                <FileText className="h-12 w-12" />
                                                <p className="text-sm font-bold uppercase tracking-widest">Aucune ligne</p>
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
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">
                                    Total
                                </span>
                                <span className="text-sm font-bold text-foreground">{fmtDh(totalHT)}</span>
                            </div>
                           
                        </div>
                        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />
                        <div className="flex flex-col gap-1 items-end pt-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">
                                Montant Total
                            </span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-3xl font-black text-indigo-700 tracking-tight">
                                    {totalTTC.toLocaleString("fr-FR", {
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

            <Dialog open={isReglementsModalOpen} onOpenChange={setIsReglementsModalOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-600 font-black">
                            <Clock className="h-5 w-5" />
                            Historique des règlements
                        </DialogTitle>
                        <DialogDescription className="font-medium">
                            Liste de tous les règlements enregistrés pour la facture gros #{doc.numero_facture}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Référence</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Mode</TableHead>
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
                                                <span>Aucun règlement saisi pour cette facture.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    reglements.map((r: any) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="text-xs font-semibold">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/dashboard/reglements/details/client_gros/${r.id}`)}
                                                    className="text-indigo-700 hover:underline"
                                                >
                                                    {buildReglementCode("client_gros", Number(r.id), String(r.date_reglement || r.created_at || ""), Number(r.numero_recu || 0) || null, (r as any).sous_societe_nom, (r as any).numero_facture || (r as any).numero_commande)}
                                                </button>
                                            </TableCell>
                                            <TableCell className="text-xs">{new Date(r.date_reglement).toLocaleDateString("fr-FR")}</TableCell>
                                            <TableCell className="text-xs font-semibold capitalize">{r.mode_paiement || "—"}</TableCell>
                                            <TableCell className="text-right font-black text-sm">
                                                {Number(r.montant || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {r.statut === "approuve" ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                        <CheckCircle2 className="h-2.5 w-2.5" /> Validé
                                                    </span>
                                                ) : r.statut === "en_attente" ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200">
                                                        <Clock className="h-2.5 w-2.5" /> En attente
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200">
                                                        <XCircle className="h-2.5 w-2.5" /> {r.statut}
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
