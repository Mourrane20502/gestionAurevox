import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Badge } from "@/components/common/ui/badge";
import { Input } from "@/components/common/ui/input";
import { ArrowLeft, Download, Eye, FileText, Receipt, RefreshCcw, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { buildReglementCode, type ReglementCodeType } from "@/lib/reglementCode";
import { buildRecuPaiementDataForReglement } from "@/lib/buildRecuPaiementDataForReglement";
import { generateRecuPaiementPdf } from "@/components/pdf/RecuPaiementPdf";

type ReglementRow = {
    id: number;
    numero_recu?: number | null;
    date_reglement?: string | null;
    montant?: number | string | null;
    mode_paiement?: string | null;
    statut?: string | null;
    sous_societe_nom?: string | null;
    numero_facture?: string | null;
    numero_commande?: string | null;
    client_nom?: string | null;
    banque_nom?: string | null;
    facture_id?: number | null;
    commande_id?: number | null;
    facture_gros_id?: number | null;
    commande_gros_id?: number | null;
    client_id?: number | null;
    pdf_path?: string | null;
    commentaire?: string | null;
};

type SituationReglement = {
    montant_ttc: number;
    total_regle: number;
    reste_a_payer: number;
};

export default function ReglementsGroupDetails() {
    const { type, commandeId } = useParams<{ type: string; commandeId: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [loading, setLoading] = useState(true);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);
    const [rows, setRows] = useState<ReglementRow[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [situation, setSituation] = useState<SituationReglement | null>(null);

    const normalizedType: ReglementCodeType = type === "client_gros" ? "client_gros" : "client";

    useEffect(() => {
        const run = async () => {
            if (!token || !commandeId) return;
            setLoading(true);
            try {
                const endpoint =
                    normalizedType === "client_gros"
                        ? `/api/reglements-clients-gros?commandeGrosId=${commandeId}`
                        : `/api/reglements-clients?commandeId=${commandeId}`;
                const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) throw new Error("Impossible de charger les règlements");
                const data = await res.json();
                const list = Array.isArray(data) ? data : [];
                const sorted = list.slice().sort((a, b) => {
                    const aMs = new Date(a.date_reglement || "").getTime();
                    const bMs = new Date(b.date_reglement || "").getTime();
                    return (Number.isNaN(bMs) ? 0 : bMs) - (Number.isNaN(aMs) ? 0 : aMs);
                });
                setRows(sorted);
                setSelectedId(sorted[0]?.id ?? null);
            } catch (e: any) {
                toast.error(e?.message || "Erreur de chargement");
                setRows([]);
                setSelectedId(null);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [token, commandeId, normalizedType]);

    const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);
    const linkedFactures = useMemo(() => {
        const map = new Map<number, string>();
        for (const r of rows) {
            const idRaw = normalizedType === "client_gros" ? r.facture_gros_id : r.facture_id;
            const fid = Number(idRaw);
            const numero = String(r.numero_facture || "").trim();
            if (!Number.isFinite(fid) || fid <= 0 || !numero) continue;
            if (!map.has(fid)) map.set(fid, numero);
        }
        return Array.from(map.entries()).map(([id, numero]) => ({ id, numero }));
    }, [rows, normalizedType]);
    const commandeCode = useMemo(() => {
        const first = rows[0];
        return String(first?.numero_commande || "").trim() || `#${commandeId || "-"}`;
    }, [rows, commandeId]);

    const userComment = useMemo(() => {
        const raw = String(selected?.commentaire || "");
        if (!raw.trim()) return "";
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !/^\[(IMPAYÉ|IMPAYE|PAYÉ|PAYE)\]\b/i.test(line))
            .join("\n")
            .trim();
    }, [selected?.commentaire]);
    const uploadedPdfUrl = (() => {
        const p = String(selected?.pdf_path || "").trim();
        if (!p) return null;
        if (/^https?:\/\//i.test(p)) return p;
        const base = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
        return `${base}/uploads/${encodeURIComponent(p)}`;
    })();
    const hasPdfForSelected = Boolean(uploadedPdfUrl);
    const canDownloadReceipt = selected?.statut === "approuve";

    const handleDownloadReceipt = async () => {
        if (!selected || !token || !canDownloadReceipt) return;
        setIsProcessingPdf(true);
        try {
            const receiptData = await buildRecuPaiementDataForReglement(normalizedType, selected, token);
            if (!receiptData) {
                toast.error("Impossible de générer le reçu");
                return;
            }
            const safeNumero = String(
                selected.numero_facture || selected.numero_commande || selected.id
            ).replace(/[^a-zA-Z0-9-_]/g, "_");
            await generateRecuPaiementPdf(receiptData, {
                filename: `Recu_paiement_${safeNumero}_${selected.id}.pdf`,
            });
            toast.success("Reçu téléchargé");
        } catch (e) {
            console.error(e);
            toast.error("Erreur lors de la génération du reçu");
        } finally {
            setIsProcessingPdf(false);
        }
    };

    useEffect(() => {
        const run = async () => {
            if (!token || !selected) {
                setSituation(null);
                return;
            }
            const isGros = normalizedType === "client_gros";
            const factureId = isGros ? selected.facture_gros_id : selected.facture_id;
            const commandeDocId = isGros ? selected.commande_gros_id : selected.commande_id;
            const query = factureId ? `factureId=${factureId}` : commandeDocId ? `commandeId=${commandeDocId}` : "";
            if (!query) {
                setSituation(null);
                return;
            }
            try {
                const url = isGros ? `/api/reglements-clients-gros/situation?${query}` : `/api/reglements-clients/situation?${query}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) return setSituation(null);
                const s = await res.json();
                setSituation({
                    montant_ttc: Number(s?.montant_ttc || 0),
                    total_regle: Number(s?.total_regle || 0),
                    reste_a_payer: Number(s?.reste_a_payer || 0),
                });
            } catch {
                setSituation(null);
            }
        };
        run();
    }, [selected, normalizedType, token]);

    const handleViewPdf = async () => {
        if (uploadedPdfUrl) {
            window.open(uploadedPdfUrl, "_blank", "noopener,noreferrer");
            return;
        }
        toast.error("Aucun PDF disponible");
    };

    const handleUploadPdfChange = (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.target;
        const run = async () => {
            const file = input.files?.[0];
            const currentId = selected?.id;
            if (!file || !currentId || !token) return;
            if (file.type !== "application/pdf") {
                toast.error("Veuillez sélectionner un fichier PDF");
                return;
            }
            setIsProcessingPdf(true);
            try {
                const formData = new FormData();
                formData.append("pdf", file);
                const endpoint =
                    normalizedType === "client_gros"
                        ? `/api/reglements-clients-gros/${currentId}/pdf/upload`
                        : `/api/reglements-clients/${currentId}/pdf/upload`;
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                    toast.error(body?.message || "Erreur lors du téléversement du PDF");
                    return;
                }
                const nextPdfPath = String(body?.pdf_path || "").trim();
                setRows((prev) =>
                    prev.map((row) =>
                        row.id === currentId ? { ...row, pdf_path: nextPdfPath || row.pdf_path || null } : row
                    )
                );
                toast.success("PDF téléversé");
            } catch {
                toast.error("Erreur lors du téléversement du PDF");
            } finally {
                input.value = "";
                setIsProcessingPdf(false);
            }
        };
        run();
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">Détail règlements groupés</h1>
                        <p className="text-sm text-muted-foreground">Commande: {commandeCode}</p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    className="gap-2"
                    onClick={handleDownloadReceipt}
                    disabled={!selected || !canDownloadReceipt || isProcessingPdf}
                    title={!canDownloadReceipt ? "Téléchargement disponible après approbation" : undefined}
                >
                    {isProcessingPdf ? (
                        <RefreshCcw className="h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    Télécharger le reçu
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Informations générales</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Date règlement</span><span className="font-semibold">{selected?.date_reglement ? new Date(selected.date_reglement).toLocaleDateString("fr-FR") : "-"}</span></div>
                        <div className="space-y-2">
                            <span className="text-muted-foreground">Historique des règlements</span>
                            <div className="space-y-2">
                                {loading ? (
                                    <p className="text-sm text-muted-foreground">Chargement...</p>
                                ) : rows.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Aucun règlement trouvé.</p>
                                ) : (
                                    rows.map((r) => {
                                        const code = buildReglementCode(
                                            normalizedType,
                                            r.id,
                                            r.date_reglement,
                                            r.numero_recu,
                                            r.sous_societe_nom,
                                            r.numero_facture || r.numero_commande
                                        );
                                        return (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() => setSelectedId(r.id)}
                                                className={`w-full flex items-center justify-between rounded-lg border p-2.5 text-left hover:bg-muted/40 ${selectedId === r.id ? "border-indigo-300 bg-indigo-50/30" : ""}`}
                                            >
                                                <span className="font-semibold text-indigo-700">{code}</span>
                                                <span className="text-sm text-muted-foreground">{Number(r.montant || 0).toLocaleString("fr-FR")} DH</span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Montant</span><span className="font-semibold">{Number(selected?.montant || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><span className="font-semibold">{selected?.mode_paiement || "-"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Banque</span><span className="font-semibold">{selected?.banque_nom || "-"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Statut</span><Badge variant="outline">{selected?.statut || "-"}</Badge></div>
                        {userComment && (
                            <div className="space-y-1">
                                <span className="text-muted-foreground">Commentaire saisi</span>
                                <p className="text-sm font-medium whitespace-pre-wrap break-words">
                                    {userComment}
                                </p>
                            </div>
                        )}
                        {situation && (
                            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-1 text-xs">
                                <div className="flex justify-between"><span className="text-muted-foreground">Montant document</span><span className="font-semibold">{situation.montant_ttc.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Total réglé</span><span className="font-semibold text-emerald-600">{situation.total_regle.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Reste à payer</span><span className="font-semibold">{situation.reste_a_payer.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span></div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Liens document</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>{selected?.client_nom || "-"}</span></div>
                        {selected?.numero_commande && (
                            <button
                                type="button"
                                className="w-full rounded-md border p-2 flex items-center gap-2 hover:bg-muted/40 text-left"
                                onClick={() => {
                                    const targetId =
                                        normalizedType === "client_gros"
                                            ? selected.commande_gros_id
                                            : selected.commande_id;
                                    if (targetId) {
                                        navigate(
                                            normalizedType === "client_gros"
                                                ? `/dashboard/commandes-gros/${targetId}`
                                                : `/dashboard/commandes/${targetId}`
                                        );
                                    }
                                }}
                            >
                                <FileText className="h-4 w-4" />
                                {selected.numero_commande}
                            </button>
                        )}
                        {selected?.numero_facture && (
                            <button
                                type="button"
                                className="w-full rounded-md border p-2 flex items-center gap-2 hover:bg-muted/40 text-left"
                                onClick={() => {
                                    const targetId =
                                        normalizedType === "client_gros"
                                            ? selected.facture_gros_id
                                            : selected.facture_id;
                                    if (targetId) {
                                        navigate(
                                            normalizedType === "client_gros"
                                                ? `/dashboard/factures-gros/${targetId}`
                                                : `/dashboard/factures/${targetId}`
                                        );
                                    }
                                }}
                            >
                                <Receipt className="h-4 w-4" />
                                {selected.numero_facture}
                            </button>
                        )}
                        {linkedFactures.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Factures liées
                                </p>
                                {linkedFactures.map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        className="w-full rounded-md border p-2 flex items-center gap-2 hover:bg-muted/40 text-left"
                                        onClick={() =>
                                            navigate(
                                                normalizedType === "client_gros"
                                                    ? `/dashboard/factures-gros/${f.id}`
                                                    : `/dashboard/factures/${f.id}`
                                            )
                                        }
                                    >
                                        <Receipt className="h-4 w-4" />
                                        {f.numero}
                                    </button>
                                ))}
                            </div>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start"
                            onClick={handleDownloadReceipt}
                            disabled={!selected || !canDownloadReceipt || isProcessingPdf}
                            title={!canDownloadReceipt ? "Téléchargement disponible après approbation" : undefined}
                        >
                            {isProcessingPdf ? (
                                <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Download className="h-4 w-4 mr-2" />
                            )}
                            Télécharger le reçu
                        </Button>
                        {hasPdfForSelected ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-start"
                                onClick={handleViewPdf}
                                disabled={!selected || isProcessingPdf}
                            >
                                <Eye className="h-4 w-4 mr-2" />
                                Voir le reçu original
                            </Button>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Upload className="h-4 w-4" />
                                    <span>Téléverser le reçu original</span>
                                </div>
                                <Input
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleUploadPdfChange}
                                    disabled={!selected || isProcessingPdf}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
