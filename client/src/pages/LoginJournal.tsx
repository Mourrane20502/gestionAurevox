import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Button } from "@/components/common/ui/button";
import { RefreshCcw, Shield, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/common/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/common/ui/select";
import { toast } from "sonner";

interface LoginLog {
    id: number;
    user_nom?: string | null;
    user_prenom?: string | null;
    email?: string | null;
    ip_address?: string | null;
    location?: string | null;
    user_agent?: string | null;
    status?: string | null;
    created_at: string;
}

type RiskLevel = "low" | "medium" | "high";

interface EnrichedLoginLog extends LoginLog {
    failedAttempts24h: number;
    ipChanged: boolean;
    riskLevel: RiskLevel;
    riskScore: number;
}

export default function LoginJournal() {
    const HIDDEN_EMAIL = "admin@gmail.com";
    const token = localStorage.getItem("token");
    const [logs, setLogs] = useState<LoginLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [allLogs, setAllLogs] = useState<LoginLog[] | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 10;
    const [search, setSearch] = useState("");
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [riskFilter, setRiskFilter] = useState<string>("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const fetchLogs = async (pageToFetch: number) => {
        if (!token) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/login-logs?page=${pageToFetch}&limit=${limit}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                setLogs([]);
                setAllLogs(null);
                setTotal(0);
                setTotalPages(1);
                return;
            }
            const data = await res.json();
            if (Array.isArray(data)) {
                setAllLogs(data);
                setTotal(data.length);
                const pages = Math.max(1, Math.ceil(data.length / limit));
                setTotalPages(pages);
                const safePage = Math.min(Math.max(1, pageToFetch), pages);
                if (safePage !== page) setPage(safePage);
                setLogs(data.slice((safePage - 1) * limit, safePage * limit));
            } else {
                const items = Array.isArray(data?.items) ? data.items : [];
                setAllLogs(null);
                setLogs(items);
                setTotal(Number(data?.total) || 0);
                setTotalPages(Number(data?.totalPages) || 1);
            }
        } catch {
            setLogs([]);
            setAllLogs(null);
            setTotal(0);
            setTotalPages(1);
            toast.error("Impossible de charger le journal de connexion pour le moment.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (allLogs === null) {
            fetchLogs(page);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, allLogs]);

    const sourceLogs = allLogs ?? logs;
    const enrichedLogs = useMemo<EnrichedLoginLog[]>(() => {
        const safe = [...sourceLogs]
            .filter((log) => {
                const email = String(log.email || "").trim().toLowerCase();
                return email !== HIDDEN_EMAIL;
            })
            .sort(
                (a, b) =>
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

        const recentFailuresByEmail = new Map<string, number[]>();
        const lastSuccessIpByEmail = new Map<string, string>();
        const enrichedAsc: EnrichedLoginLog[] = [];

        for (const log of safe) {
            const emailKey = String(log.email || "").trim().toLowerCase() || "__unknown__";
            const nowTs = new Date(log.created_at).getTime();
            const status = String(log.status || "").toLowerCase();
            const ip = String(log.ip_address || "").trim();

            const prevFailures = recentFailuresByEmail.get(emailKey) || [];
            const cutoff = nowTs - 24 * 60 * 60 * 1000;
            const failures24h = prevFailures.filter((ts) => ts >= cutoff);

            let score = 0;
            if (status === "failed") score += 2;
            if (failures24h.length >= 3) score += 2;
            const hour = new Date(log.created_at).getHours();
            if (hour < 6) score += 1;

            const lastSuccessIp = lastSuccessIpByEmail.get(emailKey) || "";
            const ipChanged = Boolean(ip && lastSuccessIp && ip !== lastSuccessIp);
            if (ipChanged) score += 2;

            const riskLevel: RiskLevel = score >= 4 ? "high" : score >= 2 ? "medium" : "low";

            enrichedAsc.push({
                ...log,
                failedAttempts24h: failures24h.length,
                ipChanged,
                riskLevel,
                riskScore: score,
            });

            if (status === "failed") {
                failures24h.push(nowTs);
                recentFailuresByEmail.set(emailKey, failures24h);
            } else {
                recentFailuresByEmail.set(emailKey, failures24h);
            }
            if (status === "success" && ip) {
                lastSuccessIpByEmail.set(emailKey, ip);
            }
        }

        return enrichedAsc.reverse();
    }, [sourceLogs, HIDDEN_EMAIL]);

    const filteredLogs = useMemo(() => {
        const q = search.trim().toLowerCase();
        return enrichedLogs.filter((log) => {
            const email = String(log.email || "").trim().toLowerCase();
            const status = String(log.status || "").toLowerCase();
            if (statusFilter !== "all" && status !== statusFilter) return false;
            if (riskFilter === "suspicious" && log.riskScore < 2) return false;
            if (riskFilter !== "all" && riskFilter !== "suspicious" && log.riskLevel !== riskFilter) return false;

            const created = new Date(log.created_at);
            if (dateFrom) {
                const from = new Date(`${dateFrom}T00:00:00`);
                if (created < from) return false;
            }
            if (dateTo) {
                const to = new Date(`${dateTo}T23:59:59`);
                if (created > to) return false;
            }

            if (!q) return true;
            const fullName = [log.user_prenom, log.user_nom].filter(Boolean).join(" ").toLowerCase();
            return (
                fullName.includes(q) ||
                email.includes(q) ||
                String(log.ip_address || "").toLowerCase().includes(q) ||
                String(log.location || "").toLowerCase().includes(q) ||
                log.riskLevel.includes(q)
            );
        });
    }, [enrichedLogs, search, statusFilter, riskFilter, dateFrom, dateTo]);

    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, riskFilter, dateFrom, dateTo]);

    const computedTotalPages = Math.max(1, Math.ceil(filteredLogs.length / limit));
    const effectiveTotalPages = allLogs !== null ? computedTotalPages : Math.max(1, totalPages);
    const safePage = Math.min(page, effectiveTotalPages);
    const paginatedLogs =
        allLogs !== null
            ? filteredLogs.slice((safePage - 1) * limit, safePage * limit)
            : filteredLogs;

    useEffect(() => {
        if (allLogs !== null) {
            setTotal(filteredLogs.length);
            setTotalPages(computedTotalPages);
        }
        if (page !== safePage) setPage(safePage);
    }, [allLogs, filteredLogs.length, computedTotalPages, page, safePage]);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Shield className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Journal de connexion
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Suivi des connexions utilisateurs pour l&apos;audit et la sécurité.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => fetchLogs(page)}
                    disabled={isLoading}
                >
                    <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    Rafraîchir
                </Button>
            </div>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Historique des connexions</CardTitle>
                    <CardDescription>
                        Liste des dernières tentatives de connexion. Si aucune donnée n&apos;apparaît, l&apos;API du journal n&apos;est peut-être pas encore configurée.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher utilisateur, email, IP, localisation..."
                                className="h-9"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 gap-2"
                                onClick={() => setShowAdvancedFilters((s) => !s)}
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                                Filtre avancé
                            </Button>
                        </div>
                        {showAdvancedFilters && (
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Statut" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous les statuts</SelectItem>
                                        <SelectItem value="success">Succès</SelectItem>
                                        <SelectItem value="failed">Échec</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={riskFilter} onValueChange={setRiskFilter}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Risque" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous les risques</SelectItem>
                                        <SelectItem value="suspicious">Suspects uniquement</SelectItem>
                                        <SelectItem value="high">Risque élevé</SelectItem>
                                        <SelectItem value="medium">Risque moyen</SelectItem>
                                        <SelectItem value="low">Risque faible</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
                                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
                            </div>
                        )}
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40">
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Utilisateur</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Email</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">IP</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Localisation</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Statut</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Risque</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Signaux</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                                            Chargement du journal...
                                        </TableCell>
                                    </TableRow>
                                ) : paginatedLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                                            Aucun enregistrement de connexion disponible pour le moment.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedLogs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-sm">
                                                {(log.user_prenom || log.user_nom)
                                                    ? [log.user_prenom, log.user_nom].filter(Boolean).join(" ")
                                                    : "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {log.email || "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                <code>{log.ip_address || "—"}</code>
                                            </TableCell>
                                            <TableCell className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                                                {log.location || "—"}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {log.status || "—"}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                <span
                                                    className={
                                                        log.riskLevel === "high"
                                                            ? "text-red-600 font-semibold"
                                                            : log.riskLevel === "medium"
                                                              ? "text-amber-600 font-semibold"
                                                              : "text-emerald-600 font-semibold"
                                                    }
                                                >
                                                    {log.riskLevel === "high"
                                                        ? "Élevé"
                                                        : log.riskLevel === "medium"
                                                          ? "Moyen"
                                                          : "Faible"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {log.failedAttempts24h > 0 && (
                                                    <span>{log.failedAttempts24h} échecs/24h</span>
                                                )}
                                                {log.failedAttempts24h > 0 && log.ipChanged && <span> • </span>}
                                                {log.ipChanged && <span>IP changée</span>}
                                                {log.failedAttempts24h === 0 && !log.ipChanged && <span>—</span>}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(log.created_at).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                            {total > 0 ? `${total} entrées • Page ${safePage} / ${effectiveTotalPages}` : `Page ${safePage} / ${effectiveTotalPages}`}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isLoading || page <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                Précédent
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isLoading || page >= effectiveTotalPages}
                                onClick={() => setPage((p) => Math.min(effectiveTotalPages, p + 1))}
                            >
                                Suivant
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
