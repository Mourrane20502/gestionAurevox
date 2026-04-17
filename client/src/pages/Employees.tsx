import { useEffect, useState } from "react";
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
    Users,
    Plus,
    Edit,
    Trash2,
    Search,
    ShieldAlert,
    Briefcase,
    Mail,
    Phone,
    Calendar,
    DollarSign,
    UserCheck,
    Store,
    MoreVertical,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Employee {
    id: number;
    nom: string;
    prenom: string;
    email: string;
    phone: string;
    role: string;
    salary: number;
    hire_date: string;
    adresse: string;
    status: string;
    id_point_de_vente: number | null;
    pv_name?: string;
}

interface PDV {
    id: number;
    nom: string;
}

export default function Employees() {
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAdmin = role === "admin";
    const isAuthorized = isAdmin || permissions.includes("employees_view");

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
                        Seuls les administrateurs peuvent gérer le personnel.
                    </p>
                </Card>
            </div>
        );
    }

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [pdvs, setPdvs] = useState<PDV[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isFormVisible, setIsFormVisible] = useState(false);

    const [formData, setFormData] = useState({
        nom: "",
        prenom: "",
        email: "",
        phone: "",
        role: "",
        salary: "",
        hire_date: new Date().toISOString().split('T')[0],
        adresse: "",
        status: "active",
        id_point_de_vente: ""
    });

    const token = localStorage.getItem("token");

    const fetchEmployees = async () => {
        setIsLoading(true);
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
            toast.error("Erreur lors du chargement des employés");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPdvs = async () => {
        try {
            const response = await fetch("/api/pdv", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) setPdvs(await response.json());
        } catch (error) {
            console.error("Error fetching PDVs:", error);
        }
    };

    useEffect(() => {
        fetchEmployees();
        fetchPdvs();
    }, []);

    useEffect(() => {
        if (editingEmployee) {
            setFormData({
                nom: editingEmployee.nom || "",
                prenom: editingEmployee.prenom || "",
                email: editingEmployee.email || "",
                phone: editingEmployee.phone || "",
                role: editingEmployee.role || "",
                salary: editingEmployee.salary?.toString() || "",
                hire_date: editingEmployee.hire_date ? new Date(editingEmployee.hire_date).toISOString().split('T')[0] : "",
                adresse: editingEmployee.adresse || "",
                status: editingEmployee.status || "active",
                id_point_de_vente: editingEmployee.id_point_de_vente?.toString() || ""
            });
            setIsFormVisible(true);
        }
    }, [editingEmployee]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!formData.nom.trim()) errors.nom = "Le nom est requis";
        if (!formData.prenom.trim()) errors.prenom = "Le prénom est requis";
        if (!formData.email.trim()) errors.email = "L'email est requis";
        if (!formData.role.trim()) errors.role = "Le rôle est requis";
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const method = editingEmployee ? "PUT" : "POST";
            const url = editingEmployee ? `/api/employees/${editingEmployee.id}` : "/api/employees";

            const payload = {
                ...formData,
                salary: formData.salary ? parseFloat(formData.salary) : 0,
                id_point_de_vente: (formData.id_point_de_vente && formData.id_point_de_vente !== "none") ? parseInt(formData.id_point_de_vente) : null
            };

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                toast.success(editingEmployee ? "Employé mis à jour !" : "Employé ajouté !");
                resetForm();
                fetchEmployees();
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
            nom: "",
            prenom: "",
            email: "",
            phone: "",
            role: "",
            salary: "",
            hire_date: new Date().toISOString().split('T')[0],
            adresse: "",
            status: "active",
            id_point_de_vente: ""
        });
        setEditingEmployee(null);
        setFormErrors({});
        setIsFormVisible(false);
    };

    const handleDelete = (employee: Employee) => {
        setEmployeeToDelete(employee);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!employeeToDelete) return;
        try {
            const response = await fetch(`/api/employees/${employeeToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Employé supprimé");
                fetchEmployees();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setDeleteDialogOpen(false);
            setEmployeeToDelete(null);
        }
    };

    const filteredEmployees = employees.filter(e =>
        `${e.nom} ${e.prenom}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Users className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Ressources Humaines
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gérez votre personnel et leurs accès</p>
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => { editingEmployee ? resetForm() : setIsFormVisible(!isFormVisible) }}
                        className={cn("shadow-sm cursor-pointer transition-all", isFormVisible ? "bg-muted text-foreground hover:bg-accent" : "bg-indigo-600 text-white hover:bg-indigo-700")}
                    >
                        {isFormVisible ? "Annuler" : <><Plus className="mr-2 h-4 w-4" /> Nouvel Employé</>}
                    </Button>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><Users className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Staff</p>
                        <p className="text-xl font-bold text-foreground">{employees.length}</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400"><UserCheck className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Actifs</p>
                        <p className="text-xl font-bold text-foreground">{employees.filter(e => e.status === 'active').length}</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400"><Briefcase className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Postes</p>
                        <p className="text-xl font-bold text-foreground">{new Set(employees.map(e => e.role)).size}</p>
                    </div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400"><DollarSign className="h-6 w-6" /></div>
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Masse Salariale</p>
                        <p className="text-xl font-bold text-foreground">{employees.reduce((acc, e) => acc + (Number(e.salary) || 0), 0).toLocaleString()} DH</p>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Form Column */}
                {isFormVisible && (
                    <Card className="lg:col-span-4 border border-border shadow-xl bg-card sticky top-6 animate-in slide-in-from-left duration-300 z-10">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                {editingEmployee ? <Edit className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : <Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
                                {editingEmployee ? "Modifier l'Employé" : "Ajouter un Employé"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="nom">Nom *</Label>
                                        <Input id="nom" name="nom" value={formData.nom} onChange={handleInputChange} className={cn(formErrors.nom && "border-red-500")} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="prenom">Prénom *</Label>
                                        <Input id="prenom" name="prenom" value={formData.prenom} onChange={handleInputChange} className={cn(formErrors.prenom && "border-red-500")} />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="email">Email *</Label>
                                    <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} className={cn(formErrors.email && "border-red-500")} />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="phone">Téléphone</Label>
                                        <Input id="phone" name="phone" value={formData.phone} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="role">Rôle / Poste *</Label>
                                        <Input id="role" name="role" value={formData.role} onChange={handleInputChange} placeholder="Ex: Vendeur, Admin" className={cn(formErrors.role && "border-red-500")} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="salary">Salaire (DH)</Label>
                                        <Input id="salary" name="salary" type="number" value={formData.salary} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="hire_date">Date d'embauche</Label>
                                        <Input id="hire_date" name="hire_date" type="date" value={formData.hire_date} onChange={handleInputChange} />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Point de Vente</Label>
                                    <Select onValueChange={(v) => handleSelectChange("id_point_de_vente", v)} value={formData.id_point_de_vente}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner un PV" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Aucun</SelectItem>
                                            {pdvs.map((pv) => (
                                                <SelectItem key={pv.id} value={pv.id.toString()}>{pv.nom}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="adresse">Adresse</Label>
                                    <Input id="adresse" name="adresse" value={formData.adresse} onChange={handleInputChange} />
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Statut</Label>
                                    <Select onValueChange={(v) => handleSelectChange("status", v)} value={formData.status}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Actif</SelectItem>
                                            <SelectItem value="inactive">Inactif</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
                                    {isSubmitting ? "Traitement..." : editingEmployee ? "Mettre à jour" : "Recruter l'Employé"}
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
                                placeholder="Rechercher par nom, email, rôle..."
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
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Contact</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Poste & PV</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Salaire</TableHead>
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
                                ) : filteredEmployees.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-20">
                                            <div className="flex flex-col items-center text-muted">
                                                <Users className="h-12 w-12 mb-3 stroke-1" />
                                                <p className="font-medium">Aucun employé trouvé</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredEmployees.map((emp) => (
                                        <TableRow key={emp.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0">
                                            <TableCell className="py-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                                        {emp.nom?.charAt(0) || ''}{emp.prenom?.charAt(0) || ''}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-foreground text-sm">{emp.nom} {emp.prenom}</p>
                                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                            <Calendar className="h-3 w-3" />
                                                            Inscrit le {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString() : 'N/A'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Mail className="h-3 w-3" />
                                                        {emp.email}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Phone className="h-3 w-3" />
                                                        {emp.phone || 'N/A'}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                                        <Briefcase className="h-3 w-3 text-indigo-500" />
                                                        {emp.role}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Store className="h-3 w-3" />
                                                        {emp.pv_name || 'Non assigné'}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                                                    {emp.salary?.toLocaleString()} DH
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-xs",
                                                    emp.status === 'active' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                                        emp.status === 'on_leave' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                                            "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                                )}>
                                                    {emp.status === 'active' ? 'En poste' : emp.status === 'on_leave' ? 'Congé' : 'Inactif'}
                                                </span>
                                            </TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-right pr-6">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem onClick={() => setEditingEmployee(emp)} className="cursor-pointer">
                                                                <Edit className="h-4 w-4" />
                                                                Modifier
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleDelete(emp)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
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
                        <DialogTitle className="text-red-600">Supprimer l'employé ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Cette action supprimera définitivement <span className="font-bold text-foreground">{employeeToDelete?.prenom} {employeeToDelete?.nom}</span> du système.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Supprimer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
