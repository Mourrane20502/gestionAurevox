import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import { Input } from "@/components/common/ui/input";
import { Button } from "@/components/common/ui/button";
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
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/common/ui/sheet";
import { toast } from "sonner";
import { Truck, ShoppingCart, Search, X, Package, Tag, Users, Edit, Trash2, XCircle, CheckCircle2, Banknote, FileText, FileSpreadsheet, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";
import jsPDF from "jspdf";

interface Fournisseur {
    id: number;
    nom: string;
}

interface AchatFournisseur {
    id: number;
    gestionnaire_id: number;
    fournisseur_id: number;
    product_id: number;
    quantite: number;
    prix_unitaire: number | null;
    statut: string | null;
    tva: number | null;
    gestionnaire_nom: string;
    fournisseur_nom: string;
    produit_nom: string;
    numero: string | null;
    facture_fournisseur?: string | null;
}

interface ReglementFournisseur {
    id: number;
    achat_id: number | null;
    montant: number;
    statut: string;
    date_reglement?: string | null;
    mode_paiement?: string | null;
    commentaire?: string | null;
    banque_nom?: string | null;
    created_at?: string | null;
}

const PLACEHOLDER_ID = "";

function toNum(value: unknown): number {
    if (value == null || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

type AchatMontantInput = Pick<AchatFournisseur, "quantite" | "prix_unitaire" | "tva">;

function achatMontantsFromRow(achat: AchatMontantInput) {
    const qte = toNum(achat.quantite);
    const pu = toNum(achat.prix_unitaire);
    const tvaPct = toNum(achat.tva);
    const ht = qte * pu;
    const ttc = ht * (1 + tvaPct / 100);
    const montantTva = ttc - ht;
    return { ht, montantTva, ttc, tvaPct };
}

function sumAchatsTtc(achats: AchatFournisseur[]): number {
    return achats.reduce((acc, a) => acc + achatMontantsFromRow(a).ttc, 0);
}

function exportFournisseurSituationToXls(fournisseur: Fournisseur, achats: AchatFournisseur[]) {
    const headers = [
        "N° Commande",
        "Produit",
        "Gestionnaire",
        "Qté",
        "Prix unitaire",
        "Total TTC",
        "TVA",
        "Statut",
    ];
    const rows = achats.map((a) => {
        const qte = toNum(a.quantite);
        const pu = a.prix_unitaire != null ? toNum(a.prix_unitaire) : 0;
        const { ttc } = achatMontantsFromRow(a);
        return [
            a.numero || `#${a.id}`,
            a.produit_nom,
            a.gestionnaire_nom,
            String(qte),
            pu.toFixed(2),
            ttc.toFixed(2),
            a.tva != null ? toNum(a.tva).toFixed(2) : "",
            a.statut || "en_attente",
        ];
    });

    const csvContent =
        [headers, ...rows]
            .map((r) =>
                r
                    .map((cell) => {
                        const v = cell ?? "";
                        const needsQuotes = /[;",\n]/.test(String(v));
                        const escaped = String(v).replace(/"/g, '""');
                        return needsQuotes ? `"${escaped}"` : escaped;
                    })
                    .join(";")
            )
            .join("\n");

    const blob = new Blob([csvContent], {
        type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (fournisseur.nom || "fournisseur").replace(/[^a-zA-Z0-9-_]/g, "_");
    link.href = url;
    link.download = `situation_fournisseur_${safeName}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportFournisseurSituationToPdf(fournisseur: Fournisseur, achats: AchatFournisseur[]) {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // En-tête
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Situation fournisseur", pageWidth / 2, 15, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const today = new Date().toLocaleDateString();
    doc.text(`Fournisseur : ${fournisseur.nom}`, 15, 24);
    doc.text(`Date : ${today}`, pageWidth - 15, 24, { align: "right" });

    // Ligne de séparation
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(15, 33, pageWidth - 15, 33);

    // Tableau des achats
    let y = 40;
    const headers = ["N° Cmd", "Produit", "Qté", "Total TTC"];
    const cols = [15, 65, 145, 185];

    const drawHeader = () => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(245, 247, 250);
        doc.setDrawColor(220);
        doc.setLineWidth(0.1);
        doc.rect(12, y - 4, pageWidth - 24, 7, "F");
        headers.forEach((h, idx) => {
            const align = idx >= 2 ? "right" : "left";
            doc.text(h, cols[idx], y, { align });
        });
        y += 5;
        doc.setFont("helvetica", "normal");
    };

    drawHeader();

    let totalQuantity = 0;
    let totalTtc = 0;

    achats.forEach((a) => {
        if (y > 270) {
            doc.addPage();
            y = 20;
            drawHeader();
        }
        const qte = toNum(a.quantite);
        const { ttc } = achatMontantsFromRow(a);

        totalQuantity += qte;
        totalTtc += ttc;

        doc.text(a.numero || `#${a.id}`, cols[0], y);
        doc.text(a.produit_nom || "", cols[1], y);
        doc.text(String(qte), cols[2], y, { align: "right" });
        doc.text(`${ttc.toFixed(2)} DH`, cols[3], y, { align: "right" });
        y += 5;
    });

    // Résumé en bas
    if (y > 250) {
        doc.addPage();
        y = 30;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const boxTop = y + 5;
    const boxHeight = 18;
    doc.setDrawColor(120, 130, 180);
    doc.setFillColor(245, 247, 255);
    doc.rect(12, boxTop, pageWidth - 24, boxHeight, "FD");

    doc.text("Récapitulatif", 16, boxTop + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Nombre de lignes : ${achats.length}`, 16, boxTop + 12);
    doc.text(`Quantité totale : ${totalQuantity.toString()}`, 16, boxTop + 17);
    doc.text(`Montant total TTC : ${totalTtc.toFixed(2)} DH`, pageWidth - 16, boxTop + 12, { align: "right" });

    const safeName = (fournisseur.nom || "fournisseur").replace(/[^a-zA-Z0-9-_]/g, "_");
    doc.save(`situation_fournisseur_${safeName}.pdf`);
}

export default function FournisseursSituation() {
    const navigate = useNavigate();
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAuthorized = role === "admin" || permissions.includes("fournisseurs_view");

    const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
    const [selectedFournisseurId, setSelectedFournisseurId] = useState<string>(PLACEHOLDER_ID);
    const [fournisseurSearchQuery, setFournisseurSearchQuery] = useState("");
    const [fournisseurDropdownOpen, setFournisseurDropdownOpen] = useState(false);
    const fournisseurSearchRef = useRef<HTMLDivElement>(null);

    const [achats, setAchats] = useState<AchatFournisseur[]>([]);
    const [reglementsFournisseurs, setReglementsFournisseurs] = useState<ReglementFournisseur[]>([]);
    const [isLoadingFournisseurs, setIsLoadingFournisseurs] = useState(true);
    const [isLoadingAchats, setIsLoadingAchats] = useState(true);
    const [editingAchatId, setEditingAchatId] = useState<number | null>(null);
    const [editingDraft, setEditingDraft] = useState<Partial<AchatFournisseur> | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [achatToDelete, setAchatToDelete] = useState<AchatFournisseur | null>(null);
    const [achatDetailOpen, setAchatDetailOpen] = useState(false);
    const [achatDetail, setAchatDetail] = useState<AchatFournisseur | null>(null);
    const [isUploadingFacture, setIsUploadingFacture] = useState(false);
    const [isDeletingFacture, setIsDeletingFacture] = useState(false);

    const token = localStorage.getItem("token");


    const filteredFournisseurs = fournisseurSearchQuery.trim()
        ? fournisseurs.filter((f) =>
            f.nom.toLowerCase().includes(fournisseurSearchQuery.toLowerCase())
        )
        : fournisseurs;

    const selectedFournisseur = selectedFournisseurId
        ? fournisseurs.find((f) => String(f.id) === selectedFournisseurId) ?? null
        : null;

    const fournisseurAchats = selectedFournisseurId
        ? achats.filter((a) => String(a.fournisseur_id) === selectedFournisseurId)
        : [];

    const showFournisseurDropdown = fournisseurDropdownOpen && (fournisseurSearchQuery.trim().length >= 0);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (fournisseurSearchRef.current && !fournisseurSearchRef.current.contains(e.target as Node)) {
                setFournisseurDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const fetchFournisseurs = async () => {
            setIsLoadingFournisseurs(true);
            try {
                const res = await fetch("/api/fournisseurs", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setFournisseurs(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                console.error("Error fetching fournisseurs:", e);
                toast.error("Erreur lors du chargement des fournisseurs");
            } finally {
                setIsLoadingFournisseurs(false);
            }
        };

        const fetchAchats = async () => {
            setIsLoadingAchats(true);
            try {
                const res = await fetch("/api/achats-fournisseurs", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    throw new Error("Erreur de chargement");
                }
                const data = await res.json();
                setAchats(Array.isArray(data) ? data : []);
            } catch (e) {
                console.error(e);
                toast.error("Erreur lors du chargement des achats fournisseurs");
            } finally {
                setIsLoadingAchats(false);
            }
        };

        const fetchReglements = async () => {
            try {
                const res = await fetch("/api/reglements-fournisseurs", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setReglementsFournisseurs(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                console.error("Error fetching reglements fournisseurs:", e);
            }
        };

        if (token) {
            fetchFournisseurs();
            fetchAchats();
            fetchReglements();
        }
    }, [token]);

    const isAchatFullyPaid = (achat: AchatFournisseur): boolean => {
        const qte = toNum(achat.quantite);
        const pu = toNum(achat.prix_unitaire);
        const tva = toNum(achat.tva);
        const montantTTC = qte * pu * (1 + tva / 100);
        if (montantTTC <= 0) return true;
        const totalRegle = reglementsFournisseurs
            .filter((r) => r.achat_id === achat.id && r.statut === "approuve")
            .reduce((sum, r) => sum + toNum(r.montant), 0);
        return totalRegle >= montantTTC - 0.01;
    };

    const achatMontants = (achat: AchatFournisseur) => achatMontantsFromRow(achat);

    const reglementsForAchatSorted = (achatId: number) =>
        reglementsFournisseurs
            .filter((r) => r.achat_id === achatId)
            .slice()
            .sort((a, b) => {
                const ad = a.date_reglement ? new Date(a.date_reglement).getTime() : 0;
                const bd = b.date_reglement ? new Date(b.date_reglement).getTime() : 0;
                if (bd !== ad) return bd - ad;
                return (b.id ?? 0) - (a.id ?? 0);
            });

    const totalRegleApprouveForAchat = (achatId: number) =>
        reglementsFournisseurs
            .filter((r) => r.achat_id === achatId && r.statut === "approuve")
            .reduce((sum, r) => sum + toNum(r.montant), 0);

    const openAchatDetail = (achat: AchatFournisseur) => {
        setAchatDetail(achat);
        setAchatDetailOpen(true);
    };

    const startEditAchat = (achat: AchatFournisseur) => {
        setEditingAchatId(achat.id);
        setEditingDraft({ ...achat });
    };

    const cancelEditAchat = () => {
        setEditingAchatId(null);
        setEditingDraft(null);
    };

    const updateDraftField = (field: keyof AchatFournisseur, value: any) => {
        setEditingDraft(prev => prev ? { ...prev, [field]: value } : prev);
    };

    const saveEditAchat = async () => {
        if (!editingDraft || editingAchatId == null) return;
        try {
            const body = {
                gestionnaire_id: editingDraft.gestionnaire_id,
                fournisseur_id: editingDraft.fournisseur_id,
                product_id: editingDraft.product_id,
                quantite: toNum(editingDraft.quantite),
                prix_unitaire: editingDraft.prix_unitaire ?? 0,
                statut: editingDraft.statut || "en_attente",
                tva: editingDraft.tva ?? 0,
            };
            const res = await fetch(`/api/achats-fournisseurs/${editingAchatId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || "Erreur lors de la mise à jour de l'achat fournisseur");
            }
            toast.success("Achat fournisseur mis à jour");
            setAchats(prev =>
                prev.map(a => a.id === editingAchatId ? { ...(a as any), ...editingDraft } as AchatFournisseur : a)
            );
            setEditingAchatId(null);
            setEditingDraft(null);
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de la mise à jour");
        }
    };

    const deleteAchat = async (achat: AchatFournisseur) => {
        try {
            const res = await fetch(`/api/achats-fournisseurs/${achat.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || "Erreur lors de la suppression");
            }
            toast.success("Achat fournisseur supprimé");
            setAchats(prev => prev.filter(a => a.id !== achat.id));
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de la suppression");
        } finally {
            setDeleteDialogOpen(false);
            setAchatToDelete(null);
        }
    };

    const downloadGeneratedFournisseurPdf = async (achat: AchatFournisseur | null | undefined) => {
        if (!achat?.id) return;
        try {
            const res = await fetch(`/api/factures/fournisseur/${achat.id}/pdf/download`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Impossible de générer le PDF fournisseur");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Facture_Fournisseur_${achat.numero || achat.id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            toast.error(e?.message || "Erreur lors du téléchargement du PDF fournisseur");
        }
    };

    const handleUploadFactureFournisseur = async (file: File) => {
        if (!achatDetail?.id) return;
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            toast.error("Veuillez choisir un fichier PDF");
            return;
        }

        const body = new FormData();
        body.append("facture", file);
        setIsUploadingFacture(true);
        try {
            const res = await fetch(`/api/achats-fournisseurs/${achatDetail.id}/facture`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` },
                body,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.message || "Erreur lors du téléversement");
            }
            const nextFilename = data?.facture_fournisseur || null;
            setAchats((prev) =>
                prev.map((a) =>
                    a.id === achatDetail.id ? { ...a, facture_fournisseur: nextFilename } : a
                )
            );
            setAchatDetail((prev) =>
                prev && prev.id === achatDetail.id ? { ...prev, facture_fournisseur: nextFilename } : prev
            );
            toast.success("Facture fournisseur téléversée");
        } catch (e: any) {
            toast.error(e?.message || "Erreur lors du téléversement");
        } finally {
            setIsUploadingFacture(false);
        }
    };

    const handleDeleteFactureFournisseur = async () => {
        if (!achatDetail?.id || !achatDetail.facture_fournisseur) return;
        const ok = window.confirm("Supprimer cette facture fournisseur ?");
        if (!ok) return;
        setIsDeletingFacture(true);
        try {
            const res = await fetch(`/api/achats-fournisseurs/${achatDetail.id}/facture`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.message || "Erreur lors de la suppression");
            }
            setAchats((prev) =>
                prev.map((a) =>
                    a.id === achatDetail.id ? { ...a, facture_fournisseur: null } : a
                )
            );
            setAchatDetail((prev) =>
                prev && prev.id === achatDetail.id ? { ...prev, facture_fournisseur: null } : prev
            );
            toast.success("Facture fournisseur supprimée");
        } catch (e: any) {
            toast.error(e?.message || "Erreur lors de la suppression");
        } finally {
            setIsDeletingFacture(false);
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="max-w-md w-full shadow-2xl border-0 bg-card/80 backdrop-blur-sm p-8 text-center animate-in fade-in zoom-in duration-300">
                    <div className="mb-6 flex justify-center">
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                            <ShieldAlert className="h-12 w-12 text-red-500" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Accès Restreint</h2>
                    <p className="text-muted-foreground">
                        Vous n'avez pas les droits pour consulter la situation fournisseurs.
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Truck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    Situation fournisseurs
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Consultez les achats réalisés auprès de chaque fournisseur
                </p>
            </div>

            <Card className="border border-border shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            Choisir un fournisseur
                        </CardTitle>
                        {selectedFournisseur && fournisseurAchats.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs gap-1"
                                    onClick={() =>
                                        exportFournisseurSituationToPdf(selectedFournisseur, fournisseurAchats)
                                    }
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    PDF
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs gap-1"
                                    onClick={() =>
                                        exportFournisseurSituationToXls(selectedFournisseur, fournisseurAchats)
                                    }
                                >
                                    <FileSpreadsheet className="h-3.5 w-3.5" />
                                    XLS
                                </Button>
                            </div>
                        )}
                    </div>
                    <CardDescription>
                        Sélectionnez un fournisseur pour afficher la liste de ses achats.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div ref={fournisseurSearchRef} className="relative max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                type="text"
                                placeholder="Rechercher un fournisseur par nom..."
                                className="pl-9 pr-9 h-11 border-indigo-200 focus-visible:ring-indigo-500"
                                value={
                                    selectedFournisseurId
                                        ? (selectedFournisseur?.nom ?? fournisseurSearchQuery)
                                        : fournisseurSearchQuery
                                }
                                onChange={(e) => {
                                    setFournisseurSearchQuery(e.target.value);
                                    if (selectedFournisseurId) setSelectedFournisseurId(PLACEHOLDER_ID);
                                }}
                                onFocus={() => setFournisseurDropdownOpen(true)}
                                disabled={isLoadingFournisseurs}
                            />
                            {selectedFournisseurId && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedFournisseurId(PLACEHOLDER_ID);
                                        setFournisseurSearchQuery("");
                                        setFournisseurDropdownOpen(true);
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                                    aria-label="Effacer la sélection"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {showFournisseurDropdown && (
                            <ul
                                className={cn(
                                    "absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-card py-1 shadow-lg",
                                    "animate-in fade-in slide-in-from-top-1 duration-200"
                                )}
                            >
                                {filteredFournisseurs.length === 0 ? (
                                    <li className="px-3 py-4 text-sm text-muted-foreground text-center">
                                        Aucun fournisseur trouvé
                                    </li>
                                ) : (
                                    filteredFournisseurs.map((f) => (
                                        <li
                                            key={f.id}
                                            className={cn(
                                                "cursor-pointer px-3 py-2.5 text-sm hover:bg-muted focus:bg-muted focus:outline-none",
                                                selectedFournisseurId === String(f.id) && "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                                            )}
                                            onClick={() => {
                                                setSelectedFournisseurId(String(f.id));
                                                setFournisseurSearchQuery(f.nom);
                                                setFournisseurDropdownOpen(false);
                                            }}
                                        >
                                            {f.nom}
                                        </li>
                                    ))
                                )}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>

            {selectedFournisseur && (
                <Card className="border border-border shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            Achats — {selectedFournisseur.nom}
                        </CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                            Historique des commandes passées auprès de ce fournisseur
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!isLoadingAchats && fournisseurAchats.length > 0 && (
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                                        <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-indigo-600/70 dark:text-indigo-400/70 uppercase tracking-wider">
                                            Produits différents
                                        </p>
                                        <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                                            {new Set(fournisseurAchats.map((a) => a.product_id)).size}
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 flex items-center gap-3">
                                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                                        <ShoppingCart className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-amber-600/70 dark:text-amber-400/70 uppercase tracking-wider">
                                            Qté totale achetée
                                        </p>
                                        <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
                                            {fournisseurAchats.reduce(
                                                (acc, a) => acc + toNum(a.quantite),
                                                0
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                                        <Tag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-wider">
                                            Total engagé
                                        </p>
                                        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                                            {sumAchatsTtc(fournisseurAchats).toFixed(2)} DH
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl border border-border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 border-b border-border">
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 pl-4">
                                            N° Achat
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">
                                            Produit
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">
                                            Gestionnaire
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-center">
                                            Qté
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right">
                                            Prix unitaire
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right">
                                            Total TTC
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-center">
                                            TVA
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right">
                                            Document
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-center">
                                            Règlement
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right pr-4">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingAchats ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <TableRow
                                                key={i}
                                                className="animate-pulse border-b border-border"
                                            >
                                                <TableCell colSpan={10}>
                                                    <div className="h-4 bg-muted rounded w-full" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : fournisseurAchats.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={10}
                                                className="text-center py-16"
                                            >
                                                <div className="flex flex-col items-center text-muted">
                                                    <ShoppingCart className="h-10 w-10 mb-3 stroke-1" />
                                                    <p className="font-medium text-muted-foreground">
                                                        Aucun achat fournisseur
                                                    </p>
                                                    <p className="text-sm text-muted">
                                                        Ce fournisseur n&apos;a encore aucun achat enregistré
                                                    </p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        fournisseurAchats.map((achat) => {
                                            const isEditing = editingAchatId === achat.id;
                                            const draft = isEditing && editingDraft ? editingDraft : achat;
                                            const totalLigne = achatMontantsFromRow(
                                                isEditing ? { ...achat, ...draft } : achat
                                            ).ttc;

                                            return (
                                                <TableRow
                                                    key={achat.id}
                                                    className="border-b border-border hover:bg-muted/30 transition-colors"
                                                >
                                                    <TableCell className="pl-4">
                                                        <button
                                                            type="button"
                                                            onClick={() => openAchatDetail(achat)}
                                                            className={cn(
                                                                "font-mono text-[11px] font-bold px-2 py-1 rounded-md transition-colors text-left",
                                                                achat.numero
                                                                    ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                                                                    : "text-muted-foreground bg-muted hover:bg-muted/80"
                                                            )}
                                                        >
                                                            {achat.numero || `#${achat.id}`}
                                                        </button>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-foreground">
                                                                {achat.produit_nom}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-sm text-muted-foreground">
                                                            {achat.gestionnaire_nom}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {isEditing ? (
                                                            <Input
                                                                type="number"
                                                                className="h-8 w-20 mx-auto text-xs text-center"
                                                                value={draft.quantite}
                                                                onChange={(e) =>
                                                                    updateDraftField("quantite", Number(e.target.value))
                                                                }
                                                            />
                                                        ) : (
                                                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                                                                {toNum(achat.quantite)}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {isEditing ? (
                                                            <Input
                                                                type="number"
                                                                className="h-8 w-24 ml-auto text-xs text-right"
                                                                value={draft.prix_unitaire ?? 0}
                                                                onChange={(e) =>
                                                                    updateDraftField("prix_unitaire", Number(e.target.value))
                                                                }
                                                                step="0.01"
                                                            />
                                                        ) : (
                                                            <span className="font-semibold text-foreground text-sm">
                                                                {achat.prix_unitaire != null
                                                                    ? `${toNum(achat.prix_unitaire).toFixed(2)} DH`
                                                                    : "—"}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                                                            {totalLigne.toFixed(2)} DH
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {isEditing ? (
                                                            <Input
                                                                type="number"
                                                                className="h-8 w-20 mx-auto text-xs text-center"
                                                                value={draft.tva ?? 0}
                                                                onChange={(e) =>
                                                                    updateDraftField("tva", Number(e.target.value))
                                                                }
                                                                step="0.01"
                                                            />
                                                        ) : (
                                                            <span className="text-sm text-muted-foreground">
                                                                {achat.tva != null
                                                                    ? `${toNum(achat.tva).toFixed(2)} %`
                                                                    : "—"}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize">
                                                            {achat.statut || "en_attente"}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {isAchatFullyPaid(achat) ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                                <CheckCircle2 className="h-2.5 w-2.5" /> Payé
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200">
                                                                <XCircle className="h-2.5 w-2.5" /> Impayé
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-4">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {isEditing ? (
                                                                <>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                                        title="Enregistrer"
                                                                        onClick={saveEditAchat}
                                                                    >
                                                                        <CheckCircle2 className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                        title="Annuler"
                                                                        onClick={cancelEditAchat}
                                                                    >
                                                                        <XCircle className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {achat.facture_fournisseur && (
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="h-7 w-7 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                                                            title="Télécharger facture fournisseur"
                                                                            onClick={() => downloadGeneratedFournisseurPdf(achat)}
                                                                        >
                                                                            <Download className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                    {!isAchatFullyPaid(achat) && (
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                                            title="Régler cet achat"
                                                                            onClick={() => navigate("/dashboard/fournisseurs/reglements", { state: { achatId: achat.id } })}
                                                                        >
                                                                            <Banknote className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                                                        title="Modifier"
                                                                        onClick={() => startEditAchat(achat)}
                                                                    >
                                                                        <Edit className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                        title="Supprimer"
                                                                        onClick={() => {
                                                                            setAchatToDelete(achat);
                                                                            setDeleteDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                    {!isLoadingAchats && fournisseurAchats.length > 0 && (
                                        <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 border-t-2 border-indigo-100 dark:border-indigo-900/30 font-bold">
                                            <TableCell colSpan={5} className="px-4 py-4 text-indigo-700 dark:text-indigo-300 uppercase tracking-wider text-xs">
                                                Total complet pour ce fournisseur
                                            </TableCell>
                                            <TableCell className="text-right px-4 py-4 text-emerald-600 dark:text-emerald-400">
                                                {sumAchatsTtc(fournisseurAchats).toFixed(2)} DH
                                            </TableCell>
                                            <TableCell colSpan={4} />
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {!selectedFournisseurId && !isLoadingFournisseurs && fournisseurs.length > 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Truck className="h-12 w-12 mb-3 stroke-1" />
                    <p className="font-medium">Choisissez un fournisseur ci-dessus</p>
                    <p className="text-sm">pour afficher ses achats fournisseurs</p>
                </div>
            )}

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Supprimer cet achat fournisseur ?</DialogTitle>
                        <DialogDescription className="text-sm">
                            Cette action est irréversible. L&apos;achat sera définitivement supprimé de la situation
                            fournisseurs.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setDeleteDialogOpen(false);
                                setAchatToDelete(null);
                            }}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                                if (achatToDelete) {
                                    deleteAchat(achatToDelete);
                                }
                            }}
                        >
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Sheet open={achatDetailOpen} onOpenChange={setAchatDetailOpen}>
                <SheetContent
                    side="right"
                    className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg"
                >
                    {achatDetail ? (
                        <>
                            {(() => {
                                const a = achatDetail;
                                const { ht, montantTva, ttc, tvaPct } = achatMontants(a);
                                const totalRegle = totalRegleApprouveForAchat(a.id);
                                const resteAPayer = Math.max(ttc - totalRegle, 0);
                                const soldeOk = isAchatFullyPaid(a);
                                const regs = reglementsForAchatSorted(a.id);
                                const dernierReglement = regs[0] ?? null;
                                const fmtDate = (d: string | null | undefined) => {
                                    if (!d) return "—";
                                    try {
                                        return new Date(d).toLocaleDateString("fr-FR", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                        });
                                    } catch {
                                        return "—";
                                    }
                                };
                                const goFicheAchat = () => {
                                    if (!a.numero) return;
                                    setAchatDetailOpen(false);
                                    navigate(`/dashboard/achats/${a.numero}`);
                                };
                                const goReglementDetail = () => {
                                    if (!dernierReglement?.id) return;
                                    setAchatDetailOpen(false);
                                    navigate(
                                        `/dashboard/reglements/details/fournisseur/${dernierReglement.id}`
                                    );
                                };
                                const goRegler = () => {
                                    setAchatDetailOpen(false);
                                    navigate("/dashboard/fournisseurs/reglements", {
                                        state: { achatId: a.id },
                                    });
                                };
                                return (
                                    <>
                                        <SheetHeader className="border-b border-border p-4 text-left">
                                            <SheetTitle className="pr-8">
                                                Détail de l&apos;achat fournisseur
                                            </SheetTitle>
                                            <SheetDescription>
                                                Synthèse identique pour les achats payés ou en attente de
                                                règlement.
                                            </SheetDescription>
                                            <div className="pt-2">
                                                {!a.facture_fournisseur ? (
                                                    <div className="mb-3">
                                                        <Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                            Facture fournisseur (PDF)
                                                        </Label>
                                                        <Input
                                                            type="file"
                                                            accept="application/pdf,.pdf"
                                                            className="h-9"
                                                            disabled={isUploadingFacture}
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) handleUploadFactureFournisseur(file);
                                                                e.currentTarget.value = "";
                                                            }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="mb-2 flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 gap-1.5"
                                                            onClick={() => downloadGeneratedFournisseurPdf(a)}
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                            Télécharger facture PDF
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            title="Supprimer la facture"
                                                            disabled={isDeletingFacture}
                                                            onClick={handleDeleteFactureFournisseur}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                                {soldeOk ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-tighter text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                        <CheckCircle2 className="h-2.5 w-2.5" /> Payé
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-tighter text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
                                                        <XCircle className="h-2.5 w-2.5" /> Impayé
                                                    </span>
                                                )}
                                            </div>
                                        </SheetHeader>

                                        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                                            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                    Référence
                                                </h3>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">
                                                            N° commande
                                                        </span>
                                                        <span className="text-right font-mono text-xs font-semibold">
                                                            {a.numero || "—"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">ID interne</span>
                                                        <span className="font-mono text-xs font-semibold">
                                                            #{a.id}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Fournisseur</span>
                                                        <span className="text-right font-medium">
                                                            {a.fournisseur_nom}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">
                                                            Statut document
                                                        </span>
                                                        <span className="text-right capitalize">
                                                            {a.statut || "en_attente"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                    Ligne d&apos;achat
                                                </h3>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Produit</span>
                                                        <span className="text-right font-medium">
                                                            {a.produit_nom}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">
                                                            Gestionnaire
                                                        </span>
                                                        <span className="text-right text-muted-foreground">
                                                            {a.gestionnaire_nom}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Quantité</span>
                                                        <span className="font-semibold">{toNum(a.quantite)}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">
                                                            Prix unitaire
                                                        </span>
                                                        <span className="font-semibold">
                                                            {a.prix_unitaire != null
                                                                ? `${toNum(a.prix_unitaire).toFixed(2)} DH`
                                                                : "—"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">TVA</span>
                                                        <span>
                                                            {a.tva != null
                                                                ? `${toNum(a.tva).toFixed(2)} %`
                                                                : "—"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                    Montants
                                                </h3>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Total</span>
                                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                            {ht.toFixed(2)} DH
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">
                                                            Montant TVA ({tvaPct.toFixed(2)} %)
                                                        </span>
                                                        <span className="font-medium">
                                                            {montantTva.toFixed(2)} DH
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 border-t border-border pt-2">
                                                        <span className="text-muted-foreground">Total TTC</span>
                                                        <span className="font-bold text-foreground">
                                                            {ttc.toFixed(2)} DH
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">
                                                            Total réglé (approuvé)
                                                        </span>
                                                        <span className="font-semibold">
                                                            {totalRegle.toFixed(2)} DH
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 border-t border-border pt-2">
                                                        <span className="text-muted-foreground">
                                                            Reste à payer (TTC)
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                "font-bold",
                                                                resteAPayer > 0.01
                                                                    ? "text-red-600 dark:text-red-400"
                                                                    : "text-emerald-600 dark:text-emerald-400"
                                                            )}
                                                        >
                                                            {resteAPayer.toFixed(2)} DH
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                    Règlements liés
                                                </h3>
                                                <div className="divide-y divide-border rounded-md border border-dashed border-border">
                                                    {regs.length === 0 ? (
                                                        <p className="p-4 text-center text-sm text-muted-foreground">
                                                            Aucun règlement enregistré pour cet achat.
                                                        </p>
                                                    ) : (
                                                        regs.map((r: ReglementFournisseur) => (
                                                            <div
                                                                key={r.id}
                                                                className="flex flex-col gap-1.5 p-3 text-sm"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <span className="text-muted-foreground">
                                                                        {fmtDate(r.date_reglement)}
                                                                    </span>
                                                                    <span className="font-semibold">
                                                                        {toNum(r.montant).toFixed(2)} DH
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span
                                                                        className={cn(
                                                                            "rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter",
                                                                            r.statut === "approuve"
                                                                                ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                                                : "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                                                                        )}
                                                                    >
                                                                        {r.statut}
                                                                    </span>
                                                                    {r.mode_paiement ? (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {r.mode_paiement}
                                                                        </span>
                                                                    ) : null}
                                                                    {r.banque_nom ? (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {r.banque_nom}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                                {r.commentaire ? (
                                                                    <p className="line-clamp-2 text-xs text-muted-foreground">
                                                                        {r.commentaire}
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <SheetFooter className="mt-0 gap-2 border-t border-border p-4 sm:flex-col">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full"
                                                disabled={!a.numero}
                                                title={
                                                    !a.numero
                                                        ? "Aucun numéro de commande pour ouvrir la fiche"
                                                        : undefined
                                                }
                                                onClick={goFicheAchat}
                                            >
                                                Fiche commande achat
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full"
                                                disabled={!dernierReglement?.id}
                                                title={
                                                    !dernierReglement?.id
                                                        ? "Aucun règlement à afficher"
                                                        : undefined
                                                }
                                                onClick={goReglementDetail}
                                            >
                                                Détail du règlement
                                            </Button>
                                            <Button
                                                type="button"
                                                className="w-full"
                                                disabled={soldeOk}
                                                title={
                                                    soldeOk
                                                        ? "Achat déjà entièrement réglé"
                                                        : undefined
                                                }
                                                onClick={goRegler}
                                            >
                                                <Banknote className="mr-2 h-4 w-4" />
                                                Régler cet achat
                                            </Button>
                                        </SheetFooter>
                                    </>
                                );
                            })()}
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>
        </div>
    );
}

