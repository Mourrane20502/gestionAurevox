import { useEffect, useState } from "react";
import { Plus, Edit, Trash, Search, ListOrdered, LayoutGrid, Table as TableIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical } from "lucide-react";
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/common/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Category {
    id: number;
    nom: string;
}

const CATEGORY_COLORS = [
    { bg: "bg-indigo-50 dark:bg-indigo-900/20", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-100 dark:border-indigo-900/30", dot: "bg-indigo-500" },
    { bg: "bg-purple-50 dark:bg-purple-900/20", text: "text-purple-600 dark:text-purple-400", border: "border-purple-100 dark:border-purple-900/30", dot: "bg-purple-500" },
    { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-100 dark:border-emerald-900/30", dot: "bg-emerald-500" },
    { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", border: "border-amber-100 dark:border-amber-900/30", dot: "bg-amber-500" },
    { bg: "bg-rose-50 dark:bg-rose-900/20", text: "text-rose-600 dark:text-rose-400", border: "border-rose-100 dark:border-rose-900/30", dot: "bg-rose-500" },
    { bg: "bg-sky-50 dark:bg-sky-900/20", text: "text-sky-600 dark:text-sky-400", border: "border-sky-100 dark:border-sky-900/30", dot: "bg-sky-500" },
];

export default function Categories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryToDelete, setCategoryToDelete] = useState<number | null>(null);

    const [categoryName, setCategoryName] = useState("");

    const token = localStorage.getItem("token");
    const isAdmin = localStorage.getItem("role") === "admin";

    const fetchCategories = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/categories", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) setCategories(await response.json());
        } catch (error) {
            console.error("Error fetching categories:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchCategories(); }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const url = editingCategory ? `/api/categories/${editingCategory.id}` : "/api/categories";
            const method = editingCategory ? "PUT" : "POST";
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: categoryName }),
            });
            if (response.ok) {
                toast.success(editingCategory ? "Catégorie mise à jour !" : "Catégorie créée !");
                setIsDialogOpen(false);
                setEditingCategory(null);
                setCategoryName("");
                fetchCategories();
            } else {
                toast.error("Échec de l'enregistrement");
            }
        } catch {
            toast.error("Erreur lors de l'enregistrement");
        }
    };

    const handleDelete = (id: number) => setCategoryToDelete(id);

    const confirmDelete = async () => {
        if (!categoryToDelete) return;
        try {
            const response = await fetch(`/api/categories/${categoryToDelete}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Catégorie supprimée");
                fetchCategories();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur lors de la suppression");
        } finally {
            setCategoryToDelete(null);
        }
    };

    const handleEdit = (category: Category) => {
        setEditingCategory(category);
        setCategoryName(category.nom);
        setIsDialogOpen(true);
    };

    const filteredCategories = categories.filter((cat) =>
        cat.nom.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);
    const paginatedCategories = filteredCategories.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ListOrdered className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Catégories
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Organisez vos produits par catégories</p>
                </div>
                {isAdmin && (
                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) { setEditingCategory(null); setCategoryName(""); }
                    }}>
                        <DialogTrigger asChild>
                            <Button className="bg-indigo-600 cursor-pointer hover:bg-indigo-700 text-white shadow-sm">
                                <Plus className="mr-2 h-4 w-4" /> Ajouter une catégorie
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[440px]">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-lg">
                                    <ListOrdered className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                    {editingCategory ? "Modifier la catégorie" : "Nouvelle catégorie"}
                                </DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="grid gap-5 py-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="name" className="text-sm font-medium">Nom *</Label>
                                    <Input
                                        id="name"
                                        value={categoryName}
                                        onChange={(e) => setCategoryName(e.target.value)}
                                        required
                                        className="h-10"
                                        placeholder="Ex: Électronique, Vêtements..."
                                    />
                                </div>
                                <DialogFooter>
                                    <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                                        {editingCategory ? "Mettre à jour" : "Créer"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Stats & Controls */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-8 px-3 rounded-md transition-all", viewMode === "grid" ? "bg-card shadow-sm text-indigo-600 dark:text-indigo-400" : "text-muted-foreground")}
                            onClick={() => setViewMode("grid")}
                        >
                            <LayoutGrid className="h-4 w-4 mr-2" /> Grille
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-8 px-3 rounded-md transition-all", viewMode === "table" ? "bg-card shadow-sm text-indigo-600 dark:text-indigo-400" : "text-muted-foreground")}
                            onClick={() => setViewMode("table")}
                        >
                            <TableIcon className="h-4 w-4 mr-2" /> Tableau
                        </Button>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <p className="text-sm text-muted-foreground">
                        <span className="font-bold text-foreground">{categories.length}</span> catégories au total
                    </p>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher..."
                        className="pl-9 h-9 bg-muted border-transparent focus:bg-card focus:border-indigo-500 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Content View */}
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : filteredCategories.length === 0 ? (
                <div className="bg-card rounded-xl border border-dashed border-border py-16 text-center">
                    <ListOrdered className="h-10 w-10 text-muted mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">Aucune catégorie trouvée</p>
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {paginatedCategories.map((cat, idx) => {
                        const style = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                        return (
                            <div
                                key={cat.id}
                                className={cn(
                                    "group relative bg-card p-5 rounded-2xl border transition-all duration-300 hover:shadow-lg hover:-translate-y-1",
                                    style.border
                                )}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center font-bold text-lg", style.bg, style.text)}>
                                        {cat.nom.charAt(0).toUpperCase()}
                                    </div>
                                    {isAdmin && (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleEdit(cat)}
                                                className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cat.id)}
                                                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                            >
                                                <Trash className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground leading-tight">{cat.nom}</h3>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 border-b border-border">
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase py-3 px-6">Nom</TableHead>
                                {isAdmin && <TableHead className="text-xs font-semibold text-muted-foreground uppercase py-3 px-6 text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedCategories.map((cat) => (
                                <TableRow key={cat.id} className="hover:bg-muted/30 transition-colors border-b border-border">
                                    <TableCell className="font-semibold text-foreground px-6 py-4">{cat.nom}</TableCell>
                                    {isAdmin && (
                                        <TableCell className="text-right px-6 py-4">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem onClick={() => handleEdit(cat)} className="cursor-pointer">
                                                        <Edit className="h-4 w-4" />
                                                        Modifier
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDelete(cat.id)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                        <Trash className="h-4 w-4" />
                                                        Supprimer
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Pagination UI */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4 bg-card border-t border-border rounded-b-xl shadow-sm">
                    <div className="text-xs text-muted-foreground font-medium hidden sm:block">
                        Affichage de <span className="text-foreground font-bold">{(currentPage - 1) * itemsPerPage + 1}</span>-
                        <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredCategories.length)}</span> sur
                        <span className="text-foreground font-bold"> {filteredCategories.length}</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 ml-auto sm:ml-0">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95 text-muted-foreground"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95 text-muted-foreground"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <div className="flex items-center gap-1 mx-1">
                            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 2) {
                                    pageNum = i + 1;
                                } else if (currentPage >= totalPages - 1) {
                                    pageNum = totalPages - 2 + i;
                                } else {
                                    pageNum = currentPage - 1 + i;
                                }

                                return (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? "default" : "outline"}
                                        size="icon"
                                        className={cn(
                                            "h-8 w-8 transition-all duration-300 active:scale-95 text-xs",
                                            currentPage === pageNum
                                                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 dark:shadow-none font-bold"
                                                : "border-border hover:bg-muted hover:text-indigo-600 text-muted-foreground"
                                        )}
                                        onClick={() => setCurrentPage(pageNum)}
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>

                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95 text-muted-foreground"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95 text-muted-foreground"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette catégorie ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action est irréversible. Toutes les références associées pourraient être affectées.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
