import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { buildReglementCode } from "@/lib/reglementCode";
import { CalendarDays, FileText, Search } from "lucide-react";

type ReglementClient = {
    id: number;
    numero_recu?: number | null;
    client_nom?: string | null;
    montant?: number | string | null;
    mode?: string | null;
    mode_paiement?: string | null;
    statut?: string | null;
    date_reglement?: string | null;
    sous_societe_nom?: string | null;
    reglement_type?: "client" | "client_gros";
};

type SousSocieteOption = { id: number; nom_sous_societe: string };

const toNumber = (value: unknown) => Number(value || 0);
const getModeValue = (row: ReglementClient) => String(row.mode_paiement || row.mode || "").trim();
const formatMode = (mode: string) => {
    const m = mode.toLowerCase();
    if (m === "espece" || m === "especes") return "Espèces";
    if (m === "virement") return "Virement";
    if (m === "cheque") return "Chèque";
    if (m === "carte") return "Carte";
    return mode || "-";
};

export default function Recus() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statutFilter, setStatutFilter] = useState("all");
    const [modeFilter, setModeFilter] = useState("all");
    const [sousSocieteFilter, setSousSocieteFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [reglements, setReglements] = useState<ReglementClient[]>([]);
    const [allSousSocieteNames, setAllSousSocieteNames] = useState<string[]>([]);

    useEffect(() => {
        const fetchReglements = async () => {
            setLoading(true);
            try {
                const [resClassic, resGros] = await Promise.all([
                    fetch("/api/reglements-clients", {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch("/api/reglements-clients-gros", {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                ]);
                if (!resClassic.ok || !resGros.ok) throw new Error("Impossible de charger les reçus.");

                const [classicData, grosData] = await Promise.all([resClassic.json(), resGros.json()]);
                const classicRows = (Array.isArray(classicData) ? classicData : []).map((r) => ({
                    ...r,
                    reglement_type: "client" as const,
                }));
                const grosRows = (Array.isArray(grosData) ? grosData : []).map((r) => ({
                    ...r,
                    reglement_type: "client_gros" as const,
                }));
                const rows = [...classicRows, ...grosRows];
                rows.sort((a, b) => {
                    const aMs = new Date(a.date_reglement || "").getTime();
                    const bMs = new Date(b.date_reglement || "").getTime();
                    return (Number.isNaN(bMs) ? 0 : bMs) - (Number.isNaN(aMs) ? 0 : aMs);
                });
                setReglements(rows);
            } catch (e: any) {
                toast.error(e?.message || "Erreur de chargement des reçus.");
            } finally {
                setLoading(false);
            }
        };

        fetchReglements();
    }, [token]);

    useEffect(() => {
        const fetchSousSocietes = async () => {
            if (!token) return;
            try {
                const res = await fetch("/api/settings/sous-societes", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                const names = (Array.isArray(data) ? data : [])
                    .map((s: SousSocieteOption) => String(s?.nom_sous_societe || "").trim())
                    .filter(Boolean);
                setAllSousSocieteNames(Array.from(new Set(names)));
            } catch {
                // silencieux: fallback aux noms présents dans les reçus
            }
        };
        fetchSousSocietes();
    }, [token]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return reglements.filter((r) => {
            const statut = String(r.statut || "").toLowerCase();
            const mode = getModeValue(r).toLowerCase();
            const dt = new Date(r.date_reglement || "");
            const hasDate = !Number.isNaN(dt.getTime());

            if (statutFilter !== "all" && statut !== statutFilter) return false;
            if (modeFilter !== "all" && mode !== modeFilter) return false;
            if (sousSocieteFilter !== "all") {
                const selectedTag =
                    String(sousSocieteFilter || "")
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .match(/[A-Za-z0-9]/)?.[0]
                        ?.toUpperCase() || "";
                const code = buildReglementCode(
                    r.reglement_type || "client",
                    r.id,
                    r.date_reglement,
                    r.numero_recu,
                    (r as any).sous_societe_nom,
                    (r as any).numero_facture || (r as any).numero_commande
                ).toUpperCase();
                const codeHasTag = selectedTag ? code.includes(`-${selectedTag}-`) : false;
                if (!codeHasTag) return false;
            }

            if (dateFrom && hasDate) {
                const from = new Date(`${dateFrom}T00:00:00`);
                if (dt < from) return false;
            }
            if (dateTo && hasDate) {
                const to = new Date(`${dateTo}T23:59:59`);
                if (dt > to) return false;
            }

            if (!q) return true;
            const code = buildReglementCode(
                r.reglement_type || "client",
                r.id,
                r.date_reglement,
                r.numero_recu,
                (r as any).sous_societe_nom,
                (r as any).numero_facture || (r as any).numero_commande
            ).toLowerCase();
            return (
                code.includes(q) ||
                String(r.client_nom || "").toLowerCase().includes(q) ||
                mode.includes(q) ||
                String(r.statut || "").toLowerCase().includes(q)
            );
        });
    }, [search, reglements, statutFilter, modeFilter, sousSocieteFilter, dateFrom, dateTo]);

    const stats = useMemo(() => {
        const total = filtered.length;
        let approuves = 0;
        let impayes = 0;
        let enAttente = 0;
        let totalMontant = 0;
        for (const row of filtered) {
            const statut = String(row.statut || "").toLowerCase();
            if (statut === "approuve") approuves += 1;
            else if (statut === "impaye") impayes += 1;
            else if (statut === "en_attente") enAttente += 1;
            totalMontant += toNumber(row.montant);
        }
        return { total, approuves, impayes, enAttente, totalMontant };
    }, [filtered]);

    const modeOptions = useMemo(() => {
        const modes = Array.from(
            new Set(
                reglements
                    .map((r) => getModeValue(r).toLowerCase())
                    .filter(Boolean)
            )
        ).sort();
        return modes;
    }, [reglements]);

    const sousSocieteOptions = useMemo(() => {
        const fromReglements = reglements
            .map((r) => String((r as any).sous_societe_nom || "").trim())
            .filter(Boolean);
        return Array.from(new Set([...allSousSocieteNames, ...fromReglements]))
            .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    }, [reglements, allSousSocieteNames]);

    const resetFilters = () => {
        setSearch("");
        setStatutFilter("all");
        setModeFilter("all");
        setSousSocieteFilter("all");
        setDateFrom("");
        setDateTo("");
    };

    const getStatutBadgeClass = (statut?: string | null) => {
        const normalized = String(statut || "").toLowerCase();
        if (normalized === "approuve") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
        if (normalized === "impaye") return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
        if (normalized === "en_attente") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    };

    const formatStatut = (statut?: string | null) => {
        if (!statut) return "-";
        if (statut === "en_attente") return "En attente";
        if (statut === "approuve") return "Approuvé";
        if (statut === "impaye") return "Impayé";
        return statut;
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <Card className="border border-border/60 shadow-md bg-card">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-indigo-600" />
                        Reçus
                    </CardTitle>
                    <CardDescription>Liste des reçus de règlements clients avec filtrage avancé.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                        <div className="rounded-xl border border-border/60 bg-card p-3">
                            <p className="text-xs text-muted-foreground">Total reçus</p>
                            <p className="text-xl font-semibold">{stats.total}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-card p-3">
                            <p className="text-xs text-muted-foreground">Approuvés</p>
                            <p className="text-xl font-semibold text-emerald-600">{stats.approuves}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-card p-3">
                            <p className="text-xs text-muted-foreground">Impayés</p>
                            <p className="text-xl font-semibold text-rose-600">{stats.impayes}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-card p-3">
                            <p className="text-xs text-muted-foreground">En attente</p>
                            <p className="text-xl font-semibold text-amber-600">{stats.enAttente}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-card p-3">
                            <p className="text-xs text-muted-foreground">Montant total</p>
                            <p className="text-xl font-semibold">{Math.round(stats.totalMontant)} DH</p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                            <div className="relative xl:col-span-2">
                                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                                <Input
                                    className="pl-9"
                                    placeholder="Recherche par code, client, mode, statut..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <select
                                className="h-10 border border-input rounded-md px-3 bg-background text-sm text-foreground"
                                value={statutFilter}
                                onChange={(e) => setStatutFilter(e.target.value)}
                            >
                                <option value="all">Tous les statuts</option>
                                <option value="approuve">Approuvé</option>
                                <option value="impaye">Impayé</option>
                                <option value="en_attente">En attente</option>
                            </select>
                            <select
                                className="h-10 border border-input rounded-md px-3 bg-background text-sm text-foreground"
                                value={modeFilter}
                                onChange={(e) => setModeFilter(e.target.value)}
                            >
                                <option value="all">Tous les modes</option>
                                {modeOptions.map((mode) => (
                                    <option key={mode} value={mode}>
                                        {formatMode(mode)}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="h-10 border border-input rounded-md px-3 bg-background text-sm text-foreground"
                                value={sousSocieteFilter}
                                onChange={(e) => setSousSocieteFilter(e.target.value)}
                            >
                                <option value="all">Société</option>
                                {sousSocieteOptions.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                            <Button variant="outline" onClick={resetFilters}>
                                Réinitialiser filtres
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                            </div>
                            <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="border border-border/60 rounded-xl overflow-hidden bg-card">
                        <div className="max-h-[560px] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Code reçu</th>
                                        <th className="px-3 py-2 text-left">Client</th>
                                        <th className="px-3 py-2 text-left">Date</th>
                                        <th className="px-3 py-2 text-right">Montant</th>
                                        <th className="px-3 py-2 text-left">Mode</th>
                                        <th className="px-3 py-2 text-left">Statut</th>
                                        <th className="px-3 py-2 text-right">Action</th>
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
                                                Aucun reçu trouvé.
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map((r) => (
                                            <tr key={r.id} className="border-t border-border/60 hover:bg-muted/40 transition-colors">
                                                <td className="px-3 py-2 font-medium">
                                                    {buildReglementCode(
                                                        r.reglement_type || "client",
                                                        r.id,
                                                        r.date_reglement,
                                                        r.numero_recu,
                                                        (r as any).sous_societe_nom,
                                                        (r as any).numero_facture || (r as any).numero_commande
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">{r.client_nom || "-"}</td>
                                                <td className="px-3 py-2">
                                                    {r.date_reglement
                                                        ? new Date(r.date_reglement).toLocaleDateString("fr-FR")
                                                        : "-"}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {Math.round(toNumber(r.montant))} DH
                                                </td>
                                                <td className="px-3 py-2">{formatMode(getModeValue(r))}</td>
                                                <td className="px-3 py-2">
                                                    <span
                                                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatutBadgeClass(r.statut)}`}
                                                    >
                                                        {formatStatut(r.statut)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            navigate(`/dashboard/reglements/details/${r.reglement_type || "client"}/${r.id}`)
                                                        }
                                                    >
                                                        Voir détail
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
