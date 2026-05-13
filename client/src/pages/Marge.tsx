import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import { ArrowUpRight, Download, Filter, RefreshCw, Search, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProductRow {
    id: number;
    nom: string;
    reference?: string | null;
    category_name?: string | null;
    point_de_vente_name?: string | null;
    fournisseur_nom?: string | null;
    product_type_name?: string | null;
    pricing_metal?: string | null;
    stock?: number | string | null;
    grammage?: number | string | null;
    prix?: number | string | null;
    prix_de_vente?: number | string | null;
    /** Colonne virtuelle SQL : `prix - prix_de_vente` */
    marge?: number | string | null;
}

function toNum(value: unknown): number {
    if (value === null || value === undefined || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function computeMarge(p: ProductRow): number | null {
    if (p.marge != null && String(p.marge).trim() !== "") {
        const n = Number(p.marge);
        if (Number.isFinite(n)) return n;
    }
    if (p.prix == null || p.prix_de_vente == null) return null;
    const a = Number(p.prix);
    const b = Number(p.prix_de_vente);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a - b;
}

type MargeFilter = "all" | "positive" | "negative" | "zero" | "missing";

export default function Marge() {
    const token = localStorage.getItem("token");
    const roleLower = (localStorage.getItem("role") || "").toLowerCase();
    const userPermissions: string[] = JSON.parse(localStorage.getItem("permissions") || "[]");

    const canAccess =
        roleLower === "admin" ||
        roleLower === "superadmin" ||
        roleLower === "responsable" ||
        roleLower === "directeur" ||
        userPermissions.includes("bilan_view") ||
        userPermissions.includes("products_view");

    const [isLoading, setIsLoading] = useState(false);
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [search, setSearch] = useState("");
    const [margeFilter, setMargeFilter] = useState<MargeFilter>("all");
    const [sortOrder, setSortOrder] = useState<"" | "marge_desc" | "marge_asc">("");

    const load = useCallback(async () => {
        if (!token) {
            toast.error("Session expirée");
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch("/api/products", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setProducts([]);
                throw new Error("Erreur de chargement");
            }
            const data = await res.json();
            setProducts(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            toast.error("Erreur lors du chargement des produits");
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (canAccess) load();
    }, [canAccess, load]);

    const enriched = useMemo(() => {
        return products.map((p) => ({
            ...p,
            margeValue: computeMarge(p),
        }));
    }, [products]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let rows = enriched.filter((p) => {
            if (q) {
                const hay =
                    `${p.nom} ${p.reference || ""} ${p.category_name || ""} ${p.product_type_name || ""} ${p.fournisseur_nom || ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            switch (margeFilter) {
                case "positive":
                    return p.margeValue != null && p.margeValue > 0;
                case "negative":
                    return p.margeValue != null && p.margeValue < 0;
                case "zero":
                    return p.margeValue != null && p.margeValue === 0;
                case "missing":
                    return p.margeValue == null;
                default:
                    return true;
            }
        });
        if (sortOrder === "marge_desc") {
            rows = [...rows].sort(
                (a, b) => (b.margeValue ?? -Infinity) - (a.margeValue ?? -Infinity)
            );
        } else if (sortOrder === "marge_asc") {
            rows = [...rows].sort(
                (a, b) => (a.margeValue ?? Infinity) - (b.margeValue ?? Infinity)
            );
        }
        return rows;
    }, [enriched, search, margeFilter, sortOrder]);

    const totals = useMemo(() => {
        return filtered.reduce(
            (acc, p) => {
                acc.count += 1;
                acc.prixAchat += toNum(p.prix);
                acc.prixVente += toNum(p.prix_de_vente);
                if (p.margeValue != null) {
                    acc.marge += p.margeValue;
                    if (p.margeValue > 0) acc.positive += 1;
                    else if (p.margeValue < 0) acc.negative += 1;
                    else acc.zero += 1;
                } else {
                    acc.missing += 1;
                }
                return acc;
            },
            {
                count: 0,
                prixAchat: 0,
                prixVente: 0,
                marge: 0,
                positive: 0,
                negative: 0,
                zero: 0,
                missing: 0,
            }
        );
    }, [filtered]);

    const formatDH = (n: number) =>
        (Number(n) || 0).toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const exportCsv = () => {
        if (filtered.length === 0) {
            toast.info("Aucun produit à exporter");
            return;
        }
        const headers = [
            "ID",
            "Référence",
            "Nom",
            "Catégorie",
            "Type",
            "Point de vente",
            "Fournisseur",
            "Prix d'achat (DH)",
            "Prix de vente (DH)",
            "Marge (DH)",
        ];
        const escape = (v: unknown) => {
            const s = String(v ?? "");
            if (s.includes(";") || s.includes('"') || s.includes("\n")) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };
        const rows = filtered.map((p) => [
            p.id,
            p.reference || "",
            p.nom,
            p.category_name || "",
            p.product_type_name || "",
            p.point_de_vente_name || "",
            p.fournisseur_nom || "",
            toNum(p.prix).toFixed(2),
            toNum(p.prix_de_vente).toFixed(2),
            p.margeValue != null ? p.margeValue.toFixed(2) : "",
        ]);
        const csv = [headers, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
        const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `marge-produits-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!canAccess) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <Card>
                    <CardHeader>
                        <CardTitle>Marge produits</CardTitle>
                        <CardDescription>
                            Vous n&apos;avez pas l&apos;autorisation d&apos;accéder à cette page.
                        </CardDescription>
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
                        <TrendingUp className="h-7 w-7 text-emerald-600" />
                        Marge — produits
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Marge calculée à partir de la colonne virtuelle <code>prix − prix_de_vente</code>.
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
                        <Filter className="h-4 w-4" />
                        Filtres
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="grid gap-1.5">
                        <Label htmlFor="marge-search">Recherche</Label>
                        <div className="relative">
                            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="marge-search"
                                className="pl-9"
                                placeholder="Nom, réf, catégorie, type, fournisseur..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Marge</Label>
                        <Select value={margeFilter} onValueChange={(v) => setMargeFilter(v as MargeFilter)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Toutes</SelectItem>
                                <SelectItem value="positive">Positive (&gt; 0)</SelectItem>
                                <SelectItem value="negative">Négative (&lt; 0)</SelectItem>
                                <SelectItem value="zero">Nulle (= 0)</SelectItem>
                                <SelectItem value="missing">Non calculable</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Tri</Label>
                        <Select
                            value={sortOrder || "none"}
                            onValueChange={(v) => setSortOrder(v === "none" ? "" : (v as typeof sortOrder))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Aucun</SelectItem>
                                <SelectItem value="marge_desc">Marge décroissante</SelectItem>
                                <SelectItem value="marge_asc">Marge croissante</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Produits</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{totals.count}</p>
                    {totals.missing > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            {totals.missing} sans marge calculable
                        </p>
                    )}
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total prix d&apos;achat</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{formatDH(totals.prixAchat)} DH</p>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total prix de vente</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{formatDH(totals.prixVente)} DH</p>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total marge</p>
                    <p
                        className={cn(
                            "text-2xl font-bold mt-1 tabular-nums flex items-center gap-1",
                            totals.marge >= 0
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-rose-700 dark:text-rose-300"
                        )}
                    >
                        {totals.marge >= 0 ? (
                            <TrendingUp className="h-5 w-5" />
                        ) : (
                            <TrendingDown className="h-5 w-5" />
                        )}
                        {formatDH(totals.marge)} DH
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        {totals.positive} + · {totals.zero} 0 · {totals.negative} −
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Produits</CardTitle>
                    <CardDescription>
                        {filtered.length === 0
                            ? "Aucun produit ne correspond aux filtres."
                            : `${filtered.length} produit(s) affiché(s).`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Référence</TableHead>
                                <TableHead>Produit</TableHead>
                                <TableHead>Catégorie</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Fournisseur</TableHead>
                                <TableHead className="text-right">Prix d&apos;achat (DH)</TableHead>
                                <TableHead className="text-right">Prix de vente (DH)</TableHead>
                                <TableHead className="text-right">Marge (DH)</TableHead>
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
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                                        Aucun produit à afficher.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((p) => {
                                    const marge = p.margeValue;
                                    const margeCls =
                                        marge == null
                                            ? "bg-muted text-muted-foreground"
                                            : marge > 0
                                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                                                : marge < 0
                                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
                                    return (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">{p.reference || "—"}</TableCell>
                                            <TableCell>
                                                <p className="font-semibold">{p.nom}</p>
                                                {(p.pricing_metal === "or" || p.pricing_metal === "silver") && (
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {p.pricing_metal === "or" ? "Or" : "Silver"}
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell>{p.category_name || "—"}</TableCell>
                                            <TableCell>{p.product_type_name || "—"}</TableCell>
                                            <TableCell>{p.fournisseur_nom || "—"}</TableCell>
                                            <TableCell className="text-right tabular-nums">{formatDH(toNum(p.prix))}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {p.prix_de_vente != null && String(p.prix_de_vente).trim() !== ""
                                                    ? formatDH(toNum(p.prix_de_vente))
                                                    : "—"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span
                                                    className={cn(
                                                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums",
                                                        margeCls
                                                    )}
                                                >
                                                    {marge == null ? "—" : `${formatDH(marge)}`}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Link
                                                    to={`/dashboard/products`}
                                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                                                >
                                                    Voir <ArrowUpRight className="h-3 w-3" />
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                            {!isLoading && filtered.length > 0 && (
                                <TableRow className="bg-muted/50 font-semibold">
                                    <TableCell colSpan={5}>Total</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatDH(totals.prixAchat)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatDH(totals.prixVente)}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span
                                            className={cn(
                                                totals.marge >= 0
                                                    ? "text-emerald-700 dark:text-emerald-300"
                                                    : "text-rose-700 dark:text-rose-300"
                                            )}
                                        >
                                            {formatDH(totals.marge)}
                                        </span>
                                    </TableCell>
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
