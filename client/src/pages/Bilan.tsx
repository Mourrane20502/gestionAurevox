import { useEffect, useMemo, useState, Fragment } from "react";
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
import { Badge } from "@/components/common/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import { useNavigate } from "react-router-dom";
import { 
    Download, 
    Filter, 
    RefreshCw, 
    Users, 
    Truck, 
    CalendarRange, 
    Store, 
    User, 
    ChevronDown, 
    ChevronRight, 
    FileText, 
    ShoppingCart, 
    ClipboardList, 
    CreditCard,
    ArrowUpRight,
    Search
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

function toNum(value: any): number {
    if (value === null || value === undefined) return 0;
    const n = Number(value);
    return isNaN(n) ? 0 : n;
}

interface ClientRow {
    client_id: number;
    client_nom: string;
    montant_devis: number;
    montant_commande: number;
    montant_facture: number;
    montant_regle: number;
    reste_a_encaisser: number;
    details?: any[];
}

interface FournisseurRow {
    fournisseur_id: number;
    fournisseur_nom: string;
    montant_achats: number;
    montant_regle: number;
    reste_a_payer: number;
    details?: any[];
}

interface BilanResponse {
    clients: ClientRow[];
    fournisseurs: FournisseurRow[];
    filters: {
        pdvs: { id: number; nom: string }[];
        users: { id: number; nom: string }[];
        clients: { id: number; nom: string }[];
        fournisseurs: { id: number; nom: string }[];
    };
}

export default function Bilan() {
    const token = localStorage.getItem("token");
    const navigate = useNavigate();

    // Default to all periods to avoid hiding older data (common source of confusion in production)
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [pdvId, setPdvId] = useState<string>("all");
    const [userId, setUserId] = useState<string>("all");
    const [clientId, setClientId] = useState<string>("all");
    const [fournisseurId, setFournisseurId] = useState<string>("all");

    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<BilanResponse | null>(null);

    const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
    const [expandedFournisseurId, setExpandedFournisseurId] = useState<number | null>(null);

    // Filtre supplémentaire sur la situation client (soldé / avec reste à encaisser)
    const [clientBalanceFilter, setClientBalanceFilter] = useState<"all" | "withReste" | "fullyPaid">("all");
    const [searchClient, setSearchClient] = useState("");
    const [searchFournisseur, setSearchFournisseur] = useState("");

    const loadBilan = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateFrom) params.append("dateFrom", dateFrom);
            if (dateTo) params.append("dateTo", dateTo);
            if (pdvId !== "all") params.append("pdvId", pdvId);
            if (userId !== "all") params.append("userId", userId);
            if (clientId !== "all") params.append("clientId", clientId);
            if (fournisseurId !== "all") params.append("fournisseurId", fournisseurId);

            const res = await fetch(`/api/bilan?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur lors du chargement du bilan");
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
        loadBilan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredClients = useMemo(() => {
        if (!data) return [];
        return data.clients.filter((c) => {
            const reste = Number(c.reste_a_encaisser) || 0;
            const fact = Number(c.montant_facture) || 0;
            if (clientBalanceFilter === "withReste") {
                return reste > 0.01;
            }
            if (clientBalanceFilter === "fullyPaid") {
                return fact > 0 && reste <= 0.01;
            }
            return true;
        });
    }, [data, clientBalanceFilter]);

    const displayedClients = useMemo(() => {
        if (!searchClient.trim()) return filteredClients;
        const q = searchClient.trim().toLowerCase();
        return filteredClients.filter((c) => (c.client_nom || "").toLowerCase().includes(q));
    }, [filteredClients, searchClient]);

    const totalClients = useMemo(() => {
        if (!displayedClients.length) return { devis: 0, commande: 0, facture: 0, regle: 0, reste: 0 };
        return displayedClients.reduce(
            (acc, c) => ({
                devis: acc.devis + (Number(c.montant_devis) || 0),
                commande: acc.commande + (Number(c.montant_commande) || 0),
                facture: acc.facture + (Number(c.montant_facture) || 0),
                regle: acc.regle + (Number(c.montant_regle) || 0),
                reste: acc.reste + (Number(c.reste_a_encaisser) || 0),
            }),
            { devis: 0, commande: 0, facture: 0, regle: 0, reste: 0 }
        );
    }, [displayedClients]);

    // Filtre supplémentaire sur la situation fournisseur (soldé / avec reste à payer)
    const [fournisseurBalanceFilter, setFournisseurBalanceFilter] = useState<"all" | "withReste" | "fullyPaid">("all");

    const filteredFournisseurs = useMemo(() => {
        if (!data) return [];
        return data.fournisseurs.filter((f) => {
            const reste = Number(f.reste_a_payer) || 0;
            const achats = Number(f.montant_achats) || 0;
            if (fournisseurBalanceFilter === "withReste") {
                return reste > 0.01;
            }
            if (fournisseurBalanceFilter === "fullyPaid") {
                return achats > 0 && reste <= 0.01;
            }
            return true;
        });
    }, [data, fournisseurBalanceFilter]);

    const displayedFournisseurs = useMemo(() => {
        if (!searchFournisseur.trim()) return filteredFournisseurs;
        const q = searchFournisseur.trim().toLowerCase();
        return filteredFournisseurs.filter((f) => (f.fournisseur_nom || "").toLowerCase().includes(q));
    }, [filteredFournisseurs, searchFournisseur]);

    const totalFournisseurs = useMemo(() => {
        if (!displayedFournisseurs.length) return { achats: 0, regle: 0, reste: 0 };
        return displayedFournisseurs.reduce(
            (acc, f) => ({
                achats: acc.achats + (Number(f.montant_achats) || 0),
                regle: acc.regle + (Number(f.montant_regle) || 0),
                reste: acc.reste + (Number(f.reste_a_payer) || 0),
            }),
            { achats: 0, regle: 0, reste: 0 }
        );
    }, [displayedFournisseurs]);

    const formatDH = (n: number) =>
        (Number(n) || 0).toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const handleExportCsv = () => {
        if (!data) return;
        const rows: string[] = [];
        rows.push("Section;Nom;Devis;Commandes;Facturé/Achats;Montant réglé;Reste");
        displayedClients.forEach((c) => {
            rows.push(
                [
                    "Client",
                    `"${(c.client_nom || "").replace(/"/g, '""')}"`,
                    c.montant_devis,
                    c.montant_commande,
                    c.montant_facture,
                    c.montant_regle,
                    c.reste_a_encaisser,
                ].join(";")
            );
        });
        displayedFournisseurs.forEach((f) => {
            rows.push(
                [
                    "Fournisseur",
                    `"${(f.fournisseur_nom || "").replace(/"/g, '""')}"`,
                    0,
                    0,
                    f.montant_achats,
                    f.montant_regle,
                    f.reste_a_payer,
                ].join(";")
            );
        });
        const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bilan_${dateFrom || "tous"}_${dateTo || "tous"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Export CSV téléchargé");
    };

    const handleExportXls = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        const wsClients = XLSX.utils.aoa_to_sheet([
            ["Client", "Devis", "Commandes", "Facturé", "Réglé", "Reste à encaisser"],
            ...displayedClients.map((c) => [
                c.client_nom,
                toNum(c.montant_devis),
                toNum(c.montant_commande),
                toNum(c.montant_facture),
                toNum(c.montant_regle),
                toNum(c.reste_a_encaisser),
            ]),
            ["TOTAL", totalClients.devis, totalClients.commande, totalClients.facture, totalClients.regle, totalClients.reste],
        ]);
        const wsFournisseurs = XLSX.utils.aoa_to_sheet([
            ["Fournisseur", "Montant Achats", "Montant Réglé", "Reste à Payer"],
            ...displayedFournisseurs.map((f) => [
                f.fournisseur_nom,
                toNum(f.montant_achats),
                toNum(f.montant_regle),
                toNum(f.reste_a_payer),
            ]),
            ["TOTAL", totalFournisseurs.achats, totalFournisseurs.regle, totalFournisseurs.reste],
        ]);
        XLSX.utils.book_append_sheet(wb, wsClients, "Clients");
        XLSX.utils.book_append_sheet(wb, wsFournisseurs, "Fournisseurs");
        XLSX.writeFile(wb, `bilan_${dateFrom || "tous"}_${dateTo || "tous"}.xlsx`);
        toast.success("Export Excel téléchargé");
    };

    const handleExportPdf = async () => {
        if (!data) return;
        const loadingToastId = toast.loading("Génération du rapport PDF...");
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();

            // Image loading helper
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
                    } catch (e) { res(null); }
                };
                img.onerror = () => res(null);
            });

            let gestionnaireName = "Gestionnaire";
            let gestionnaireLogoUrl: string | null = null;
            try {
                const localToken = localStorage.getItem("token");
                const response = await fetch("/api/gestionnaires", {
                    headers: localToken ? { Authorization: `Bearer ${localToken}` } : {},
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
                // Keep fallback header values for PDF exports.
            }
            const logoData = gestionnaireLogoUrl ? await loadImgToBase64(gestionnaireLogoUrl) : null;

            // Header Background
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageWidth, 40, "F");

            // Logo
            if (logoData) {
                doc.addImage(logoData, "JPEG", 14, 8, 24, 24);
            }

            // Header Text
            doc.setFontSize(22);
            doc.setTextColor(67, 56, 202); // indigo
            doc.setFont("helvetica", "bold");
            doc.text(gestionnaireName, 42, 18);

            doc.setFontSize(14);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text("Rapprochement / Bilan Financier", 42, 26);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Période : ${dateFrom || "Toutes"} au ${dateTo || "Toutes"}`, pageWidth - 14, 18, { align: "right" });
            doc.text(`Généré le : ${new Date().toLocaleDateString("fr-FR")}`, pageWidth - 14, 24, { align: "right" });

            // 1. Section Clients
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text("I. RÉCAPITULATIF CLIENTS", 14, 50);

            autoTable(doc, {
                startY: 55,
                head: [["Client", "Devis", "Commandes", "Facturé", "Réglé", "Reste"]],
                body: displayedClients.map(c => [
                    c.client_nom,
                    `${Number(c.montant_devis || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(c.montant_commande || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(c.montant_facture || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(c.montant_regle || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(c.reste_a_encaisser || 0).toFixed(2).replace(".", ",")} DH`,
                ]),
                foot: [[
                    "TOTAL",
                    `${Number(totalClients.devis || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalClients.commande || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalClients.facture || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalClients.regle || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalClients.reste || 0).toFixed(2).replace(".", ",")} DH`,
                ]],
                theme: "grid",
                headStyles: { fillColor: [67, 56, 202] },
                footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
            });

            // 2. Section Fournisseurs
            const finalY = (doc as any).lastAutoTable.finalY + 15;
            doc.text("II. RÉCAPITULATIF FOURNISSEURS", 14, finalY);

            autoTable(doc, {
                startY: finalY + 5,
                head: [["Fournisseur", "Montant Achats", "Montant Réglé", "Reste à Payer"]],
                body: displayedFournisseurs.map(f => [
                    f.fournisseur_nom,
                    `${Number(f.montant_achats || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(f.montant_regle || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(f.reste_a_payer || 0).toFixed(2).replace(".", ",")} DH`,
                ]),
                foot: [[
                    "TOTAL",
                    `${Number(totalFournisseurs.achats || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalFournisseurs.regle || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalFournisseurs.reste || 0).toFixed(2).replace(".", ",")} DH`,
                ]],
                theme: "grid",
                headStyles: { fillColor: [71, 85, 105] }, // slate
                footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
            });

            // 3. Résumé Final
            const finalY2 = (doc as any).lastAutoTable.finalY + 15;
            doc.setFillColor(238, 242, 255);
            doc.roundedRect(14, finalY2, pageWidth - 28, 25, 3, 3, "F");
            
            doc.setFontSize(11);
            doc.setTextColor(67, 56, 202);
            doc.text("BILAN DES CRÉANCES / DETTES :", 20, finalY2 + 10);
            
            doc.setFontSize(14);
            const net = Number(totalClients.reste || 0) - Number(totalFournisseurs.reste || 0);
            doc.text(`${net >= 0 ? "+" : ""}${net.toFixed(2).replace(".", ",")} DH`, pageWidth - 20, finalY2 + 15, { align: "right" });
            
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text("Solde théorique (Reste à encaisser - Reste à payer)", 20, finalY2 + 18);

            doc.save(`bilan_${dateFrom || "tous"}_${dateTo || "tous"}.pdf`);
            toast.dismiss(loadingToastId);
            toast.success("Bilan PDF exporté");
        } catch (e) {
            console.error(e);
            toast.dismiss(loadingToastId);
            toast.error("Erreur lors de la génération du PDF");
        }
    };

    const handleExportClientsCsv = () => {
        if (!data) return;
        const rows: string[] = ["Section;Nom;Devis;Commandes;Facturé;Montant réglé;Reste à encaisser"];
        displayedClients.forEach((c) => {
            rows.push(
                ["Client", `"${(c.client_nom || "").replace(/"/g, '""')}"`, c.montant_devis, c.montant_commande, c.montant_facture, c.montant_regle, c.reste_a_encaisser].join(";")
            );
        });
        const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bilan_clients_${dateFrom || "tous"}_${dateTo || "tous"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Export CSV clients téléchargé");
    };

    const handleExportClientsXls = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ["Client", "Devis", "Commandes", "Facturé", "Réglé", "Reste à encaisser"],
            ...displayedClients.map((c) => [
                c.client_nom,
                toNum(c.montant_devis),
                toNum(c.montant_commande),
                toNum(c.montant_facture),
                toNum(c.montant_regle),
                toNum(c.reste_a_encaisser),
            ]),
            ["TOTAL", totalClients.devis, totalClients.commande, totalClients.facture, totalClients.regle, totalClients.reste],
        ]);
        XLSX.utils.book_append_sheet(wb, ws, "Clients");
        XLSX.writeFile(wb, `bilan_clients_${dateFrom || "tous"}_${dateTo || "tous"}.xlsx`);
        toast.success("Export Excel clients téléchargé");
    };

    const handleExportClientsPdf = async () => {
        if (!data) return;
        const loadingToastId = toast.loading("Génération du PDF clients...");
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
                    } catch (e) { res(null); }
                };
                img.onerror = () => res(null);
            });
            let gestionnaireName = "Gestionnaire";
            let gestionnaireLogoUrl: string | null = null;
            try {
                const localToken = localStorage.getItem("token");
                const response = await fetch("/api/gestionnaires", {
                    headers: localToken ? { Authorization: `Bearer ${localToken}` } : {},
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
                // Keep fallback header values for PDF exports.
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
            doc.text("Bilan Clients", 42, 26);
            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Période : ${dateFrom || "Toutes"} au ${dateTo || "Toutes"}`, pageWidth - 14, 18, { align: "right" });
            doc.text(`Généré le : ${new Date().toLocaleDateString("fr-FR")}`, pageWidth - 14, 24, { align: "right" });

            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text("RÉCAPITULATIF CLIENTS", 14, 50);
            autoTable(doc, {
                startY: 55,
                head: [["Client", "Devis", "Commandes", "Facturé", "Réglé", "Reste"]],
                body: displayedClients.map(c => [
                    c.client_nom,
                    `${Number(c.montant_devis || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(c.montant_commande || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(c.montant_facture || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(c.montant_regle || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(c.reste_a_encaisser || 0).toFixed(2).replace(".", ",")} DH`,
                ]),
                foot: [["TOTAL",
                    `${Number(totalClients.devis || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalClients.commande || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalClients.facture || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalClients.regle || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalClients.reste || 0).toFixed(2).replace(".", ",")} DH`,
                ]],
                theme: "grid",
                headStyles: { fillColor: [67, 56, 202] },
                footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
            });
            doc.save(`bilan_clients_${dateFrom || "tous"}_${dateTo || "tous"}.pdf`);
            toast.dismiss(loadingToastId);
            toast.success("Export PDF clients téléchargé");
        } catch (e) {
            console.error(e);
            toast.dismiss(loadingToastId);
            toast.error("Erreur lors de la génération du PDF clients");
        }
    };

    const handleExportFournisseursCsv = () => {
        if (!data) return;
        const rows: string[] = ["Section;Nom;Montant Achats;Montant Réglé;Reste à payer"];
        displayedFournisseurs.forEach((f) => {
            rows.push(
                ["Fournisseur", `"${(f.fournisseur_nom || "").replace(/"/g, '""')}"`, f.montant_achats, f.montant_regle, f.reste_a_payer].join(";")
            );
        });
        const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bilan_fournisseurs_${dateFrom || "tous"}_${dateTo || "tous"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Export CSV fournisseurs téléchargé");
    };

    const handleExportFournisseursXls = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ["Fournisseur", "Montant Achats", "Montant Réglé", "Reste à Payer"],
            ...displayedFournisseurs.map((f) => [
                f.fournisseur_nom,
                toNum(f.montant_achats),
                toNum(f.montant_regle),
                toNum(f.reste_a_payer),
            ]),
            ["TOTAL", totalFournisseurs.achats, totalFournisseurs.regle, totalFournisseurs.reste],
        ]);
        XLSX.utils.book_append_sheet(wb, ws, "Fournisseurs");
        XLSX.writeFile(wb, `bilan_fournisseurs_${dateFrom || "tous"}_${dateTo || "tous"}.xlsx`);
        toast.success("Export Excel fournisseurs téléchargé");
    };

    const handleExportFournisseursPdf = async () => {
        if (!data) return;
        const loadingToastId = toast.loading("Génération du PDF fournisseurs...");
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
                    } catch (e) { res(null); }
                };
                img.onerror = () => res(null);
            });
            let gestionnaireName = "Gestionnaire";
            let gestionnaireLogoUrl: string | null = null;
            try {
                const localToken = localStorage.getItem("token");
                const response = await fetch("/api/gestionnaires", {
                    headers: localToken ? { Authorization: `Bearer ${localToken}` } : {},
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
                // Keep fallback header values for PDF exports.
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
            doc.text("Bilan Fournisseurs", 42, 26);
            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Période : ${dateFrom || "Toutes"} au ${dateTo || "Toutes"}`, pageWidth - 14, 18, { align: "right" });
            doc.text(`Généré le : ${new Date().toLocaleDateString("fr-FR")}`, pageWidth - 14, 24, { align: "right" });

            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text("RÉCAPITULATIF FOURNISSEURS", 14, 50);
            autoTable(doc, {
                startY: 55,
                head: [["Fournisseur", "Montant Achats", "Montant Réglé", "Reste à Payer"]],
                body: displayedFournisseurs.map(f => [
                    f.fournisseur_nom,
                    `${Number(f.montant_achats || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(f.montant_regle || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(f.reste_a_payer || 0).toFixed(2).replace(".", ",")} DH`,
                ]),
                foot: [["TOTAL",
                    `${Number(totalFournisseurs.achats || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalFournisseurs.regle || 0).toFixed(2).replace(".", ",")} DH`,
                    `${Number(totalFournisseurs.reste || 0).toFixed(2).replace(".", ",")} DH`,
                ]],
                theme: "grid",
                headStyles: { fillColor: [71, 85, 105] },
                footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
            });
            doc.save(`bilan_fournisseurs_${dateFrom || "tous"}_${dateTo || "tous"}.pdf`);
            toast.dismiss(loadingToastId);
            toast.success("Export PDF fournisseurs téléchargé");
        } catch (e) {
            console.error(e);
            toast.dismiss(loadingToastId);
            toast.error("Erreur lors de la génération du PDF fournisseurs");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        Rapprochement / Bilan
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Vue synthétique des positions clients et fournisseurs sur une période donnée.
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
                        variant="outline"
                        size="sm"
                        className="gap-2 cursor-pointer"
                        onClick={handleExportXls}
                        disabled={!data || isLoading}
                    >
                        <Download className="h-4 w-4" />
                        Export XLS
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 cursor-pointer"
                        onClick={handleExportCsv}
                        disabled={!data || isLoading}
                    >
                        <Download className="h-4 w-4" />
                        Export CSV
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-muted-foreground"
                        onClick={loadBilan}
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
                        Filtrez par période, PDV, utilisateur, client ou fournisseur. Cliquez sur &quot;Appliquer&quot; pour mettre à jour le bilan.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">Période rapide :</span>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                            const d = new Date();
                            d.setDate(1);
                            setDateFrom(d.toISOString().split("T")[0]);
                            setDateTo(new Date().toISOString().split("T")[0]);
                            setTimeout(loadBilan, 0);
                        }}>
                            Ce mois
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                            const d = new Date();
                            d.setMonth(d.getMonth() - 1);
                            d.setDate(1);
                            setDateFrom(d.toISOString().split("T")[0]);
                            const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                            setDateTo(fin.toISOString().split("T")[0]);
                            setTimeout(loadBilan, 0);
                        }}>
                            Mois dernier
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                            const y = new Date().getFullYear();
                            setDateFrom(`${y}-01-01`);
                            setDateTo(new Date().toISOString().split("T")[0]);
                            setTimeout(loadBilan, 0);
                        }}>
                            Cette année
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Date du
                            </label>
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Date au
                            </label>
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <Store className="h-3 w-3" />
                                Point de vente
                            </label>
                            <Select value={pdvId} onValueChange={setPdvId}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Tous les PDV" />
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
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Utilisateur
                            </label>
                            <Select value={userId} onValueChange={setUserId}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Tous les utilisateurs" />
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
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Client
                            </label>
                            <Select value={clientId} onValueChange={setClientId}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Tous clients" />
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
                                <Truck className="h-3 w-3 rotate-180" />
                                Fournisseur
                            </label>
                            <Select value={fournisseurId} onValueChange={setFournisseurId}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Tous fournisseurs" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous</SelectItem>
                                    {data?.filters.fournisseurs.map((f) => (
                                        <SelectItem key={f.id} value={String(f.id)}>
                                            {f.nom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1 xl:col-span-2">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <Search className="h-3 w-3" />
                                Recherche client (nom)
                            </label>
                            <Input
                                type="text"
                                placeholder="Filtrer les clients affichés..."
                                value={searchClient}
                                onChange={(e) => setSearchClient(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1 xl:col-span-2">
                            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <Search className="h-3 w-3" />
                                Recherche fournisseur (nom)
                            </label>
                            <Input
                                type="text"
                                placeholder="Filtrer les fournisseurs affichés..."
                                value={searchFournisseur}
                                onChange={(e) => setSearchFournisseur(e.target.value)}
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
                                setFournisseurId("all");
                                setSearchClient("");
                                setSearchFournisseur("");
                            }}
                        >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Réinitialiser
                        </Button>
                        <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={loadBilan} disabled={isLoading}>
                            {isLoading ? "Chargement..." : "Appliquer les filtres"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border border-border shadow-sm">
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Users className="h-5 w-5 text-emerald-600" />
                                    Clients
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Total facturé, encaissé et reste à encaisser pour chaque client. Utilisez les filtres pour isoler les clients soldés ou avec reste à encaisser.
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                    onClick={handleExportClientsPdf}
                                    disabled={!data || isLoading || displayedClients.length === 0}
                                    title="Exporter la rubrique clients en PDF"
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    PDF
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    onClick={handleExportClientsXls}
                                    disabled={!data || isLoading || displayedClients.length === 0}
                                    title="Exporter la rubrique clients en Excel"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    XLS
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    onClick={handleExportClientsCsv}
                                    disabled={!data || isLoading || displayedClients.length === 0}
                                    title="Exporter la rubrique clients en CSV"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    CSV
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
                            <span className="text-muted-foreground font-semibold">Filtre clients :</span>
                            <Button
                                type="button"
                                size="sm"
                                variant={clientBalanceFilter === "all" ? "default" : "outline"}
                                className="h-7 px-2"
                                onClick={() => setClientBalanceFilter("all")}
                            >
                                Tous
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={clientBalanceFilter === "withReste" ? "default" : "outline"}
                                className="h-7 px-2"
                                onClick={() => setClientBalanceFilter("withReste")}
                            >
                                Avec reste à encaisser
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={clientBalanceFilter === "fullyPaid" ? "default" : "outline"}
                                className="h-7 px-2"
                                onClick={() => setClientBalanceFilter("fullyPaid")}
                            >
                                Soldés
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                            <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Total Devis
                                </p>
                                <p className="text-sm font-bold text-foreground">
                                    {formatDH(totalClients.devis)} DH
                                </p>
                            </div>
                            <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Total Commandes
                                </p>
                                <p className="text-sm font-bold text-foreground">
                                    {formatDH(totalClients.commande)} DH
                                </p>
                            </div>
                            <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Montant facturé
                                </p>
                                <p className="text-sm font-bold text-foreground">
                                    {formatDH(totalClients.facture)} DH
                                </p>
                            </div>
                            <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Montant réglé
                                </p>
                                <p className="text-sm font-bold text-emerald-600">
                                    {formatDH(totalClients.regle)} DH
                                </p>
                            </div>
                            <div className="bg-muted/60 p-3 rounded-xl border border-border col-span-2 lg:col-span-1">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Reste à encaisser
                                </p>
                                <p className="text-sm font-bold text-amber-600">
                                    {formatDH(totalClients.reste)} DH
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border overflow-x-auto">
                            <Table className="min-w-[520px]">
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
                                    {!data || displayedClients.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={6}
                                                className="text-center text-xs text-muted-foreground py-6"
                                            >
                                                Aucun mouvement client pour ces filtres.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        displayedClients.map((c) => (
                                            <Fragment key={c.client_id}>
                                                <TableRow 
                                                    key={c.client_id}
                                                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                                                    onClick={() => setExpandedClientId(expandedClientId === c.client_id ? null : c.client_id)}
                                                >
                                                    <TableCell className="flex items-center gap-2">
                                                        {expandedClientId === c.client_id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                        <span className="font-semibold">{c.client_nom}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {formatDH(c.montant_devis)} DH
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {formatDH(c.montant_commande)} DH
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {formatDH(c.montant_facture)} DH
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold text-emerald-600">
                                                        {formatDH(c.montant_regle)} DH
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-amber-600">
                                                        {formatDH(c.reste_a_encaisser)} DH
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {toNum(c.reste_a_encaisser) <= 0.05 ? (
                                                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] uppercase font-bold">Soldé</Badge>
                                                        ) : (
                                                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] uppercase font-bold">Impayé</Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                                {expandedClientId === c.client_id && c.details && (
                                                    <TableRow className="bg-muted/10">
                                                        <TableCell colSpan={6} className="p-0">
                                                            <div className="p-4 space-y-3 bg-indigo-50/5 border-l-2 border-indigo-400 m-2 rounded-r-lg">
                                                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-2">Historique des transactions</h4>
                                                                 <div className="rounded-lg border border-border/50 overflow-x-auto bg-white dark:bg-zinc-900 shadow-sm">
                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0 pl-3">Date</TableHead>
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0">Type</TableHead>
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0">Référence</TableHead>
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0 text-right">Montant</TableHead>
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0 text-right pr-3">Action</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {c.details.map((det: any, idx: number) => (
                                                                                <TableRow key={idx} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                                                                                    <TableCell className="text-[11px] py-1.5 pl-3">
                                                                                        {new Date(det.date).toLocaleDateString()}
                                                                                    </TableCell>
                                                                                    <TableCell className="py-1.5">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <div className={cn(
                                                                                                "p-1 rounded",
                                                                                                det.type === 'facture' || det.type === 'facture_gros' ? "bg-blue-50 text-blue-600" :
                                                                                                det.type === 'commande' || det.type === 'commande_gros' ? "bg-emerald-50 text-emerald-600" :
                                                                                                det.type === 'devis' || det.type === 'devis_gros' ? "bg-amber-50 text-amber-600" :
                                                                                                "bg-purple-50 text-purple-600"
                                                                                            )}>
                                                                                                {(det.type === 'facture' || det.type === 'facture_gros') && <FileText className="h-3 w-3" />}
                                                                                                {(det.type === 'commande' || det.type === 'commande_gros') && <ShoppingCart className="h-3 w-3" />}
                                                                                                {(det.type === 'devis' || det.type === 'devis_gros') && <ClipboardList className="h-3 w-3" />}
                                                                                                {(det.type === 'reglement' || det.type === 'reglement_gros') && <CreditCard className="h-3 w-3" />}
                                                                                            </div>
                                                                                            <span className="text-[11px] font-medium capitalize">{String(det.type || "").replace("_", " ")}</span>
                                                                                        </div>
                                                                                    </TableCell>
                                                                                    <TableCell className="text-[11px] font-mono py-1.5">
                                                                                        <div className="flex flex-col">
                                                                                            <span className="font-bold">{det.numero || "—"}</span>
                                                                                            {(det.type === 'commande' || det.type === 'commande_gros') && det.facture_numero && (
                                                                                                <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/20 px-1 rounded-sm w-fit mt-0.5">Facturé: {det.facture_numero}</span>
                                                                                            )}
                                                                                            {(det.type === 'reglement' || det.type === 'reglement_gros') && det.numero_facture && (
                                                                                                <span className="text-[9px] text-muted-foreground">Sur Fact. {det.numero_facture}</span>
                                                                                            )}
                                                                                        </div>
                                                                                    </TableCell>
                                                                                    <TableCell className={cn(
                                                                                        "text-[11px] text-right font-bold py-1.5",
                                                                                        det.type === 'reglement' || det.type === 'reglement_gros' ? "text-emerald-600" : "text-foreground"
                                                                                    )}>
                                                                                        {det.type === 'reglement' || det.type === 'reglement_gros' ? '-' : ''}{formatDH(det.montant)} DH
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right py-1.5 pr-3">
                                                                                        <button 
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                if (det.type === 'facture') navigate(`/dashboard/factures/${det.id}`);
                                                                                                if (det.type === 'facture_gros') navigate(`/dashboard/factures-gros/${det.id}`);
                                                                                                if (det.type === 'commande') navigate(`/dashboard/commandes/${det.id}`);
                                                                                                if (det.type === 'commande_gros') navigate(`/dashboard/commandes-gros/${det.id}`);
                                                                                                if (det.type === 'devis') navigate(`/dashboard/devis/${det.id}`);
                                                                                                if (det.type === 'devis_gros') navigate(`/dashboard/devis-gros/${det.id}`);
                                                                                                if (det.type === 'reglement') navigate(`/dashboard/reglements`);
                                                                                                if (det.type === 'reglement_gros') navigate(`/dashboard/reglements/details/client_gros/${det.id}`);
                                                                                            }}
                                                                                            className="p-1 hover:bg-indigo-50 rounded text-indigo-600 transition-colors"
                                                                                            title="Voir les détails"
                                                                                        >
                                                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                                                        </button>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                            {c.details.length === 0 && (
                                                                                <TableRow>
                                                                                    <TableCell colSpan={5} className="py-4 text-center text-[11px] text-muted-foreground italic">Aucune transaction trouvée.</TableCell>
                                                                                </TableRow>
                                                                            )}
                                                                        </TableBody>
                                                                    </Table>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        ))
                                    )}
                                    {data && displayedClients.length > 0 && (
                                        <TableRow className="bg-indigo-50/30 dark:bg-indigo-900/10 font-bold border-t-2 border-indigo-100 dark:border-indigo-900/30">
                                            <TableCell className="px-4 py-3 uppercase tracking-wider text-[10px]">Total Filtré</TableCell>
                                            <TableCell className="text-right px-4 py-3">{formatDH(totalClients.devis)} DH</TableCell>
                                            <TableCell className="text-right px-4 py-3">{formatDH(totalClients.commande)} DH</TableCell>
                                            <TableCell className="text-right px-4 py-3">{formatDH(totalClients.facture)} DH</TableCell>
                                            <TableCell className="text-right px-4 py-3 text-emerald-600 dark:text-emerald-400">{formatDH(totalClients.regle)} DH</TableCell>
                                            <TableCell className="text-right px-4 py-3 text-amber-600 dark:text-amber-400">{formatDH(totalClients.reste)} DH</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm">
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Truck className="h-5 w-5 text-sky-600" />
                                    Fournisseurs
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Total des achats, montants réglés et reste à payer pour chaque fournisseur.
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1 border-sky-200 text-sky-600 hover:bg-sky-50"
                                    onClick={handleExportFournisseursPdf}
                                    disabled={!data || isLoading || displayedFournisseurs.length === 0}
                                    title="Exporter la rubrique fournisseurs en PDF"
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    PDF
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    onClick={handleExportFournisseursXls}
                                    disabled={!data || isLoading || displayedFournisseurs.length === 0}
                                    title="Exporter la rubrique fournisseurs en Excel"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    XLS
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    onClick={handleExportFournisseursCsv}
                                    disabled={!data || isLoading || displayedFournisseurs.length === 0}
                                    title="Exporter la rubrique fournisseurs en CSV"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    CSV
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
                            <span className="text-muted-foreground font-semibold">Filtre fournisseurs :</span>
                            <Button
                                type="button"
                                size="sm"
                                variant={fournisseurBalanceFilter === "all" ? "default" : "outline"}
                                className="h-7 px-2"
                                onClick={() => setFournisseurBalanceFilter("all")}
                            >
                                Tous
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={fournisseurBalanceFilter === "withReste" ? "default" : "outline"}
                                className="h-7 px-2"
                                onClick={() => setFournisseurBalanceFilter("withReste")}
                            >
                                Avec reste à payer
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={fournisseurBalanceFilter === "fullyPaid" ? "default" : "outline"}
                                className="h-7 px-2"
                                onClick={() => setFournisseurBalanceFilter("fullyPaid")}
                            >
                                Soldés
                            </Button>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Montant achats
                                </p>
                                <p className="text-sm font-bold text-foreground">
                                    {formatDH(totalFournisseurs.achats)} DH
                                </p>
                            </div>
                            <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Montant réglé
                                </p>
                                <p className="text-sm font-bold text-emerald-600">
                                    {formatDH(totalFournisseurs.regle)} DH
                                </p>
                            </div>
                            <div className="bg-muted/60 p-3 rounded-xl border border-border">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Reste à payer
                                </p>
                                <p className="text-sm font-bold text-amber-600">
                                    {formatDH(totalFournisseurs.reste)} DH
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border overflow-x-auto">
                            <Table className="min-w-[520px]">
                                <TableHeader>
                                    <TableRow className="bg-muted/60">
                                        <TableHead>Fournisseur</TableHead>
                                        <TableHead className="text-right">Achats</TableHead>
                                        <TableHead className="text-right">Réglé</TableHead>
                                        <TableHead className="text-right">Reste</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!data || displayedFournisseurs.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={4}
                                                className="text-center text-xs text-muted-foreground py-6"
                                            >
                                                Aucun mouvement fournisseur pour ces filtres.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        displayedFournisseurs.map((f) => (
                                            <Fragment key={f.fournisseur_id}>
                                                <TableRow 
                                                    key={f.fournisseur_id}
                                                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                                                    onClick={() => setExpandedFournisseurId(expandedFournisseurId === f.fournisseur_id ? null : f.fournisseur_id)}
                                                >
                                                    <TableCell className="flex items-center gap-2">
                                                        {expandedFournisseurId === f.fournisseur_id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                        <span className="font-semibold">{f.fournisseur_nom}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatDH(f.montant_achats)} DH
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatDH(f.montant_regle)} DH
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatDH(f.reste_a_payer)} DH
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {toNum(f.reste_a_payer) <= 0.05 ? (
                                                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] uppercase font-bold">Soldé</Badge>
                                                        ) : (
                                                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] uppercase font-bold">Impayé</Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                                {expandedFournisseurId === f.fournisseur_id && f.details && (
                                                    <TableRow className="bg-muted/10">
                                                        <TableCell colSpan={4} className="p-0">
                                                            <div className="p-4 space-y-3 bg-sky-50/5 border-l-2 border-sky-400 m-2 rounded-r-lg">
                                                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-2">Historique des achats et règlements</h4>
                                                                <div className="rounded-lg border border-border/50 overflow-x-auto bg-white dark:bg-zinc-900 shadow-sm">
                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0 pl-3">Date</TableHead>
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0">Type</TableHead>
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0">Référence</TableHead>
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0 text-right">Montant</TableHead>
                                                                                <TableHead className="text-[10px] h-8 font-bold uppercase py-0 text-right pr-3">Action</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {f.details.map((det: any, idx: number) => (
                                                                                <TableRow key={idx} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                                                                                    <TableCell className="text-[11px] py-1.5 pl-3">
                                                                                        {new Date(det.date).toLocaleDateString()}
                                                                                    </TableCell>
                                                                                    <TableCell className="py-1.5">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <div className={cn(
                                                                                                "p-1 rounded",
                                                                                                det.type === 'achat' ? "bg-sky-50 text-sky-600" : "bg-purple-50 text-purple-600"
                                                                                            )}>
                                                                                                {det.type === 'achat' ? <ShoppingCart className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                                                                                            </div>
                                                                                            <span className="text-[11px] font-medium capitalize">{det.type}</span>
                                                                                        </div>
                                                                                    </TableCell>
                                                                                    <TableCell className="text-[11px] font-mono py-1.5">
                                                                                        <div className="flex flex-col">
                                                                                            <span className="font-bold">{det.numero || "—"}</span>
                                                                                            {det.type === 'achat' && (
                                                                                                <span className={cn(
                                                                                                    "text-[9px] font-bold px-1 rounded-sm w-fit mt-0.5 uppercase tracking-tighter",
                                                                                                    toNum(det.montant_paye) >= toNum(det.montant) - 0.1 
                                                                                                        ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" 
                                                                                                        : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
                                                                                                )}>
                                                                                                    {toNum(det.montant_paye) >= toNum(det.montant) - 0.1 ? "Payé" : "Impayé"}
                                                                                                </span>
                                                                                            )}
                                                                                            {det.type === 'reglement' && det.achat_numero && (
                                                                                                <span className="text-[9px] text-muted-foreground">Sur Cmd. {det.achat_numero}</span>
                                                                                            )}
                                                                                        </div>
                                                                                    </TableCell>
                                                                                    <TableCell className={cn(
                                                                                        "text-[11px] text-right font-bold py-1.5",
                                                                                        det.type === 'reglement' ? "text-emerald-600" : "text-foreground"
                                                                                    )}>
                                                                                        {det.type === 'reglement' ? '-' : ''}{formatDH(det.montant)} DH
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right py-1.5 pr-3">
                                                                                        <button 
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                if (det.type === 'achat') navigate(`/dashboard/achats/${det.numero}`);
                                                                                                if (det.type === 'reglement') navigate(`/dashboard/fournisseurs/reglements`);
                                                                                            }}
                                                                                            className="p-1 hover:bg-sky-50 rounded text-sky-600 transition-colors"
                                                                                            title="Voir les détails"
                                                                                        >
                                                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                                                        </button>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                            {f.details.length === 0 && (
                                                                                <TableRow>
                                                                                    <TableCell colSpan={5} className="py-4 text-center text-[11px] text-muted-foreground italic">Aucune transaction trouvée.</TableCell>
                                                                                </TableRow>
                                                                            )}
                                                                        </TableBody>
                                                                    </Table>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        ))
                                    )}
                                    {data && displayedFournisseurs.length > 0 && (
                                        <TableRow className="bg-sky-50/30 dark:bg-sky-900/10 font-bold border-t-2 border-sky-100 dark:border-sky-900/30">
                                            <TableCell className="px-4 py-3 uppercase tracking-wider text-[10px]">Total Filtré</TableCell>
                                            <TableCell className="text-right px-4 py-3">{formatDH(totalFournisseurs.achats)} DH</TableCell>
                                            <TableCell className="text-right px-4 py-3 text-emerald-600 dark:text-emerald-400">{formatDH(totalFournisseurs.regle)} DH</TableCell>
                                            <TableCell className="text-right px-4 py-3 text-amber-600 dark:text-amber-400">{formatDH(totalFournisseurs.reste)} DH</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
