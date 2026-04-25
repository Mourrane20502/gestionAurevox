import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { AlertTriangle, Bell, Package, ReceiptText, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

type ProductAlert = {
    id: number;
    nom: string;
    stock: number;
    stock_alert: number;
};

type ReglementAlert = {
    id: number;
    client_nom?: string;
    numero_facture?: string | null;
    numero_commande?: string | null;
    montant: number;
    statut: string;
    date_reglement: string;
};

export default function AlertsNotifications() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [isLoading, setIsLoading] = useState(true);
    const [lowStockProducts, setLowStockProducts] = useState<ProductAlert[]>([]);
    const [impayeReglements, setImpayeReglements] = useState<ReglementAlert[]>([]);

    useEffect(() => {
        const run = async () => {
            if (!token) return;
            setIsLoading(true);
            try {
                const headers = { Authorization: `Bearer ${token}` };
                const [productsRes, regRes] = await Promise.all([
                    fetch("/api/products", { headers }),
                    fetch("/api/reglements-clients", { headers }),
                ]);

                const products = productsRes.ok ? await productsRes.json() : [];
                const reglements = regRes.ok ? await regRes.json() : [];

                const lowStock = Array.isArray(products)
                    ? products.filter(
                          (p: any) =>
                              typeof p.stock === "number" &&
                              typeof p.stock_alert === "number" &&
                              p.stock <= p.stock_alert
                      )
                    : [];

                const impayes = Array.isArray(reglements)
                    ? reglements.filter((r: any) => r.statut === "impaye")
                    : [];

                setLowStockProducts(lowStock);
                setImpayeReglements(impayes);
            } catch (e) {
                console.error(e);
                toast.error("Erreur lors du chargement des alertes");
            } finally {
                setIsLoading(false);
            }
        };
        run();
    }, [token]);

    const totalAlerts = useMemo(
        () => lowStockProducts.length + impayeReglements.length,
        [lowStockProducts.length, impayeReglements.length]
    );

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Bell className="h-6 w-6 text-indigo-600" />
                        Alertes et notifications
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Vue complète des alertes critiques: règlements impayés et stock bas.
                    </p>
                </div>
                <div className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-bold">
                    {totalAlerts} alerte(s)
                </div>
            </div>

            {isLoading ? (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        Chargement des alertes...
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <Card className="border border-border">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-rose-600" />
                                Règlements clients impayés ({impayeReglements.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {impayeReglements.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Aucun règlement impayé.</p>
                            ) : (
                                impayeReglements.map((r) => (
                                    <div
                                        key={r.id}
                                        className="flex items-center justify-between rounded-xl border border-border p-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate">
                                                {r.client_nom || "Client"} •{" "}
                                                {r.numero_facture || r.numero_commande || `#${r.id}`}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {Number(r.montant || 0).toLocaleString("fr-FR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{" "}
                                                MAD
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => navigate("/dashboard/reglements", { state: { filterStatut: "impaye" } })}
                                        >
                                            <ReceiptText className="h-3.5 w-3.5 mr-1" />
                                            Voir
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border border-border">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Package className="h-4 w-4 text-amber-600" />
                                Produits en alerte stock ({lowStockProducts.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {lowStockProducts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Aucun produit en stock critique.</p>
                            ) : (
                                lowStockProducts.map((p) => (
                                    <div
                                        key={p.id}
                                        className="flex items-center justify-between rounded-xl border border-border p-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate">{p.nom}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Stock: {p.stock} / seuil: {p.stock_alert}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => navigate("/dashboard/inventaire")}
                                        >
                                            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                                            Ouvrir
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
