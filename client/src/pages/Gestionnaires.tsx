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
import { toast } from "sonner";
import {
    Building2,
    Plus,
    Edit,
    Trash2,
    Search,
    ShieldAlert,
    Phone,
    Mail,
    MapPin,
    Briefcase,
    FileCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Gestionnaire {
    id: number;
    nom: string;
    logo?: string;
    adresse: string;
    type_entreprise: string;
    email: string;
    responsable: string;
    telephone: string;
    ice: string;
    identifiant_fiscale: string;
    patente: string;
    cnss: string;
}

export default function Gestionnaires() {
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAdmin = role === "admin";
    const isAuthorized = isAdmin || permissions.includes("gestionnaires_view");

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
                        Seuls les administrateurs peuvent gérer les gestionnaires (sociétés).
                    </p>
                </Card>
            </div>
        );
    }

    const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [gestionnaireToDelete, setGestionnaireToDelete] = useState<Gestionnaire | null>(null);
    const [editingGestionnaire, setEditingGestionnaire] = useState<Gestionnaire | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isFormVisible, setIsFormVisible] = useState(false);

    const [formData, setFormData] = useState({
        nom: "",
        logo: "", // stores current logo filename for existing entries (not edited directly)
        adresse: "",
        type_entreprise: "",
        email: "",
        responsable: "",
        telephone: "",
        ice: "",
        identifiant_fiscale: "",
        patente: "",
        cnss: ""
    });
    const [logoFile, setLogoFile] = useState<File | null>(null);

    const token = localStorage.getItem("token");

    const fetchGestionnaires = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/gestionnaires", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) setGestionnaires(await response.json());
        } catch (error) {
            console.error("Error fetching gestionnaires:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchGestionnaires(); }, []);

    useEffect(() => {
        if (editingGestionnaire) {
            setFormData({
                nom: editingGestionnaire.nom || "",
                logo: editingGestionnaire.logo || "",
                adresse: editingGestionnaire.adresse || "",
                type_entreprise: editingGestionnaire.type_entreprise || "",
                email: editingGestionnaire.email || "",
                responsable: editingGestionnaire.responsable || "",
                telephone: editingGestionnaire.telephone || "",
                ice: editingGestionnaire.ice || "",
                identifiant_fiscale: editingGestionnaire.identifiant_fiscale || "",
                patente: editingGestionnaire.patente || "",
                cnss: editingGestionnaire.cnss || ""
            });
            setIsFormVisible(true);
        }
    }, [editingGestionnaire]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setLogoFile(e.target.files[0]);
        } else {
            setLogoFile(null);
        }
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!formData.nom.trim()) errors.nom = "Le nom est requis";
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const method = editingGestionnaire ? "PUT" : "POST";
            const url = editingGestionnaire ? `/api/gestionnaires/${editingGestionnaire.id}` : "/api/gestionnaires";

            const data = new FormData();
            // Append textual fields (exclude logo, which is file-only)
            Object.entries(formData).forEach(([key, value]) => {
                if (key === "logo") return;
                if (value !== null && value !== "") {
                    data.append(key, value as string);
                }
            });
            if (logoFile) {
                data.append("logo", logoFile);
            }

            const response = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: data,
            });

            if (response.ok) {
                toast.success(editingGestionnaire ? "Gestionnaire mis à jour !" : "Gestionnaire ajouté !");
                resetForm();
                fetchGestionnaires();
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
            logo: "",
            adresse: "",
            type_entreprise: "",
            email: "",
            responsable: "",
            telephone: "",
            ice: "",
            identifiant_fiscale: "",
            patente: "",
            cnss: ""
        });
        setLogoFile(null);
        setEditingGestionnaire(null);
        setFormErrors({});
        setIsFormVisible(false);
    };

    const handleDelete = (g: Gestionnaire) => {
        setGestionnaireToDelete(g);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!gestionnaireToDelete) return;
        try {
            const response = await fetch(`/api/gestionnaires/${gestionnaireToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Gestionnaire supprimé");
                fetchGestionnaires();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setDeleteDialogOpen(false);
            setGestionnaireToDelete(null);
        }
    };

    const filteredGestionnaires = gestionnaires.filter(g =>
        g.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (g.responsable && g.responsable.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Building2 className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Gestionnaires (Sociétés)
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Paramétrez les entités de gestion de votre bijouterie</p>
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => { editingGestionnaire ? resetForm() : setIsFormVisible(!isFormVisible) }}
                        className={cn("shadow-sm transition-all cursor-pointer", isFormVisible ? "bg-muted text-foreground hover:bg-accent" : "bg-indigo-600 text-white hover:bg-indigo-700")}
                    >
                        {isFormVisible ? "Annuler" : <><Plus className="mr-2 h-4 w-4" /> Nouveau Gestionnaire</>}
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><Building2 className="h-6 w-6" /></div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Entités</p>
                        <p className="text-2xl font-bold text-foreground">{gestionnaires.length}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {isFormVisible && (
                    <Card className="lg:col-span-5 border border-border shadow-xl bg-card animate-in slide-in-from-left duration-300">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                {editingGestionnaire ? <Edit className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : <Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
                                {editingGestionnaire ? "Modifier l'entité" : "Ajouter une entité"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="nom" className="text-sm font-medium">Nom / Raison Sociale *</Label>
                                        <Input id="nom" name="nom" value={formData.nom} onChange={handleInputChange} placeholder="Ex: Bijouterie Luxe SARL" className={cn(formErrors.nom && "border-red-500")} />
                                        {formErrors.nom && <p className="text-red-500 text-xs">{formErrors.nom}</p>}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="logo" className="text-sm font-medium">Logo (fichier)</Label>
                                        <Input
                                            id="logo"
                                            name="logo"
                                            type="file"
                                            accept="image/*"
                                            onChange={handleLogoChange}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="responsable" className="text-sm font-medium">Responsable</Label>
                                        <Input id="responsable" name="responsable" value={formData.responsable} onChange={handleInputChange} placeholder="Nom du responsable" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="type_entreprise" className="text-sm font-medium">Type d'entreprise</Label>
                                        <Input id="type_entreprise" name="type_entreprise" value={formData.type_entreprise} onChange={handleInputChange} placeholder="Ex: SARL, Auto-entrepreneur" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="email" className="text-sm font-medium">Email Professional</Label>
                                        <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="contact@bijouterie.com" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="telephone" className="text-sm font-medium">Téléphone</Label>
                                        <Input id="telephone" name="telephone" value={formData.telephone} onChange={handleInputChange} placeholder="+212..." />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="ice" className="text-sm font-medium">ICE</Label>
                                        <Input id="ice" name="ice" value={formData.ice} onChange={handleInputChange} placeholder="Identifiant Commun Entreprise" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="identifiant_fiscale" className="text-sm font-medium">Identifiant Fiscal</Label>
                                        <Input id="identifiant_fiscale" name="identifiant_fiscale" value={formData.identifiant_fiscale} onChange={handleInputChange} placeholder="IF" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="patente" className="text-sm font-medium">Patente</Label>
                                        <Input id="patente" name="patente" value={formData.patente} onChange={handleInputChange} placeholder="N° Patente" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cnss" className="text-sm font-medium">CNSS</Label>
                                        <Input id="cnss" name="cnss" value={formData.cnss} onChange={handleInputChange} placeholder="N° CNSS" />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label htmlFor="adresse" className="text-sm font-medium">Adresse</Label>
                                        <Input id="adresse" name="adresse" value={formData.adresse} onChange={handleInputChange} placeholder="Adresse complète" />
                                    </div>
                                </div>
                                <Button disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                                    {isSubmitting ? "Traitement..." : editingGestionnaire ? "Mettre à jour" : "Créer le Gestionnaire"}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                <div className={cn("space-y-4", isFormVisible ? "lg:col-span-7" : "lg:col-span-12")}>
                    <div className="bg-card p-3 rounded-xl border border-border flex justify-between items-center backdrop-blur-sm">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Rechercher une entité..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-10 bg-muted" />
                        </div>
                    </div>

                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs font-bold uppercase py-4 pl-6">Société</TableHead>
                                    <TableHead className="text-xs font-bold uppercase py-4">Informations Fiscaux</TableHead>
                                    <TableHead className="text-xs font-bold uppercase py-4">Contact</TableHead>
                                    <TableHead className="text-xs font-bold uppercase py-4 text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse h-20"><TableCell colSpan={4} /></TableRow>
                                    ))
                                ) : filteredGestionnaires.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-20 text-muted">Aucune entité trouvée</TableCell></TableRow>
                                ) : (
                                    filteredGestionnaires.map((g, idx) => (
                                        <TableRow key={g.id} className="group hover:bg-muted/30 border-b border-border last:border-0">
                                            <TableCell className="py-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold overflow-hidden", idx % 2 === 0 ? "bg-indigo-100 text-indigo-600" : "bg-purple-100 text-purple-600")}>
                                                        {g.logo ? (
                                                            <img
                                                                src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${g.logo}`}
                                                                alt={g.nom}
                                                                className="h-full w-full object-contain"
                                                            />
                                                        ) : (
                                                            g.nom.charAt(0).toUpperCase()
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-foreground">{g.nom}</span>
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <Briefcase className="h-3 w-3" /> {g.type_entreprise || "Entité"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1 text-xs">
                                                    <span className="font-medium text-foreground tracking-tight flex items-center gap-1.5"><FileCheck className="h-3.5 w-3.5 text-blue-500" /> ICE: {g.ice || "—"}</span>
                                                    <span className="text-muted-foreground text-[10px] font-bold uppercase">IF: {g.identifiant_fiscale || "—"} | RC: {g.patente || "—"}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1.5 text-foreground font-medium"><Phone className="h-3.5 w-3.5 text-indigo-500" /> {g.telephone || "—"}</span>
                                                    <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-indigo-400" /> {g.email || "—"}</span>
                                                    {g.adresse && <span className="flex items-center gap-1.5 truncate max-w-[150px]"><MapPin className="h-3.5 w-3.5 text-rose-400" /> {g.adresse}</span>}
                                                </div>
                                            </TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-right py-4 pr-6">
                                                    <div className="flex justify-end gap-1">
                                                        <Button size="icon" variant="ghost" onClick={() => setEditingGestionnaire(g)} className="h-8 w-8 text-amber-500 hover:bg-amber-50"><Edit className="h-4 w-4" /></Button>
                                                        <Button size="icon" variant="ghost" onClick={() => handleDelete(g)} className="h-8 w-8 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
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

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Supprimer le gestionnaire ?</DialogTitle>
                        <DialogDescription>Cette action est irréversible.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={confirmDelete}>Supprimer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
