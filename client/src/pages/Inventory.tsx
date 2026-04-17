import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/common/ui/table";
import { Search, Package, RefreshCcw, RotateCcw, AlertTriangle, CheckCircle2, MessageSquare, Plus, Clock, X, MoreVertical, Trash2, History, Save } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/common/ui/dialog";
import { Label } from "@/components/common/ui/label";

interface Product {
    id: number;
    nom: string;
    reference?: string;
    stock: number;
    prix: number;
}

interface InventoryLine extends Product {
    realStock: number | "";
    justification: string;
}

interface ResolvedVerification {
    id: number;
    product_id: number;
    statut: string;
    admin_message: string | null;
    updated_at: string;
    user_id?: number | null;
    user_nom?: string | null;
    user_prenom?: string | null;
}

export default function Inventory() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [products, setProducts] = useState<InventoryLine[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [savedProductIds, setSavedProductIds] = useState<Set<number>>(new Set());
    const [resolvedByProduct, setResolvedByProduct] = useState<Record<number, ResolvedVerification>>({});

    // State for Add Inventory Dialog
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newInventory, setNewInventory] = useState({
        productId: "",
        realStock: "",
        justification: ""
    });
    const [productSearchQuery, setProductSearchQuery] = useState("");
    const [productDropdownOpen, setProductDropdownOpen] = useState(false);
    const productSearchRef = useRef<HTMLDivElement>(null);

    const STORAGE_KEY = "inventoryRealStock";
    const JUSTIFICATION_STORAGE_KEY = "inventoryJustification";

    const fetchProducts = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/products", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data: Product[] = await res.json();

            // Charger d'éventuelles valeurs sauvegardées (stock réel saisi précédemment)
            let saved: Record<number, number> = {};
            let savedJustifications: Record<number, string> = {};
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    saved = JSON.parse(raw);
                }
                const rawJust = localStorage.getItem(JUSTIFICATION_STORAGE_KEY);
                if (rawJust) {
                    savedJustifications = JSON.parse(rawJust);
                }
            } catch {
                saved = {};
                savedJustifications = {};
            }

            const idsWithSavedData = new Set<number>([
                ...Object.keys(saved).map(Number),
                ...Object.keys(savedJustifications).map(Number)
            ].filter((n) => !Number.isNaN(n)));
            setSavedProductIds(idsWithSavedData);

            setProducts(
                data.map(p => ({
                    ...p,
                    realStock: Object.prototype.hasOwnProperty.call(saved, p.id)
                        ? saved[p.id]
                        : "",
                    justification: Object.prototype.hasOwnProperty.call(savedJustifications, p.id)
                        ? savedJustifications[p.id]
                        : ""
                }))
            );
        } finally {
            setIsLoading(false);
        }
    };

    const fetchResolved = async () => {
        if (!token) return;
        try {
            const res = await fetch("/api/inventory-verifications/resolved", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data: ResolvedVerification[] = await res.json();
            const map: Record<number, ResolvedVerification> = {};
            data.forEach(v => { map[v.product_id] = v; });
            setResolvedByProduct(map);
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    useEffect(() => {
        if (token) fetchResolved();
    }, [token]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
                setProductDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredProductsForDialog = productSearchQuery.trim()
        ? products.filter(
            (p) =>
                p.nom.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                (p.reference || "").toLowerCase().includes(productSearchQuery.toLowerCase())
        )
        : [...products].sort((a, b) => a.nom.localeCompare(b.nom));
    const selectedProductForDialog = newInventory.productId
        ? products.find((p) => p.id.toString() === newInventory.productId)
        : null;

    const handleRealStockChange = (id: number, value: string) => {
        const num = value === "" ? "" : Number(value);
        if (num !== "" && Number.isNaN(num)) return;
        setProducts(prev =>
            prev.map(p =>
                p.id === id ? { ...p, realStock: num } : p
            )
        );
    };

    const handleJustificationChange = (id: number, value: string) => {
        setProducts(prev =>
            prev.map(p =>
                p.id === id ? { ...p, justification: value } : p
            )
        );
    };

    const resetCounts = () => {
        setProducts(prev => prev.map(p => ({ ...p, realStock: "", justification: "" })));
        setSavedProductIds(new Set());
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(JUSTIFICATION_STORAGE_KEY);
        toast.info("Toutes les données d'inventaire local ont été réinitialisées.");
    };

    const handleAddInventory = async () => {
        if (!newInventory.productId) {
            toast.error("Veuillez sélectionner un produit");
            return;
        }
        if (newInventory.realStock === "") {
            toast.error("Veuillez saisir le stock réel");
            return;
        }

        const id = parseInt(newInventory.productId);
        const product = products.find(p => p.id === id);
        if (!product) return;

        // Mise à jour locale
        setProducts(prev => prev.map(p =>
            p.id === id
                ? { ...p, realStock: Number(newInventory.realStock), justification: newInventory.justification }
                : p
        ));

        // Enregistrement
        await saveInventoryRecord(id, Number(newInventory.realStock), newInventory.justification);

        // Fermer et reset
        setIsDialogOpen(false);
        setNewInventory({ productId: "", realStock: "", justification: "" });
        setProductSearchQuery("");
        setProductDropdownOpen(false);
    };

    const saveInventoryRecord = async (productId: number, realStock: number, justification: string) => {
        let saved: Record<number, number> = {};
        let savedJustifications: Record<number, string> = {};
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) saved = JSON.parse(raw);
            const rawJust = localStorage.getItem(JUSTIFICATION_STORAGE_KEY);
            if (rawJust) savedJustifications = JSON.parse(rawJust);
        } catch {
            saved = {};
            savedJustifications = {};
        }

        saved[productId] = realStock;
        if (justification.trim()) {
            savedJustifications[productId] = justification.trim();
        } else {
            delete savedJustifications[productId];
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        localStorage.setItem(JUSTIFICATION_STORAGE_KEY, JSON.stringify(savedJustifications));

        setSavedProductIds(prev => new Set(prev).add(productId));

        const product = products.find(p => p.id === productId);
        if (product && token) {
            try {
                const res = await fetch("/api/inventory-verifications", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        product_id: product.id,
                        product_nom: product.nom,
                        stock_systeme: product.stock,
                        stock_reel: realStock,
                        justification: justification.trim() || undefined,
                    }),
                });
                if (res.ok) {
                    toast.info("Vérification envoyée aux approbations.");
                    // Notifier le sidebar pour rafraîchir le compteur d'approbations
                    window.dispatchEvent(new CustomEvent("approvals-updated"));
                }
            } catch {
                // Ignore API error for now
            }
        }
        toast.success("Inventaire enregistré pour ce produit.");
    };

    const saveLine = async (id: number) => {
        const product = products.find(p => p.id === id);
        if (!product || product.realStock === "") {
            toast.error("Saisissez le stock réel avant d'enregistrer.");
            return;
        }
        await saveInventoryRecord(product.id, Number(product.realStock), product.justification);
    };

    const removeFromInventory = (id: number) => {
        setProducts(prev => prev.map(p =>
            p.id === id ? { ...p, realStock: "", justification: "" } : p
        ));

        setSavedProductIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });

        // Update localStorage
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                delete saved[id];
                localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            }
            const rawJust = localStorage.getItem(JUSTIFICATION_STORAGE_KEY);
            if (rawJust) {
                const savedJust = JSON.parse(rawJust);
                delete savedJust[id];
                localStorage.setItem(JUSTIFICATION_STORAGE_KEY, JSON.stringify(savedJust));
            }
        } catch (e) {
            console.error("Error updating localStorage", e);
        }

        // Update API
        const resolved = resolvedByProduct[id];
        if (resolved?.id && token) {
            fetch(`/api/inventory-verifications/${resolved.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => {
                if (res.ok) fetchResolved();
            });
        }

        toast.success("Produit retiré de la session d'inventaire.");
    };

    const inventoriedProducts = products.filter(p => savedProductIds.has(p.id));

    const filtered = inventoriedProducts.filter(p =>
        p.nom.toLowerCase().includes(search.toLowerCase()) ||
        (p.reference || "").toLowerCase().includes(search.toLowerCase())
    );

    // --- Statistics Calculations ---
    const totalProducts = products.length;
    const inventoriedCount = savedProductIds.size;
    const completionPercentage = totalProducts > 0 ? (inventoriedCount / totalProducts) * 100 : 0;

    const stats = products.reduce((acc, p) => {
        const isInventored = savedProductIds.has(p.id);
        const price = p.prix || 0;
        acc.systemValue += p.stock * price;

        if (isInventored) {
            const real = Number(p.realStock) || 0;
            const diff = real - p.stock;
            acc.realValue += real * price;
            if (diff > 0) acc.gainValue += diff * price;
            if (diff < 0) acc.lossValue += Math.abs(diff) * price;

            const status = resolvedByProduct[p.id]?.statut;
            if (status === 'verifie') acc.verified++;
            else if (status === 'a_revoir') acc.rejected++;
            else acc.pending++;
        }
        return acc;
    }, { systemValue: 0, realValue: 0, gainValue: 0, lossValue: 0, verified: 0, pending: 0, rejected: 0 });

    const anomalies = filtered.filter(p => p.realStock !== "" && p.realStock !== p.stock);
    const totalAnomalies = anomalies.length;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Package className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Inventaire
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Effectuez un comptage physique et comparez le avec le stock système.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                                <Plus className="h-4 w-4" />
                                Ajouter un inventaire
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[480px] overflow-visible">
                            <DialogHeader>
                                <DialogTitle>Nouvel inventaire</DialogTitle>
                                <DialogDescription>
                                    Sélectionnez un produit et saisissez la quantité physique constatée.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4" ref={productSearchRef}>
                                <div className="grid gap-2">
                                    <Label htmlFor="product">Produit</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        <Input
                                            id="product"
                                            type="text"
                                            placeholder="Rechercher par nom ou référence..."
                                            className="pl-9 pr-9 h-10 border-indigo-200 focus-visible:ring-indigo-500"
                                            value={selectedProductForDialog ? `${selectedProductForDialog.nom}${selectedProductForDialog.reference ? ` (${selectedProductForDialog.reference})` : ""}` : productSearchQuery}
                                            readOnly={!!selectedProductForDialog}
                                            onChange={(e) => {
                                                setProductSearchQuery(e.target.value);
                                            }}
                                            onFocus={() => {
                                                if (!selectedProductForDialog) setProductDropdownOpen(true);
                                            }}
                                            onClick={() => {
                                                if (!selectedProductForDialog) setProductDropdownOpen(true);
                                            }}
                                        />
                                        {newInventory.productId && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNewInventory((prev) => ({ ...prev, productId: "" }));
                                                    setProductSearchQuery("");
                                                    setProductDropdownOpen(true);
                                                }}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                                                aria-label="Effacer la sélection"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {productDropdownOpen && (
                                    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden animate-in fade-in duration-200">
                                        <div className="px-3 py-2 border-b border-border bg-muted/50">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                {filteredProductsForDialog.length === 0
                                                    ? "Aucun résultat"
                                                    : `${Math.min(filteredProductsForDialog.length, 100)} produit(s)`}
                                            </span>
                                        </div>
                                        <ul className="max-h-[220px] overflow-y-auto overscroll-contain py-1">
                                            {filteredProductsForDialog.length === 0 ? (
                                                <li className="px-4 py-6 text-sm text-muted-foreground text-center">Aucun produit trouvé pour cette recherche</li>
                                            ) : (
                                                filteredProductsForDialog.slice(0, 100).map((p) => {
                                                    const label = [p.nom, p.reference].filter(Boolean).join(" — ");
                                                    return (
                                                        <li
                                                            key={p.id}
                                                            className={cn(
                                                                "cursor-pointer px-4 py-2.5 text-sm border-b border-border/50 last:border-b-0 transition-colors",
                                                                "hover:bg-indigo-50/80 dark:hover:bg-indigo-900/20",
                                                                newInventory.productId === p.id.toString() && "bg-indigo-100/80 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 font-medium"
                                                            )}
                                                            title={label}
                                                            onClick={() => {
                                                                setNewInventory((prev) => ({ ...prev, productId: p.id.toString() }));
                                                                setProductSearchQuery("");
                                                                setProductDropdownOpen(false);
                                                            }}
                                                        >
                                                            <span className="block truncate font-medium text-foreground">{p.nom}</span>
                                                            {p.reference && <span className="block truncate text-xs text-muted-foreground mt-0.5">Réf. {p.reference}</span>}
                                                        </li>
                                                    );
                                                })
                                            )}
                                        </ul>
                                    </div>
                                )}

                                {newInventory.productId && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label className="text-muted-foreground text-[11px] uppercase tracking-wider">Référence</Label>
                                                <div className="h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-foreground flex items-center">
                                                    {products.find(p => p.id.toString() === newInventory.productId)?.reference || "-"}
                                                </div>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label className="text-muted-foreground text-[11px] uppercase tracking-wider">Stock Système</Label>
                                                <div className="h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm font-semibold text-foreground flex items-center justify-end">
                                                    {products.find(p => p.id.toString() === newInventory.productId)?.stock}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="grid gap-2">
                                    <Label htmlFor="realStock" className="font-semibold text-indigo-600">Quantité Physique Comptée</Label>
                                    <Input
                                        id="realStock"
                                        type="number"
                                        placeholder="Saisir la quantité réelle..."
                                        className="h-10 text-base border-indigo-200 focus-visible:ring-indigo-500"
                                        value={newInventory.realStock}
                                        onChange={e => setNewInventory(prev => ({ ...prev, realStock: e.target.value }))}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="justification">Justification (optionnel)</Label>
                                    <Input
                                        id="justification"
                                        placeholder="Ex: Erreur de saisie, casse..."
                                        value={newInventory.justification}
                                        onChange={e => setNewInventory(prev => ({ ...prev, justification: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                                <Button onClick={handleAddInventory}>Enregistrer</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Button
                        variant="outline"
                        className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        onClick={resetCounts}
                    >
                        <RotateCcw className="h-4 w-4" />
                        Réinitialiser
                    </Button>
                    
                    <Button
                        variant="outline"
                        className="gap-2 cursor-pointer"
                        onClick={() => { fetchProducts(); fetchResolved(); }}
                        disabled={isLoading}
                    >
                        <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                        Rafraîchir
                    </Button>
                   
                </div>
            </div>

            {/* Professional Recap Section */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 md:grid-cols-2">
                {/* 1. Global Progress Card */}
                <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Couverture</p>
                            <Badge variant="outline" className={cn(
                                "text-[10px] px-1.5 py-0",
                                completionPercentage === 100 ? "border-emerald-500 text-emerald-600" : "border-indigo-500 text-indigo-600"
                            )}>
                                {inventoriedCount} / {totalProducts}
                            </Badge>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-end justify-between">
                                <h3 className="text-2xl font-bold tracking-tight">{completionPercentage.toFixed(1)}%</h3>
                                <p className="text-[10px] text-muted-foreground mb-1 italic">Taux de comptage</p>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted flex">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-700"
                                    style={{ width: `${completionPercentage}%` }}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Financial Discrepancy Card */}
                <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variance Valeur</p>
                            <div className="flex gap-1">
                                {stats.gainValue > 0 && <span className="text-[10px] text-emerald-600 font-medium">+{stats.gainValue.toFixed(2).replace(".", ",")} DH</span>}
                                {stats.lossValue > 0 && <span className="text-[10px] text-red-600 font-medium">-{stats.lossValue.toFixed(2).replace(".", ",")} DH</span>}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <h3 className={cn(
                                "text-2xl font-bold tracking-tight",
                                (stats.realValue - stats.systemValue) >= 0 ? "text-emerald-600" : "text-red-600"
                            )}>
                                {(stats.realValue - stats.systemValue).toFixed(2).replace(".", ",")} DH
                            </h3>
                            <p className="text-[10px] text-muted-foreground">Ecart net sur produits comptés</p>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] border-t border-border/40 pt-3">
                            <div>
                                <p className="text-muted-foreground">Valeur Syst.</p>
                                <p className="font-semibold">{stats.systemValue.toFixed(2).replace(".", ",")} DH</p>
                            </div>
                            <div className="text-right">
                                <p className="text-muted-foreground">Valeur Réelle</p>
                                <p className="font-semibold">{stats.realValue.toFixed(2).replace(".", ",")} DH</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Anomalies & Quality Card */}
                <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Qualité Stock</p>
                        <div className="flex-1 space-y-1">
                            <h3 className="text-lg font-bold leading-tight">Anomalies: {totalAnomalies}</h3>
                            <p className="text-[10px] text-muted-foreground">
                                Écarts sur {inventoriedCount} produits vérifiés.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Validation Workflow Card */}
                <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Statut Approbations</p>
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-medium">
                                <span className="text-emerald-600">Validés: {stats.verified}</span>
                                <span className="text-blue-600">En attente: {stats.pending}</span>
                                <span className="text-red-600">Rejetés: {stats.rejected}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted flex">
                                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(stats.verified / (inventoriedCount || 1)) * 100}%` }} />
                                <div className="h-full bg-blue-500 transition-all" style={{ width: `${(stats.pending / (inventoriedCount || 1)) * 100}%` }} />
                                <div className="h-full bg-red-500 transition-all" style={{ width: `${(stats.rejected / (inventoriedCount || 1)) * 100}%` }} />
                            </div>
                            <p className="text-[9px] text-muted-foreground text-center italic mt-1 font-medium">
                                Répartition des décisions administratives
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-base text-foreground">Historique récent de l&apos;inventaire</CardTitle>
                            <CardDescription>
                                Liste des produits inventoriés au cours de cette session.
                            </CardDescription>
                        </div>
                        <div className="relative w-full max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filtrer l'historique..."
                                className="pl-9 h-9"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    {anomalies.length > 0 && (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs text-amber-800">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {anomalies.length} écart(s) détecté(s).
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Produit</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Référence</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Stock système</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Stock réel</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Écart</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Justification</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Utilisateur</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Retour admin</TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-right pr-4">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                                            Chargement...
                                        </TableCell>
                                    </TableRow>
                                ) : filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                                            {inventoriedCount === 0
                                                ? "Commencez par ajouter un inventaire avec le bouton ci-dessus."
                                                : "Aucun résultat pour cette recherche."}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map(p => {
                                        const diff =
                                            p.realStock === "" ? 0 : (Number(p.realStock) - p.stock);
                                        const hasDiff = p.realStock !== "" && diff !== 0;
                                        const resolved = resolvedByProduct[p.id];
                                        return (
                                            <TableRow key={p.id} className={cn("transition-colors", hasDiff ? "bg-amber-50/40 hover:bg-amber-100/40" : "")}>
                                                <TableCell className="text-sm font-medium">{p.nom}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{p.reference || "-"}</TableCell>
                                                <TableCell className="text-right text-sm">{p.stock}</TableCell>
                                                <TableCell className="text-right">
                                                    <Input
                                                        type="number"
                                                        className="h-8 w-24 ml-auto text-right"
                                                        value={p.realStock === "" ? "" : p.realStock}
                                                        onChange={e => handleRealStockChange(p.id, e.target.value)}
                                                    />
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-right text-sm font-semibold",
                                                    hasDiff
                                                        ? diff > 0
                                                            ? "text-emerald-600"
                                                            : "text-red-600"
                                                        : "text-muted-foreground"
                                                )}>
                                                    {p.realStock === "" ? "-" : diff}
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="text"
                                                        className="h-8 text-xs"
                                                        placeholder="Justification..."
                                                        value={p.justification}
                                                        onChange={e => handleJustificationChange(p.id, e.target.value)}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                    {resolved && (resolved.user_nom != null || resolved.user_prenom != null)
                                                        ? [resolved.user_prenom, resolved.
                                                            user_nom].filter(Boolean).join(" ").trim() || "—"
                                                        : "—"}
                                                </TableCell>
                                                <TableCell className="max-w-[180px]">
                                                    {resolved ? (
                                                        <div className={cn(
                                                            "flex items-center gap-1.5 text-xs rounded-md px-2 py-1",
                                                            resolved.statut === "verifie"
                                                                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                                                : resolved.statut === "a_revoir"
                                                                    ? "bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                                                                    : "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                                                        )}>
                                                            {resolved.statut === "verifie" ? (
                                                                <>
                                                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                                                    <span>Validé</span>
                                                                </>
                                                            ) : resolved.statut === "a_revoir" ? (
                                                                <>
                                                                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                                                    <span>À revoir</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Clock className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                                                    <span>En attente</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right pr-4">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            className="h-8 px-3 gap-1.5"
                                                            onClick={() => saveLine(p.id)}
                                                        >
                                                            <Save className="h-3.5 w-3.5" />
                                                            Enregistrer
                                                        </Button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuItem onClick={() => navigate(`/dashboard/inventaire/${p.id}`)} className="cursor-pointer">
                                                                    <History className="h-4 w-4" />
                                                                    Historique
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => removeFromInventory(p.id)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                                    <Trash2 className="h-4 w-4" />
                                                                    Supprimer de l&apos;historique
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
