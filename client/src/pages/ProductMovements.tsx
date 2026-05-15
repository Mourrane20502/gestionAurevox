import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Button } from "@/components/common/ui/button";
import { RefreshCcw, History, Package, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/common/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/common/ui/select";

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    create: "Création produit",
    update: "Modification produit",
    delete: "Suppression produit",
    devis_creation: "Devis — ligne ajoutée",
    devis_sortie: "Devis — sortie stock",
    facture_creation: "Facture — ligne ajoutée",
    facture_sortie: "Facture — ligne retirée",
    commande_creation: "Commande — ligne ajoutée",
    commande_sortie: "Commande — sortie stock",
    avoir_retour: "Avoir — retour stock",
    avoir_sortie: "Avoir — annulation retour",
    bon_livraison_creation: "BL — ligne ajoutée",
    bon_livraison_sortie: "BL — livraison / clôture",
};

const KNOWN_MOVEMENT_TYPES = [
    "devis_creation",
    "devis_sortie",
    "facture_creation",
    "facture_sortie",
    "commande_creation",
    "commande_sortie",
    "avoir_retour",
    "avoir_sortie",
    "bon_livraison_creation",
    "bon_livraison_sortie",
    "create",
    "update",
    "delete",
];

function formatMovementType(type: string): string {
    const key = String(type || "").trim();
    return MOVEMENT_TYPE_LABELS[key] || key || "—";
}

interface Movement {
    id: number;
    produit_nom: string | null;
    produit_reference?: string | null;
    type: string;
    quantity_before: number | null;
    quantity_after: number | null;
    description?: string | null;
    created_at: string;
    user_nom?: string | null;
    user_prenom?: string | null;
    reference_type?: string | null;
    reference_id?: number | null;
    reference_numero?: string | null;
    point_de_vente_nom?: string | null;
}

