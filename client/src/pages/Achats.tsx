import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import { toast } from "sonner";
import { ShoppingCart, Truck, Plus, Trash2 } from "lucide-react";
import { generateBonCommandeFournisseurPdf } from "@/components/pdf/BonCommandeFournisseurPdf";
import { cn } from "@/lib/utils";

interface Fournisseur {
    id: number;
    nom: string;
    taux_ras?: number | null;
}

interface CatalogProduct {
    id: number;
    nom: string;
    prix: number;
}

interface Gestionnaire {
    id: number;
    nom: string;
}

interface AchatItem {
    produit_id?: number;
    designation: string;
    quantite: number;
    prix_unitaire: number;
    tva: number;
}

export default function Achats() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
    const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
    const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);
    const [selectedFournisseurId, setSelectedFournisseurId] = useState<string>("");
    const [selectedGestionnaireId, setSelectedGestionnaireId] = useState<string>("");
    const [items, setItems] = useState<AchatItem[]>([
        { designation: "", quantite: 1, prix_unitaire: 0, tva: 20 },
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reglementDialogOpen, setReglementDialogOpen] = useState(false);
    const [pendingAchatId, setPendingAchatId] = useState<number | null>(null);

    const selectedFournisseur = useMemo(
        () => fournisseurs.find((f) => String(f.id) === selectedFournisseurId),
        [fournisseurs, selectedFournisseurId]
    );
    const tauxRas = Number(selectedFournisseur?.taux_ras ?? 100);

    const totals = useMemo(() => {
        const totalHT = items.reduce((sum, it) => {
            const qty = Number(it.quantite) || 0;
            const unit = Number(it.prix_unitaire) || 0;
            return sum + (qty * unit);
        }, 0);
        const totalTVA = items.reduce((sum, it) => {
            const qty = Number(it.quantite) || 0;
            const unit = Number(it.prix_unitaire) || 0;
            const tva = Number(it.tva) || 0;
            const ht = qty * unit;
            return sum + (ht * tva / 100);
        }, 0);
        const totalTTC = totalHT + totalTVA;
        // RAS est calcule sur la TVA uniquement.
        const montantRas = totalTVA * (tauxRas / 100);
        const netFournisseur = totalTTC - montantRas;
        return {
            totalTTC,
            montantRas,
            netFournisseur,
        };
    }, [items, tauxRas]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [fRes, pRes, gRes] = await Promise.all([
                    fetch("/api/fournisseurs", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/gestionnaires", { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                if (fRes.ok) setFournisseurs(await fRes.json());
                if (pRes.ok) setCatalogProducts(await pRes.json());
                if (gRes.ok) {
                    const data = await gRes.json();
                    setGestionnaires(data || []);
                    if (data && data[0]) {
                        setSelectedGestionnaireId(String(data[0].id));
                    }
                }
            } catch (e) {
                console.error(e);
                toast.error("Erreur de chargement des données fournisseurs");
            }
        };
        fetchData();
    }, [token]);

    const handleItemChange = (index: number, field: keyof AchatItem, value: any) => {
        const next = [...items];
        if (field === "quantite" || field === "prix_unitaire" || field === "tva") {
            const n = Number(value);
            (next[index] as any)[field] = Number.isFinite(n) ? n : 0;
        } else {
            (next[index] as any)[field] = value;
        }
        setItems(next);
    };

    // Sélection d'un produit du stock (table products) pour auto-remplir désignation / prix
    const handleCatalogProductSelect = (index: number, productId: string) => {
        const product = catalogProducts.find((p) => p.id === Number(productId));
        const next = [...items];
        if (product) {
            next[index].produit_id = product.id;
            next[index].designation = product.nom;
            next[index].prix_unitaire = Number(product.prix) || 0;
        }
        setItems(next);
    };

    const addItemRow = () => {
        setItems(prev => [...prev, { designation: "", quantite: 1, prix_unitaire: 0, tva: 20 }]);
    };

    const removeItemRow = (index: number) => {
        if (items.length === 1) return;
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGestionnaireId) {
            toast.error("Aucun gestionnaire sélectionné");
            return;
        }
        if (!selectedFournisseurId) {
            toast.error("Veuillez choisir un fournisseur");
            return;
        }
        const cleanItems = items.filter(
            (it) =>
                it.quantite > 0 &&
                (
                    (it.produit_id && it.produit_id > 0) ||
                    it.designation.trim() !== ""
                )
        );
        if (cleanItems.length === 0) {
            toast.error("Veuillez ajouter au moins une ligne produit valide");
            return;
        }

        setIsSubmitting(true);
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
        const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
        const orderNumero = `BCF-${datePart}-${randomPart}`;

        let lastAchatId: number | null = null;
        try {
            for (const it of cleanItems) {
                const body = {
                    gestionnaire_id: Number(selectedGestionnaireId),
                    fournisseur_id: Number(selectedFournisseurId),
                    product_id: it.produit_id ?? null,
                    quantite: it.quantite,
                    prix_unitaire: it.prix_unitaire,
                    statut: "en_attente",
                    tva: it.tva,
                    designation_libre: it.produit_id ? null : it.designation || null,
                    numero: orderNumero,
                    montant_ttc: it.quantite * it.prix_unitaire * (1 + (Number(it.tva) || 0) / 100),
                    taux_ras: tauxRas,
                    montant_ras:
                        (it.quantite * it.prix_unitaire * ((Number(it.tva) || 0) / 100)) * (tauxRas / 100),
                    net_fournisseur:
                        (it.quantite * it.prix_unitaire * (1 + (Number(it.tva) || 0) / 100)) -
                        ((it.quantite * it.prix_unitaire * ((Number(it.tva) || 0) / 100)) * (tauxRas / 100)),
                };
                const res = await fetch("/api/achats-fournisseurs", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || "Erreur lors de la création de l'achat");
                }
                const created = await res.json().catch(() => null);
                if (created && typeof created.id === "number") {
                    lastAchatId = created.id;
                }
            }
            const fournisseur = fournisseurs.find((f) => String(f.id) === selectedFournisseurId);
            const gestionnaire = gestionnaires.find((g) => String(g.id) === selectedGestionnaireId);
            try {
                await generateBonCommandeFournisseurPdf({
                    numero: orderNumero,
                    fournisseur_nom: fournisseur?.nom ?? "Fournisseur",
                    gestionnaire_nom: gestionnaire?.nom ?? "Gestionnaire",
                    statut: "en_attente",
                    items: cleanItems.map((it) => ({
                        produit_nom: it.designation?.trim() || catalogProducts.find((p) => p.id === it.produit_id)?.nom || "—",
                        quantite: it.quantite,
                        prix_unitaire: it.prix_unitaire,
                        tva: it.tva,
                        montant_ht: it.quantite * it.prix_unitaire,
                    })),
                    montant_ttc: totals.totalTTC,
                    taux_ras: tauxRas,
                    montant_ras: totals.montantRas,
                    net_fournisseur: totals.netFournisseur,
                });
                toast.success("Achat enregistré et bon de commande téléchargé");
            } catch (pdfErr) {
                console.error(pdfErr);
                toast.success("Achat fournisseur enregistré");
            }
            setItems([{ designation: "", quantite: 1, prix_unitaire: 0, tva: 20 }]);

            // Notifier le sidebar pour rafraîchir le compteur d'approbations
            window.dispatchEvent(new CustomEvent("approvals-updated"));

            if (lastAchatId) {
                setPendingAchatId(lastAchatId);
                setReglementDialogOpen(true);
            }
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Erreur lors de l'enregistrement de l'achat");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ShoppingCart className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                        Achats fournisseurs
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Enregistrez les commandes passées auprès de vos fournisseurs
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="hidden sm:inline-flex"
                    onClick={() => navigate("/dashboard/fournisseurs")}
                >
                    <Truck className="h-4 w-4 mr-2" />
                    Gérer les fournisseurs
                </Button>
            </div>

            <Card className="border border-border shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        Nouvelle commande fournisseur
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium">Gestionnaire</Label>
                                <Select
                                    value={selectedGestionnaireId}
                                    onValueChange={setSelectedGestionnaireId}
                                >
                                    <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Choisir un gestionnaire" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {gestionnaires.map(g => (
                                            <SelectItem key={g.id} value={String(g.id)}>
                                                {g.nom}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium">Fournisseur</Label>
                                <Select
                                    value={selectedFournisseurId}
                                    onValueChange={setSelectedFournisseurId}
                                >
                                    <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Choisir un fournisseur" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fournisseurs.map(f => (
                                            <SelectItem key={f.id} value={String(f.id)}>
                                                {f.nom}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40 border-b border-border">
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 pl-4">
                                            Produit (BDD)
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2">
                                            Ou saisie manuelle
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-center">
                                            Qté
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-center">
                                            Prix unitaire
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-2 text-center">
                                            TVA %
                                        </TableHead>
                                        <TableHead className="w-[40px]" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item, index) => (
                                        <TableRow key={index} className="border-b border-border">
                                            <TableCell className="pl-4">
                                                <Select
                                                    onValueChange={(v) => handleCatalogProductSelect(index, v)}
                                                >
                                                    <SelectTrigger className="h-9 text-xs">
                                                        <SelectValue placeholder="Depuis produits..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {catalogProducts.map((p) => (
                                                            <SelectItem key={p.id} value={String(p.id)}>
                                                                {p.nom}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    className="h-9 text-xs"
                                                    value={item.designation}
                                                    onChange={e =>
                                                        handleItemChange(index, "designation", e.target.value)
                                                    }
                                                    placeholder="Taper le nom du produit manuellement"
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Input
                                                    type="number"
                                                    className="h-9 w-20 mx-auto text-xs text-center"
                                                    value={item.quantite}
                                                    onChange={e =>
                                                        handleItemChange(index, "quantite", e.target.value)
                                                    }
                                                    min={1}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Input
                                                    type="number"
                                                    className="h-9 w-24 mx-auto text-xs text-center"
                                                    value={item.prix_unitaire}
                                                    onChange={e =>
                                                        handleItemChange(index, "prix_unitaire", e.target.value)
                                                    }
                                                    step="0.01"
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Input
                                                    type="number"
                                                    className="h-9 w-20 mx-auto text-xs text-center"
                                                    value={item.tva}
                                                    onChange={e =>
                                                        handleItemChange(index, "tva", e.target.value)
                                                    }
                                                    step="0.01"
                                                />
                                            </TableCell>
                                            <TableCell className="text-right pr-3">
                                                <button
                                                    type="button"
                                                    onClick={() => removeItemRow(index)}
                                                    className={cn(
                                                        "p-1.5 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors",
                                                        items.length === 1 && "opacity-30 cursor-not-allowed"
                                                    )}
                                                    disabled={items.length === 1}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex justify-between items-center">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={addItemRow}
                            >
                                <Plus className="h-4 w-4" />
                                Ajouter une ligne
                            </Button>

                            <Button
                                type="submit"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? "Enregistrement..." : "Enregistrer l'achat"}
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="rounded-lg border border-border p-3">
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total TTC</p>
                                <p className="text-lg font-semibold">{totals.totalTTC.toFixed(2)} MAD</p>
                            </div>
                            <div className="rounded-lg border border-border p-3">
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Taux RAS auto</p>
                                <p className="text-lg font-semibold">{tauxRas.toFixed(2)} %</p>
                            </div>
                            <div className="rounded-lg border border-border p-3">
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Montant RAS</p>
                                <p className="text-lg font-semibold">{totals.montantRas.toFixed(2)} MAD</p>
                            </div>
                            <div className="rounded-lg border border-border p-3">
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Net fournisseur</p>
                                <p className="text-lg font-semibold">{totals.netFournisseur.toFixed(2)} MAD</p>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Dialog open={reglementDialogOpen} onOpenChange={setReglementDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Régler ce bon de commande ?</DialogTitle>
                        <DialogDescription className="text-sm">
                            L&apos;achat fournisseur a été enregistré avec succès.
                            <br />
                            Voulez-vous maintenant saisir un règlement fournisseur pour ce bon de commande dans l&apos;écran
                            des règlements fournisseurs ?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setReglementDialogOpen(false);
                                setPendingAchatId(null);
                            }}
                        >
                            Non, plus tard
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                if (!pendingAchatId) {
                                    setReglementDialogOpen(false);
                                    return;
                                }
                                navigate("/dashboard/fournisseurs/reglements", {
                                    state: {
                                        achatId: pendingAchatId,
                                        fournisseurId: Number(selectedFournisseurId),
                                    },
                                });
                                setReglementDialogOpen(false);
                                setPendingAchatId(null);
                            }}
                        >
                            Oui, régler maintenant
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

