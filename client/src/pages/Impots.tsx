import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { FileText, Mail, Send } from "lucide-react";

type FactureRow = {
    id: number;
    kind: "client" | "client_gros" | "fournisseur";
    numero_facture?: string;
    client_nom?: string;
    montant_ttc?: number | string;
    statut?: string;
    date_facture?: string;
    created_at?: string;
};

const normalize = (s: unknown) => String(s || "").toLowerCase().trim();
const formatHistoryDate = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return "Toutes";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString("fr-FR");
};

export default function Impots() {
    const token = localStorage.getItem("token");
    const [factures, setFactures] = useState<FactureRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [search, setSearch] = useState("");
    const [statutFilter, setStatutFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [recipients, setRecipients] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [lastResult, setLastResult] = useState<any>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [clientRes, clientGrosRes, fournisseurRes] = await Promise.all([
                    fetch("/api/factures", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/factures-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/achats-fournisseurs", { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                if (!clientRes.ok) throw new Error("Impossible de charger les factures clients.");
                if (!clientGrosRes.ok) throw new Error("Impossible de charger les factures gros.");
                if (!fournisseurRes.ok) throw new Error("Impossible de charger les factures fournisseurs.");

                const clientData = await clientRes.json();
                const clientGrosData = await clientGrosRes.json();
                const fournisseurData = await fournisseurRes.json();

                const clientRows: FactureRow[] = (Array.isArray(clientData) ? clientData : []).map((f: any) => ({
                    ...f,
                    kind: "client",
                }));
                const fournisseurRows: FactureRow[] = (Array.isArray(fournisseurData) ? fournisseurData : [])
                    // Utiliser uniquement les factures fournisseurs uploadées (pas les bons de commande).
                    .filter((a: any) => Boolean(a?.facture_fournisseur))
                    .map((a: any) => {
                        const qte = Number(a.quantite || 0);
                        const pu = Number(a.prix_unitaire || 0);
                        const tva = Number(a.tva || 0);
                        const montantHt = qte * pu;
                        const montantTtc = montantHt * (1 + tva / 100);
                        return {
                            id: Number(a.id),
                            kind: "fournisseur",
                            numero_facture: a.numero || `#${a.id}`,
                            client_nom: a.fournisseur_nom || "-",
                            montant_ttc: montantTtc,
                            statut: a.statut || "en_attente",
                            date_facture: a.date_achat || a.created_at || null,
                            created_at: a.created_at || null,
                        };
                    });

                const clientGrosRows: FactureRow[] = (Array.isArray(clientGrosData) ? clientGrosData : []).map((f: any) => ({
                    ...f,
                    kind: "client_gros",
                }));

                setFactures([...clientRows, ...clientGrosRows, ...fournisseurRows]);
            } catch (e: any) {
                toast.error(e.message || "Erreur de chargement.");
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch("/api/factures/email-history?limit=100", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Impossible de charger l'historique.");
            const data = await res.json();
            setHistory(Array.isArray(data) ? data : []);
        } catch (e: any) {
            toast.error(e.message || "Erreur de chargement de l'historique.");
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [token]);

    const filtered = useMemo(() => {
        const q = normalize(search);
        return factures.filter((f) => {
            const statut = normalize(f.statut);
            if (statutFilter !== "all" && statut !== normalize(statutFilter)) return false;
            const dt = new Date(f.date_facture || f.created_at || "");
            const hasDate = !Number.isNaN(dt.getTime());
            if (dateFrom && hasDate) {
                const from = new Date(`${dateFrom}T00:00:00`);
                if (dt < from) return false;
            }
            if (dateTo && hasDate) {
                const to = new Date(`${dateTo}T23:59:59`);
                if (dt > to) return false;
            }
            if (!q) return true;
            return (
                normalize(f.numero_facture).includes(q) ||
                normalize(f.client_nom).includes(q) ||
                normalize(f.statut).includes(q)
            );
        });
    }, [factures, search, statutFilter, dateFrom, dateTo]);

    const rowKey = (f: FactureRow) => `${f.kind}-${Number(f.id)}`;
    const allVisibleSelected = filtered.length > 0 && filtered.every((f) => selected.has(rowKey(f)));

    const toggleOne = (key: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleAllVisible = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                filtered.forEach((f) => next.delete(rowKey(f)));
            } else {
                filtered.forEach((f) => next.add(rowKey(f)));
            }
            return next;
        });
    };

    const selectedCount = selected.size;

    const sendBulk = async () => {
        const recipientsList = recipients
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        const selectedRows = factures.filter((f) => selected.has(rowKey(f)));
        const selectedClientIds = selectedRows
            .filter((f) => f.kind === "client")
            .map((f) => Number(f.id));
        const selectedClientGrosCount = selectedRows.filter((f) => f.kind === "client_gros").length;
        const selectedFournisseurIds = selectedRows
            .filter((f) => f.kind === "fournisseur")
            .map((f) => Number(f.id));
        const selectedDates = selectedRows
            .map((f) => {
                const src = f.date_facture || f.created_at || "";
                const d = new Date(src);
                return Number.isNaN(d.getTime()) ? null : d;
            })
            .filter((d): d is Date => d !== null)
            .sort((a, b) => a.getTime() - b.getTime());
        const autoDateFrom =
            selectedDates.length > 0 ? selectedDates[0].toISOString().slice(0, 10) : null;
        const autoDateTo =
            selectedDates.length > 0
                ? selectedDates[selectedDates.length - 1].toISOString().slice(0, 10)
                : null;

        if (selectedCount === 0) {
            toast.error("Sélectionnez au moins une facture.");
            return;
        }
        if (recipientsList.length === 0) {
            toast.error("Renseignez au moins un destinataire.");
            return;
        }
        if (selectedClientGrosCount > 0) {
            toast.warning(
                `${selectedClientGrosCount} facture(s) gros sélectionnée(s) seront ignorées pour l'envoi (non supportées dans cet écran).`
            );
        }

        setSending(true);
        setLastResult(null);
        try {
            const res = await fetch("/api/factures/bulk-send-email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    factureIds: selectedClientIds,
                    fournisseurFactureIds: selectedFournisseurIds,
                    recipients: recipientsList,
                    subject,
                    message,
                    // Priorité aux filtres saisis; sinon on prend la plage réelle des factures envoyées.
                    dateFrom: dateFrom || autoDateFrom,
                    dateTo: dateTo || autoDateTo,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Erreur d'envoi.");
            setLastResult(data);
            fetchHistory();
            if (data?.summary?.failed > 0) {
                toast.warning(
                    `Envoi partiel: ${data.summary.sent} succès, ${data.summary.failed} échec(s).`
                );
            } else {
                toast.success(`Envoi réussi pour ${data?.summary?.sent || selectedCount} facture(s).`);
            }
        } catch (e: any) {
            toast.error(e.message || "Erreur d'envoi.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-indigo-600" />
                        Impôts - Envoi massif des factures
                    </CardTitle>
                    <CardDescription>
                        Sélection multiple de factures et envoi en masse par email avec retour détaillé.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <Input
                            placeholder="Recherche (N°, client, statut)..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select
                            className="h-10 border rounded-md px-3 bg-background text-sm"
                            value={statutFilter}
                            onChange={(e) => setStatutFilter(e.target.value)}
                        >
                            <option value="all">Tous les statuts</option>
                            <option value="payee">Payée</option>
                            <option value="non_payee">Non payée</option>
                            <option value="en_attente">En attente</option>
                        </select>
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                        <div className="text-sm text-muted-foreground flex items-center">
                            {filtered.length} facture(s) trouvée(s) - {selectedCount} sélectionnée(s)
                        </div>
                    </div>

                    <div className="border rounded-xl overflow-hidden">
                        <div className="max-h-[420px] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0 z-10">
                                    <tr>
                                        <th className="text-left px-3 py-2 w-10">
                                            <input
                                                type="checkbox"
                                                checked={allVisibleSelected}
                                                onChange={toggleAllVisible}
                                                aria-label="Sélection globale"
                                            />
                                        </th>
                                        <th className="text-left px-3 py-2">Type</th>
                                        <th className="text-left px-3 py-2">N° Facture</th>
                                        <th className="text-left px-3 py-2">Client</th>
                                        <th className="text-left px-3 py-2">Date</th>
                                        <th className="text-right px-3 py-2">Montant</th>
                                        <th className="text-left px-3 py-2">Statut</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td className="px-3 py-4 text-muted-foreground" colSpan={7}>
                                                Chargement...
                                            </td>
                                        </tr>
                                    ) : filtered.length === 0 ? (
                                        <tr>
                                            <td className="px-3 py-4 text-muted-foreground" colSpan={7}>
                                                Aucune facture.
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map((f) => (
                                            <tr key={f.id} className="border-t">
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(rowKey(f))}
                                                        onChange={() => toggleOne(rowKey(f))}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${f.kind === "client" ? "bg-indigo-100 text-indigo-700" : f.kind === "client_gros" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}>
                                                        {f.kind === "client" ? "Client" : f.kind === "client_gros" ? "Client gros" : "Fournisseur"}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 font-medium">{f.numero_facture || `#${f.id}`}</td>
                                                <td className="px-3 py-2">{f.client_nom || "-"}</td>
                                                <td className="px-3 py-2">
                                                    {new Date(f.date_facture || f.created_at || "").toLocaleDateString("fr-FR")}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {Math.round(Number(f.montant_ttc || 0))} DH
                                                </td>
                                                <td className="px-3 py-2">{f.statut || "-"}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <Input
                            placeholder="Destinataires (séparés par virgule) ex: a@x.com, b@y.com"
                            value={recipients}
                            onChange={(e) => setRecipients(e.target.value)}
                        />
                        <Input
                            placeholder="Sujet (optionnel)"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                        <textarea
                            className="min-h-24 border rounded-md px-3 py-2 text-sm bg-background"
                            placeholder="Message (optionnel)"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap gap-3 items-center">
                        <Button onClick={sendBulk} disabled={sending || selectedCount === 0}>
                            <Send className="h-4 w-4 mr-2" />
                            {sending ? "Envoi en cours..." : `Envoyer ${selectedCount} facture(s)`}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setSelected(new Set())}
                            disabled={selectedCount === 0 || sending}
                        >
                            Réinitialiser la sélection
                        </Button>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            Envoi groupé avec pièce jointe PDF (clients + fournisseurs).
                        </span>
                    </div>

                    {lastResult?.results?.length > 0 && (
                        <div className="border rounded-xl p-3 bg-muted/30">
                            <div className="text-sm font-semibold mb-2">
                                Résultat: {lastResult.summary?.sent || 0} succès / {lastResult.summary?.failed || 0} échec(s)
                            </div>
                            <div className="max-h-44 overflow-auto space-y-1">
                                {lastResult.results.map((r: any) => (
                                    <div key={`${r.facture_id}-${r.success}`} className="text-xs">
                                        Facture #{r.facture_id} {r.numero_facture ? `(${r.numero_facture})` : ""} -{" "}
                                        <span className={r.success ? "text-emerald-600" : "text-rose-600"}>
                                            {r.success ? "Succès" : `Échec: ${r.error || "erreur"}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Historique des envois email</CardTitle>
                        <CardDescription>
                            Détails des envois en masse: factures, destinataires, date, statut et résultats.
                        </CardDescription>
                    </div>
                    <Button variant="outline" onClick={fetchHistory} disabled={historyLoading}>
                        {historyLoading ? "Chargement..." : "Actualiser"}
                    </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                    {historyLoading ? (
                        <div className="text-sm text-muted-foreground">Chargement...</div>
                    ) : history.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Aucun envoi enregistré.</div>
                    ) : (
                        <div className="space-y-2 max-h-[480px] overflow-auto">
                            {history.map((h) => (
                                <div key={h.id} className="border rounded-xl p-3 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-sm font-semibold">
                                            Envoi #{h.id} -{" "}
                                            <span
                                                className={
                                                    h.status === "success"
                                                        ? "text-emerald-600"
                                                        : h.status === "partial"
                                                          ? "text-amber-600"
                                                          : "text-rose-600"
                                                }
                                            >
                                                {h.status}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {new Date(h.created_at).toLocaleString("fr-FR")}
                                        </div>
                                    </div>
                                    <div className="text-xs">
                                        <b>Destinataires:</b> {(h.recipients || []).join(", ") || "-"}
                                    </div>
                                    <div className="text-xs">
                                        <b>Factures clients ciblées:</b> {(h.facture_ids || []).length} -{" "}
                                        {(h.facture_ids || []).slice(0, 15).join(", ")}
                                        {(h.facture_ids || []).length > 15 ? " ..." : ""}
                                    </div>
                                    <div className="text-xs">
                                        <b>Factures fournisseurs ciblées:</b>{" "}
                                        {(h.fournisseur_facture_ids || []).length} -{" "}
                                        {(h.fournisseur_facture_ids || []).slice(0, 15).join(", ")}
                                        {(h.fournisseur_facture_ids || []).length > 15 ? " ..." : ""}
                                    </div>
                                    <div className="text-xs">
                                        <b>Date (de):</b> {formatHistoryDate(h.date_from)} {"  "}
                                        <b>Date (à):</b> {formatHistoryDate(h.date_to)}
                                    </div>
                                    <div className="text-xs">
                                        <b>Résultat:</b> {h.sent_count || 0} succès / {h.failed_count || 0} échec(s)
                                    </div>
                                    <div className="max-h-28 overflow-auto bg-muted/30 rounded-md p-2 space-y-1">
                                        {(h.results || []).map((r: any, idx: number) => (
                                            <div key={`${h.id}-${idx}`} className="text-[11px]">
                                                Facture #{r.facture_id} {r.numero_facture ? `(${r.numero_facture})` : ""} -{" "}
                                                <span className={r.success ? "text-emerald-600" : "text-rose-600"}>
                                                    {r.success ? "Succès" : `Échec: ${r.error || "erreur"}`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

