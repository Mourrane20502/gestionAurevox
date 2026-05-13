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
    Calendar,
    Plus,
    Edit,
    Trash2,
    Search,
    ShieldAlert,
    Clock,
    CheckCircle2,
    XCircle,
    User,
    Store,
    BookOpen,
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
import AurevoxLogo from "@/assets/aurevox_logo.png";


interface Employee {
    id: number;
    nom: string;
    prenom: string;
    id_point_de_vente: number | null;
}

interface Conge {
    id: number;
    employee_id: number;
    point_de_vente_id: number | null;
    type: string;
    date_debut: string;
    date_fin: string;
    nombre_jours: number;
    motif: string;
    status: 'en_attente' | 'approuve' | 'refuse';
    prenom: string;
    nom: string;
    pv_name: string;
}

export default function Conges() {
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAdmin = role === "admin";
    const isAuthorized = isAdmin || permissions.includes("conges_view");

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
                        Seuls les administrateurs peuvent gérer les congés.
                    </p>
                </Card>
            </div>
        );
    }

    const [conges, setConges] = useState<Conge[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [congeToDelete, setCongeToDelete] = useState<Conge | null>(null);
    const [editingConge, setEditingConge] = useState<Conge | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    const [signatureConge, setSignatureConge] = useState<Conge | null>(null);
    const companySignaturePadRef = useRef<SignatureCanvas | null>(null);
    const employeeSignaturePadRef = useRef<SignatureCanvas | null>(null);
    const [isCompanySignatureEmpty, setIsCompanySignatureEmpty] = useState(true);
    const [isEmployeeSignatureEmpty, setIsEmployeeSignatureEmpty] = useState(true);
    const [signerName, setSignerName] = useState("");
    const [signerTitle, setSignerTitle] = useState("");
    const [gestionnaireLogoPath, setGestionnaireLogoPath] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        employee_id: "",
        type: "paye",
        date_debut: new Date().toISOString().split('T')[0],
        date_fin: new Date().toISOString().split('T')[0],
        nombre_jours: "1",
        motif: "",
        status: "en_attente"
    });

    const token = localStorage.getItem("token");

    const fetchConges = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/conges", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setConges(data);
            }
        } catch (error) {
            console.error("Error fetching conges:", error);
            toast.error("Erreur lors du chargement des congés");
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
        fetchConges();
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
        if (editingConge) {
            setFormData({
                employee_id: editingConge.employee_id.toString(),
                type: editingConge.type,
                date_debut: editingConge.date_debut ? new Date(editingConge.date_debut).toISOString().split('T')[0] : "",
                date_fin: editingConge.date_fin ? new Date(editingConge.date_fin).toISOString().split('T')[0] : "",
                nombre_jours: editingConge.nombre_jours.toString(),
                motif: editingConge.motif || "",
                status: editingConge.status
            });
            setIsFormVisible(true);
        }
    }, [editingConge]);

    useEffect(() => {
        if (formData.date_debut && formData.date_fin) {
            const start = new Date(formData.date_debut);
            const end = new Date(formData.date_fin);
            const diffTime = end.getTime() - start.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days

            setFormData(prev => ({
                ...prev,
                nombre_jours: diffDays > 0 ? diffDays.toString() : "0"
            }));
        }
    }, [formData.date_debut, formData.date_fin]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!formData.employee_id) errors.employee_id = "L'employé est requis";
        if (!formData.date_debut) errors.date_debut = "Date de début requise";
        if (!formData.date_fin) errors.date_fin = "Date de fin requise";
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const method = editingConge ? "PUT" : "POST";
            const url = editingConge ? `/api/conges/${editingConge.id}` : "/api/conges";

            const selectedEmp = employees.find(emp => emp.id.toString() === formData.employee_id);

            const payload = {
                ...formData,
                employee_id: parseInt(formData.employee_id),
                point_de_vente_id: selectedEmp?.id_point_de_vente || null,
                nombre_jours: parseInt(formData.nombre_jours)
            };

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                toast.success(editingConge ? "Congé mis à jour !" : "Congé ajouté !");
                resetForm();
                fetchConges();
            } else {
                toast.error("Une erreur est survenue");
            }
        } catch {
            toast.error("Erreur de connexion");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApprove = async (id: number) => {
        try {
            const response = await fetch(`/api/conges/${id}/approve`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Congé approuvé !");
                fetchConges();
            }
        } catch {
            toast.error("Erreur serveur");
        }
    };

    const handleRefuse = async (id: number) => {
        try {
            const response = await fetch(`/api/conges/${id}/refuse`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Congé refusé !");
                fetchConges();
            }
        } catch {
            toast.error("Erreur serveur");
        }
    };

    const resetForm = () => {
        setFormData({
            employee_id: "",
            type: "paye",
            date_debut: new Date().toISOString().split('T')[0],
            date_fin: new Date().toISOString().split('T')[0],
            nombre_jours: "1",
            motif: "",
            status: "en_attente"
        });
        setEditingConge(null);
        setFormErrors({});
        setIsFormVisible(false);
    };

    const handleDelete = (conge: Conge) => {
        setCongeToDelete(conge);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!congeToDelete) return;
        try {
            const response = await fetch(`/api/conges/${congeToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Congé supprimé");
                fetchConges();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setDeleteDialogOpen(false);
            setCongeToDelete(null);
        }
    };

    const openSignatureDialog = (conge: Conge) => {
        setSignatureConge(conge);
        setIsCompanySignatureEmpty(true);
        setIsEmployeeSignatureEmpty(true);
        setSignerName("");
        setSignerTitle("");
        companySignaturePadRef.current?.clear();
        employeeSignaturePadRef.current?.clear();
        setSignatureDialogOpen(true);
    };

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

    const handlePrintDemandeConge = async (
        conge: Conge,
        companySignatureDataUrl: string,
        employeeSignatureDataUrl: string,
        signerNameText: string,
        signerTitleText: string
    ) => {
        try {
            const doc = new jsPDF("p", "mm", "a4");
            const margin = 20;

            // Logo
            try {
                const logoSource = gestionnaireLogoPath
                    ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${gestionnaireLogoPath}`
                    : AurevoxLogo;
                const logoData = await loadImgToBase64(logoSource);
                if (logoData) {
                    doc.addImage(logoData, "PNG", margin, 10, 25, 25);
                }
            } catch (err) {
                console.error("Logo loading error:", err);
            }

            // Titre
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.text("DEMANDE DE CONGÉ", 105, margin, { align: "center" });

            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            const today = new Date().toLocaleDateString("fr-FR");
            doc.text(`Fait le ${today}`, 105, margin + 10, { align: "center" });

            const fullName = `${conge.prenom} ${conge.nom}`;
            const periode = `du ${new Date(conge.date_debut).toLocaleDateString("fr-FR")} au ${new Date(conge.date_fin).toLocaleDateString("fr-FR")}`;

            const paragraphs = [
                "",
                `Je soussigné(e) ${fullName}, employé(e) de la société AUREVOX,`,
                `affecté(e) à l'établissement ${conge.pv_name || "Aurevox"}, sollicite un congé :`,
                ``,
                `- Type de congé : ${conge.type}`,
                `- Période : ${periode}`,
                `- Nombre de jours : ${conge.nombre_jours}`,
                `- Motif : ${conge.motif || "N/A"}`,
                ``,
                `Je m'engage à assurer une bonne passation de mes dossiers avant mon départ.`,
                ``,
                `Signature du salarié et visa de la société ci-dessous.`
            ];

            let y = margin + 30;
            doc.setFontSize(10);
            paragraphs.forEach((line) => {
                doc.text(line, margin, y);
                y += 8;
            });

            // Zone signatures
            y += 10;
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
            } else {
                doc.line(margin, y + 15, margin + 60, y + 15);
            }

            // Nom du salarié sous sa signature
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.text(`${conge.prenom} ${conge.nom}`, margin, y + 30);

            // Bloc droite : société
            doc.text("Signature et cachet de la société", midX + 25, y);
            if (companySignatureDataUrl) {
                const imgWidth = 40;
                const imgHeight = 20;
                const xPos = midX + 25;
                const yPos = y + 5;
                doc.addImage(companySignatureDataUrl, "PNG", xPos, yPos, imgWidth, imgHeight);
            }

            if (signerNameText || signerTitleText) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(11);
                const textY = y + 30;
                if (signerNameText) {
                    doc.text(signerNameText, midX + 45, textY, { align: "center" });
                }
                if (signerTitleText) {
                    doc.text(signerTitleText, midX + 45, textY + 6, { align: "center" });
                }
            }

            doc.save(`Demande_conge_${conge.prenom}_${conge.nom}.pdf`);
        } catch (error) {
            console.error("Error generating demande de congé:", error);
            toast.error("Erreur lors de la génération de la demande");
        }
    };

    const confirmSignatureAndPrint = async () => {
        if (!signatureConge) return;
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

        await handlePrintDemandeConge(
            signatureConge,
            companyDataUrl,
            employeeDataUrl,
            signerName.trim(),
            signerTitle.trim()
        );

        setSignatureDialogOpen(false);
        setSignatureConge(null);
    };

    const filteredConges = conges.filter(c =>
        `${c.nom} ${c.prenom}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.motif?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approuve':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1"><CheckCircle2 className="h-3 w-3" /> Approuvé</span>;
            case 'refuse':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1"><XCircle className="h-3 w-3" /> Refusé</span>;
            default:
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1"><Clock className="h-3 w-3" /> En attente</span>;
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Calendar className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Gestion des Congés
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Suivi et approbation des absences du personnel</p>
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => { editingConge ? resetForm() : setIsFormVisible(!isFormVisible) }}
                        className={cn("shadow-sm transition-all cursor-pointer", isFormVisible ? "bg-muted text-foreground hover:bg-accent" : "bg-indigo-600 text-white hover:bg-indigo-700")}
                    >
                        {isFormVisible ? "Annuler" : <><Plus className="mr-2 h-4 w-4" /> Nouveau Congé</>}
                    </Button>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400"><Clock className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">En attente</p>
                        <p className="text-xl font-bold text-foreground">{conges.filter(c => c.status === 'en_attente').length}</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Approuvés</p>
                        <p className="text-xl font-bold text-foreground">{conges.filter(c => c.status === 'approuve').length}</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><Calendar className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total ce mois</p>
                        <p className="text-xl font-bold text-foreground">{conges.length}</p>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Form Column */}
                {isFormVisible && (
                    <Card className="lg:col-span-4 border border-border shadow-xl bg-card sticky top-6 animate-in slide-in-from-left duration-300 z-10">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                {editingConge ? <Edit className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : <Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
                                {editingConge ? "Modifier le Congé" : "Enregistrer un Congé"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label>Employé *</Label>
                                    <Select onValueChange={(v) => handleSelectChange("employee_id", v)} value={formData.employee_id} disabled={!!editingConge}>
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

                                <div className="space-y-1.5">
                                    <Label>Type de Congé</Label>
                                    <Select onValueChange={(v) => handleSelectChange("type", v)} value={formData.type}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="paye">Congé Payé</SelectItem>
                                            <SelectItem value="maladie">Maladie</SelectItem>
                                            <SelectItem value="non_paye">Sans Solde</SelectItem>
                                            <SelectItem value="autre">Autre</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="date_debut">Date Début *</Label>
                                        <Input id="date_debut" name="date_debut" type="date" value={formData.date_debut} onChange={handleInputChange} className={cn(formErrors.date_debut && "border-red-500")} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="date_fin">Date Fin *</Label>
                                        <Input id="date_fin" name="date_fin" type="date" value={formData.date_fin} onChange={handleInputChange} className={cn(formErrors.date_fin && "border-red-500")} />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="nombre_jours">Nombre de jours (Calculé)</Label>
                                    <Input id="nombre_jours" name="nombre_jours" type="number" value={formData.nombre_jours} readOnly className="bg-muted cursor-not-allowed" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="motif">Motif / Description</Label>
                                    <Input id="motif" name="motif" value={formData.motif} onChange={handleInputChange} placeholder="Ex: Voyage familial, RDV médical" />
                                </div>

                                {editingConge && (
                                    <div className="space-y-1.5">
                                        <Label>Statut</Label>
                                        <Select onValueChange={(v) => handleSelectChange("status", v)} value={formData.status}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="en_attente">En attente</SelectItem>
                                                <SelectItem value="approuve">Approuvé</SelectItem>
                                                <SelectItem value="refuse">Refusé</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <Button disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
                                    {isSubmitting ? "Traitement..." : editingConge ? "Mettre à jour" : "Valider la Demande"}
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
                                placeholder="Rechercher par nom, motif..."
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
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Jours / Type</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Motif</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Statut</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell className="pl-6"><div className="h-10 w-40 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-10 w-32 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-10 w-24 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-10 w-20 bg-muted rounded" /></TableCell>
                                            <TableCell><div className="h-10 w-16 bg-muted rounded" /></TableCell>
                                            <TableCell className="pr-6"><div className="h-10 w-16 bg-muted rounded ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredConges.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-20">
                                            <div className="flex flex-col items-center text-muted">
                                                <BookOpen className="h-12 w-12 mb-3 stroke-1" />
                                                <p className="font-medium">Aucun congé enregistré</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredConges.map((conge) => (
                                        <TableRow key={conge.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0">
                                            <TableCell className="py-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-lg bg-linear-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                                                        <User className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-foreground text-sm">{conge.prenom} {conge.nom}</p>
                                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                            <Store className="h-3 w-3" />
                                                            {conge.pv_name || 'Siège'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-xs space-y-0.5">
                                                    <div className="flex items-center gap-1 text-foreground">
                                                        <Calendar className="h-3 w-3 text-indigo-500" />
                                                        Du {new Date(conge.date_debut).toLocaleDateString()}
                                                    </div>
                                                    <div className="flex items-center gap-1 text-muted-foreground pl-4">
                                                        Au {new Date(conge.date_fin).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-bold text-foreground">{conge.nombre_jours} Jours</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase opacity-70 font-bold">{conge.type}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-xs text-muted-foreground max-w-[150px] truncate" title={conge.motif}>
                                                    {conge.motif || 'N/A'}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(conge.status)}
                                            </TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-right pr-6">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-56">
                                                            {conge.status === 'en_attente' && (
                                                                <>
                                                                    <DropdownMenuItem onClick={() => handleApprove(conge.id)} className="cursor-pointer">
                                                                        <CheckCircle2 className="h-4 w-4" />
                                                                        Approuver
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleRefuse(conge.id)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                                        <XCircle className="h-4 w-4" />
                                                                        Refuser
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            <DropdownMenuItem onClick={() => openSignatureDialog(conge)} className="cursor-pointer">
                                                                <Printer className="h-4 w-4" />
                                                                Imprimer la demande
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setEditingConge(conge)} className="cursor-pointer">
                                                                <Edit className="h-4 w-4" />
                                                                Modifier
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleDelete(conge)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                                <Trash2 className="h-4 w-4" />
                                                                Supprimer
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            )}
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
                        <DialogTitle className="text-red-600">Supprimer ce congé ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Cette action supprimera la demande de congé de <span className="font-bold text-foreground">{congeToDelete?.prenom} {congeToDelete?.nom}</span>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Supprimer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Signature Dialog for leave request */}
            <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Signature de la demande de congé</DialogTitle>
                        <DialogDescription>
                            Signez numériquement pour le salarié et pour la société, puis complétez les informations du signataire côté société. Les signatures seront intégrées dans le PDF.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-3 space-y-3">
                        <Label>Signature du salarié</Label>
                        <div className="border border-border rounded-xl bg-background overflow-hidden">
                            <SignatureCanvas
                                ref={employeeSignaturePadRef}
                                penColor="#111827"
                                onEnd={() => setIsEmployeeSignatureEmpty(false)}
                                canvasProps={{
                                    width: 480,
                                    height: 160,
                                    className: "w-full h-40 bg-white"
                                }}
                            />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Utilisez la souris ou le doigt (sur mobile) pour signer.</span>
                            <button
                                type="button"
                                className="underline hover:text-foreground"
                                onClick={() => {
                                    employeeSignaturePadRef.current?.clear();
                                    setIsEmployeeSignatureEmpty(true);
                                }}
                            >
                                Effacer signature salarié
                            </button>
                        </div>

                        <Label className="mt-4 block">Signature de la société</Label>
                        <div className="border border-border rounded-xl bg-background overflow-hidden">
                            <SignatureCanvas
                                ref={companySignaturePadRef}
                                penColor="#111827"
                                onEnd={() => setIsCompanySignatureEmpty(false)}
                                canvasProps={{
                                    width: 480,
                                    height: 160,
                                    className: "w-full h-40 bg-white"
                                }}
                            />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Signature du représentant de la société.</span>
                            <button
                                type="button"
                                className="underline hover:text-foreground"
                                onClick={() => {
                                    companySignaturePadRef.current?.clear();
                                    setIsCompanySignatureEmpty(true);
                                }}
                            >
                                Effacer signature société
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                            <div className="space-y-1">
                                <Label htmlFor="signerName">Nom du signataire</Label>
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
                                setSignatureConge(null);
                            }}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={confirmSignatureAndPrint}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            disabled={
                                isCompanySignatureEmpty ||
                                isEmployeeSignatureEmpty ||
                                !signerName.trim() ||
                                !signerTitle.trim()
                            }
                        >
                            Générer la demande
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
