import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
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
import { Filter, RefreshCw, FileText, CalendarRange, Store, User, Users, Search, BadgeDollarSign, Wallet, Receipt, HandCoins, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ClientRow {
    client_id: number;
    client_nom: string;
    montant_devis: number;
    montant_commande: number;
    montant_facture: number;
    montant_regle: number;
    reste_a_encaisser: number;
}

interface BilanResponse {
    clients: ClientRow[];
    filters: {
        pdvs: { id: number; nom: string }[];
        users: { id: number; nom: string }[];
        clients: { id: number; nom: string }[];
    };
}

export default function CA() {
    const token = localStorage.getItem("token");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [pdvId, setPdvId] = useState<string>("all");
    const [userId, setUserId] = useState<string>("all");
    const [clientId, setClientId] = useState<string>("all");
    const [searchClient, setSearchClient] = useState("");

    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<BilanResponse | null>(null);

    const loadCA = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateFrom) params.append("dateFrom", dateFrom);
            if (dateTo) params.append("dateTo", dateTo);
            if (pdvId !== "all") params.append("pdvId", pdvId);
            if (userId !== "all") params.append("userId", userId);
            if (clientId !== "all") params.append("clientId", clientId);

            const res = await fetch(`/api/bilan?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur lors du chargement du chiffre d'affaire");
            }
            const json = (await res.json()) as BilanResponse;
            setData(json);
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Erreur de connexion au serveur");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadCA();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const displayedClients = useMemo(() => {
        const rows = data?.clients || [];
        if (!searchClient.trim()) return rows;
        const q = searchClient.trim().toLowerCase();
        return rows.filter((c) => String(c.client_nom || "").toLowerCase().includes(q));
    }, [data, searchClient]);

    const totals = useMemo(
        () =>
            displayedClients.reduce(
                (acc, c) => {
                    acc.devis += Number(c.montant_devis) || 0;
                    acc.commande += Number(c.montant_commande) || 0;
                    acc.facture += Number(c.montant_facture) || 0;
                    acc.regle += Number(c.montant_regle) || 0;
                    acc.reste += Number(c.reste_a_encaisser) || 0;
                    return acc;
                },
                { devis: 0, commande: 0, facture: 0, regle: 0, reste: 0 }
            ),
        [displayedClients]
    );

    const formatDH = (n: number) =>
        (Number(n) || 0).toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const formatPdfAmount = (n: number) => {
        const value = Number(n) || 0;
        if (Math.abs(value - Math.round(value)) < 0.000001) {
            return String(Math.round(value));
        }
        return value.toFixed(2).replace(/\.00$/, "");
    };

    const selectedFilterLabel = (items: { id: number; nom: string }[] | undefined, value: string, allLabel: string) => {
        if (value === "all") return allLabel;
        const found = (items || []).find((it) => String(it.id) === String(value));
        return found?.nom || `ID ${value}`;
    };

    const handleExportPdf = async () => {
        if (!data) return;
        const loadingToastId = toast.loading("Génération du PDF chiffre d'affaire...");
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const loadImgToBase64 = (url: string) => new Promise<string | null>((res) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = url;
                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) { res(null); return; }
                        ctx.drawImage(img, 0, 0);
                        res(canvas.toDataURL("image/jpeg", 0.7));
                    } catch {
                        res(null);
                    }
                };
                img.onerror = () => res(null);
            });

            let gestionnaireName = "Gestionnaire";
            let gestionnaireLogoUrl: string | null = null;
            try {
                const response = await fetch("/api/gestionnaires", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (response.ok) {
                    const payload = await response.json();
                    const first = Array.isArray(payload) ? payload[0] : null;
                    const resolvedName = String(first?.nom || "").trim();
                    if (resolvedName) gestionnaireName = resolvedName;
                    if (first?.logo) {
                        gestionnaireLogoUrl = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${first.logo}`;
                    }
                }
            } catch {
                // fallback only
            }
            const logoData = gestionnaireLogoUrl ? await loadImgToBase64(gestionnaireLogoUrl) : null;

            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageWidth, 40, "F");
            if (logoData) doc.addImage(logoData, "JPEG", 14, 8, 24, 24);
            doc.setFontSize(22);
            doc.setTextColor(67, 56, 202);
            doc.setFont("helvetica", "bold");
            doc.text(gestionnaireName, 42, 18);
            doc.setFontSize(14);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text("Rapport chiffre d'affaire", 42, 26);

            autoTable(doc, {
                startY: 44,
                head: [["Filtre", "Valeur"]],
                body: [
                    ["Période", `${dateFrom || "Toutes"} au ${dateTo || "Toutes"}`],
                    ["Point de vente", selectedFilterLabel(data.filters.pdvs, pdvId, "Tous")],
                    ["Utilisateur", selectedFilterLabel(data.filters.users, userId, "Tous")],
                    ["Client", selectedFilterLabel(data.filters.clients, clientId, "Tous")],
                    ["Recherche client", searchClient.trim() || "Aucune"],
                ],
                theme: "grid",
                styles: { fontSize: 8 },
                headStyles: { fillColor: [99, 102, 241], textColor: 255 },
            });

            const startY = ((doc as any).lastAutoTable?.finalY || 44) + 8;
            autoTable(doc, {
                startY,
                head: [["Client", "Devis", "Commandes", "Facturé", "Réglé", "Reste"]],
                body: displayedClients.map((c) => [
                    c.client_nom,
                    `${formatPdfAmount(c.montant_devis)} DH`,
                    `${formatPdfAmount(c.montant_commande)} DH`,
                    `${formatPdfAmount(c.montant_facture)} DH`,
                    `${formatPdfAmount(c.montant_regle)} DH`,
                    `${formatPdfAmount(c.reste_a_encaisser)} DH`,
                ]),
                foot: [[
                    "TOTAL",
                    `${formatPdfAmount(totals.devis)} DH`,
                    `${formatPdfAmount(totals.commande)} DH`,
                    `${formatPdfAmount(totals.facture)} DH`,
                    `${formatPdfAmount(totals.regle)} DH`,
                    `${formatPdfAmount(totals.reste)} DH`,
                ]],
                theme: "grid",
                headStyles: { fillColor: [67, 56, 202] },
                footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
            });

            doc.save(`chiffre_affaire_${dateFrom || "tous"}_${dateTo || "tous"}.pdf`);
            toast.dismiss(loadingToastId);
            toast.success("PDF chiffre d'affaire exporté");
        } catch (e) {
            console.error(e);
            toast.dismiss(loadingToastId);
            toast.error("Erreur lors de la génération du PDF");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <BadgeDollarSign className="h-6 w-6 text-indigo-600" />
                        Chiffre d'affaire
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Suivi détaillé du CA clients avec filtres dynamiques et export PDF.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                        onClick={handleExportPdf}
                        disabled={!data || isLoading}
                    >
                        <FileText className="h-4 w-4" />
                        Export PDF
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-muted-foreground"
                        onClick={loadCA}
                        disabled={isLoading}
                    >
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        Rafraîchir
                    </Button>
                </div>
            </div>

            <Card className="border border-border shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Filter className="h-5 w-5 text-muted-foreground" />
                        Filtres
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Les filtres appliqués impactent directement les données affichées et le PDF.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">Période rapide :</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                                const now = new Date();
                                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                                setDateFrom(start.toISOString().split("T")[0]);
                                setDateTo(now.toISOString().split("T")[0]);
                            }}
                        >
                            Ce mois
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                                const now = new Date();
                                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                                const end = new Date(now.getFullYear(), now.getMonth(), 0);
                                setDateFrom(start.toISOString().split("T")[0]);
                                setDateTo(end.toISOString().split("T")[0]);
                            }}
                        >
                            Mois dernier
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                                const now = new Date();
                                setDateFrom(`${now.getFullYear()}-01-01`);
                                setDateTo(now.toISOString().split("T")[0]);
                            }}
                        >
                            Cette année
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Date du
                            </label>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Date au
                            </label>
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <Store className="h-3 w-3" />
                                Point de vente
                            </label>
                            <Select value={pdvId} onValueChange={setPdvId}>
                                <SelectTrigger className="h-9 text-xs w-full min-w-0">
                                    <SelectValue placeholder="Tous les PDV" className="truncate" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous</SelectItem>
                                    {data?.filters.pdvs.map((p) => (
                                        <SelectItem key={p.id} value={String(p.id)}>
                                            {p.nom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1 min-w-0">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Utilisateur
                            </label>
                            <Select value={userId} onValueChange={setUserId}>
                                <SelectTrigger className="h-9 text-xs w-full min-w-0">
                                    <SelectValue placeholder="Tous les utilisateurs" className="truncate" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous</SelectItem>
                                    {data?.filters.users.map((u) => (
                                        <SelectItem key={u.id} value={String(u.id)}>
                                            {u.nom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1 min-w-0">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Client
                            </label>
                            <Select value={clientId} onValueChange={setClientId}>
                                <SelectTrigger className="h-9 text-xs w-full min-w-0">
                                    <SelectValue placeholder="Tous clients" className="truncate" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous</SelectItem>
                                    {data?.filters.clients.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                            {c.nom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <Search className="h-3 w-3" />
                                Recherche client
                            </label>
                            <Input
                                type="text"
                                placeholder="Nom client..."
                                value={searchClient}
                                onChange={(e) => setSearchClient(e.target.value)}
                                className="h-9"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setDateFrom("");
                                setDateTo("");
                                setPdvId("all");
                                setUserId("all");
                                setClientId("all");
                                setSearchClient("");
                            }}
                        >
                            Réinitialiser
                        </Button>
                        <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={loadCA} disabled={isLoading}>
                            {isLoading ? "Chargement..." : "Appliquer les filtres"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <Card className="border-indigo-100/80">
                    <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                            <FileText className="h-3.5 w-3.5" />
                            Total devis
                        </div>
                        <p className="text-base font-bold">{formatDH(totals.devis)} DH</p>
                    </CardContent>
                </Card>
                <Card className="border-sky-100/80">
                    <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                            <Wallet className="h-3.5 w-3.5" />
                            Total commandes
                        </div>
                        <p className="text-base font-bold">{formatDH(totals.commande)} DH</p>
                    </CardContent>
                </Card>
                <Card className="border-violet-100/80">
                    <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                            <Receipt className="h-3.5 w-3.5" />
                            Montant facturé
                        </div>
                        <p className="text-base font-bold">{formatDH(totals.facture)} DH</p>
                    </CardContent>
                </Card>
                <Card className="border-emerald-100/80">
                    <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                            <HandCoins className="h-3.5 w-3.5 text-emerald-600" />
                            Montant réglé
                        </div>
                        <p className="text-base font-bold text-emerald-600">{formatDH(totals.regle)} DH</p>
                    </CardContent>
                </Card>
                <Card className="border-amber-100/80">
                    <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                            Reste à encaisser
                        </div>
                        <p className="text-base font-bold text-amber-600">{formatDH(totals.reste)} DH</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-border shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Détail par client</CardTitle>
                    <CardDescription className="text-xs">
                        {displayedClients.length} client(s) trouvé(s) selon les filtres sélectionnés.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <Table className="min-w-[640px]">
                        <TableHeader>
                            <TableRow className="bg-muted/60">
                                <TableHead>Client</TableHead>
                                <TableHead className="text-right">Devis</TableHead>
                                <TableHead className="text-right">Commandes</TableHead>
                                <TableHead className="text-right">Facturé</TableHead>
                                <TableHead className="text-right">Réglé</TableHead>
                                <TableHead className="text-right">Reste</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayedClients.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                                        Aucune donnée pour les filtres sélectionnés.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                displayedClients.map((c) => (
                                    <TableRow key={c.client_id}>
                                        <TableCell className="font-semibold">{c.client_nom}</TableCell>
                                        <TableCell className="text-right">{formatDH(c.montant_devis)} DH</TableCell>
                                        <TableCell className="text-right">{formatDH(c.montant_commande)} DH</TableCell>
                                        <TableCell className="text-right">{formatDH(c.montant_facture)} DH</TableCell>
                                        <TableCell className="text-right text-emerald-600">{formatDH(c.montant_regle)} DH</TableCell>
                                        <TableCell className="text-right text-amber-600">{formatDH(c.reste_a_encaisser)} DH</TableCell>
                                    </TableRow>
                                ))
                            )}
                            {displayedClients.length > 0 && (
                                <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 font-bold border-t-2 border-indigo-100 dark:border-indigo-900/30">
                                    <TableCell>TOTAL FILTRÉ</TableCell>
                                    <TableCell className="text-right">{formatDH(totals.devis)} DH</TableCell>
                                    <TableCell className="text-right">{formatDH(totals.commande)} DH</TableCell>
                                    <TableCell className="text-right">{formatDH(totals.facture)} DH</TableCell>
                                    <TableCell className="text-right text-emerald-600">{formatDH(totals.regle)} DH</TableCell>
                                    <TableCell className="text-right text-amber-600">{formatDH(totals.reste)} DH</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