export default function ProductMovements() {
    const token = localStorage.getItem("token");
    const [movements, setMovements] = useState<Movement[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [search, setSearch] = useState("");
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [typeFilter, setTypeFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const fetchMovements = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/product-movements", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                // Backend pas encore implémenté : on ne casse pas l'UI
                setMovements([]);
                return;
            }
            const data = await res.json();
            setMovements(data);
            setCurrentPage(1);
        } catch {
            setMovements([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMovements();
    }, []);

    const movementTypes = useMemo(() => {
        const fromData = movements.map((m) => String(m.type || "").trim()).filter(Boolean);
        return Array.from(new Set([...KNOWN_MOVEMENT_TYPES, ...fromData]));
    }, [movements]);
    const filteredMovements = useMemo(() => {
        const q = search.trim().toLowerCase();
        return movements.filter((m) => {
            const normalizedType = String(m.type || "").trim();
            if (typeFilter !== "all" && normalizedType !== typeFilter) return false;

            const created = new Date(m.created_at);
            if (dateFrom) {
                const from = new Date(`${dateFrom}T00:00:00`);
                if (created < from) return false;
            }
            if (dateTo) {
                const to = new Date(`${dateTo}T23:59:59`);
                if (created > to) return false;
            }

            if (!q) return true;
            const fullUser = [m.user_prenom, m.user_nom].filter(Boolean).join(" ").toLowerCase();
            return (
                String(m.produit_nom || "").toLowerCase().includes(q) ||
                String(m.produit_reference || "").toLowerCase().includes(q) ||
                fullUser.includes(q) ||
                String(m.point_de_vente_nom || "").toLowerCase().includes(q) ||
                String(m.reference_numero || "").toLowerCase().includes(q) ||
                String(m.description || "").toLowerCase().includes(q)
            );
        });
    }, [movements, search, typeFilter, dateFrom, dateTo]);
    useEffect(() => {
        setCurrentPage(1);
    }, [search, typeFilter, dateFrom, dateTo]);

    const totalPages = Math.max(1, Math.ceil(filteredMovements.length / pageSize));
    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedMovements = filteredMovements.slice(startIndex, startIndex + pageSize);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <History className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Mouvements Produits
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Historique des créations, modifications, suppressions et ajustements de stock des produits.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={fetchMovements}
                    disabled={isLoading}
                >
                    <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    Rafraîchir
                </Button>
            </div>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Historique des mouvements</CardTitle>
                    <CardDescription>
                        Historique des mouvements de stock avec utilisateur, point de vente du produit et référence document (devis, avoir…).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher produit, utilisateur, PDV, référence..."
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
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <Select value={typeFilter} onValueChange={setTypeFilter}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Type de mouvement" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous les types</SelectItem>
                                        {movementTypes.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {formatMovementType(type)}
                                            </SelectItem>
                                        ))}
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
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Produit</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Type</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Avant</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Après</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Écart</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Utilisateur</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Lien vente</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Détails</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                                            Chargement des mouvements...
                                        </TableCell>
                                    </TableRow>
                                ) : paginatedMovements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                                            Aucun mouvement enregistré pour le moment.{" "}
                                            <span className="inline-flex items-center gap-1">
                                                <Package className="h-4 w-4" /> 
                                                Le suivi détaillé sera disponible dès que l&apos;API des mouvements sera branchée.
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedMovements.map(m => {
                                        const before = m.quantity_before ?? 0;
                                        const after = m.quantity_after ?? 0;
                                        const diff = after - before;
                                        return (
                                            <TableRow key={m.id}>
                                                <TableCell className="text-sm font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <span>{m.produit_nom || "Produit supprimé"}</span>
                                                        {m.produit_reference && (
                                                            <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                                REF: {m.produit_reference}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs font-semibold text-muted-foreground">
                                                    {formatMovementType(m.type)}
                                                </TableCell>
                                                <TableCell className="text-right text-sm">{m.quantity_before ?? "-"}</TableCell>
                                                <TableCell className="text-right text-sm">{m.quantity_after ?? "-"}</TableCell>
                                                <TableCell className={`text-right text-sm font-semibold ${
                                                    diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-muted-foreground"
                                                }`}>
                                                    {m.quantity_before == null && m.quantity_after == null ? "-" : diff}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                    {(m.user_nom != null || m.user_prenom != null)
                                                        ? [m.user_prenom, m.user_nom].filter(Boolean).join(" ").trim() || "—"
                                                        : "—"}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {m.point_de_vente_nom ? (
                                                        <span>
                                                            <span className="font-medium text-foreground">{m.point_de_vente_nom}</span>
                                                            {m.reference_type && m.reference_numero && (
                                                                <span className="text-muted-foreground ml-1">
                                                                    • {m.reference_type === "devis" && "Devis "}
                                                                    {m.reference_type === "commande" && "Commande "}
                                                                    {m.reference_type === "facture" && "Facture "}
                                                                    {m.reference_type === "avoir" && "Avoir "}
                                                                    {m.reference_type === "bon_livraison" && "BL "}
                                                                    {m.reference_numero}
                                                                </span>
                                                            )}
                                                        </span>
                                                    ) : m.reference_type && m.reference_numero ? (
                                                        <span className="text-muted-foreground">
                                                            {m.reference_type === "devis" && "Devis "}
                                                            {m.reference_type === "commande" && "Commande "}
                                                            {m.reference_type === "facture" && "Facture "}
                                                            {m.reference_type === "avoir" && "Avoir "}
                                                            {m.reference_type === "bon_livraison" && "BL "}
                                                            <span className="font-medium text-foreground">{m.reference_numero}</span>
                                                        </span>
                                                    ) : "-"}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {new Date(m.created_at).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {m.description || "-"}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    {filteredMovements.length > pageSize && (
                        <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
                            <div>
                                Affichage de{" "}
                                <span className="font-semibold">
                                    {startIndex + 1}
                                </span>{" "}
                                à{" "}
                                <span className="font-semibold">
                                    {Math.min(startIndex + pageSize, filteredMovements.length)}
                                </span>{" "}
                                sur{" "}
                                <span className="font-semibold">
                                    {filteredMovements.length}
                                </span>{" "}
                                mouvements
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                >
                                    Précédent
                                </Button>
                                <span>
                                    Page{" "}
                                    <span className="font-semibold">{currentPage}</span>{" "}
                                    / {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                >
                                    Suivant
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

