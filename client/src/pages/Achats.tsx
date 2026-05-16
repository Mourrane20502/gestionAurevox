import { useCallback, useEffect, useMemo, useState } from "react";
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/common/ui/alert-dialog";
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

const TVA_OPTIONS = [0, 7, 10, 14, 20] as const;
const DEFAULT_TVA = 20;
const ACHAT_FORM_DRAFT_KEY = "gestionaurevox_achat_fournisseur_draft";

function isManualAchatLine(item: AchatItem): boolean {
    return !(item.produit_id && item.produit_id > 0) && item.designation.trim() !== "";
}

function getValidAchatItems(items: AchatItem[]): AchatItem[] {
    return items.filter(
        (it) =>
            it.quantite > 0 &&
            ((it.produit_id && it.produit_id > 0) || it.designation.trim() !== "")
    );
}

const emptyAchatItem = (): AchatItem => ({
    designation: "",
    quantite: 1,
    prix_unitaire: 0,
    tva: DEFAULT_TVA,
});

function computeLineHt(item: AchatItem): number {
    return (Number(item.quantite) || 0) * (Number(item.prix_unitaire) || 0);
}

function computeOrderTotals(lines: AchatItem[]) {
    const totalHT = lines.reduce((acc, it) => acc + computeLineHt(it), 0);
    const totalTVA = lines.reduce(
        (acc, it) => acc + computeLineHt(it) * ((Number(it.tva) || 0) / 100),
        0
    );
    return { totalHT, totalTVA, totalTTC: totalHT + totalTVA };
}

export default function Achats() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
    const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
    const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);
    const [selectedFournisseurId, setSelectedFournisseurId] = useState<string>("");
    const [selectedGestionnaireId, setSelectedGestionnaireId] = useState<string>("");
    const [items, setItems] = useState<AchatItem[]>([emptyAchatItem()]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reglementDialogOpen, setReglementDialogOpen] = useState(false);
    const [pendingAchatId, setPendingAchatId] = useState<number | null>(null);
    const [manualProductPrompt, setManualProductPrompt] = useState<AchatItem[] | null>(null);

    useEffect(() => {
        const raw = sessionStorage.getItem(ACHAT_FORM_DRAFT_KEY);
        if (!raw) return;
        try {
            const draft = JSON.parse(raw) as {
                items?: AchatItem[];
                selectedFournisseurId?: string;
                selectedGestionnaireId?: string;
            };
            if (draft.items?.length) setItems(draft.items);
            if (draft.selectedFournisseurId) setSelectedFournisseurId(draft.selectedFournisseurId);
            if (draft.selectedGestionnaireId) setSelectedGestionnaireId(draft.selectedGestionnaireId);
            sessionStorage.removeItem(ACHAT_FORM_DRAFT_KEY);
            toast.message("Brouillon de commande fournisseur restauré.");
        } catch {
            sessionStorage.removeItem(ACHAT_FORM_DRAFT_KEY);
        }
    }, []);

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
        } else if (field === "designation") {
            next[index].designation = String(value);
            delete next[index].produit_id;
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
        setItems((prev) => [...prev, emptyAchatItem()]);
    };

    const orderTotals = useMemo(() => computeOrderTotals(items), [items]);

    const removeItemRow = (index: number) => {
        if (items.length === 1) return;
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const submitAchats = useCallback(async () => {
        if (!selectedGestionnaireId) {
            toast.error("Aucun gestionnaire sélectionné");
            return;
        }
        if (!selectedFournisseurId) {
            toast.error("Veuillez choisir un fournisseur");
            return;
        }
        const cleanItems = getValidAchatItems(items);
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
                });
                toast.success("Achat enregistré et bon de commande téléchargé");
            } catch (pdfErr) {
                console.error(pdfErr);
                toast.success("Achat fournisseur enregistré");
            }
            setItems([emptyAchatItem()]);

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
    }, [items, selectedFournisseurId, selectedGestionnaireId, fournisseurs, gestionnaires, catalogProducts, token]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanItems = getValidAchatItems(items);
        const manualLines = cleanItems.filter(isManualAchatLine);
        if (manualLines.length > 0) {
            setManualProductPrompt(manualLines);
            return;
        }
        void submitAchats();
    };

    const goToCreateProduct = () => {
        const first = manualProductPrompt?.[0];
        sessionStorage.setItem(
            ACHAT_FORM_DRAFT_KEY,
            JSON.stringify({ items, selectedFournisseurId, selectedGestionnaireId })
        );
        setManualProductPrompt(null);
        navigate("/dashboard/products", {
            state: {
                openCreateForm: true,
                draftProduct: {
                    nom: first?.designation?.trim() ?? "",
                    prix: String(first?.prix_unitaire ?? 0),
                    fournisseur_id: selectedFournisseurId || "",
                },
            },
        });
    };

    const manualPromptLabel =
        manualProductPrompt && manualProductPrompt.length > 0
            ? manualProductPrompt.map((it) => it.designation.trim()).filter(Boolean).join(", ")
            : "";

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
                                                <Select
                                                    value={String(item.tva ?? DEFAULT_TVA)}
                                                    onValueChange={(v) =>
                                                        handleItemChange(index, "tva", v)
                                                    }
                                                >
                                                    <SelectTrigger className="h-9 w-[88px] mx-auto text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {TVA_OPTIONS.map((rate) => (
                                                            <SelectItem key={rate} value={String(rate)}>
                                                                {rate} %
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
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

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2 w-fit"
                                onClick={addItemRow}
                            >
                                <Plus className="h-4 w-4" />
                                Ajouter une ligne
                            </Button>

                            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm space-y-1.5 min-w-[220px]">
                                    <div className="flex justify-between gap-4 text-muted-foreground">
                                        <span>Total HT</span>
                                        <span className="font-medium text-foreground tabular-nums">
                                            {orderTotals.totalHT.toLocaleString("fr-FR", {
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            DH
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-muted-foreground">
                                        <span>TVA</span>
                                        <span className="font-medium text-foreground tabular-nums">
                                            {orderTotals.totalTVA.toLocaleString("fr-FR", {
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            DH
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 pt-1 border-t border-border font-semibold text-foreground">
                                        <span>Total TTC</span>
                                        <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                                            {orderTotals.totalTTC.toLocaleString("fr-FR", {
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            DH
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto shrink-0"
                                    disabled={isSubmitting}
                                >
                                {isSubmitting ? "Enregistrement..." : "Enregistrer l'achat"}
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <AlertDialog
                open={manualProductPrompt != null && manualProductPrompt.length > 0}
                onOpenChange={(open) => {
                    if (!open) setManualProductPrompt(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Produit absent du catalogue</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                            <span className="block">
                                {manualProductPrompt && manualProductPrompt.length > 1
                                    ? `${manualProductPrompt.length} lignes sont saisies manuellement et ne sont pas liées à un produit du stock.`
                                    : "Ce produit est saisi manuellement et n'est pas encore dans le catalogue."}
                            </span>
                            {manualPromptLabel ? (
                                <span className="block font-medium text-foreground">{manualPromptLabel}</span>
                            ) : null}
                            <span className="block">
                                Souhaitez-vous l&apos;ajouter d&apos;abord dans les produits, puis revenir
                                enregistrer cette commande ?
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setManualProductPrompt(null);
                                void submitAchats();
                            }}
                        >
                            Continuer sans ajouter
                        </Button>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700"
                            onClick={(e) => {
                                e.preventDefault();
                                goToCreateProduct();
                            }}
                        >
                            Créer le produit
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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

