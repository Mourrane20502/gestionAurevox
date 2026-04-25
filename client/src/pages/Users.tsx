import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Plus, Edit, Trash, Search, User, Eye, EyeOff, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
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

interface UserData {
    id: number;
    nom: string;
    prenom: string;
    email: string;
    role: string;
}

export default function Users() {
    const [users, setUsers] = useState<UserData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const [userToDelete, setUserToDelete] = useState<number | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const [formData, setFormData] = useState({
        nom: "",
        prenom: "",
        email: "",
        password: "",
        role: "user",
    });

    const token = localStorage.getItem("token");

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/users/all-users", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
            } else {
                toast.error("Erreur lors de la récupération des utilisateurs");
            }
        } catch (error) {
            console.error("Error fetching users:", error);
            toast.error("Erreur réseau");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (value: string) => {
        setFormData((prev) => ({ ...prev, role: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const isEditing = !!editingUser;
            const url = isEditing ? `/api/users/${editingUser.id}` : "/api/users/create-user";
            const method = isEditing ? "PUT" : "POST";

            // For editing, if password is empty, we might not want to send it or handle it separately
            // But based on controller, it expects all fields.

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                toast.success(isEditing ? "Utilisateur mis à jour !" : "Utilisateur créé !");
                setIsDialogOpen(false);
                setEditingUser(null);
                resetForm();
                fetchUsers();
            } else {
                const data = await response.json();
                toast.error(data.message || "Échec de l'opération");
            }
        } catch (error) {
            toast.error("Erreur lors de l'enregistrement");
        }
    };

    const resetForm = () => {
        setFormData({
            nom: "",
            prenom: "",
            email: "",
            password: "",
            role: "user",
        });
    };

    const handleEdit = (user: UserData) => {
        setEditingUser(user);
        setFormData({
            nom: user.nom,
            prenom: user.prenom,
            email: user.email,
            password: "", // Don't show password
            role: user.role,
        });
        setIsDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!userToDelete) return;
        try {
            const response = await fetch(`/api/users/${userToDelete}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Utilisateur supprimé");
                fetchUsers();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur lors de la suppression");
        } finally {
            setUserToDelete(null);
        }
    };

    const filteredUsers = users.filter((u) =>
        `${u.nom} ${u.prenom}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <User className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Utilisateurs
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gérez les accès et les rôles du personnel</p>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                        setEditingUser(null);
                        resetForm();
                        setShowPassword(false);
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-indigo-600 cursor-pointer hover:bg-indigo-700 text-white shadow-sm">
                            <Plus className="mr-2 h-4 w-4" /> Ajouter un utilisateur
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-lg">
                                <User className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                {editingUser ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="grid gap-5 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="nom">Nom</Label>
                                    <Input id="nom" name="nom" value={formData.nom} onChange={handleInputChange} required />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="prenom">Prénom</Label>
                                    <Input id="prenom" name="prenom" value={formData.prenom} onChange={handleInputChange} required />
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} required />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="password">Mot de passe {editingUser && "(Laissez vide pour conserver)"}</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        required={!editingUser}
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="role">Rôle</Label>
                                <Select onValueChange={handleSelectChange} value={formData.role}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choisir un rôle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="admin">Administrateur</SelectItem>
                                        <SelectItem value="responsable">Responsable</SelectItem>
                                        <SelectItem value="directeur">Directeur</SelectItem>
                                        <SelectItem value="comptable">Comptable</SelectItem>
                                        <SelectItem value="user">Commercial</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogFooter>
                                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                                    {editingUser ? "Mettre à jour" : "Créer l'utilisateur"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher un utilisateur..."
                        className="pl-9 h-10 bg-card border-border"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 border-b border-border">
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Utilisateur</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Email</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Rôle</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={i} className="border-b border-border">
                                    {Array.from({ length: 4 }).map((_, j) => (
                                        <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse w-24" /></TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : filteredUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-16 text-muted-foreground">
                                    Aucun utilisateur trouvé
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedUsers.map((user) => (
                                <TableRow key={user.id} className="group border-b border-border hover:bg-muted/30 transition-colors">
                                    <TableCell className="py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                                                {user.nom.charAt(0)}{user.prenom.charAt(0)}
                                            </div>
                                            <span className="font-medium">{user.nom} {user.prenom}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                                    <TableCell>
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                user.role === 'admin'
                                                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                                                    : user.role === 'responsable'
                                                        ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                                                        : user.role === 'directeur'
                                                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                                                            : user.role === 'comptable'
                                                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                                            }`}
                                        >
                                            {user.role === 'admin'
                                                ? 'Administrateur'
                                                : user.role === 'responsable'
                                                    ? 'Responsable'
                                                    : user.role === 'directeur'
                                                        ? 'Directeur'
                                                        : user.role === 'comptable'
                                                            ? 'Comptable'
                                                        : 'Commercial'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onClick={() => handleEdit(user)} className="cursor-pointer">
                                                    <Edit className="h-4 w-4" />
                                                    Modifier
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setUserToDelete(user.id)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                    <Trash className="h-4 w-4" />
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

            {/* Pagination UI */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4 bg-card border-t border-border rounded-b-xl shadow-sm">
                    <div className="text-xs text-muted-foreground font-medium hidden sm:block">
                        Affichage de <span className="text-foreground font-bold">{(currentPage - 1) * itemsPerPage + 1}</span>-
                        <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> sur
                        <span className="text-foreground font-bold"> {filteredUsers.length}</span>
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
                            {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 3) pageNum = i + 1;
                                else if (currentPage <= 2) pageNum = i + 1;
                                else if (currentPage >= totalPages - 1) pageNum = totalPages - 2 + i;
                                else pageNum = currentPage - 1 + i;

                                return (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? "default" : "outline"}
                                        size="icon"
                                        className={cn(
                                            "h-8 w-8 transition-all duration-300 text-xs",
                                            currentPage === pageNum
                                                ? "bg-indigo-600 text-white font-bold"
                                                : "text-muted-foreground"
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

            <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cet utilisateur ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action est irréversible. L'utilisateur perdra tout accès au système.
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
