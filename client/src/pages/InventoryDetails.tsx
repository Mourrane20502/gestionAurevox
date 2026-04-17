import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { ArrowLeft, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductDetails {
    id: number;
    nom: string;
    reference?: string;
    description?: string;
    prix: number;
    stock: number;
    stock_alert?: number;
    grammage?: number;
    code_barre?: string;
    category_name?: string;
    point_de_vente_name?: string;
}

interface InventoryInfo {
    realStock?: number;
    justification?: string;
}

export default function InventoryDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [product, setProduct] = useState<ProductDetails | null>(null);
    const [inventory, setInventory] = useState<InventoryInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const token = localStorage.getItem("token");

    useEffect(() => {
        if (!id) return;
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Fetch product details
                const res = await fetch(`/api/products/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) {
                    setError("Impossible de charger les détails du produit.");
                } else {
                    const data = await res.json();
                    setProduct(data);
                }

                // Fetch inventory info from localStorage
                const productId = Number(id);
                let savedReal: Record<number, number> = {};
                let savedJust: Record<number, string> = {};
                try {
                    const rawReal = localStorage.getItem("inventoryRealStock");
                    if (rawReal) savedReal = JSON.parse(rawReal);
                    const rawJust = localStorage.getItem("inventoryJustification");
                    if (rawJust) savedJust = JSON.parse(rawJust);
                } catch {
                    savedReal = {};
                    savedJust = {};
                }
                setInventory({
                    realStock: savedReal[productId],
                    justification: savedJust[productId] || ""
                });
            } catch {
                setError("Erreur lors du chargement des données.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [id, token]);

    const systemStock = product?.stock ?? 0;
    const realStock = inventory?.realStock;
    const hasRealStock = typeof realStock === "number" && !Number.isNaN(realStock);
    const diff = hasRealStock ? realStock - systemStock : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => navigate("/dashboard/inventaire")}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Package className="h-6 w-6 text-indigo-600" />
                            Détails inventaire
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Vue détaillée du produit et de l&apos;écart d&apos;inventaire.
                        </p>
                    </div>
                </div>
            </div>

            <Card className="border-border/60 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>{product?.nom || "Produit inconnu"}</span>
                        {product?.reference && (
                            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                                Réf: {product.reference}
                            </span>
                        )}
                    </CardTitle>
                    <CardDescription>
                        {product?.category_name && (
                            <span className="mr-3">Catégorie : {product.category_name}</span>
                        )}
                        {product?.point_de_vente_name && (
                            <span>Point de vente : {product.point_de_vente_name}</span>
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                            <AlertTriangle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    {isLoading && (
                        <p className="text-sm text-muted-foreground">Chargement...</p>
                    )}

                    {!isLoading && product && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div className="space-y-1">
                                    <p className="text-xs uppercase text-muted-foreground font-semibold">Stock système</p>
                                    <p className="text-lg font-bold">{systemStock}</p>
                                    {typeof product.stock_alert === "number" && (
                                        <p className="text-xs text-muted-foreground">
                                            Seuil d&apos;alerte : {product.stock_alert}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs uppercase text-muted-foreground font-semibold">Stock réel saisi</p>
                                    <p className="text-lg font-bold">
                                        {hasRealStock ? realStock : "—"}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs uppercase text-muted-foreground font-semibold">Écart</p>
                                    <p
                                        className={cn(
                                            "text-lg font-bold",
                                            hasRealStock && diff !== 0
                                                ? diff > 0
                                                    ? "text-emerald-600"
                                                    : "text-red-600"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        {hasRealStock ? diff : "—"}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <p className="text-xs uppercase text-muted-foreground font-semibold">Justification</p>
                                <div className="min-h-[60px] rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                                    {inventory?.justification && inventory.justification.trim() !== ""
                                        ? inventory.justification
                                        : <span className="text-muted-foreground">Aucune justification enregistrée pour ce produit.</span>}
                                </div>
                            </div>

                            {product.description && (
                                <div className="space-y-1">
                                    <p className="text-xs uppercase text-muted-foreground font-semibold">Description du produit</p>
                                    <p className="text-sm text-muted-foreground">{product.description}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                {typeof product.prix === "number" && (
                                    <div>
                                        <p className="text-xs uppercase text-muted-foreground font-semibold">Prix</p>
                                        <p className="font-medium">{product.prix} DH</p>
                                    </div>
                                )}
                                {typeof product.grammage === "number" && product.grammage > 0 && (
                                    <div>
                                        <p className="text-xs uppercase text-muted-foreground font-semibold">Grammage</p>
                                        <p className="font-medium">{product.grammage} g</p>
                                    </div>
                                )}
                                {product.code_barre && (
                                    <div>
                                        <p className="text-xs uppercase text-muted-foreground font-semibold">Code-barres</p>
                                        <p className="font-medium">{product.code_barre}</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

