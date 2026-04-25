import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/ui/card";
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
import { Badge } from "@/components/common/ui/badge";
import { toast } from "sonner";
import { Users, ShoppingBag, Package, Tag, Calendar, User, Search, X, FileText, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import jsPDF from "jspdf";

interface Client {
    id: number;
    nom_complet: string;
    type: "particulier" | "revendeur";
}

interface ClientProduct {
    product_id: number;
    product_name: string;
    reference: string | null;
    photo: string | null;
    current_price: number;
    grammage: number | null;
    category_name: string | null;
    point_de_vente_name: string | null;
    total_quantity: number;
    total_spent: number;
    last_purchase_date: string | null;
    nb_factures: number;
    // Encodage "date|type|id|numero" envoyé par l'API
    last_doc_info?: string | null;
}

interface ClientDocument {
    id: number;
    numero: string;
    date: string;
    type: "facture" | "commande" | "facture_gros" | "commande_gros";
    montant_ttc: number;
    total_regle: number;
    reste_a_payer: number;
    statutOriginal: string;
}

const PLACEHOLDER_ID = "";

function toNum(value: unknown): number {
    if (value == null || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function exportClientSituationToXls(client: Client, products: ClientProduct[]) {
    const headers = [
        "Produit",
        "Catégorie",
        "Prix unitaire",
        "Grammage",
        "Qté achetée",
        "Total",
        "Dernier document",
        "Dernière date",
    ];
    const rows = products.map((p) => {
        let docLabel = "";
        let dateStr = "";
        if (p.last_doc_info) {
            const [dateRaw, type, , numero] = p.last_doc_info.split("|");
            const typeLabel = type === "facture" ? "Facture" : type === "devis" ? "Devis" : "";
            docLabel = [typeLabel, numero].filter(Boolean).join(" ");
            if (dateRaw) {
                const d = new Date(dateRaw);
                if (!Number.isNaN(d.getTime())) {
                    dateStr = d.toLocaleDateString("fr-FR");
                }
            }
        }
        return [
            p.product_name,
            p.category_name || "",
            toNum(p.current_price).toFixed(2),
            toNum(p.grammage) > 0 ? toNum(p.grammage).toFixed(2) : "",
            String(toNum(p.total_quantity)),
            toNum(p.total_spent).toFixed(2),
            docLabel,
            dateStr,
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
    const safeName = (client.nom_complet || "client").replace(/[^a-zA-Z0-9-_]/g, "_");
    link.href = url;
    link.download = `situation_client_${safeName}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportClientSituationToPdf(client: Client, products: ClientProduct[]) {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // En-tête
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Situation client", pageWidth / 2, 15, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const today = new Date().toLocaleDateString();
    doc.text(`Client : ${client.nom_complet}`, 15, 24);
    doc.text(`Type : ${client.type}`, 15, 29);
    doc.text(`Date : ${today}`, pageWidth - 15, 24, { align: "right" });

    // Ligne de séparation
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(15, 33, pageWidth - 15, 33);

    // Tableau des produits
    let y = 40;
    const headers = ["Produit", "Catégorie", "Qté", "Total"];
    const cols = [15, 80, 135, 185];

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
    let totalHt = 0;

    products.forEach((p) => {
        if (y > 270) {
            doc.addPage();
            y = 20;
            drawHeader();
        }
        const qte = toNum(p.total_quantity);
        const total = toNum(p.total_spent);
        totalQuantity += qte;
        totalHt += total;

        doc.text(p.product_name || "", cols[0], y);
        doc.text(p.category_name || "", cols[1], y);
        doc.text(String(qte), cols[2], y, { align: "right" });
        doc.text(`${total.toFixed(2)} DH`, cols[3], y, { align: "right" });
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
    doc.text(`Nombre de lignes : ${products.length}`, 16, boxTop + 12);
    doc.text(`Quantité totale : ${totalQuantity.toString()}`, 16, boxTop + 17);
    doc.text(`Montant total : ${totalHt.toFixed(2)} DH`, pageWidth - 16, boxTop + 12, { align: "right" });

    const safeName = (client.nom_complet || "client").replace(/[^a-zA-Z0-9-_]/g, "_");
    doc.save(`situation_client_${safeName}.pdf`);
}

export default function ClientSituation() {
    const navigate = useNavigate();
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const roleLower = (role || "").toLowerCase();
    const isSuperAdmin = roleLower === "superadmin";
    const isAuthorized = isSuperAdmin || role === "admin" || permissions.includes("clients_view");

    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>(PLACEHOLDER_ID);
    const [clientSearchQuery, setClientSearchQuery] = useState("");
    const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
    const clientSearchRef = useRef<HTMLDivElement>(null);
    const [clientProducts, setClientProducts] = useState<ClientProduct[]>([]);
    const [isLoadingClients, setIsLoadingClients] = useState(true);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
    const [clientDocuments, setClientDocuments] = useState<ClientDocument[]>([]);
    const [productsPage, setProductsPage] = useState(1);
    const [documentsPage, setDocumentsPage] = useState(1);
    const token = localStorage.getItem("token");
    const pageSize = 10;

    const filteredClients = clientSearchQuery.trim()
        ? clients.filter((c) =>
            c.nom_complet.toLowerCase().includes(clientSearchQuery.toLowerCase())
        )
        : clients;
    const showClientDropdown = clientDropdownOpen && (clientSearchQuery.trim().length >= 0);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
                setClientDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedClient = selectedClientId
        ? clients.find((c) => String(c.id) === selectedClientId) ?? null
        : null;
    const productsTotalPages = Math.max(1, Math.ceil(clientProducts.length / pageSize));
    const documentsTotalPages = Math.max(1, Math.ceil(clientDocuments.length / pageSize));
    const paginatedProducts = clientProducts.slice(
        (productsPage - 1) * pageSize,
        productsPage * pageSize
    );
    const paginatedDocuments = clientDocuments.slice(
        (documentsPage - 1) * pageSize,
        documentsPage * pageSize
    );

    useEffect(() => {
        const fetchClients = async () => {
            setIsLoadingClients(true);
            try {
                const response = await fetch("/api/clients", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (response.ok) setClients(await response.json());
            } catch (error) {
                console.error("Error fetching clients:", error);
                toast.error("Erreur lors du chargement des clients");
            } finally {
                setIsLoadingClients(false);
            }
        };
        fetchClients();
    }, [token]);

    useEffect(() => {
        setProductsPage(1);
        setDocumentsPage(1);
    }, [selectedClientId]);

    useEffect(() => {
        setProductsPage((prev) => Math.min(prev, productsTotalPages));
    }, [productsTotalPages]);

    useEffect(() => {
        setDocumentsPage((prev) => Math.min(prev, documentsTotalPages));
    }, [documentsTotalPages]);

    useEffect(() => {
        if (!selectedClientId) {
            setClientProducts([]);
            return;
        }
        setIsLoadingProducts(true);
        setClientProducts([]);
        fetch(`/api/clients/${selectedClientId}/products`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => {
                if (res.ok) return res.json();
                throw new Error("Erreur chargement produits");
            })
            .then((data) => setClientProducts(data))
            .catch(() => toast.error("Erreur lors du chargement des produits"))
            .finally(() => setIsLoadingProducts(false));

        // Fetch Commandes & Factures
        setIsLoadingDocuments(true);
        setClientDocuments([]);
        
        const fetchDocs = async () => {
            try {
                const [ordersRes, facturesRes, ordersGrosRes, facturesGrosRes, regCliGrosRes] = await Promise.all([
                    fetch("/api/commandes", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/factures", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/commandes-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/factures-gros", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/reglements-clients-gros", { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                
                const ordersData = ordersRes.ok ? await ordersRes.json() : [];
                const facturesData = facturesRes.ok ? await facturesRes.json() : [];
                const ordersGrosData = ordersGrosRes.ok ? await ordersGrosRes.json() : [];
                const facturesGrosData = facturesGrosRes.ok ? await facturesGrosRes.json() : [];
                const regCliGrosData = regCliGrosRes.ok ? await regCliGrosRes.json() : [];

                const regGrosByFacture: Record<number, number> = {};
                const regGrosByCommande: Record<number, number> = {};
                if (Array.isArray(regCliGrosData)) {
                    regCliGrosData
                        .filter((r: any) => String(r?.statut || "").toLowerCase() === "approuve")
                        .forEach((r: any) => {
                            const montant = toNum(r?.montant);
                            const factureId = Number(r?.facture_gros_id);
                            const commandeId = Number(r?.commande_gros_id);
                            if (Number.isFinite(factureId) && factureId > 0) {
                                regGrosByFacture[factureId] = (regGrosByFacture[factureId] || 0) + montant;
                            }
                            if (Number.isFinite(commandeId) && commandeId > 0) {
                                regGrosByCommande[commandeId] = (regGrosByCommande[commandeId] || 0) + montant;
                            }
                        });
                }
                
                // Commandes non facturées uniquement (chaque vente facturée est affichée via la facture)
                const filteredOrders = ordersData
                    .filter((o: any) => String(o.client_id) === selectedClientId && !facturesData.find((f: any) => f.commande_id === o.id))
                    .map((o: any) => ({
                        id: o.id,
                        numero: o.numero_commande,
                        date: o.date_commande,
                        type: "commande" as const,
                        montant_ttc: toNum(o.montant_ttc),
                        total_regle: toNum(o.total_regle),
                        reste_a_payer: toNum(o.reste_a_payer),
                        statutOriginal: o.statut
                    }));

                const filteredOrdersGros = ordersGrosData
                    .filter((o: any) => String(o.client_id) === selectedClientId && !facturesGrosData.find((f: any) => Number(f.commande_gros_id) === Number(o.id)))
                    .map((o: any) => {
                        const montantTtc = toNum(o.montant_ttc);
                        const totalRegle = typeof o.total_regle !== "undefined" ? toNum(o.total_regle) : toNum(regGrosByCommande[Number(o.id)]);
                        const reste = typeof o.reste_a_payer !== "undefined" ? toNum(o.reste_a_payer) : Math.max(montantTtc - totalRegle, 0);
                        return {
                            id: o.id,
                            numero: o.numero_commande,
                            date: o.date_commande,
                            type: "commande_gros" as const,
                            montant_ttc: montantTtc,
                            total_regle: totalRegle,
                            reste_a_payer: reste,
                            statutOriginal: o.statut,
                        };
                    });
                
                // Toutes les factures (une facture = une vente facturée, avec ses 3 lignes produits côté facture)
                const filteredFactures = facturesData
                    .filter((f: any) => String(f.client_id) === selectedClientId)
                    .map((f: any) => ({
                        id: f.id,
                        numero: f.numero_facture,
                        date: f.date_facture,
                        type: "facture" as const,
                        montant_ttc: toNum(f.montant_ttc),
                        total_regle: toNum(f.total_regle),
                        reste_a_payer: toNum(f.reste_a_payer),
                        statutOriginal: f.statut
                    }));

                const filteredFacturesGros = facturesGrosData
                    .filter((f: any) => String(f.client_id) === selectedClientId)
                    .map((f: any) => {
                        const montantTtc = toNum(f.montant_ttc);
                        const totalRegle = typeof f.total_regle !== "undefined" ? toNum(f.total_regle) : toNum(regGrosByFacture[Number(f.id)]);
                        const reste = typeof f.reste_a_payer !== "undefined" ? toNum(f.reste_a_payer) : Math.max(montantTtc - totalRegle, 0);
                        return {
                            id: f.id,
                            numero: f.numero_facture,
                            date: f.date_facture,
                            type: "facture_gros" as const,
                            montant_ttc: montantTtc,
                            total_regle: totalRegle,
                            reste_a_payer: reste,
                            statutOriginal: f.statut,
                        };
                    });
                
                const allDocs = [...filteredOrders, ...filteredFactures, ...filteredOrdersGros, ...filteredFacturesGros].sort((a, b) => 
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                );
                
                setClientDocuments(allDocs);
            } catch (error) {
                console.error("Error fetching client documents:", error);
            } finally {
                setIsLoadingDocuments(false);
            }
        };
        
        fetchDocs();
    }, [selectedClientId, token]);

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
                        Vous n'avez pas les droits pour consulter la situation clients.
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <ShoppingBag className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    Situation client
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Consultez les produits achetés par chaque client
                </p>
            </div>

            <Card className="border border-border shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <User className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            Choisir un client
                        </CardTitle>
                        {selectedClient && clientProducts.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs gap-1"
                                    onClick={() => exportClientSituationToPdf(selectedClient, clientProducts)}
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    PDF
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs gap-1"
                                    onClick={() => exportClientSituationToXls(selectedClient, clientProducts)}
                                >
                                    <FileSpreadsheet className="h-3.5 w-3.5" />
                                    XLS
                                </Button>
                            </div>
                        )}
                    </div>
                    <CardDescription>
                        Sélectionnez un client pour afficher la liste de ses produits achetés.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div ref={clientSearchRef} className="relative max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                type="text"
                                placeholder="Rechercher un client par nom..."
                                className="pl-9 pr-9 h-11 border-indigo-200 focus-visible:ring-indigo-500"
                                value={selectedClientId ? (selectedClient?.nom_complet ?? clientSearchQuery) : clientSearchQuery}
                                onChange={(e) => {
                                    setClientSearchQuery(e.target.value);
                                    if (selectedClientId) setSelectedClientId(PLACEHOLDER_ID);
                                }}
                                onFocus={() => setClientDropdownOpen(true)}
                                disabled={isLoadingClients}
                            />
                            {selectedClientId && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedClientId(PLACEHOLDER_ID);
                                        setClientSearchQuery("");
                                        setClientDropdownOpen(true);
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                                    aria-label="Effacer la sélection"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {showClientDropdown && (
                            <ul
                                className={cn(
                                    "absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-card py-1 shadow-lg",
                                    "animate-in fade-in slide-in-from-top-1 duration-200"
                                )}
                            >
                                {filteredClients.length === 0 ? (
                                    <li className="px-3 py-4 text-sm text-muted-foreground text-center">
                                        Aucun client trouvé
                                    </li>
                                ) : (
                                    filteredClients.map((c) => (
                                        <li
                                            key={c.id}
                                            className={cn(
                                                "cursor-pointer px-3 py-2.5 text-sm hover:bg-muted focus:bg-muted focus:outline-none",
                                                selectedClientId === String(c.id) && "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                                            )}
                                            onClick={() => {
                                                setSelectedClientId(String(c.id));
                                                setClientSearchQuery(c.nom_complet);
                                                setClientDropdownOpen(false);
                                            }}
                                        >
                                            {c.nom_complet}
                                        </li>
                                    ))
                                )}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>

            {selectedClient && (
                <>
                <Card className="border border-border shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ShoppingBag className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            Produits achetés — {selectedClient.nom_complet}
                        </CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                            Historique des produits achetés par ce client
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!isLoadingProducts && clientProducts.length > 0 && (
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                                        <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-indigo-600/70 dark:text-indigo-400/70 uppercase tracking-wider">
                                            Produits
                                        </p>
                                        <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                                            {clientProducts.length}
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 flex items-center gap-3">
                                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                                        <ShoppingBag className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-amber-600/70 dark:text-amber-400/70 uppercase tracking-wider">
                                            Qté totale
                                        </p>
                                        <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
                                            {clientProducts.reduce(
                                                (acc, p) => acc + toNum(p.total_quantity),
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
                                            Total dépensé
                                        </p>
                                        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                                            {clientProducts
                                                .reduce((acc, p) => acc + toNum(p.total_spent), 0)
                                                .toFixed(2)}{" "}
                                            DH
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
                                            Produit
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">
                                            Catégorie
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">
                                            Prix unitaire
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">
                                            Grammage
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-center">
                                            Qté achetée
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right">
                                            Total
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-center">
                                            Document
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right pr-4">
                                            Dernier achat
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingProducts ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <TableRow
                                                key={i}
                                                className="animate-pulse border-b border-border"
                                            >
                                                <TableCell className="pl-4">
                                                    <div className="h-4 bg-muted rounded w-32" />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="h-4 bg-muted rounded w-20" />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="h-4 bg-muted rounded w-16" />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="h-4 bg-muted rounded w-14" />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="h-4 bg-muted rounded w-10 mx-auto" />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="h-4 bg-muted rounded w-16 ml-auto" />
                                                </TableCell>
                                                <TableCell className="pr-4">
                                                    <div className="h-4 bg-muted rounded w-20 ml-auto" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : clientProducts.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={7}
                                                className="text-center py-16"
                                            >
                                                <div className="flex flex-col items-center text-muted">
                                                    <ShoppingBag className="h-10 w-10 mb-3 stroke-1" />
                                                    <p className="font-medium text-muted-foreground">
                                                        Aucun produit acheté
                                                    </p>
                                                    <p className="text-sm text-muted">
                                                        Ce client n'a encore acheté aucun produit
                                                    </p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedProducts.map((product) => {
                                            // Décoder last_doc_info: "date|type|id|numero"
                                            let docType: string | null = null;
                                            let docId: number | null = null;
                                            let docNumber: string | null = null;
                                            if (product.last_doc_info) {
                                                const [, type, idStr, number] = product.last_doc_info.split("|");
                                                docType = type || null;
                                                docId = idStr ? Number(idStr) : null;
                                                docNumber = number || null;
                                            }

                                            const handleDocClick = () => {
                                                if (!docType || !docId) return;
                                                if (docType === "facture") {
                                                    // Aller sur la page de détails facture
                                                    navigate(`/dashboard/factures/${docId}`);
                                                } else if (docType === "devis") {
                                                    // Aller sur la page de détails devis (et non le formulaire d'édition)
                                                    navigate(`/dashboard/devis/${docId}`);
                                                }
                                            };

                                            const docLabel =
                                                docType && docNumber
                                                    ? `${docType === "facture" ? "Facture" : "Devis"} ${docNumber}`
                                                    : docType
                                                        ? docType === "facture"
                                                            ? "Facture"
                                                            : "Devis"
                                                        : null;

                                            return (
                                            <TableRow
                                                key={product.product_id}
                                                className="border-b border-border hover:bg-muted/30 transition-colors"
                                            >
                                                <TableCell className="py-3 pl-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center shrink-0 overflow-hidden text-indigo-600 dark:text-indigo-400">
                                                            {product.photo ? (
                                                                <img
                                                                    src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(product.photo)}`}
                                                                    alt={product.product_name}
                                                                    className="h-8 w-8 object-cover rounded-lg"
                                                                    onError={(e) => {
                                                                        (
                                                                            e.target as HTMLImageElement
                                                                        ).style.display = "none";
                                                                    }}
                                                                />
                                                            ) : (
                                                                <Package className="h-3.5 w-3.5" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-foreground text-sm">
                                                                {product.product_name}
                                                            </p>
                                                            {product.reference && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    {product.reference}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {product.category_name ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                                                            {product.category_name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">
                                                            —
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-semibold text-foreground text-sm">
                                                        {toNum(product.current_price).toFixed(2)} DH
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-sm text-muted-foreground">
                                                        {toNum(product.grammage) > 0
                                                            ? `${toNum(product.grammage).toFixed(2)} g`
                                                            : "—"}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                                                        {toNum(product.total_quantity)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                                                        {toNum(product.total_spent).toFixed(2)} DH
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {docLabel ? (
                                                        <button
                                                            type="button"
                                                            onClick={handleDocClick}
                                                            className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                                        >
                                                            {docLabel}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">
                                                            —
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right pr-4">
                                                    {product.last_purchase_date ? (
                                                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                            <Calendar className="h-3 w-3" />
                                                            {new Date(
                                                                product.last_purchase_date
                                                            ).toLocaleDateString("fr-FR")}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">
                                                            —
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        {!isLoadingProducts && clientProducts.length > pageSize && (
                            <div className="flex items-center justify-between gap-3 pt-1">
                                <p className="text-xs text-muted-foreground">
                                    Affichage {(productsPage - 1) * pageSize + 1}-
                                    {Math.min(productsPage * pageSize, clientProducts.length)} sur {clientProducts.length}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setProductsPage((p) => Math.max(1, p - 1))}
                                        disabled={productsPage <= 1}
                                    >
                                        Précédent
                                    </Button>
                                    <span className="text-xs font-medium text-muted-foreground min-w-[72px] text-center">
                                        {productsPage} / {productsTotalPages}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setProductsPage((p) => Math.min(productsTotalPages, p + 1))}
                                        disabled={productsPage >= productsTotalPages}
                                    >
                                        Suivant
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="border border-border shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300 mt-6">
                    <CardHeader className="pb-3 text-indigo-600">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            Situation des Règlements — {selectedClient.nom_complet}
                        </CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                            Historique des commandes et factures (classique + gros) avec leur statut de règlement
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-xl border border-border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 border-b border-border">
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 pl-4">N° Document</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">Date</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">Type</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right">Montant TTC</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right">Réglé</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right">Reste</TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-center">Règlement</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingDocuments ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <TableRow key={i} className="animate-pulse">
                                                <TableCell colSpan={7} className="py-4"><div className="h-4 bg-muted rounded w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : clientDocuments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                                Aucune transaction trouvée
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedDocuments.map((doc) => (
                                            <TableRow key={`${doc.type}-${doc.id}`} className="hover:bg-muted/30">
                                                <TableCell className="pl-4">
                                                    <button
                                                        onClick={() => {
                                                            if (doc.type === "facture") return navigate(`/dashboard/factures/${doc.id}`);
                                                            if (doc.type === "commande") return navigate(`/dashboard/commandes/${doc.id}`);
                                                            if (doc.type === "facture_gros") return navigate(`/dashboard/factures-gros/${doc.id}`);
                                                            return navigate(`/dashboard/commandes-gros/${doc.id}`);
                                                        }}
                                                        className="font-mono text-[11px] font-bold text-indigo-600 hover:underline"
                                                    >
                                                        {doc.numero}
                                                    </button>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {new Date(doc.date).toLocaleDateString("fr-FR")}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={cn(
                                                        "text-[10px] uppercase",
                                                        doc.type === "facture"
                                                            ? "bg-blue-50 text-blue-600 border-blue-100"
                                                            : doc.type === "facture_gros"
                                                                ? "bg-indigo-50 text-indigo-600 border-indigo-100"
                                                                : doc.type === "commande_gros"
                                                                    ? "bg-violet-50 text-violet-700 border-violet-200"
                                                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                                    )}>
                                                        {doc.type === "facture"
                                                            ? "Facture"
                                                            : doc.type === "facture_gros"
                                                                ? "Facture gros"
                                                                : doc.type === "commande_gros"
                                                                    ? "Non facturé (gros)"
                                                                    : "Non facturé"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-sm">
                                                    {doc.montant_ttc.toFixed(2)} DH
                                                </TableCell>
                                                <TableCell className="text-right text-emerald-600 text-sm">
                                                    {doc.total_regle.toFixed(2)} DH
                                                </TableCell>
                                                <TableCell className="text-right text-red-600 font-bold text-sm">
                                                    {doc.reste_a_payer.toFixed(2)} DH
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {doc.reste_a_payer <= 0.01 ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                            <CheckCircle2 className="h-2.5 w-2.5" /> Payé
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200">
                                                            <XCircle className="h-2.5 w-2.5" /> Impayé
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        {!isLoadingDocuments && clientDocuments.length > pageSize && (
                            <div className="flex items-center justify-between gap-3 pt-4">
                                <p className="text-xs text-muted-foreground">
                                    Affichage {(documentsPage - 1) * pageSize + 1}-
                                    {Math.min(documentsPage * pageSize, clientDocuments.length)} sur {clientDocuments.length}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDocumentsPage((p) => Math.max(1, p - 1))}
                                        disabled={documentsPage <= 1}
                                    >
                                        Précédent
                                    </Button>
                                    <span className="text-xs font-medium text-muted-foreground min-w-[72px] text-center">
                                        {documentsPage} / {documentsTotalPages}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDocumentsPage((p) => Math.min(documentsTotalPages, p + 1))}
                                        disabled={documentsPage >= documentsTotalPages}
                                    >
                                        Suivant
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                </>
            )}

            {!selectedClientId && !isLoadingClients && clients.length > 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Users className="h-12 w-12 mb-3 stroke-1" />
                    <p className="font-medium">Choisissez un client ci-dessus</p>
                    <p className="text-sm">pour afficher ses produits achetés</p>
                </div>
            )}
        </div>
    );
}
