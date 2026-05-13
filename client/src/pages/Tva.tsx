import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import { ArrowUpRight, CalendarRange, Download, Percent, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CommandeRow {
    id: number;
    numero_commande: string;
    date_commande: string | null;
    created_at?: string | null;
    client_id?: number | null;
    client_nom?: string | null;
    point_de_vente_nom?: string | null;
    point_de_vente_nom_from_items?: string | null;
    user_nom?: string | null;
    statut?: string | null;
    montant_ht?: number | string | null;
    montant_tva?: number | string | null;
    montant_ttc?: number | string | null;
}

function toNum(value: unknown): number {
    if (value === null || value === undefined || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function docDayKey(raw: unknown): string {
    if (raw == null) return "";
    const s = String(raw).trim();
    if (!s) return "";
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function inDateRange(dayKey: string, dateFrom: string, dateTo: string): boolean {
    if (!dateFrom && !dateTo) return true;
    if (!dayKey) return false;
    if (dateFrom && dayKey < dateFrom) return false;
    if (dateTo && dayKey > dateTo) return false;
    return true;
}

function formatDate(raw: unknown): string {
    const day = docDayKey(raw);
    if (!day) return "—";
    try {
        const [y, m, d] = day.split("-");
        if (y && m && d) return `${d}/${m}/${y}`;
        return day;
    } catch {
        return day;
    }
}

const STATUT_STYLES: Record<string, string> = {
    en_attente: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    validee: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    livree: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
    annulee: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    refusee: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

function statutBadge(s?: string | null): { label: string; cls: string } {
    const raw = String(s ?? "").trim();
    const key = raw.toLowerCase().replace(/\s+/g, "_");
    return {
        label: raw || "—",
        cls: STATUT_STYLES[key] || "bg-muted text-foreground",
    };
}

export default function Tva() {
    const token = localStorage.getItem("token");
    const roleLower = (localStorage.getItem("role") || "").toLowerCase();
    const userPermissions: string[] = JSON.parse(localStorage.getItem("permissions") || "[]");

    const canAccess =
        roleLower === "admin" ||
        roleLower === "superadmin" ||
        roleLower === "responsable" ||
        roleLower === "directeur" ||
        userPermissions.includes("bilan_view") ||
        userPermissions.includes("factures_view") ||
        userPermissions.includes("commandes_view");

    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [search, setSearch] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [commandes, setCommandes] = useState<CommandeRow[]>([]);

    const load = useCallback(async () => {
        if (!token) {
            toast.error("Session expirée");
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch("/api/commandes", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setCommandes([]);
                throw new Error("Erreur de chargement");
            }
            const data = await res.json();
            setCommandes(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            toast.error("Erreur lors du chargement des commandes");
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (canAccess) load();
    }, [canAccess, load]);

    const filteredCommandes = useMemo(() => {
        const q = search.trim().toLowerCase();
        return commandes.filter((c) => {
            const day = docDayKey(c.date_commande ?? c.created_at);
            if (!inDateRange(day, dateFrom, dateTo)) return false;
            if (!q) return true;
            return (
                String(c.numero_commande || "").toLowerCase().includes(q) ||
                String(c.client_nom || "").toLowerCase().includes(q) ||
                String(c.point_de_vente_nom || c.point_de_vente_nom_from_items || "")
                    .toLowerCase()
                    .includes(q)
            );
        });
    }, [commandes, dateFrom, dateTo, search]);

    const totals = useMemo(() => {
        return filteredCommandes.reduce(
            (acc, c) => {
                acc.ht += toNum(c.montant_ht);
                acc.tva += toNum(c.montant_tva);
                acc.ttc += toNum(c.montant_ttc) || toNum(c.montant_ht) + toNum(c.montant_tva);
                acc.count += 1;
                return acc;
            },
            { ht: 0, tva: 0, ttc: 0, count: 0 }
        );
    }, [filteredCommandes]);

    const formatDH = (n: number) =>
        (Number(n) || 0).toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const exportCsv = () => {
        if (filteredCommandes.length === 0) {
            toast.info("Aucune commande à exporter");
            return;
        }
        const headers = [
            "N° commande",
            "Date",
            "Client",
            "Point de vente",
            "Créé par",
            "Statut",
            "Montant HT",
            "Montant TVA",
            "Montant TTC",
        ];
        const escape = (v: unknown) => {
            const s = String(v ?? "");
            if (s.includes(";") || s.includes('"') || s.includes("\n")) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };
        const rows = filteredCommandes.map((c) => [
            c.numero_commande || c.id,
            formatDate(c.date_commande ?? c.created_at),
            c.client_nom || "—",
            c.point_de_vente_nom || c.point_de_vente_nom_from_items || "—",
            c.user_nom || "—",
            c.statut || "—",
            toNum(c.montant_ht).toFixed(2),
            toNum(c.montant_tva).toFixed(2),
            (toNum(c.montant_ttc) || toNum(c.montant_ht) + toNum(c.montant_tva)).toFixed(2),
        ]);
        const csv = [headers, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
        const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tva-commandes-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!canAccess) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <Card>
                    <CardHeader>
                        <CardTitle>TVA — ventes</CardTitle>
                        <CardDescription>Vous n&apos;avez pas l&apos;autorisation d&apos;accéder à cette page.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Percent className="h-7 w-7 text-indigo-600" />
                        TVA — commandes
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Somme des montants TVA enregistrés sur les commandes, avec le détail commande par commande.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportCsv} disabled={isLoading} className="gap-2">
                        <Download className="h-4 w-4" />
                        Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => load()} disabled={isLoading} className="gap-2">
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        Actualiser
                    </Button>
                </div>
            </div>

            <Card className="border-border/60">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <CalendarRange className="h-4 w-4" />
                        Filtres
                    </CardTitle>
                    <CardDescription>
                        Période sur la date de commande. La recherche porte sur le n°, le client et le point de vente.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="grid gap-1.5">
                        <Label htmlFor="tva-from">Du</Label>
                        <Input id="tva-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="tva-to">Au</Label>
                        <Input id="tva-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="tva-search">Recherche</Label>
                        <div className="relative">
                            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="tva-search"
                                className="pl-9"
                                placeholder="N° commande, client, PDV..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Commandes</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{totals.count}</p>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total HT</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{formatDH(totals.ht)} DH</p>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total TVA</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums text-indigo-700 dark:text-indigo-300">
                        {formatDH(totals.tva)} DH
                    </p>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total TTC</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{formatDH(totals.ttc)} DH</p>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Commandes concernées</CardTitle>
                    <CardDescription>
                        {filteredCommandes.length === 0
                            ? "Aucune commande ne correspond aux filtres."
                            : `${filteredCommandes.length} commande(s) prise(s) en compte dans le total TVA.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>N° commande</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Point de vente</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead className="text-right">HT (DH)</TableHead>
                                <TableHead className="text-right">TVA (DH)</TableHead>
                                <TableHead className="text-right">TTC (DH)</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        {Array.from({ length: 9 }).map((__, j) => (
                                            <TableCell key={j}>
                                                <div className="h-4 bg-muted rounded animate-pulse w-20" />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : filteredCommandes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                                        Aucune commande sur cette période.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCommandes.map((c) => {
                                    const ttc =
                                        toNum(c.montant_ttc) ||
                                        toNum(c.montant_ht) + toNum(c.montant_tva);
                                    const statut = statutBadge(c.statut);
                                    return (
                                        <TableRow key={c.id}>
                                            <TableCell className="font-medium">
                                                {c.numero_commande || `#${c.id}`}
                                            </TableCell>
                                            <TableCell>{formatDate(c.date_commande ?? c.created_at)}</TableCell>
                                            <TableCell>{c.client_nom || "—"}</TableCell>
                                            <TableCell>
                                                {c.point_de_vente_nom || c.point_de_vente_nom_from_items || "—"}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={cn(
                                                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                                                        statut.cls
                                                    )}
                                                >
                                                    {statut.label}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatDH(toNum(c.montant_ht))}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums font-semibold text-indigo-700 dark:text-indigo-300">
                                                {formatDH(toNum(c.montant_tva))}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{formatDH(ttc)}</TableCell>
                                            <TableCell className="text-right">
                                                <Link
                                                    to={`/dashboard/commandes/${c.id}`}
                                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                                                >
                                                    Voir <ArrowUpRight className="h-3 w-3" />
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                            {!isLoading && filteredCommandes.length > 0 && (
                                <TableRow className="bg-muted/50 font-semibold">
                                    <TableCell colSpan={5}>Total</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatDH(totals.ht)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-indigo-700 dark:text-indigo-300">
                                        {formatDH(totals.tva)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{formatDH(totals.ttc)}</TableCell>
                                    <TableCell />
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
