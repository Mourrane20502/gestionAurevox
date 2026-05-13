import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Button } from "@/components/common/ui/button";
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
    Receipt,
    Printer,
    Hash,
    RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { generateDevisGrosPdfFromApiRow } from "@/components/pdf/GrosDocumentPdf";
import { buildReglementCode } from "@/lib/reglementCode";

interface DevisGrosItem {
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

interface DevisGrosDetails {
    id: number;
    numero_devis: string;
    date_devis: string;
    client_id?: number;
    client_nom?: string;
    user_nom?: string | null;
    grammage: number;
    statuts_devis: string;
    prix_total?: number;
    reduction?: number;
    montant_ht: number;
    taux_tva?: number;
    montant_tva: number;
    montant_ttc: number;
    items?: DevisGrosItem[];
}

interface ComparableDocument {
    id: number;
    numero?: string | null;
    montant_ht?: number;
    montant_tva?: number;
    montant_ttc?: number;
    reduction?: number;
    items?: DevisGrosItem[];
}

function fmtDh(n: number) {
    return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
}

function fmtDhExact(value: unknown) {
    const raw = String(value ?? "").trim();
    if (!raw) return "0 DH";
    return `${raw} DH`;
}

function resolvePrixParGrammeExact(it: DevisGrosItem) {
    const grammage = Number(it.grammage) || 0;
    const net =
        (Number((it as any).montant_ttc) || 0) ||
        ((Number(it.montant_ht) || 0) + (Number((it as any).montant_tva) || 0));
    if (grammage > 0 && net > 0) {
        return `${net / grammage} DH`;
    }
    return fmtDhExact(it.prix_unitaire);
}

export default function DevisGrosDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [doc, setDoc] = useState<DevisGrosDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [linkedCmd, setLinkedCmd] = useState<{ id: number; numero_commande: string } | null>(null);
    const [linkedFac, setLinkedFac] = useState<{ id: number; numero_facture: string } | null>(null);
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
    const [linkedCommandeDoc, setLinkedCommandeDoc] = useState<ComparableDocument | null>(null);
    const [linkedFactureDoc, setLinkedFactureDoc] = useState<ComparableDocument | null>(null);

