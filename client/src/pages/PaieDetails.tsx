import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import { toast } from "sonner";
import {
    DollarSign,
    Printer,
    TrendingUp,
    User,
    ArrowLeft,
    CheckCircle2,
    Clock,
    Save,
} from "lucide-react";
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
    salaire_base: number;
    salaire_brut: number;
    salaire_net: number;
    primes: number;
    commission: number;
    heures_supp: number;
    deductions: number;
    cnss: number;
    ir: number;
    statut: "paye" | "en_attente" | null;
    date_paiement: string | null;
    prenom: string;
    nom: string;
    pv_name?: string;
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

export default function PaieDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [salary, setSalary] = useState<Salary | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [loadingVolume, setLoadingVolume] = useState(false);
    const [volumeTtc, setVolumeTtc] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        employee_id: "",
        mois: "",
        annee: "",
        salaire_base: "0",
        commission: "0",
        taux_commission_pct: "5",
        primes: "0",
        heures_supp: "0",
        deductions: "0",
        cnss: "0",
        ir: "0",
        statut: "en_attente",
        date_paiement: "",
    });

    const fetchSalary = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/salaries/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSalary(data);
                setFormData({
                    employee_id: data.employee_id?.toString() || "",
                    mois: data.mois?.toString() || "",
                    annee: data.annee?.toString() || "",
                    salaire_base: data.salaire_base?.toString() || "0",
                    commission: (data.commission ?? 0).toString(),
                    taux_commission_pct: "5",
                    primes: (data.primes ?? 0).toString(),
                    heures_supp: (data.heures_supp ?? 0).toString(),
                    deductions: (data.deductions ?? 0).toString(),
                    cnss: (data.cnss ?? 0).toString(),
                    ir: (data.ir ?? 0).toString(),
                    statut: data.statut || "en_attente",
                    date_paiement: data.date_paiement
                        ? new Date(data.date_paiement).toISOString().split("T")[0]
                        : "",
                });
            } else {
                toast.error("Fiche de paie introuvable");
                navigate("/dashboard/paiement");
            }
        } catch {
            toast.error("Erreur chargement fiche de paie");
        } finally {
            setIsLoading(false);
        }
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
        }
    };

    useEffect(() => {
        fetchSalary();
        fetchEmployees();
    }, [id]);

    const selectedEmployee = employees.find(
        (e) => e.id.toString() === formData.employee_id
    );
    const employeeFullName = (
        selectedEmployee
            ? `${selectedEmployee.prenom ?? ""} ${selectedEmployee.nom ?? ""}`
            : `${salary?.prenom ?? ""} ${salary?.nom ?? ""}`
    ).trim() || "Employé";

    const fetchVolumeVente = async () => {
        if (!formData.employee_id || !formData.mois || !formData.annee) return;
        setLoadingVolume(true);
        setVolumeTtc(null);
        try {
            const params = new URLSearchParams({
                employee_id: formData.employee_id,
                mois: formData.mois,
                annee: formData.annee,
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
        } finally {
            setLoadingVolume(false);
        }
    };

    useEffect(() => {
        if (formData.employee_id && formData.mois && formData.annee) {
            fetchVolumeVente();
        }
    }, [formData.employee_id, formData.mois, formData.annee]);

    const applyTauxCommission = () => {
        const pct = parseFloat(formData.taux_commission_pct || "0") / 100;
        const vol = volumeTtc ?? 0;
        const commission = Math.round(vol * pct * 100) / 100;
        setFormData((prev) => ({ ...prev, commission: String(commission) }));
        toast.success(
            `Commission = ${commission.toFixed(2).replace(".", ",")} DH (${formData.taux_commission_pct}% du volume)`
        );
    };

    const totalBrut =
        parseFloat(formData.salaire_base || "0") +
        parseFloat(formData.primes || "0") +
        parseFloat(formData.commission || "0") +
        parseFloat(formData.heures_supp || "0") -
        parseFloat(formData.deductions || "0");

    const totalNet =
        totalBrut -
        parseFloat(formData.cnss || "0") -
        parseFloat(formData.ir || "0");

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.salaire_base || parseFloat(formData.salaire_base) <= 0) {
            toast.error("Saisissez le salaire de base");
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                employee_id: parseInt(formData.employee_id),
                point_de_vente_id: selectedEmployee?.id_point_de_vente || null,
                mois: parseInt(formData.mois),
                annee: parseInt(formData.annee),
                salaire_base: parseFloat(formData.salaire_base),
                primes: parseFloat(formData.primes || "0"),
                commission: parseFloat(formData.commission || "0"),
                heures_supp: parseFloat(formData.heures_supp || "0"),
                deductions: parseFloat(formData.deductions || "0"),
                cnss: parseFloat(formData.cnss || "0"),
                ir: parseFloat(formData.ir || "0"),
                statut: formData.statut,
                date_paiement: formData.date_paiement || null,
            };
            const res = await fetch(`/api/salaries/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                toast.success("Fiche de paie mise à jour");
                fetchSalary();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || "Erreur enregistrement");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setIsSaving(false);
        }
    };

    const handleValidate = async () => {
        setIsSaving(true);
        try {
            const payload = {
                ...salary,
                statut: "paye",
                date_paiement: new Date().toISOString().split("T")[0],
            };
            const res = await fetch(`/api/salaries/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                toast.success("Salaire validé et marqué comme payé !");
                fetchSalary();
            } else {
                toast.error("Erreur lors de la validation");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setIsSaving(false);
        }
    };

    const handlePrintFichePaie = async () => {
        if (!salary) return;
        const nomComplet = employeeFullName;
        const periode = `${MONTHS[parseInt(formData.mois) - 1]} ${formData.annee}`;
        const salaireBase = parseFloat(formData.salaire_base || "0");
        const commission = parseFloat(formData.commission || "0");

        try {
            const doc = new jsPDF("p", "mm", "a4");
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;

            const logoImgData = await loadImgToBase64(AurevoxLogo);
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
            doc.text("Gestion de Paie - Aurevox", pageWidth / 2, y, { align: "center" });
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
            doc.text(
                `Matricule interne: EMP-${String(selectedEmployee?.id ?? salary.employee_id ?? 0).padStart(4, "0")}`,
                25,
                y + 24
            );
            doc.text(
                `Modèle généré le ${new Date().toLocaleDateString("fr-FR")}`,
                pageWidth / 2 + 5,
                y + 24
            );

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
                    halign: "left",
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
            doc.text(
                `${totalBrut.toFixed(2).replace(".", ",")} DH`,
                pageWidth - 25,
                y + 10,
                { align: "right" }
            );

            const footerY = 280;
            doc.setDrawColor(226, 232, 240);
            doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Pour faire valoir ce que de droit xxxxxxxxxxx.", pageWidth / 2, footerY, {
                align: "center",
            });

            doc.save(
                `Fiche_paie_${salary.prenom}_${salary.nom}_${formData.mois}_${formData.annee}.pdf`
            );
            toast.success("Fiche de paie imprimée");
        } catch (err) {
            console.error(err);
            toast.error("Erreur génération PDF");
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6 pb-20 animate-pulse">
                <div className="h-8 w-64 bg-muted rounded" />
                <div className="h-[500px] w-full bg-muted rounded-2xl" />
            </div>
        );
    }

    if (!salary) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <p className="text-muted-foreground">Fiche de paie introuvable.</p>
            </div>
        );
    }

    const isPending = salary.statut !== "paye";

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate("/dashboard/paiement")}
                        className="h-9 w-9 rounded-lg"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <DollarSign className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                            Éditer Fiche de Paie
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {employeeFullName} — {MONTHS[salary.mois - 1]} {salary.annee}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Statut badge */}
                    <span
                        className={
                            salary.statut === "paye"
                                ? "inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-1 text-xs font-bold gap-1.5"
                                : "inline-flex items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 text-xs font-bold gap-1.5"
                        }
                    >
                        {salary.statut === "paye" ? (
                            <>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Payé
                            </>
                        ) : (
                            <>
                                <Clock className="h-3.5 w-3.5" /> En attente
                            </>
                        )}
                    </span>
                    {/* Validate button */}
                    {isPending && (
                        <Button
                            onClick={handleValidate}
                            disabled={isSaving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            Valider le paiement
                        </Button>
                    )}
                </div>
            </div>

            {/* Edit Form */}
            <Card className="border border-border shadow-lg bg-card">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5 text-indigo-600" />
                        Détails de la fiche de paie
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSave} className="space-y-6">
                        {/* Employé & Période (read-only) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label>Employé</Label>
                                <Input
                                    readOnly
                                    value={employeeFullName}
                                    className="bg-muted cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Mois</Label>
                                <Select
                                    value={formData.mois}
                                    onValueChange={(v) =>
                                        setFormData((prev) => ({ ...prev, mois: v }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MONTHS.map((m, i) => (
                                            <SelectItem key={i} value={String(i + 1)}>
                                                {m}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Année</Label>
                                <Input
                                    type="number"
                                    value={formData.annee}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            annee: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>

                        {/* Volume de vente */}
                        <div className="p-4 rounded-xl bg-muted/50 border border-border">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                Volume de vente (période)
                            </p>
                            {loadingVolume ? (
                                <p className="text-sm text-muted-foreground">Chargement...</p>
                            ) : volumeTtc !== null ? (
                                <p className="text-xl font-bold text-foreground flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                                    {volumeTtc.toFixed(2).replace(".", ",")} DH TTC
                                </p>
                            ) : null}
                            <p className="text-xs text-muted-foreground mt-1">
                                Basé sur les factures du commercial.
                            </p>
                        </div>

                        {/* Salaire de base & Commission */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Salaire de base (DH) *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.salaire_base}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            salaire_base: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Commission (DH)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.commission}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                commission: e.target.value,
                                            }))
                                        }
                                        className="flex-1"
                                    />
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            max="100"
                                            value={formData.taux_commission_pct}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    taux_commission_pct: e.target.value,
                                                }))
                                            }
                                            className="w-14 text-center"
                                        />
                                        <span className="text-xs text-muted-foreground">%</span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={applyTauxCommission}
                                        >
                                            Appliquer
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Primes, Heures Supp, Déductions */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label>Primes (DH)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.primes}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            primes: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Heures Supp. (DH)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.heures_supp}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            heures_supp: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Déductions (DH)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.deductions}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            deductions: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>

                        {/* CNSS & IR */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>CNSS (DH)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.cnss}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            cnss: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>IR - Impôt (DH)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.ir}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            ir: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>

                        {/* Totals */}
                        <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-foreground">
                                    Total brut
                                </span>
                                <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                                    {totalBrut.toFixed(2).replace(".", ",")} DH
                                </span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-indigo-200 dark:border-indigo-700">
                                <span className="font-bold text-foreground">
                                    Total net
                                </span>
                                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                                    {totalNet.toFixed(2).replace(".", ",")} DH
                                </span>
                            </div>
                        </div>

                        {/* Statut & Date paiement */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Statut</Label>
                                <Select
                                    value={formData.statut}
                                    onValueChange={(v) =>
                                        setFormData((prev) => ({ ...prev, statut: v }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="en_attente">En attente</SelectItem>
                                        <SelectItem value="paye">Payé</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Date de paiement</Label>
                                <Input
                                    type="date"
                                    value={formData.date_paiement}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            date_paiement: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-3 pt-2">
                            <Button
                                type="submit"
                                disabled={isSaving}
                                className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                            >
                                <Save className="h-4 w-4" />
                                {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handlePrintFichePaie}
                                className="gap-2"
                            >
                                <Printer className="h-4 w-4" />
                                Imprimer la fiche de paie
                            </Button>
                            {isPending && (
                                <Button
                                    type="button"
                                    onClick={handleValidate}
                                    disabled={isSaving}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Valider le paiement
                                </Button>
                            )}
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
