import { useEffect, useState } from "react";
import { Plus, Edit, Trash, Search, Store, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Package, Mail, Phone } from "lucide-react";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
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
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/common/ui/dialog";
import { Label } from "@/components/common/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/common/ui/alert-dialog";
import { toast } from "sonner";

interface PointDeVente {
    id: number;
    nom: string;
    logo?: string | null;
    email?: string | null;
    telephone?: string | null;
    num_tel?: string | null;
    if?: string | null;
    ice?: string | null;
    patente?: string | null;
    cnss?: string | null;
    adresse?: string | null;
    rc?: string | null;
    id_sous_gestionnaire?: number | null;
    sous_societe_nom?: string | null;
}

interface SousSociete {
    id: number;
    nom_sous_societe: string;
}

interface Product {
    id: number;
    nom: string;
    prix: number;
    stock: number;
    category_name: string;
    reference: string;
    grammage: number;
    photo?: string | null;
    // Optionnel : quantité totale vendue renvoyée par l'API (en unités)
    quantite_vendue?: number;
}

const AVATAR_COLORS = [
    "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400",
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
    "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400",
];

export default function PDV() {
    const [pdvs, setPdvs] = useState<PointDeVente[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPdv, setEditingPdv] = useState<PointDeVente | null>(null);
    const [pdvToDelete, setPdvToDelete] = useState<number | null>(null);
    const [pdvName, setPdvName] = useState("");
    const [pdvEmail, setPdvEmail] = useState("");
    const [pdvTelephone, setPdvTelephone] = useState("");
    const [pdvNumTel, setPdvNumTel] = useState("");
    const [pdvIf, setPdvIf] = useState("");
    const [pdvIce, setPdvIce] = useState("");
    const [pdvPatente, setPdvPatente] = useState("");
    const [pdvCnss, setPdvCnss] = useState("");
    const [pdvAdresse, setPdvAdresse] = useState("");
    const [pdvRc, setPdvRc] = useState("");
    const [idSousGestionnaire, setIdSousGestionnaire] = useState("");
    const [sousSocietes, setSousSocietes] = useState<SousSociete[]>([]);

    // State for viewing products
    const [selectedPdv, setSelectedPdv] = useState<PointDeVente | null>(null);
    const [pdvProducts, setPdvProducts] = useState<Product[]>([]);
    const [isProductsLoading, setIsProductsLoading] = useState(false);
    const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);

    const token = localStorage.getItem("token");
    const role = (localStorage.getItem("role") || "").toLowerCase();
    const canManagePdv = role === "superadmin" || role === "admin";
    const isAdmin = role === "admin";

    const fetchPdvs = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/pdv", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) setPdvs(await response.json());
        } catch (error) {
            console.error("Error fetching points of sale:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPdvProducts = async (id: number) => {
        setIsProductsLoading(true);
        try {
            const response = await fetch(`/api/pdv/${id}/products`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setPdvProducts(data);
            }
        } catch (error) {
            console.error("Error fetching pdv products:", error);
            toast.error("Erreur lors du chargement des produits");
        } finally {
            setIsProductsLoading(false);
        }
    };

    const fetchSousSocietes = async () => {
        try {
            const response = await fetch("/api/settings/sous-societes", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            const data = await response.json();
            const safe = Array.isArray(data) ? data : [];
            setSousSocietes(safe);
            if (!editingPdv && !idSousGestionnaire && safe.length > 0) {
                setIdSousGestionnaire(String(safe[0].id));
            }
        } catch {
            // ignore
        }
    };

    const handleViewProducts = (pdv: PointDeVente) => {
        setSelectedPdv(pdv);
        setPdvProducts([]);
        setIsProductsModalOpen(true);
        fetchPdvProducts(pdv.id);
    };

    useEffect(() => {
        fetchPdvs();
        fetchSousSocietes();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const [pdvLogoFile, setPdvLogoFile] = useState<File | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!idSousGestionnaire) {
            toast.error("Veuillez sélectionner une sous-société");
            return;
        }
        try {
            const url = editingPdv ? `/api/pdv/${editingPdv.id}` : "/api/pdv";
            const method = editingPdv ? "PUT" : "POST";
            const formData = new FormData();
            formData.append("name", pdvName);
            // Always send editable fields, including empty values, to avoid stale data on update.
            formData.append("email", (pdvEmail || "").trim());
            formData.append("telephone", (pdvTelephone || "").trim());
            formData.append("num_tel", (pdvNumTel || "").trim());
            formData.append("id_sous_gestionnaire", idSousGestionnaire);
            formData.append("if", (pdvIf || "").trim());
            formData.append("ice", (pdvIce || "").trim());
            formData.append("patente", (pdvPatente || "").trim());
            formData.append("cnss", (pdvCnss || "").trim());
            formData.append("adresse", (pdvAdresse || "").trim());
            formData.append("rc", (pdvRc || "").trim());
            if (pdvLogoFile) formData.append("logo", pdvLogoFile);

            const response = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (response.ok) {
                toast.success(editingPdv ? "Point de vente mis à jour !" : "Point de vente créé !");
                setIsDialogOpen(false);
                setEditingPdv(null);
                setPdvName("");
                setPdvLogoFile(null);
                setPdvEmail("");
                setPdvTelephone("");
                setPdvNumTel("");
                setIdSousGestionnaire(sousSocietes[0] ? String(sousSocietes[0].id) : "");
                setPdvIf("");
                setPdvIce("");
                setPdvPatente("");
                setPdvCnss("");
                setPdvAdresse("");
                setPdvRc("");
                fetchPdvs();
            } else {
                let errorMessage = "Échec de l'enregistrement";
                try {
                    const payload = await response.json();
                    const backendMessage = String(payload?.message || "").trim();
                    if (backendMessage) errorMessage = backendMessage;
                } catch {
                    // Keep default message when body is not JSON
                }
                toast.error(errorMessage);
            }
        } catch {
            toast.error("Erreur lors de l'enregistrement");
        }
    };

    const handleDelete = (id: number) => setPdvToDelete(id);

    const confirmDelete = async () => {
        if (!pdvToDelete) return;
        try {
            const response = await fetch(`/api/pdv/${pdvToDelete}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Point de vente supprimé");
                fetchPdvs();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur lors de la suppression");
        } finally {
            setPdvToDelete(null);
        }
    };

    const handleEdit = (pdv: PointDeVente) => {
        setEditingPdv(pdv);
        setPdvName(pdv.nom);
        setPdvEmail(pdv.email || "");
        setPdvTelephone(pdv.telephone || "");
        setPdvNumTel(pdv.num_tel || "");
        setIdSousGestionnaire(pdv.id_sous_gestionnaire ? String(pdv.id_sous_gestionnaire) : "");
        setPdvIf(pdv.if || "");
        setPdvIce(pdv.ice || "");
        setPdvPatente(pdv.patente || "");
        setPdvCnss(pdv.cnss || "");
        setPdvAdresse(pdv.adresse || "");
        setPdvRc(pdv.rc || "");
        setIsDialogOpen(true);
    };

    const filteredPdvs = pdvs.filter((pdv) =>
        pdv.nom.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredPdvs.length / itemsPerPage);
    const paginatedPdvs = filteredPdvs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Calculs des totaux de grammage pour le PDV sélectionné
    // Total grammage vendu = somme(quantite_vendue * grammage)
    //   Ex : 10 produits vendus, grammage 100 g → 10 * 100 = 1 000 g
    const totalGrammageVendu = pdvProducts.reduce(
        (sum, p) => sum + (Number(p.quantite_vendue) || 0) * (Number(p.grammage) || 0),
        0
    );

    // Grammage restant = somme(stock * grammage) (ce qu'il reste en stock)
    const totalGrammageRestant = pdvProducts.reduce(
        (sum, p) => sum + (Number(p.stock) || 0) * (Number(p.grammage) || 0),
        0
    );

    // Total grammage initial = vendu + restant
    const totalGrammageInitial = totalGrammageVendu + totalGrammageRestant;

    const getProductPhotoUrl = (photo?: string | null) => {
        if (!photo) return null;
        if (photo.startsWith("http")) return photo;
        return `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${photo}`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Store className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Points de vente
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gérez vos emplacements de vente</p>
                </div>
                {canManagePdv && (
                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) {
                            setEditingPdv(null);
                            setPdvName("");
                            setPdvLogoFile(null);
                            setPdvEmail("");
                            setPdvTelephone("");
                            setPdvNumTel("");
                            setIdSousGestionnaire(sousSocietes[0] ? String(sousSocietes[0].id) : "");
                            setPdvIf("");
                            setPdvIce("");
                            setPdvPatente("");
                            setPdvCnss("");
                            setPdvAdresse("");
                            setPdvRc("");
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button className="bg-indigo-600 cursor-pointer hover:bg-indigo-700 text-white shadow-sm transition-all active:scale-95">
                                <Plus className="mr-2 h-4 w-4" /> Ajouter un Point de Vente
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-lg">
                                    <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                    {editingPdv ? "Modifier le PDV" : "Nouveau point de vente"}
                                </DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="grid gap-5 py-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="name" className="text-sm font-medium">Nom *</Label>
                                    <Input
                                        id="name"
                                        value={pdvName}
                                        onChange={(e) => setPdvName(e.target.value)}
                                        required
                                        className="h-10"
                                        placeholder="Ex: Boutique Centre-Ville"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label className="text-sm font-medium">Sous-société *</Label>
                                    <Select value={idSousGestionnaire} onValueChange={setIdSousGestionnaire}>
                                        <SelectTrigger className="h-10">
                                            <SelectValue placeholder="Choisir une sous-société" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {sousSocietes.map((ss) => (
                                                <SelectItem key={ss.id} value={String(ss.id)}>
                                                    {ss.nom_sous_societe}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={pdvEmail}
                                        onChange={(e) => setPdvEmail(e.target.value)}
                                        className="h-10"
                                        placeholder="contact@boutique.com"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="telephone" className="text-sm font-medium">Téléphone</Label>
                                    <Input
                                        id="telephone"
                                        value={pdvTelephone}
                                        onChange={(e) => setPdvTelephone(e.target.value)}
                                        className="h-10"
                                        placeholder="+212 6 12 34 56 78"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="num_tel" className="text-sm font-medium">Num Tel 2</Label>
                                    <Input
                                        id="num_tel"
                                        value={pdvNumTel}
                                        onChange={(e) => setPdvNumTel(e.target.value)}
                                        className="h-10"
                                        placeholder="+212 ..."
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="if" className="text-sm font-medium">IF</Label>
                                        <Input
                                            id="if"
                                            value={pdvIf}
                                            onChange={(e) => setPdvIf(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="ice" className="text-sm font-medium">ICE</Label>
                                        <Input
                                            id="ice"
                                            value={pdvIce}
                                            onChange={(e) => setPdvIce(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="patente" className="text-sm font-medium">Patente</Label>
                                        <Input
                                            id="patente"
                                            value={pdvPatente}
                                            onChange={(e) => setPdvPatente(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="cnss" className="text-sm font-medium">CNSS</Label>
                                        <Input
                                            id="cnss"
                                            value={pdvCnss}
                                            onChange={(e) => setPdvCnss(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="adresse" className="text-sm font-medium">Adresse</Label>
                                        <Input
                                            id="adresse"
                                            value={pdvAdresse}
                                            onChange={(e) => setPdvAdresse(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="rc" className="text-sm font-medium">RC</Label>
                                        <Input
                                            id="rc"
                                            value={pdvRc}
                                            onChange={(e) => setPdvRc(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="logo" className="text-sm font-medium">Logo (fichier)</Label>
                                    <Input
                                        id="logo"
                                        type="file"
                                        accept="image/*"
                                        className="h-9"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0] || null;
                                            setPdvLogoFile(file);
                                        }}
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Le fichier sera envoyé et stocké dans <span className="font-mono">/uploads</span>.
                                    </p>
                                </div>
                                <DialogFooter>
                                    <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md w-full">
                                        {editingPdv ? "Mettre à jour" : "Créer"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Search */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher un point de vente..."
                        className="pl-9 h-10 bg-card border-border shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="h-10 px-4 bg-card border border-border rounded-xl flex items-center shadow-sm">
                    <p className="text-sm text-muted-foreground font-medium">
                        Total: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{pdvs.length}</span>
                    </p>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30 border-b border-border">
                            <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-4 px-6">Point de vente</TableHead>
                            <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-4 px-6">Coordonnées</TableHead>
                            <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-4 px-6 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <TableRow key={i} className="border-b border-border">
                                    <TableCell className="px-6 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 bg-muted rounded-lg animate-pulse" />
                                            <div className="h-5 bg-muted rounded animate-pulse w-48" />
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-6 py-5">
                                        <div className="h-8 bg-muted rounded animate-pulse w-24 ml-auto" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : filteredPdvs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={2} className="text-center py-24 text-muted-foreground">
                                    <Store className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                    <p className="font-medium">Aucun point de vente trouvé</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedPdvs.map((pdv, idx) => {
                                const colorClass = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                                const initials = pdv.nom.substring(0, 2).toUpperCase();
                                const logoUrl = pdv.logo
                                    ? (pdv.logo.startsWith("http")
                                        ? pdv.logo
                                        : `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${pdv.logo}`)
                                    : null;
                                return (
                                    <TableRow key={pdv.id} className="group border-b border-border hover:bg-muted/20 transition-all">
                                        <TableCell className="py-4 px-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black shadow-sm overflow-hidden ${colorClass}`}>
                                                    {logoUrl ? (
                                                        <img
                                                            src={logoUrl}
                                                            alt={pdv.nom}
                                                            className="h-full w-full object-cover"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = "none";
                                                            }}
                                                        />
                                                    ) : (
                                                        initials
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-foreground text-base tracking-tight">{pdv.nom}</p>
                                                    <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-muted-foreground">
                                                        {pdv.sous_societe_nom && <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">Sous-société: {pdv.sous_societe_nom}</span>}
                                                        {pdv.if && <span className="px-1.5 py-0.5 rounded bg-muted">IF: {pdv.if}</span>}
                                                        {pdv.ice && <span className="px-1.5 py-0.5 rounded bg-muted">ICE: {pdv.ice}</span>}
                                                        {pdv.patente && <span className="px-1.5 py-0.5 rounded bg-muted">Patente: {pdv.patente}</span>}
                                                        {pdv.cnss && <span className="px-1.5 py-0.5 rounded bg-muted">CNSS: {pdv.cnss}</span>}
                                                        {pdv.rc && <span className="px-1.5 py-0.5 rounded bg-muted">RC: {pdv.rc}</span>}
                                                        {pdv.adresse && <span className="px-1.5 py-0.5 rounded bg-muted">Adresse: {pdv.adresse}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-6 py-4 align-middle">
                                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                {pdv.email && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Mail className="h-3 w-3" />
                                                        <span>{pdv.email}</span>
                                                    </span>
                                                )}
                                                {pdv.telephone && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Phone className="h-3 w-3" />
                                                        <span>{pdv.telephone}</span>
                                                    </span>
                                                )}
                                                {pdv.num_tel && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Phone className="h-3 w-3" />
                                                        <span>{pdv.num_tel}</span>
                                                    </span>
                                                )}
                                                {!pdv.email && !pdv.telephone && !pdv.num_tel && (
                                                    <span className="text-[11px] text-muted-foreground/70">—</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right px-6 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleViewProducts(pdv)}
                                                    className="h-9 px-3 gap-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                    <span className="hidden sm:inline">Produits</span>
                                                </Button>
                                                {canManagePdv && (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleEdit(pdv)}
                                                            className="h-9 w-9 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDelete(pdv.id)}
                                                            className="h-9 w-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                                        >
                                                            <Trash className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination UI */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 bg-card border border-border rounded-2xl shadow-sm">
                    <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest hidden sm:block">
                        Page <span className="text-foreground">{currentPage}</span> / {totalPages}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-xl border-border hover:bg-muted"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-xl border-border hover:bg-muted"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-xl border-border hover:bg-muted"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-xl border-border hover:bg-muted"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Products Modal */}
            <Dialog open={isProductsModalOpen} onOpenChange={setIsProductsModalOpen}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-3xl">
                    {/* Premium gradient header */}
                    <DialogHeader className="shrink-0 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.3),transparent_50%)]" />

                        <div className="relative p-6 pb-0">
                            <div className="flex items-center gap-4">
                                <div className="h-14 w-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-lg">
                                    <Store className="h-7 w-7 text-white" />
                                </div>
                                <div>
                                    <DialogTitle className="text-2xl font-black tracking-tight text-white">
                                        {selectedPdv?.nom}
                                    </DialogTitle>
                                    <p className="text-indigo-200 text-xs font-bold uppercase tracking-[0.25em] mt-1">
                                        Inventaire produits
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stat cards */}
                        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 p-6 pt-5">
                            {/* Total grammage (vendu + restant) */}
                            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-3 border border-white/10">
                                <p className="text-indigo-200 text-[9px] font-black uppercase tracking-widest mb-1">
                                    Total grammage
                                </p>
                                <p className="text-base font-extrabold text-white leading-none">
                                    {totalGrammageInitial.toLocaleString("fr-FR")}
                                    <span className="text-[10px] font-bold text-indigo-200 ml-1">g</span>
                                </p>
                            </div>

                            {/* Total grammage vendu */}
                            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-3 border border-white/10">
                                <p className="text-indigo-200 text-[9px] font-black uppercase tracking-widest mb-1">
                                    Total grammage vendu
                                </p>
                                <p className="text-base font-extrabold text-white leading-none">
                                    {totalGrammageVendu.toLocaleString("fr-FR")}
                                    <span className="text-[10px] font-bold text-indigo-200 ml-1">g</span>
                                </p>
                            </div>

                            {/* Total grammage restant (stock * grammage - vendu) */}
                            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-3 border border-white/10">
                                <p className="text-indigo-200 text-[9px] font-black uppercase tracking-widest mb-1">
                                    Grammage restant
                                </p>
                                <p className="text-base font-extrabold text-white leading-none">
                                    {totalGrammageRestant.toLocaleString("fr-FR")}
                                    <span className="text-[10px] font-bold text-indigo-200 ml-1">g</span>
                                </p>
                            </div>

                            {/* Nombre d'articles */}
                            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-3 border border-white/10">
                                <p className="text-indigo-200 text-[9px] font-black uppercase tracking-widest mb-1">
                                    Articles
                                </p>
                                <p className="text-base font-extrabold text-white leading-none">
                                    {pdvProducts.length}
                                    <span className="text-[10px] font-bold text-indigo-200 ml-1">pcs</span>
                                </p>
                            </div>

                            {/* Valeur totale (admin uniquement) */}
                            {isAdmin && (
                                <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-3 border border-white/10">
                                    <p className="text-indigo-200 text-[9px] font-black uppercase tracking-widest mb-1">
                                        Valeur Totale
                                    </p>
                                    <p className="text-base font-extrabold text-white leading-none">
                                        {pdvProducts
                                            .reduce((sum, p) => sum + (Number(p.prix) || 0), 0)
                                            .toLocaleString("fr-FR")}
                                        <span className="text-[10px] font-bold text-indigo-200 ml-1">DH</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    </DialogHeader>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto bg-slate-50/80 dark:bg-slate-950/50">
                        {isProductsLoading ? (
                            <div className="p-6 space-y-3">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="h-20 bg-white dark:bg-slate-900 rounded-2xl animate-pulse border border-slate-100 dark:border-white/5" />
                                ))}
                            </div>
                        ) : pdvProducts.length === 0 ? (
                            <div className="py-24 text-center">
                                <div className="h-20 w-20 mx-auto mb-5 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center">
                                    <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-400 dark:text-slate-500">Aucun produit</h3>
                                <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">Ce point de vente ne contient pas encore de produits.</p>
                            </div>
                        ) : (
                            <div className="p-5 space-y-2.5">
                                {pdvProducts.map((product) => (
                                    (() => {
                                        const productPhotoUrl = getProductPhotoUrl(product.photo);
                                        return (
                                    <div
                                        key={product.id}
                                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-2xl p-4 hover:shadow-lg hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all duration-300 group"
                                    >
                                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                                            {productPhotoUrl ? (
                                                <img
                                                    src={productPhotoUrl}
                                                    alt={product.nom}
                                                    className="h-14 w-14 rounded-xl object-cover border border-indigo-100 dark:border-indigo-900/40 shadow-md ring-1 ring-black/5 dark:ring-white/10 transition-transform duration-300 group-hover:scale-105"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = "none";
                                                    }}
                                                />
                                            ) : (
                                                <div className="h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
                                                    <Package className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                                </div>
                                            )}

                                            <div className="min-w-0">
                                                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                    {product.nom}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                        {product.category_name}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-mono truncate">
                                                        {product.reference || "—"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <div className="text-center px-3 py-2 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/30 min-w-[82px]">
                                                    <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest">Grammage</p>
                                                    <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5 leading-none">
                                                        {Number(product.grammage || 0).toLocaleString('fr-FR')}
                                                        <span className="text-[10px] font-bold opacity-60 ml-0.5">g</span>
                                                    </p>
                                                </div>
                                                <div className="text-right min-w-[88px]">
                                                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Prix</p>
                                                    <p className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5 leading-none">
                                                        {Number(product.prix).toLocaleString('fr-FR')}
                                                        <span className="text-[10px] font-bold opacity-50 ml-0.5">DH</span>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                        );
                                    })()
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {pdvProducts.length} produit{pdvProducts.length !== 1 ? 's' : ''} • Mis à jour en temps réel
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs font-bold text-slate-500 hover:text-slate-700"
                            onClick={() => setIsProductsModalOpen(false)}
                        >
                            Fermer
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!pdvToDelete} onOpenChange={(open) => !open && setPdvToDelete(null)}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce point de vente ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action est irréversible. Le point de vente sera définitivement supprimé.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700 rounded-xl">
                            Confirmer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
