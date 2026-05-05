import { useEffect, useRef, useState } from "react";
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
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
    Plus,
    Edit,
    Trash2,
    Search,
    ShieldAlert,
    Store,
    CreditCard,
    TrendingUp,
    TrendingDown,
    Calendar,
    CheckCircle2,
    Clock,
    Printer,
    MoreVertical,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import SignatureCanvas from "react-signature-canvas";
import SousLogo from "@/assets/sous_logo.jpg";



interface Employee {
    id: number;
    nom: string;
    prenom: string;
    salary: number;
    id_point_de_vente: number | null;
}

interface Salary {
    id: number;
    employee_id: number;
    point_de_vente_id: number | null;
    mois: number;
    annee: number;
    salaire_base: number;
    primes: number;
    commission?: number;
    heures_supp: number;
    deductions: number;
    salaire_brut: number;
    cnss: number;
    ir: number;
    salaire_net: number;
    statut: 'paye' | 'en_attente';
    date_paiement: string | null;
    nom: string;
    prenom: string;
    pv_name: string;
}

const MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export default function Salaries() {
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isPrivileged =
        role === "admin" ||
        role === "responsable" ||
        role === "directeur" ||
        role === "superadmin";
    const isAuthorized = isPrivileged || permissions.includes("salaries_view");

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
                        Seuls les administrateurs peuvent gérer les salaires.
                    </p>
                </Card>
            </div>
        );
    }

    const [salaries, setSalaries] = useState<Salary[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [salaryToDelete, setSalaryToDelete] = useState<Salary | null>(null);
    const [editingSalary, setEditingSalary] = useState<Salary | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    const [signatureSalary, setSignatureSalary] = useState<Salary | null>(null);
    const companySignaturePadRef = useRef<SignatureCanvas | null>(null);
    const employeeSignaturePadRef = useRef<SignatureCanvas | null>(null);
    const [isCompanySignatureEmpty, setIsCompanySignatureEmpty] = useState(true);
    const [isEmployeeSignatureEmpty, setIsEmployeeSignatureEmpty] = useState(true);
    const [gestionnaireLogoPath, setGestionnaireLogoPath] = useState<string | null>(null);

    const [signerName, setSignerName] = useState("");
    const [signerTitle, setSignerTitle] = useState("");


    const [formData, setFormData] = useState({
        employee_id: "",
        mois: (new Date().getMonth() + 1).toString(),
        annee: new Date().getFullYear().toString(),
        salaire_base: "0",
        primes: "0",
        commission: "0",
        heures_supp: "0",
        deductions: "0",
        cnss: "0",
        ir: "0",
        statut: "",
        date_paiement: ""
    });

    const token = localStorage.getItem("token");

    const fetchSalaries = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/salaries", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setSalaries(data);
            }
        } catch (error) {
            console.error("Error fetching salaries:", error);
            toast.error("Erreur lors du chargement des salaires");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const response = await fetch("/api/employees", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setEmployees(data);
            }
        } catch (error) {
            console.error("Error fetching employees:", error);
        }
    };

    useEffect(() => {
        fetchSalaries();
        fetchEmployees();
    }, []);

    useEffect(() => {
        const fetchGestionnaireLogo = async () => {
            if (!token) return;
            try {
                const response = await fetch("/api/gestionnaires", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!response.ok) return;
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    setGestionnaireLogoPath(data[0]?.logo || null);
                }
            } catch {
                // ignore logo fetch errors, fallback logo is used in PDFs
            }
        };

        fetchGestionnaireLogo();
    }, [token]);

    useEffect(() => {
        if (editingSalary) {
            setFormData({
                employee_id: editingSalary.employee_id.toString(),
                mois: editingSalary.mois.toString(),
                annee: editingSalary.annee.toString(),
                salaire_base: editingSalary.salaire_base.toString(),
                primes: editingSalary.primes.toString(),
                commission: (editingSalary as Salary & { commission?: number }).commission?.toString() ?? "0",
                heures_supp: editingSalary.heures_supp.toString(),
                deductions: editingSalary.deductions.toString(),
                cnss: editingSalary.cnss.toString(),
                ir: editingSalary.ir.toString(),
                statut: editingSalary.statut || "en_attente",
                date_paiement: editingSalary.date_paiement ? new Date(editingSalary.date_paiement).toISOString().split('T')[0] : ""
            });
            setIsFormVisible(true);
        }
    }, [editingSalary]);

    const handleEmployeeChange = (empId: string) => {
        const emp = employees.find(e => e.id.toString() === empId);
        setFormData(prev => ({
            ...prev,
            employee_id: empId,
            salaire_base: emp?.salary.toString() || "0"
        }));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const calculateBrut = () => {
        const base = Number(String(formData.salaire_base || "0").replace(",", ".")) || 0;
        const primes = Number(String(formData.primes || "0").replace(",", ".")) || 0;
        const commission = Number(String(formData.commission || "0").replace(",", ".")) || 0;
        const hs = Number(String(formData.heures_supp || "0").replace(",", ".")) || 0;
        const deduc = Number(String(formData.deductions || "0").replace(",", ".")) || 0;
        return base + primes + commission + hs - deduc;
    };

    const calculateNet = () => {
        const brut = calculateBrut();
        const cnss = Number(String(formData.cnss || "0").replace(",", ".")) || 0;
        const ir = Number(String(formData.ir || "0").replace(",", ".")) || 0;
        return brut - cnss - ir;
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!formData.employee_id) errors.employee_id = "L'employé est requis";
        if (!formData.mois) errors.mois = "Le mois est requis";
        if (!formData.annee) errors.annee = "L'année est requise";
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const method = editingSalary ? "PUT" : "POST";
            const url = editingSalary ? `/api/salaries/${editingSalary.id}` : "/api/salaries";

            const selectedEmp = employees.find(emp => emp.id.toString() === formData.employee_id);

            const payload = {
                ...formData,
                employee_id: parseInt(formData.employee_id),
                point_de_vente_id: selectedEmp?.id_point_de_vente || null,
                mois: parseInt(formData.mois),
                annee: parseInt(formData.annee),
                salaire_base: parseFloat(formData.salaire_base),
                primes: parseFloat(formData.primes),
                commission: parseFloat(formData.commission || "0"),
                heures_supp: parseFloat(formData.heures_supp),
                deductions: parseFloat(formData.deductions),
                cnss: parseFloat(formData.cnss),
                ir: parseFloat(formData.ir)
            };

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                toast.success(editingSalary ? "Salaire mis à jour !" : "Fiche de paie créée !");
                resetForm();
                fetchSalaries();
            } else {
                toast.error("Une erreur est survenue");
            }
        } catch {
            toast.error("Erreur de connexion");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({
            employee_id: "",
            mois: (new Date().getMonth() + 1).toString(),
            annee: new Date().getFullYear().toString(),
            salaire_base: "0",
            primes: "0",
            commission: "0",
            heures_supp: "0",
            deductions: "0",
            cnss: "0",
            ir: "0",
            statut: "en_attente",
            date_paiement: ""
        });
        setEditingSalary(null);
        setFormErrors({});
        setIsFormVisible(false);
    };

    const handleDelete = (salary: Salary) => {
        setSalaryToDelete(salary);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!salaryToDelete) return;
        try {
            const response = await fetch(`/api/salaries/${salaryToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Salaire supprimé");
                fetchSalaries();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setDeleteDialogOpen(false);
            setSalaryToDelete(null);
        }
    };

    const handleValidate = async (salary: Salary) => {
        try {
            const response = await fetch(`/api/salaries/${salary.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    ...salary,
                    statut: "paye",
                    date_paiement: new Date().toISOString().split('T')[0]
                }),
            });
            if (response.ok) {
                toast.success(`Salaire de ${salary.prenom} ${salary.nom} validé !`);
                fetchSalaries();
            } else {
                toast.error("Erreur lors de la validation");
            }
        } catch {
            toast.error("Erreur serveur");
        }
    };

    const filteredSalaries = salaries.filter(s =>
        `${s.nom} ${s.prenom}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        MONTHS[s.mois - 1].toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.annee.toString().includes(searchTerm)
    );

    const totalPaid = salaries.filter(s => s.statut === 'paye').reduce((acc, s) => acc + Number(s.salaire_net), 0);
    const totalPending = salaries.filter(s => s.statut === 'en_attente').reduce((acc, s) => acc + Number(s.salaire_net), 0);
    const totalBrut = salaries.reduce((acc, s) => acc + Number(s.salaire_brut), 0);
    const totalNet = totalPaid + totalPending;

    const loadImgToBase64 = (url: string) => new Promise<string | null>((res) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) { res(null); return; }
            ctx.drawImage(img, 0, 0);
            res(canvas.toDataURL("image/png", 0.7));
        };
        img.onerror = () => res(null);
    });

    const handlePrintAttestation = async (
        salary: Salary,
        companySignatureDataUrl?: string,
        employeeSignatureDataUrl?: string,
        signerNameText?: string,
        signerTitleText?: string
    ) => {
        try {
            const doc = new jsPDF("p", "mm", "a4");
            const margin = 20;

            // Logo
            try {
                const logoSource = gestionnaireLogoPath
                    ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${gestionnaireLogoPath}`
                    : SousLogo;
                const logoData = await loadImgToBase64(logoSource);
                if (logoData) {
                    doc.addImage(logoData, "PNG", margin, 10, 25, 25);
                }
            } catch (err) {
                console.error("Logo loading error:", err);
            }


            // Header
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.text("ATTESTATION DE TRAVAIL", 105, margin, { align: "center" });

            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            const today = new Date().toLocaleDateString("fr-FR");
            doc.text(`Fait à ${salary.pv_name || "Gestion ERP"}, le ${today}`, 105, margin + 10, { align: "center" });

            // Corps
            const yStart = margin + 30;
            const fullName = `${salary.prenom} ${salary.nom}`;
            const periode = `${MONTHS[salary.mois - 1]} ${salary.annee}`;

            const paragraphs = [
                `Je soussigné(e), représentant légal de la société Gestion ERP, atteste que :`,
                ``,
                `${fullName}, perçoit un salaire net de ${Number(salary.salaire_net || 0).toFixed(2).replace(".", ",")} DH pour la période de ${periode}.`,
                `L'intéressé(e) travaille au sein de notre établissement ${salary.pv_name || ""} en qualité de salarié(e).`,
                ``,
                `La présente attestation est délivrée à la demande de l'intéressé(e) pour servir et valoir ce que de droit.`
            ];

            let y = yStart;
            doc.setFontSize(12);
            paragraphs.forEach((line) => {
                doc.text(line, margin, y);
                y += 8;
            });

            // Signatures
            y += 15;
            const midX = 105;

            // Bloc gauche : salarié
            doc.setFont("helvetica", "bold");
            doc.text("Signature du salarié", margin, y);
            if (employeeSignatureDataUrl) {
                const imgWidth = 40;
                const imgHeight = 20;
                const xPos = margin;
                const yPos = y + 5;
                doc.addImage(employeeSignatureDataUrl, "PNG", xPos, yPos, imgWidth, imgHeight);
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.text(`${salary.prenom} ${salary.nom}`, margin, y + 30);

            // Bloc droite : société
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("Signature et cachet", midX + 55, y);
            if (companySignatureDataUrl) {
                const imgWidth = 40;
                const imgHeight = 20;
                const xPos = midX + 55 - imgWidth / 2;
                const yPos = y + 5;
                doc.addImage(companySignatureDataUrl, "PNG", xPos, yPos, imgWidth, imgHeight);
            }

            // Nom & poste du signataire sous la signature (Société)
            if (signerNameText || signerTitleText) {
                doc.setFontSize(11);
                doc.setFont("helvetica", "normal");
                const textY = y + 30;
                if (signerNameText) {
                    doc.text(signerNameText, midX + 55, textY, { align: "center" });
                }
                if (signerTitleText) {
                    doc.text(signerTitleText, midX + 55, textY + 6, { align: "center" });
                }
            }



            doc.save(`Attestation_travail_${salary.prenom}_${salary.nom}.pdf`);
        } catch (error) {
            console.error("Error generating attestation:", error);
            toast.error("Erreur lors de la génération de l'attestation");
        }
    };

    const openSignatureDialog = (salary: Salary) => {
        setSignatureSalary(salary);
        setIsCompanySignatureEmpty(true);
        setIsEmployeeSignatureEmpty(true);
        setSignerName("");
        setSignerTitle("");
        setTimeout(() => {
            companySignaturePadRef.current?.clear();
            employeeSignaturePadRef.current?.clear();
        }, 100);
        setSignatureDialogOpen(true);
    };

    const confirmSignatureAndPrint = async () => {
        if (!signatureSalary) return;
        if (!companySignaturePadRef.current || companySignaturePadRef.current.isEmpty()) return;
        if (!employeeSignaturePadRef.current || employeeSignaturePadRef.current.isEmpty()) return;
        if (!signerName.trim() || !signerTitle.trim()) return;

        const companyCanvas: HTMLCanvasElement = (companySignaturePadRef.current as any).getCanvas
            ? (companySignaturePadRef.current as any).getCanvas()
            : (companySignaturePadRef.current as any)._canvas;
        const employeeCanvas: HTMLCanvasElement = (employeeSignaturePadRef.current as any).getCanvas
            ? (employeeSignaturePadRef.current as any).getCanvas()
            : (employeeSignaturePadRef.current as any)._canvas;

        const companyDataUrl = companyCanvas.toDataURL("image/png");
        const employeeDataUrl = employeeCanvas.toDataURL("image/png");

        await handlePrintAttestation(
            signatureSalary,
            companyDataUrl,
            employeeDataUrl,
            signerName.trim(),
            signerTitle.trim()
        );
        setSignatureDialogOpen(false);
        setSignatureSalary(null);
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <DollarSign className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Gestion des Salaires
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Édition des fiches de paie et suivi des règlements</p>
                </div>
                <Button
                    onClick={() => { editingSalary ? resetForm() : setIsFormVisible(!isFormVisible) }}
                    className={cn("shadow-sm transition-all cursor-pointer", isFormVisible ? "bg-muted text-foreground hover:bg-accent" : "bg-indigo-600 text-white hover:bg-indigo-700")}
                >
                    {isFormVisible ? "Annuler" : <><Plus className="mr-2 h-4 w-4" /> Nouveau Salaire</>}
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><CreditCard className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Masse Salariale Brut</p>
                        <p className="text-xl font-bold text-foreground">{totalBrut.toFixed(2).replace(".", ",")} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400"><TrendingUp className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Masse Salariale Net</p>
                        <p className="text-xl font-bold text-foreground">{totalNet.toFixed(2).replace(".", ",")} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Payé (Net)</p>
                        <p className="text-xl font-bold text-foreground">{totalPaid.toFixed(2).replace(".", ",")} DH</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400"><Clock className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">En attente (Net)</p>
                        <p className="text-xl font-bold text-foreground">{totalPending.toFixed(2).replace(".", ",")} DH</p>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Form Column */}
                {isFormVisible && (
                    <Card className="lg:col-span-4 border border-border shadow-xl bg-card sticky top-6 animate-in slide-in-from-left duration-300 z-10">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                {editingSalary ? <Edit className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : <Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
                                {editingSalary ? "Modifier Salaire" : "Nouvelle Fiche de Paie"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label>Employé *</Label>
                                    <Select onValueChange={handleEmployeeChange} value={formData.employee_id}>
                                        <SelectTrigger className={cn(formErrors.employee_id && "border-red-500")}>
                                            <SelectValue placeholder="Sélectionner un employé" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {employees.map((emp) => (
                                                <SelectItem key={emp.id} value={emp.id.toString()}>{emp.prenom} {emp.nom}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Mois</Label>
                                        <Select onValueChange={(v) => handleSelectChange("mois", v)} value={formData.mois}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {MONTHS.map((m, i) => (
                                                    <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Année</Label>
                                        <Input name="annee" type="number" value={formData.annee} onChange={handleInputChange} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Salaire de base</Label>
                                        <Input name="salaire_base" type="number" value={formData.salaire_base} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Primes</Label>
                                        <Input name="primes" type="number" value={formData.primes} onChange={handleInputChange} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Commission</Label>
                                        <Input name="commission" type="number" value={formData.commission || "0"} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Heures Supp.</Label>
                                        <Input name="heures_supp" type="number" value={formData.heures_supp} onChange={handleInputChange} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Déductions</Label>
                                        <Input name="deductions" type="number" value={formData.deductions} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-1.5" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>CNSS</Label>
                                        <Input name="cnss" type="number" value={formData.cnss} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>IR (Impôt)</Label>
                                        <Input name="ir" type="number" value={formData.ir} onChange={handleInputChange} />
                                    </div>
                                </div>

                                <div className="bg-muted/50 p-4 rounded-xl space-y-2 border border-border/50">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider">Salaire Brut</span>
                                        <span className="font-bold text-foreground">{calculateBrut().toLocaleString()} DH</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-border">
                                        <span className="text-xs uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">Salaire Net</span>
                                        <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{calculateNet().toLocaleString()} DH</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Statut</Label>
                                        <Select onValueChange={(v) => handleSelectChange("statut", v)} value={formData.statut}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="en_attente">En attente</SelectItem>
                                                <SelectItem value="paye">Payé</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Date de paiement</Label>
                                        <Input name="date_paiement" type="date" value={formData.date_paiement} onChange={handleInputChange} />
                                    </div>
                                </div>

                                <Button disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
                                    {isSubmitting ? "Traitement..." : editingSalary ? "Mettre à jour" : "Générer Bulletin"}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* List Column */}
                <div className={cn("space-y-4", isFormVisible ? "lg:col-span-8" : "lg:col-span-12")}>
                    <div className="bg-card p-3 rounded-xl border border-border shadow-sm flex justify-between items-center backdrop-blur-sm">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher par employé, mois..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 border-transparent bg-muted focus:bg-card focus:border-indigo-500 transition-all border"
                            />
                        </div>
                    </div>

                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 border-b border-border">
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 pl-6">Employé</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Période</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Brut / Net</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Primes / Heures</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Statut</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell className="pl-6"><div className="h-10 w-40 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-10 w-24 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-10 w-32 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-10 w-24 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-10 w-16 bg-muted rounded" /></TableCell>
                                            <TableCell className="pr-6"><div className="h-10 w-16 bg-muted rounded ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredSalaries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-20">
                                            <div className="flex flex-col items-center text-muted">
                                                <DollarSign className="h-12 w-12 mb-3 stroke-1" />
                                                <p className="font-medium">Aucun salaire enregistré</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredSalaries.map((salary) => (
                                        <TableRow key={salary.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0">
                                            <TableCell className="py-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                                                        {salary.nom?.charAt(0)}{salary.prenom?.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-foreground text-sm">{salary.prenom} {salary.nom}</p>
                                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                            <Store className="h-3 w-3" />
                                                            {salary.pv_name || 'Non assigné'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                                    <Calendar className="h-4 w-4 text-indigo-500" />
                                                    {MONTHS[salary.mois - 1]} {salary.annee}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    <div className="text-xs text-muted-foreground line-through opacity-50">
                                                        {Number(salary.salaire_brut || 0).toFixed(2).replace(".", ",")} DH
                                                    </div>
                                                    <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                                                        {Number(salary.salaire_net || 0).toFixed(2).replace(".", ",")} DH
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                                                        +{salary.primes + (salary.heures_supp || 0)} Primes/HS
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                                        <TrendingDown className="h-3 w-3 text-red-500" />
                                                        -{salary.deductions + salary.cnss + salary.ir} Déduc.
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-xs gap-1",
                                                    salary.statut === 'paye' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                )}>
                                                    {salary.statut === 'paye' ? <><CheckCircle2 className="h-3 w-3" /> Payé</> : <><Clock className="h-3 w-3" /> En attente</>}
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
                                                        {salary.statut !== 'paye' && (
                                                            <DropdownMenuItem onClick={() => handleValidate(salary)} className="cursor-pointer">
                                                                <CheckCircle2 className="h-4 w-4" />
                                                                Valider le paiement
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => openSignatureDialog(salary)} className="cursor-pointer">
                                                            <Printer className="h-4 w-4" />
                                                            Imprimer attestation
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setEditingSalary(salary)} className="cursor-pointer">
                                                            <Edit className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDelete(salary)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
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
                </div>
            </div>

            {/* Delete Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Supprimer cette fiche ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Cette action supprimera définitivement le bulletin de paie de <span className="font-bold text-foreground">{salaryToDelete?.prenom} {salaryToDelete?.nom}</span> pour {salaryToDelete && MONTHS[salaryToDelete.mois - 1]} {salaryToDelete?.annee}.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Supprimer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Signature Dialog */}
            <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Signatures de l'attestation</DialogTitle>
                        <DialogDescription>
                            Signez numériquement pour le salarié (à gauche) et pour la société (à droite).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-3 space-y-4">
                        <div className="space-y-2">
                            <Label>Signature du salarié</Label>
                            <div className="border border-border rounded-xl bg-background overflow-hidden">
                                <SignatureCanvas
                                    ref={employeeSignaturePadRef}
                                    penColor="#111827"
                                    onEnd={() => setIsEmployeeSignatureEmpty(false)}
                                    canvasProps={{
                                        width: 480,
                                        height: 140,
                                        className: "w-full h-32 bg-white"
                                    }}
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    className="text-[11px] underline text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                        employeeSignaturePadRef.current?.clear();
                                        setIsEmployeeSignatureEmpty(true);
                                    }}
                                >
                                    Effacer signature salarié
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Signature de la société</Label>
                            <div className="border border-border rounded-xl bg-background overflow-hidden">
                                <SignatureCanvas
                                    ref={companySignaturePadRef}
                                    penColor="#111827"
                                    onEnd={() => setIsCompanySignatureEmpty(false)}
                                    canvasProps={{
                                        width: 480,
                                        height: 140,
                                        className: "w-full h-32 bg-white"
                                    }}
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    className="text-[11px] underline text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                        companySignaturePadRef.current?.clear();
                                        setIsCompanySignatureEmpty(true);
                                    }}
                                >
                                    Effacer signature société
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                            <div className="space-y-1">
                                <Label htmlFor="signerName">Nom du signataire (Société)</Label>
                                <Input
                                    id="signerName"
                                    placeholder="Ex: Mohamed Dupont"
                                    value={signerName}
                                    onChange={(e) => setSignerName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="signerTitle">Poste / Fonction</Label>
                                <Input
                                    id="signerTitle"
                                    placeholder="Ex: Directeur Général"
                                    value={signerTitle}
                                    onChange={(e) => setSignerTitle(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setSignatureDialogOpen(false);
                                setSignatureSalary(null);
                            }}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={confirmSignatureAndPrint}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            disabled={isCompanySignatureEmpty || isEmployeeSignatureEmpty || !signerName.trim() || !signerTitle.trim()}
                        >
                            Générer l&apos;attestation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