    useEffect(() => {
        const run = async () => {
            if (!id) return;
            setLoading(true);
            try {
                const res = await fetch(`/api/devis-gros/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    toast.error("Impossible de charger le devis gros");
                    return;
                }
                setDoc(await res.json());
            } catch {
                toast.error("Erreur lors du chargement");
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [id, token]);

    useEffect(() => {
        if (!doc?.id || !token) return;
        let cancelled = false;
        (async () => {
            try {
                const [r1, r2] = await Promise.all([
                    fetch("/api/commandes-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/factures-gros", { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                if (cancelled) return;
                if (r1.ok) {
                    const rows = await r1.json();
                    const row = Array.isArray(rows)
                        ? rows.find((c: { devis_gros_id?: number }) => Number(c.devis_gros_id) === Number(doc.id))
                        : null;
                    setLinkedCmd(row ? { id: row.id, numero_commande: row.numero_commande } : null);
                    if (row?.id) {
                        const rc = await fetch(`/api/commandes-gros/${row.id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (rc.ok) {
                            const c = await rc.json();
                            if (!cancelled) {
                                setLinkedCommandeDoc({
                                    id: Number(c.id) || Number(row.id),
                                    numero: c.numero_commande || row.numero_commande || null,
                                    montant_ht: Number(c.montant_ht) || 0,
                                    montant_tva: Number(c.montant_tva) || 0,
                                    montant_ttc: Number(c.montant_ttc) || 0,
                                    reduction: Number(c.reduction) || 0,
                                    items: Array.isArray(c.items) ? c.items : [],
                                });
                            }
                        }
                    } else if (!cancelled) {
                        setLinkedCommandeDoc(null);
                    }
                } else setLinkedCmd(null);
                if (r2.ok) {
                    const rows = await r2.json();
                    const row = Array.isArray(rows)
                        ? rows.find((f: { devis_gros_id?: number }) => Number(f.devis_gros_id) === Number(doc.id))
                        : null;
                    setLinkedFac(row ? { id: row.id, numero_facture: row.numero_facture } : null);
                    if (row?.id) {
                        const rf = await fetch(`/api/factures-gros/${row.id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (rf.ok) {
                            const f = await rf.json();
                            if (!cancelled) {
                                setLinkedFactureDoc({
                                    id: Number(f.id) || Number(row.id),
                                    numero: f.numero_facture || row.numero_facture || null,
                                    montant_ht: Number(f.montant_ht) || 0,
                                    montant_tva: Number(f.montant_tva) || 0,
                                    montant_ttc: Number(f.montant_ttc) || 0,
                                    reduction: Number(f.reduction) || 0,
                                    items: Array.isArray(f.items) ? f.items : [],
                                });
                            }
                        }
                    } else if (!cancelled) {
                        setLinkedFactureDoc(null);
                    }
                } else setLinkedFac(null);
            } catch {
                if (!cancelled) {
                    setLinkedCmd(null);
                    setLinkedFac(null);
                    setLinkedCommandeDoc(null);
                    setLinkedFactureDoc(null);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [doc?.id, token]);

    useEffect(() => {
        if (!token) return;
        if (!linkedCmd?.id && !linkedFac?.id) {
            setReglements([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const [fromCommande, fromFacture] = await Promise.all([
                    linkedCmd?.id
                        ? fetch(`/api/reglements-clients-gros?commandeGrosId=${linkedCmd.id}`, {
                              headers: { Authorization: `Bearer ${token}` },
                          }).then((r) => (r.ok ? r.json() : []))
                        : Promise.resolve([]),
                    linkedFac?.id
                        ? fetch(`/api/reglements-clients-gros?factureGrosId=${linkedFac.id}`, {
                              headers: { Authorization: `Bearer ${token}` },
                          }).then((r) => (r.ok ? r.json() : []))
                        : Promise.resolve([]),
                ]);
                if (cancelled) return;
                const rows = [...(Array.isArray(fromCommande) ? fromCommande : []), ...(Array.isArray(fromFacture) ? fromFacture : [])];
                const deduped = Array.from(new Map(rows.map((r: any) => [Number(r?.id) || 0, r])).values());
                setReglements(deduped);
            } catch {
                if (!cancelled) setReglements([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [linkedCmd?.id, linkedFac?.id, token]);

    const items = useMemo(() => (Array.isArray(doc?.items) ? doc!.items : []), [doc]);

    const anomalyMessages = useMemo(() => {
        if (!doc) return [] as string[];
        const epsilon = 0.01;
        const formatDh = (v: number) =>
            `${Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
        const formatPct = (v: number) =>
            `${Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
        const normalize = (s: string) => (s || "").trim().toLowerCase();
        const keyOf = (it: DevisGrosItem) =>
            [
                normalize(it.designation || it.produit_nom || ""),
                Number(it.prix_unitaire || 0).toFixed(2),
                Number(it.taux_tva || 0).toFixed(2),
                Number(it.reduction || 0).toFixed(2),
            ].join("|");
        const grammageByKey = (list: DevisGrosItem[]) => {
            const map = new Map<string, number>();
            for (const it of list || []) {
                const k = keyOf(it);
                map.set(k, (map.get(k) || 0) + Number(it.grammage || 0));
            }
            return map;
        };

        const messages: string[] = [];
        const devisItems = Array.isArray(doc.items) ? doc.items : [];
        const refs: Array<{ label: string; doc: ComparableDocument | null }> = [
            { label: "Commande gros", doc: linkedCommandeDoc },
            { label: "Facture gros", doc: linkedFactureDoc },
        ];

        for (const { label, doc: refDoc } of refs) {
            if (!refDoc) continue;
            const refReduction = Number(refDoc.reduction || 0);
            const devisReduction = Number(doc.reduction || 0);
            if (Math.abs(refReduction - devisReduction) > epsilon) {
                messages.push(`${label}: écart de réduction (${formatPct(refReduction)} vs devis ${formatPct(devisReduction)}).`);
            }
            const refHt = Number(refDoc.montant_ht || 0);
            const refTva = Number(refDoc.montant_tva || 0);
            const refTtc = Number(refDoc.montant_ttc || 0);
            const devisHt = Number(doc.montant_ht || 0);
            const devisTva = Number(doc.montant_tva || 0);
            const devisTtc = Number(doc.montant_ttc || 0);
            if (Math.abs(refHt - devisHt) > epsilon) messages.push(`${label}: écart montant HT (${formatDh(refHt)} vs devis ${formatDh(devisHt)}).`);
            if (Math.abs(refTva - devisTva) > epsilon) messages.push(`${label}: écart montant TVA (${formatDh(refTva)} vs devis ${formatDh(devisTva)}).`);
            if (Math.abs(refTtc - devisTtc) > epsilon) messages.push(`${label}: écart montant (${formatDh(refTtc)} vs devis ${formatDh(devisTtc)}).`);

            const refItems = Array.isArray(refDoc.items) ? refDoc.items : [];
            if (refItems.length !== devisItems.length) {
                messages.push(`${label}: nombre de lignes différent (${refItems.length} vs devis ${devisItems.length}).`);
            }
            const refMap = grammageByKey(refItems);
            const devisMap = grammageByKey(devisItems);
            const allKeys = new Set<string>([...refMap.keys(), ...devisMap.keys()]);
            for (const k of allKeys) {
                const rg = Number(refMap.get(k) || 0);
                const dg = Number(devisMap.get(k) || 0);
                if (Math.abs(rg - dg) > epsilon) {
                    const [designation, pu, tva, red] = k.split("|");
                    messages.push(`${label}: ligne "${designation || "article"}" (PU ${pu}, TVA ${tva}%, Red ${red}%) grammage ${rg} vs devis ${dg}.`);
                }
            }
        }
        return messages;
    }, [doc, linkedCommandeDoc, linkedFactureDoc]);

    const handlePdf = async () => {
        if (!doc || !token) return;
        setPdfLoading(true);
        try {
            const res = await fetch(`/api/devis-gros/${doc.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error("Impossible de charger le document");
                return;
            }
            const data = await res.json();
            await generateDevisGrosPdfFromApiRow(data as Record<string, unknown>);
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
                <p className="text-muted-foreground text-sm font-medium animate-pulse">Chargement en cours...</p>
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
                    <h2 className="text-xl font-bold text-foreground">Devis gros introuvable</h2>
                    <p className="text-muted-foreground mt-2">
                        Le document que vous recherchez n&apos;existe pas ou a été supprimé.
                    </p>
                    <Button className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={() => navigate(-1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Retourner à la liste
                    </Button>
                </Card>
            </div>
        );
    }

    const st = String(doc.statuts_devis || "");
    const isPending = st.includes("attente");
    const isRefused = st.includes("refus");
    const totalHT = Number(doc.montant_ht) || 0;
    const totalTVA = Number(doc.montant_tva) || 0;
    const totalTTC = Number(doc.montant_ttc) || totalHT + totalTVA;

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
                            <span className="text-indigo-600">Devis gros</span>
                            <span className="text-muted-foreground font-mono">#{doc.numero_devis}</span>
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                            <Calendar className="h-3.5 w-3.5" />
                            Créé le{" "}
                            {new Date(doc.date_devis).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                            })}
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
                        onClick={() => navigate("/dashboard/devis-gros", { state: { editDevisGrosId: doc.id } })}
                        className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 gap-2"
                    >
                        Modifier le devis gros
                        <ArrowUpRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {isPending && (
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
                                    Ce devis gros n&apos;est pas encore validé. Vous pouvez le gérer via le menu des approbations.
                                </span>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 shadow-sm font-bold text-xs h-10 px-6 rounded-lg transition-transform active:scale-95"
                            onClick={() =>
                                navigate("/dashboard/approvals", {
                                    state: { fromDetails: true, type: "devis", id: doc.id },
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
                        <p className="text-xs text-muted-foreground mt-1 font-medium italic underline decoration-indigo-200">
                            Destinataire du devis gros
                        </p>
                        {doc.user_nom?.trim() ? (
                            <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span className="font-semibold text-foreground/80">{doc.user_nom.trim()}</span>
                            </p>
                        ) : null}
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Info className="h-3.5 w-3.5 text-indigo-500" /> Statut
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="mt-1">
                            {!isPending && !isRefused ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                                    <CheckCircle2 className="h-3 w-3" /> Accepté
                                </span>
                            ) : isRefused ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200 shadow-sm">
                                    <XCircle className="h-3 w-3" /> Refusé
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">
                                    <Clock className="h-3 w-3" /> En validation
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <ExternalLink className="h-3.5 w-3.5 text-indigo-500" /> Documents liés
                    </CardHeader>
                    <CardContent className="p-4 pt-1 space-y-1.5">
                        {linkedCmd ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                onClick={() => navigate(`/dashboard/commandes-gros/${linkedCmd.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <ShoppingCart className="h-3 w-3" />
                                    <span>Commande {linkedCmd.numero_commande}</span>
                                </div>
                                <ArrowUpRight className="h-3 w-3" />
                            </button>
                        ) : (
                            <p className="text-[10px] text-muted-foreground italic mt-2">Aucune commande liée</p>
                        )}
                        {linkedFac ? (
                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                                onClick={() => navigate(`/dashboard/factures-gros/${linkedFac.id}`)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Receipt className="h-3 w-3" />
                                    <span>Facture {linkedFac.numero_facture}</span>
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
                            <Hash className="h-4 w-4" /> Lignes du devis gros
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground font-semibold">
                            Détail au grammage (nature « Gros »)
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
        </div>
    );
}
