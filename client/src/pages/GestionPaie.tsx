import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
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
import { DollarSign, Printer, TrendingUp, ShieldAlert, User, Search, Calendar, CheckCircle2, Clock, Edit, Trash2, MoreVertical } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AurevoxLogo from "@/assets/aurevox_logo.png";

interface Employee {
    id: number;
    nom: string;
    prenom: string;
    salary: number;
    id_point_de_vente: number | null;
    user_id?: number | null;
}

interface Salary {
    id: number;
    employee_id: number;
    mois: number;
    annee: number;
    salaire_brut: number;
    salaire_net: number;
    statut: "paye" | "en_attente" | null;
    prenom: string;
    nom: string;
    salaire_base: number;
    primes: number;
    commission: number;
    heures_supp: number;
    deductions: number;
    cnss: number;
    ir: number;
}

const MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const loadImgToBase64 = (src: string): Promise<string | null> =>
    new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "Anonymous";
        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) return resolve(null);
                ctx.drawImage(image, 0, 0);
                resolve(canvas.toDataURL("image/png"));
            } catch {
                resolve(null);
            }
        };
        image.onerror = () => resolve(null);
        image.src = src;
    });

export default function GestionPaie() {
    const navigate = useNavigate();
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAuthorized = permissions.includes("paie_view");

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [salaries, setSalaries] = useState<Salary[]>([]);
    const [loadingVolume, setLoadingVolume] = useState(false);
    const [volumeTtc, setVolumeTtc] = useState<number | null>(null);
    const [isLoadingSalaries, setIsLoadingSalaries] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [editingSalary, setEditingSalary] = useState<Salary | null>(null);
    const [gestionnaireLogoPath, setGestionnaireLogoPath] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        employee_id: "",
        mois: (new Date().getMonth() + 1).toString(),
        annee: new Date().getFullYear().toString(),
        salaire_base: "",
        commission: "0",
        taux_commission_pct: "0"
    });

    const token = localStorage.getItem("token");

    const toNumber = (value: string | number | null | undefined) => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0;
        const normalized = String(value ?? "").replace(",", ".").trim();
        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const fetchEmployees = async () => {
        try {
            const res = await fetch("/api/employees", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setEmployees(data);
            }
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement employés");
        }
    };

    const fetchSalaries = async () => {
        setIsLoadingSalaries(true);
        try {
            const res = await fetch("/api/salaries", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSalaries(data);
            }
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement fiches de paie");
        } finally {
            setIsLoadingSalaries(false);
        }
    };

    useEffect(() => {
        const fetchGestionnaireLogo = async () => {
            if (!token) return;
            try {
                const res = await fetch("/api/gestionnaires", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    setGestionnaireLogoPath(data[0]?.logo || null);
                }
            } catch {
                // ignore logo fetch errors, fallback logo is used in PDFs
            }
        };

        fetchEmployees();
        fetchSalaries();
        fetchGestionnaireLogo();
    }, []);

    const selectedEmployee = employees.find(e => e.id.toString() === formData.employee_id);

    const fetchVolumeVente = async () => {
        if (!formData.employee_id || !formData.mois || !formData.annee) {
            toast.error("Sélectionnez un employé, un mois et une année");
            return;
        }
        setLoadingVolume(true);
        setVolumeTtc(null);
        try {
            const params = new URLSearchParams({
                employee_id: formData.employee_id,
                mois: formData.mois,
                annee: formData.annee
            });
            const res = await fetch(`/api/paie/volume-vente?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (res.ok) {
                setVolumeTtc(data.volume_ttc ?? 0);
            }
        } catch (e) {
            console.error(e);
            toast.error("Erreur volume de vente");
        } finally {
            setLoadingVolume(false);
        }
    };

    useEffect(() => {
        if (formData.employee_id && formData.mois && formData.annee) {
            fetchVolumeVente();
        } else {
            setVolumeTtc(null);
        }
    }, [formData.employee_id, formData.mois, formData.annee]);

    const handleEmployeeChange = (empId: string) => {
        const emp = employees.find(e => e.id.toString() === empId);
        setFormData(prev => ({
            ...prev,
            employee_id: empId,
            salaire_base: emp?.salary ? String(emp.salary) : ""
        }));
    };

    const applyTauxCommission = () => {
        if (!formData.employee_id || !formData.mois || !formData.annee) {
            toast.error("Sélectionnez un employé, un mois et une année");
            return;
        }

        const rawPct = toNumber(formData.taux_commission_pct);
        const pctValue = Math.min(Math.max(rawPct, 0), 100);
        if (rawPct !== pctValue) {
            setFormData(prev => ({ ...prev, taux_commission_pct: String(pctValue) }));
        }
        // Si le taux = 0%, on applique simplement la commission saisie en DH.
        if (pctValue === 0) {
            const manualCommission = toNumber(formData.commission);
            setFormData(prev => ({ ...prev, commission: manualCommission.toFixed(2) }));
            toast.success(
                `Commission appliquée: ${manualCommission.toFixed(2).replace(".", ",")} DH (saisie manuelle)`
            );
            return;
        }

        const salaireBase = toNumber(formData.salaire_base);
        if (salaireBase <= 0) {
            toast.error("Saisissez d'abord un salaire de base valide");
            return;
        }

        const commission = Math.round((salaireBase * pctValue / 100) * 100) / 100;
        setFormData(prev => ({ ...prev, commission: commission.toFixed(2) }));
        toast.success(
            `Commission = ${commission.toFixed(2).replace(".", ",")} DH (${pctValue.toString().replace(".", ",")}% du salaire de base)`
        );
    };

    const totalBrut = toNumber(formData.salaire_base) + toNumber(formData.commission);

    const filteredSalaries = salaries
        .filter((s) => {
            const term = searchTerm.toLowerCase();
            if (!term) return true;
            const fullName = `${s.prenom ?? ""} ${s.nom ?? ""}`.toLowerCase();
            const periode = `${s.mois}/${s.annee}`;
            return fullName.includes(term) || periode.includes(term);
        })
        .sort((a, b) => {
            const yearDiff = Number(b.annee || 0) - Number(a.annee || 0);
            if (yearDiff !== 0) return yearDiff;
            const monthDiff = Number(b.mois || 0) - Number(a.mois || 0);
            if (monthDiff !== 0) return monthDiff;
            return Number(b.id || 0) - Number(a.id || 0);
        });

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.employee_id) {
            toast.error("Sélectionnez un employé");
            return;
        }
        if (!formData.salaire_base || toNumber(formData.salaire_base) <= 0) {
            toast.error("Saisissez le salaire de base");
            return;
        }
        try {
            const isEditing = !!editingSalary;
            const url = isEditing ? `/api/salaries/${editingSalary!.id}` : "/api/salaries";
            const method = isEditing ? "PUT" : "POST";
            const payload = {
                employee_id: parseInt(formData.employee_id),
                point_de_vente_id: selectedEmployee?.id_point_de_vente || null,
                mois: parseInt(formData.mois),
                annee: parseInt(formData.annee),
                salaire_base: toNumber(formData.salaire_base),
                primes: 0,
                commission: toNumber(formData.commission),
                heures_supp: 0,
                deductions: 0,
                cnss: 0,
                ir: 0
            };
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success(isEditing ? "Fiche de paie mise à jour" : "Fiche de paie enregistrée");
                setEditingSalary(null);
                fetchSalaries();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || "Erreur enregistrement");
            }
        } catch (e) {
            toast.error("Erreur serveur");
        }
    };

    const handleEditSalary = (s: Salary) => {
        navigate(`/dashboard/paiement/${s.id}`);
    };

    const handleValidateSalary = async (s: Salary) => {
        try {
            const res = await fetch(`/api/salaries/${s.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    ...s,
                    statut: "paye",
                    date_paiement: new Date().toISOString().split('T')[0]
                }),
            });
            if (res.ok) {
                toast.success(`Salaire de ${s.prenom} ${s.nom} validé !`);
                fetchSalaries();
            } else {
                toast.error("Erreur lors de la validation");
            }
        } catch {
            toast.error("Erreur serveur");
        }
    };

    const handleDeleteSalary = async (s: Salary) => {
        try {
            const res = await fetch(`/api/salaries/${s.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                toast.success("Fiche de paie supprimée");
                if (editingSalary && editingSalary.id === s.id) {
                    setEditingSalary(null);
                }
                fetchSalaries();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || "Erreur suppression");
            }
        } catch {
            toast.error("Erreur serveur");
        }
    };

    const handlePrintFichePaie = async () => {
        if (!selectedEmployee) {
            toast.error("Sélectionnez un employé");
            return;
        }
        const nomComplet = `${selectedEmployee.prenom} ${selectedEmployee.nom}`;
        const periode = `${MONTHS[parseInt(formData.mois) - 1]} ${formData.annee}`;
        const salaireBase = parseFloat(formData.salaire_base || "0");
        const commission = parseFloat(formData.commission || "0");

        try {
            const doc = new jsPDF("p", "mm", "a4");
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;

            const logoSource = gestionnaireLogoPath
                ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${gestionnaireLogoPath}`
                : AurevoxLogo;
            const logoImgData = await loadImgToBase64(logoSource);
            if (logoImgData) {
                doc.addImage(logoImgData, "PNG", 20, 8, 26, 26);
            }

            // En-tête de l'entreprise
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.setTextColor(30, 58, 138); // Indigo-900
            doc.text("FICHE DE PAIE", pageWidth / 2, y, { align: "center" });
            y += 8;

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text("Gestion de paie", pageWidth / 2, y, { align: "center" });
            y += 15;

            // Informations du document et employé
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(20, y, pageWidth - 40, 30, 3, 3, "FD");

            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Informations de l'employé", 25, y + 8);
            doc.text("Période concernée", pageWidth / 2 + 5, y + 8);

            doc.setFontSize(12);
            doc.setTextColor(15, 23, 42);
            doc.text(nomComplet, 25, y + 16);
            doc.text(periode, pageWidth / 2 + 5, y + 16);

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text(`Matricule interne: EMP-${selectedEmployee.id.toString().padStart(4, '0')}`, 25, y + 24);
            doc.text(`Modèle généré le ${new Date().toLocaleDateString("fr-FR")}`, pageWidth / 2 + 5, y + 24);

            y += 40;

            // Titre de sections
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            doc.text("Détail des rémunérations", 20, y);
            y += 6;

            // Tableau des montants
            autoTable(doc, {
                startY: y,
                head: [["Description", "Montant (DH)"]],
                body: [
                    ["Salaire de base", `${salaireBase.toFixed(2).replace(".", ",")} DH`],
                    ["Commission", `${commission.toFixed(2).replace(".", ",")} DH`],
                ],
                theme: "grid",
                headStyles: {
                    fillColor: [79, 70, 229], // Indigo-600
                    textColor: 255,
                    fontStyle: "bold",
                    halign: "left"
                },
                columnStyles: {
                    0: { cellWidth: 100 },
                    1: { halign: "right" }
                },
                styles: {
                    font: "helvetica",
                    fontSize: 11,
                    textColor: [50, 50, 50]
                },
                margin: { left: 20, right: 20 },
            });

            y = (doc as any).lastAutoTable.finalY + 10;

            // Résultat net / brut
            doc.setFillColor(238, 242, 255); // Indigo-50
            doc.setDrawColor(199, 210, 254); // Indigo-200
            doc.roundedRect(pageWidth - 95, y, 75, 15, 2, 2, "FD");

            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 58, 138); // Indigo-900
            doc.text("TOTAL BRUT", pageWidth - 90, y + 10);

            doc.setFontSize(14);
            doc.text(`${totalBrut.toFixed(2).replace(".", ",")} DH`, pageWidth - 25, y + 10, { align: "right" });

            // Pied de page
            const footerY = 280;
            doc.setDrawColor(226, 232, 240);
            doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Pour faire valoir ce que de droit.", pageWidth / 2, footerY, { align: "center" });

            doc.save(`Fiche_paie_${selectedEmployee.prenom}_${selectedEmployee.nom}_${formData.mois}_${formData.annee}.pdf`);
            toast.success("Fiche de paie imprimée");
        } catch (err) {
            console.error(err);
            toast.error("Erreur génération PDF");
        }
    };

    const handleDownloadFichePaie = async (s: Salary) => {
        const nomComplet = `${s.prenom} ${s.nom}`;
        const periode = `${MONTHS[s.mois - 1]} ${s.annee}`;
        const salaireBase = Number(s.salaire_base || 0);
        const commission = Number(s.commission || 0);
        const tBrut = Number(s.salaire_brut || 0);

        try {
            const doc = new jsPDF("p", "mm", "a4");
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;

            const logoSource = gestionnaireLogoPath
                ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${gestionnaireLogoPath}`
                : AurevoxLogo;
            const logoImgData = await loadImgToBase64(logoSource);
            if (logoImgData) {
                doc.addImage(logoImgData, "PNG", 20, 8, 26, 26);
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.setTextColor(30, 58, 138);
            doc.text("FICHE DE PAIE", pageWidth / 2, y, { align: "center" });
            y += 8;

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text("Gestion de paie", pageWidth / 2, y, { align: "center" });
            y += 15;

            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(20, y, pageWidth - 40, 30, 3, 3, "FD");

            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Informations de l'employé", 25, y + 8);
            doc.text("Période concernée", pageWidth / 2 + 5, y + 8);

            doc.setFontSize(12);
            doc.setTextColor(15, 23, 42);
            doc.text(nomComplet, 25, y + 16);
            doc.text(periode, pageWidth / 2 + 5, y + 16);

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text(`Matricule interne: EMP-${s.employee_id.toString().padStart(4, '0')}`, 25, y + 24);
            doc.text(`Réimpression le ${new Date().toLocaleDateString("fr-FR")}`, pageWidth / 2 + 5, y + 24);

            y += 40;

            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            doc.text("Détail des rémunérations", 20, y);
            y += 6;

            autoTable(doc, {
                startY: y,
                head: [["Description", "Montant (DH)"]],
                body: [
                    ["Salaire de base", `${salaireBase.toFixed(2).replace(".", ",")} DH`],
                    ["Commission", `${commission.toFixed(2).replace(".", ",")} DH`],
                ],
                theme: "grid",
                headStyles: {
                    fillColor: [79, 70, 229],
                    textColor: 255,
                    fontStyle: "bold",
                    halign: "left"
                },
                columnStyles: { 0: { cellWidth: 100 }, 1: { halign: "right" } },
                styles: { font: "helvetica", fontSize: 11, textColor: [50, 50, 50] },
                margin: { left: 20, right: 20 },
            });

            y = (doc as any).lastAutoTable.finalY + 10;

            doc.setFillColor(238, 242, 255);
            doc.setDrawColor(199, 210, 254);
            doc.roundedRect(pageWidth - 95, y, 75, 15, 2, 2, "FD");

            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 58, 138);
            doc.text("TOTAL BRUT", pageWidth - 90, y + 10);

            doc.setFontSize(14);
            doc.text(`${tBrut.toFixed(2).replace(".", ",")} DH`, pageWidth - 25, y + 10, { align: "right" });

            const footerY = 280;
            doc.setDrawColor(226, 232, 240);
            doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Pour faire valoir ce que de droit.", pageWidth / 2, footerY, { align: "center" });

            doc.save(`Fiche_paie_${s.prenom}_${s.nom}_${s.mois}_${s.annee}.pdf`);
            toast.success("Fiche de paie imprimée");
        } catch (err) {
            console.error(err);
            toast.error("Erreur génération PDF");
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="max-w-md w-full shadow-2xl border-0 bg-card/80 backdrop-blur-sm p-8 text-center">
                    <div className="mb-6 flex justify-center">
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                            <ShieldAlert className="h-12 w-12 text-red-500" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Accès restreint</h2>
                    <p className="text-muted-foreground">Vous n'avez pas accès à la gestion de paie.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <DollarSign className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Gestion de paie
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Saisie du salaire et de la commission (selon le volume de vente), impression de la fiche de paie
                    </p>
                </div>
            </div>

            <Card className="border border-border shadow-lg bg-card">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5 text-indigo-600" />
                        Nouvelle fiche de paie
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Employé (commercial) *</Label>
                                <Select value={formData.employee_id} onValueChange={handleEmployeeChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Sélectionner un employé" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.map((emp) => (
                                            <SelectItem key={emp.id} value={emp.id.toString()}>
                                                {emp.prenom} {emp.nom}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Mois</Label>
                                    <Select value={formData.mois} onValueChange={(v) => setFormData(prev => ({ ...prev, mois: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {MONTHS.map((m, i) => (
                                                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Année</Label>
                                    <Input
                                        type="number"
                                        value={formData.annee}
                                        onChange={(e) => setFormData(prev => ({ ...prev, annee: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {formData.employee_id && (
                            <div className="p-4 rounded-xl bg-muted/50 border border-border">
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Volume de vente (période)</p>
                                {loadingVolume ? (
                                    <p className="text-sm text-muted-foreground">Chargement...</p>
                                ) : volumeTtc !== null ? (
                                    <p className="text-xl font-bold text-foreground flex items-center gap-2">
                                        <TrendingUp className="h-5 w-5 text-emerald-600" />
                                        {volumeTtc.toFixed(2).replace(".", ",")} DH TTC
                                    </p>
                                ) : null}
                                <p className="text-xs text-muted-foreground mt-1">
                                    Basé sur les factures du commercial (employé lié à un compte utilisateur).
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Salaire de base (DH) *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.salaire_base}
                                    onChange={(e) => setFormData(prev => ({ ...prev, salaire_base: e.target.value }))}
                                    placeholder="Salaire fixe"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Commission (DH)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.commission}
                                        onChange={(e) => setFormData(prev => ({ ...prev, commission: e.target.value }))}
                                        placeholder="Montant commission"
                                        className="flex-1"
                                    />
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            max="100"
                                            value={formData.taux_commission_pct}
                                            onChange={(e) => setFormData(prev => ({ ...prev, taux_commission_pct: e.target.value }))}
                                            onBlur={(e) => {
                                                const raw = toNumber(e.target.value);
                                                const normalized = Math.min(Math.max(raw, 0), 100);
                                                setFormData(prev => ({ ...prev, taux_commission_pct: String(normalized) }));
                                            }}
                                            className="w-14 text-center"
                                        />
                                        <span className="text-xs text-muted-foreground">%</span>
                                        <Button type="button" variant="outline" size="sm" onClick={applyTauxCommission}>
                                            Appliquer
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Saisie manuelle ou « Appliquer » pour X % du salaire de base.
                                </p>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-foreground">Total brut (salaire + commission)</span>
                                <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                                    {totalBrut.toFixed(2).replace(".", ",")} DH
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                                Enregistrer la fiche de paie
                            </Button>
                            <Button type="button" variant="outline" onClick={handlePrintFichePaie} className="gap-2">
                                <Printer className="h-4 w-4" />
                                Imprimer la fiche de paie
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card className="border border-border shadow-sm bg-card">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between text-lg">
                        <span>Fiches de paie enregistrées</span>
                        <div className="relative w-full max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher par employé ou période..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-9 text-sm"
                            />
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="rounded-b-2xl overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 border-b border-border">
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 pl-6">
                                        Employé
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">
                                        Période
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">
                                        Brut / Net
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3">
                                        Statut
                                    </TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-3 text-right pr-6">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingSalaries ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell className="pl-6">
                                                <div className="h-8 w-40 bg-muted rounded" />
                                            </TableCell>
                                            <TableCell>
                                                <div className="h-8 w-24 bg-muted rounded" />
                                            </TableCell>
                                            <TableCell>
                                                <div className="h-8 w-32 bg-muted rounded" />
                                            </TableCell>
                                            <TableCell>
                                                <div className="h-8 w-20 bg-muted rounded" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredSalaries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                                            Aucune fiche de paie enregistrée.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredSalaries.map((s) => (
                                        <TableRow key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors text-sm">
                                            <TableCell className="pl-6">
                                                <div className="font-semibold text-foreground">
                                                    {s.prenom} {s.nom}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="h-4 w-4 text-indigo-500" />
                                                    <span>
                                                        {String(s.mois).padStart(2, "0")}/{s.annee}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] text-muted-foreground line-through">
                                                        {Number(s.salaire_brut ?? 0).toFixed(2).replace(".", ",")} DH
                                                    </span>
                                                    <span className="text-sm font-semibold text-indigo-600">
                                                        {Number(s.salaire_net ?? 0).toFixed(2).replace(".", ",")} DH
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={
                                                        s.statut === "paye"
                                                            ? "inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold gap-1"
                                                            : "inline-flex items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold gap-1"
                                                    }
                                                >
                                                    {s.statut === "paye" ? (
                                                        <>
                                                            <CheckCircle2 className="h-3 w-3" />
                                                            Payé
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock className="h-3 w-3" />
                                                            En attente
                                                        </>
                                                    )}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56">
                                                        {s.statut !== "paye" && (
                                                            <DropdownMenuItem onClick={() => handleValidateSalary(s)} className="cursor-pointer">
                                                                <CheckCircle2 className="h-4 w-4" />
                                                                Valider le paiement
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => handleDownloadFichePaie(s)} className="cursor-pointer">
                                                            <Printer className="h-4 w-4" />
                                                            Imprimer fiche de paie
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleEditSalary(s)} className="cursor-pointer">
                                                            <Edit className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDeleteSalary(s)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                            <Trash2 className="h-4 w-4" />
                                                            Supprimer
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
