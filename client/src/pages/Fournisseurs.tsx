import { useEffect, useState } from "react";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Card } from "@/components/common/ui/card";
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
import { DeleteSvgIcon, EditSvgIcon } from "@/components/icons/actionSvgIcons";
import { toast } from "sonner";
import {
    Truck,
    Plus,
    Search,
    ShieldAlert,
    Phone,
    Mail,
    MapPin,
    Hash,
    MoreVertical,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Fournisseur {
    id: number;
    nom: string;
    ice: string;
    telephone: string;
    email: string;
    rc: string;
    adresse: string;
    numero_tva?: string | null;
    if_number?: string | null;
    cnss?: string | null;
    patente?: string | null;
    taux_ras?: number | null;
    regularite_fiscale?: number | boolean;
    regularite_pdf_document?: string | null;
    regularite_date_debut?: string | null;
    regularite_date_expiration?: string | null;
}

export default function Fournisseurs() {
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAdmin = role === "admin";
    const isAuthorized = isAdmin || permissions.includes("fournisseurs_view");

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
                        Seuls les administrateurs peuvent gérer les fournisseurs.
                    </p>
                </Card>
            </div>
        );
    }

    const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [fournisseurToDelete, setFournisseurToDelete] = useState<Fournisseur | null>(null);
    const [editingFournisseur, setEditingFournisseur] = useState<Fournisseur | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isFormVisible, setIsFormVisible] = useState(false);

    const [formData, setFormData] = useState({
        nom: "",
        ice: "",
        numero_tva: "",
        if_number: "",
        cnss: "",
        patente: "",
        taux_ras: "100",
        telephone: "",
        email: "",
        rc: "",
        adresse: "",
        regularite_fiscale: false,
        regularite_date_debut: "",
        regularite_date_expiration: "",
    });
    const [regularitePdfFile, setRegularitePdfFile] = useState<File | null>(null);

    const token = localStorage.getItem("token");

    const fetchFournisseurs = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/fournisseurs", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) setFournisseurs(await response.json());
        } catch (error) {
            console.error("Error fetching fournisseurs:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchFournisseurs(); }, []);

    useEffect(() => {
        if (editingFournisseur) {
            setFormData({
                nom: editingFournisseur.nom || "",
                ice: editingFournisseur.ice || "",
                numero_tva: editingFournisseur.numero_tva || "",
                if_number: editingFournisseur.if_number || "",
                cnss: editingFournisseur.cnss || "",
                patente: editingFournisseur.patente || "",
                taux_ras:
                    String(
                        editingFournisseur.regularite_fiscale === 1 || editingFournisseur.regularite_fiscale === true
                            ? 75
                            : 100
                    ),
                telephone: editingFournisseur.telephone || "",
                email: editingFournisseur.email || "",
                rc: editingFournisseur.rc || "",
                adresse: editingFournisseur.adresse || "",
                regularite_fiscale:
                    editingFournisseur.regularite_fiscale === 1 || editingFournisseur.regularite_fiscale === true,
                regularite_date_debut: editingFournisseur.regularite_date_debut
                    ? String(editingFournisseur.regularite_date_debut).slice(0, 10)
                    : "",
                regularite_date_expiration: editingFournisseur.regularite_date_expiration
                    ? String(editingFournisseur.regularite_date_expiration).slice(0, 10)
                    : "",
            });
            setRegularitePdfFile(null);
            setIsFormVisible(true);
        }
    }, [editingFournisseur]);

    const addSixMonths = (dateStart: string) => {
        if (!dateStart) return "";
        const [y, m, d] = dateStart.split("-").map(Number);
        if (!y || !m || !d) return "";
        const base = new Date(y, m - 1, d);
        if (Number.isNaN(base.getTime())) return "";
        base.setMonth(base.getMonth() + 6);
        const yy = base.getFullYear();
        const mm = String(base.getMonth() + 1).padStart(2, "0");
        const dd = String(base.getDate()).padStart(2, "0");
        return `${yy}-${mm}-${dd}`;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => {
            if (name === "regularite_date_debut") {
                return {
                    ...prev,
                    regularite_date_debut: value,
                    regularite_date_expiration: addSixMonths(value),
                };
            }
            return { ...prev, [name]: value };
        });
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!formData.nom.trim()) errors.nom = "Le nom est requis";
        if (formData.regularite_fiscale) {
            if (!formData.regularite_date_debut) errors.regularite_date_debut = "Date début requise";
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const method = editingFournisseur ? "PUT" : "POST";
            const url = editingFournisseur ? `/api/fournisseurs/${editingFournisseur.id}` : "/api/fournisseurs";
            const payload = new FormData();
            payload.set("nom", formData.nom);
            payload.set("ice", formData.ice);
            payload.set("numero_tva", formData.numero_tva);
            payload.set("if_number", formData.if_number);
            payload.set("cnss", formData.cnss);
            payload.set("patente", formData.patente);
            payload.set("taux_ras", formData.taux_ras);
            payload.set("telephone", formData.telephone);
            payload.set("email", formData.email);
            payload.set("rc", formData.rc);
            payload.set("adresse", formData.adresse);
            payload.set("regularite_fiscale", formData.regularite_fiscale ? "1" : "0");
            if (formData.regularite_fiscale) {
                payload.set("regularite_date_debut", formData.regularite_date_debut || "");
                payload.set("regularite_date_expiration", formData.regularite_date_expiration || "");
                if (regularitePdfFile) payload.set("regularite_pdf", regularitePdfFile);
            }
            const response = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: payload,
            });

            if (response.ok) {
                toast.success(editingFournisseur ? "Fournisseur mis à jour !" : "Fournisseur ajouté !");
                resetForm();
                fetchFournisseurs();
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
            ice: "",
            numero_tva: "",
            if_number: "",
            cnss: "",
            patente: "",
            taux_ras: "100",
            telephone: "",
            email: "",
            rc: "",
            adresse: "",
            regularite_fiscale: false,
            regularite_date_debut: "",
            regularite_date_expiration: "",
        });
        setRegularitePdfFile(null);
        setEditingFournisseur(null);
        setFormErrors({});
        setIsFormVisible(false);
    };

    const handleDelete = (fournisseur: Fournisseur) => {
        setFournisseurToDelete(fournisseur);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!fournisseurToDelete) return;
        try {
            const response = await fetch(`/api/fournisseurs/${fournisseurToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Fournisseur supprimé");
                fetchFournisseurs();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setDeleteDialogOpen(false);
            setFournisseurToDelete(null);
        }
    };

    const filteredFournisseurs = fournisseurs.filter(f =>
        f.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.ice && f.ice.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Truck className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Fournisseurs
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gérez votre base de données fournisseurs</p>
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => {
                            setEditingFournisseur(null);
                            setFormData({
                                nom: "",
                                ice: "",
                                numero_tva: "",
                                if_number: "",
                                cnss: "",
                                patente: "",
                                taux_ras: "100",
                                telephone: "",
                                email: "",
                                rc: "",
                                adresse: "",
                                regularite_fiscale: false,
                                regularite_date_debut: "",
                                regularite_date_expiration: "",
                            });
                            setRegularitePdfFile(null);
                            setFormErrors({});
                            setIsFormVisible(true);
                        }}
                        className="shadow-sm cursor-pointer transition-all bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                        <><Plus className="mr-2 h-4 w-4" /> Nouveau Fournisseur</>
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><Truck className="h-6 w-6" /></div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Fournisseurs</p>
                        <p className="text-2xl font-bold text-foreground">{fournisseurs.length}</p>
                    </div>
                </div>
            </div>

            <Dialog
                open={isFormVisible}
                onOpenChange={(open) => {
                    setIsFormVisible(open);
                    if (!open) {
                        setEditingFournisseur(null);
                        setFormErrors({});
                        setRegularitePdfFile(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-lg flex items-center gap-2">
                            {editingFournisseur ? <EditSvgIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : <Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
                            {editingFournisseur ? "Modifier le Fournisseur" : "Ajouter un Fournisseur"}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="nom" className="text-sm font-medium">Nom *</Label>
                            <Input
                                id="nom"
                                name="nom"
                                value={formData.nom}
                                onChange={handleInputChange}
                                placeholder="Ex: Fournisseur SARL"
                                className={cn("h-10", formErrors.nom && "border-red-500 focus-visible:ring-red-500")}
                            />
                            {formErrors.nom && <p className="text-red-500 text-xs mt-1">{formErrors.nom}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ice" className="text-sm font-medium">ICE</Label>
                            <Input id="ice" name="ice" value={formData.ice} onChange={handleInputChange} placeholder="ICE du fournisseur" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="numero_tva" className="text-sm font-medium">Numéro TVA</Label>
                            <Input id="numero_tva" name="numero_tva" value={formData.numero_tva} onChange={handleInputChange} placeholder="Numéro TVA" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="if_number" className="text-sm font-medium">IF</Label>
                            <Input id="if_number" name="if_number" value={formData.if_number} onChange={handleInputChange} placeholder="IF" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cnss" className="text-sm font-medium">CNSS</Label>
                            <Input id="cnss" name="cnss" value={formData.cnss} onChange={handleInputChange} placeholder="CNSS" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="patente" className="text-sm font-medium">Patente</Label>
                            <Input id="patente" name="patente" value={formData.patente} onChange={handleInputChange} placeholder="Patente" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="taux_ras" className="text-sm font-medium">Taux RAS (%)</Label>
                            <Input
                                id="taux_ras"
                                name="taux_ras"
                                value={formData.taux_ras}
                                readOnly
                                disabled
                                className="h-10"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Calcul automatique: 75% si régularité fiscale active, sinon 100%.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="telephone" className="text-sm font-medium">Téléphone</Label>
                            <Input id="telephone" name="telephone" value={formData.telephone} onChange={handleInputChange} placeholder="+212..." className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                            <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="email@exemple.com" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="rc" className="text-sm font-medium">RC</Label>
                            <Input id="rc" name="rc" value={formData.rc} onChange={handleInputChange} placeholder="Numéro RC" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="adresse" className="text-sm font-medium">Adresse</Label>
                            <Input id="adresse" name="adresse" value={formData.adresse} onChange={handleInputChange} placeholder="Adresse complète" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Régularité fiscale</Label>
                            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                                <input
                                    id="regularite_fiscale"
                                    type="checkbox"
                                    checked={Boolean(formData.regularite_fiscale)}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            regularite_fiscale: e.target.checked,
                                            taux_ras: e.target.checked ? "75" : "100",
                                            regularite_date_debut: e.target.checked ? prev.regularite_date_debut : "",
                                            regularite_date_expiration: e.target.checked ? prev.regularite_date_expiration : "",
                                        }))
                                    }
                                />
                                <Label htmlFor="regularite_fiscale" className="text-sm cursor-pointer">
                                    Fournisseur avec régularité fiscale
                                </Label>
                            </div>
                        </div>
                        {formData.regularite_fiscale && (
                            <div className="space-y-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-900/10 p-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="regularite_pdf" className="text-sm font-medium">PDF</Label>
                                    <Input
                                        id="regularite_pdf"
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        onChange={(e) => setRegularitePdfFile(e.target.files?.[0] || null)}
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="regularite_date_debut" className="text-sm font-medium">Date début</Label>
                                        <Input
                                            id="regularite_date_debut"
                                            name="regularite_date_debut"
                                            type="date"
                                            value={formData.regularite_date_debut}
                                            onChange={handleInputChange}
                                        />
                                        {formErrors.regularite_date_debut && (
                                            <p className="text-red-500 text-xs mt-1">{formErrors.regularite_date_debut}</p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="regularite_date_expiration" className="text-sm font-medium">Date expiration</Label>
                                        <Input
                                            id="regularite_date_expiration"
                                            name="regularite_date_expiration"
                                            type="date"
                                            value={formData.regularite_date_expiration}
                                            readOnly
                                            disabled
                                        />
                                        <p className="text-[11px] text-muted-foreground">Calculée automatiquement (+ 6 mois).</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsFormVisible(false)}>
                                Annuler
                            </Button>
                            <Button disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
                                {isSubmitting ? "Traitement..." : editingFournisseur ? "Mettre à jour" : "Créer le Fournisseur"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <div className="space-y-4">
                    <div className="bg-card p-3 rounded-xl border border-border shadow-sm flex justify-between items-center backdrop-blur-sm">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher un fournisseur..."
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
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 pl-6">Fournisseur</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Contact</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Informations</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell colSpan={4} className="h-16" />
                                        </TableRow>
                                    ))
                                ) : filteredFournisseurs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-20">
                                            <div className="flex flex-col items-center text-muted">
                                                <Truck className="h-12 w-12 mb-3 stroke-1" />
                                                <p className="font-medium">Aucun fournisseur trouvé</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredFournisseurs.map((f, idx) => (
                                        <TableRow key={f.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0 text-sm">
                                            <TableCell className="py-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold shadow-sm",
                                                        idx % 3 === 0 ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" :
                                                            idx % 3 === 1 ? "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400")}>
                                                        {f.nom.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-foreground text-base">{f.nom}</span>
                                                        <span className="text-[10px] items-center flex gap-1 text-muted-foreground font-medium uppercase tracking-tighter">
                                                            <Hash className="h-3 w-3" /> ICE: {f.ice || "—"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1.5">
                                                    {f.telephone && (
                                                        <span className="text-xs flex items-center gap-2 text-foreground font-medium">
                                                            <Phone className="h-3.5 w-3.5 text-indigo-500" /> {f.telephone}
                                                        </span>
                                                    )}
                                                    {f.email && (
                                                        <span className="text-xs flex items-center gap-2 text-muted-foreground">
                                                            <Mail className="h-3.5 w-3.5 text-indigo-400" /> {f.email}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1.5">
                                                    {(f.numero_tva || f.if_number || f.cnss || f.patente || f.rc) ? (
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {f.numero_tva && (
                                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                    TVA: {f.numero_tva}
                                                                </span>
                                                            )}
                                                            {f.if_number && (
                                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                    IF: {f.if_number}
                                                                </span>
                                                            )}
                                                            {f.cnss && (
                                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                    CNSS: {f.cnss}
                                                                </span>
                                                            )}
                                                            {f.patente && (
                                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                    Patente: {f.patente}
                                                                </span>
                                                            )}
                                                            {f.rc && (
                                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                    RC: {f.rc}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Aucune info fiscale</span>
                                                    )}
                                                    {f.adresse && (
                                                        <span className="text-xs flex items-center gap-2 text-muted-foreground max-w-[260px] truncate">
                                                            <MapPin className="h-3.5 w-3.5 text-rose-400" /> {f.adresse}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-right py-4 pr-6">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem onClick={() => setEditingFournisseur(f)} className="cursor-pointer">
                                                                <EditSvgIcon className="h-4 w-4" />
                                                                Modifier
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleDelete(f)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                                <DeleteSvgIcon className="h-4 w-4" />
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
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Supprimer le fournisseur ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Êtes-vous sûr de vouloir supprimer <span className="font-bold text-foreground">"{fournisseurToDelete?.nom}"</span> ?
                            <br /><br />
                            Cette action est irréversible.
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
