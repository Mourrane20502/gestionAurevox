import { useEffect, useState } from "react";
import { Wallet, Plus, Edit, Trash, Search, ArrowDownCircle, ArrowUpCircle, Filter, Landmark, MoreVertical, Calendar } from "lucide-react";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CaisseEntry {
    id: number;
    type: 'recette' | 'depense';
    montant: number;
    descriptif: string;
    id_banque: number | null;
    nom_banque?: string;
    created_at: string;
}

interface Banque {
    id: number;
    nom_banque: string;
}

export default function Caisse() {
    const [entries, setEntries] = useState<CaisseEntry[]>([]);
    const [banques, setBanques] = useState<Banque[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<CaisseEntry | null>(null);
    const [entryToDelete, setEntryToDelete] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        type: "recette",
        montant: "",
        descriptif: "",
        id_banque: "0", // "0" means none
    });

    const token = localStorage.getItem("token");

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [caisseRes, banqueRes] = await Promise.all([
                fetch("/api/caisse", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/banque", { headers: { Authorization: `Bearer ${token}` } })
            ]);

            if (caisseRes.ok) {
                const data = await caisseRes.json();
                setEntries(data);
            }
            if (banqueRes.ok) {
                const data = await banqueRes.json();
                setBanques(data);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Erreur lors du chargement des données");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const resetForm = () => {
        setFormData({
            type: "recette",
            montant: "",
            descriptif: "",
            id_banque: "0",
        });
        setEditingEntry(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const payload = {
            ...formData,
            montant: parseFloat(formData.montant),
            id_banque: formData.id_banque === "0" ? null : parseInt(formData.id_banque)
        };

        if (isNaN(payload.montant) || payload.montant <= 0) {
            toast.error("Veuillez entrer un montant valide");
            return;
        }

        try {
            const isEditing = !!editingEntry;
            const url = isEditing ? `/api/caisse/${editingEntry.id}` : "/api/caisse";
            const method = isEditing ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                toast.success(isEditing ? "Entrée mise à jour" : "Entrée ajoutée");
                setIsDialogOpen(false);
                resetForm();
                fetchData();
            } else {
                const error = await response.json();
                toast.error(error.message || "Une erreur est survenue");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    const handleEdit = (entry: CaisseEntry) => {
        setEditingEntry(entry);
        setFormData({
            type: entry.type,
            montant: entry.montant.toString(),
            descriptif: entry.descriptif || "",
            id_banque: entry.id_banque?.toString() || "0",
        });
        setIsDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!entryToDelete) return;
        try {
            const response = await fetch(`/api/caisse/${entryToDelete}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Entrée supprimée");
                fetchData();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch {
            toast.error("Erreur réseau");
        } finally {
            setEntryToDelete(null);
        }
    };

    const filteredEntries = entries.filter(e =>
        e.descriptif?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.nom_banque?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalRecettes = entries.filter(e => e.type === 'recette').reduce((acc, curr) => acc + Number(curr.montant), 0);
    const totalDepenses = entries.filter(e => e.type === 'depense').reduce((acc, curr) => acc + Number(curr.montant), 0);
    const soldeCaisse = totalRecettes - totalDepenses;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                        <Wallet className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Gestion de la Caisse
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Suivez vos recettes et dépenses en temps réel</p>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 dark:shadow-none">
                            <Plus className="mr-2 h-4 w-4" /> Nouvelle Opération
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                {editingEntry ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                                {editingEntry ? "Modifier l'opération" : "Nouvelle opération"}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="type">Type d'opération</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(v) => handleSelectChange("type", v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choisir le type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="recette">Recette (Entrée)</SelectItem>
                                        <SelectItem value="depense">Dépense (Sortie)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="montant">Montant (DH)</Label>
                                <Input
                                    id="montant"
                                    name="montant"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.montant}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="id_banque">Banque (Optionnel)</Label>
                                <Select
                                    value={formData.id_banque}
                                    onValueChange={(v) => handleSelectChange("id_banque", v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Aucune banque" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">Aucune (Espèces)</SelectItem>
                                        {banques.map(b => (
                                            <SelectItem key={b.id} value={b.id.toString()}>
                                                {b.nom_banque}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="descriptif">Description</Label>
                                <Input
                                    id="descriptif"
                                    name="descriptif"
                                    placeholder="Ex: Vente bijoux, Achat fournitures..."
                                    value={formData.descriptif}
                                    onChange={handleInputChange}
                                />
                            </div>

                            <DialogFooter className="pt-4">
                                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
                                    {editingEntry ? "Enregistrer les modifications" : "Ajouter à la caisse"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <ArrowDownCircle className="h-16 w-16 text-emerald-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Recettes</p>
                    <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                        {totalRecettes.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DH
                    </h3>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <ArrowUpCircle className="h-16 w-16 text-rose-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Dépenses</p>
                    <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400">
                        {totalDepenses.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DH
                    </h3>
                </div>

                <div className="bg-indigo-600 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                        <Wallet className="h-16 w-16 text-white" />
                    </div>
                    <p className="text-xs font-bold text-indigo-100 uppercase tracking-widest mb-1">Solde Actuel</p>
                    <h3 className="text-2xl font-black text-white">
                        {soldeCaisse.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DH
                    </h3>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Rechercher une opération..."
                            className="pl-9 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="rounded-xl gap-2">
                            <Filter className="h-4 w-4" /> Filtrer
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-xl gap-2">
                            <Calendar className="h-4 w-4" /> Date
                        </Button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date & Heure</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Banque</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Montant</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="px-6 py-4"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full"></div></td>
                                    </tr>
                                ))
                            ) : filteredEntries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                                        Aucune opération trouvée
                                    </td>
                                </tr>
                            ) : (
                                filteredEntries.map((entry) => (
                                    <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-900 dark:text-white">
                                                    {new Date(entry.created_at).toLocaleDateString('fr-FR')}
                                                </span>
                                                <span className="text-[10px] text-slate-400">
                                                    {new Date(entry.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                                entry.type === 'recette'
                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                            )}>
                                                {entry.type === 'recette' ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                                                {entry.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-slate-600 dark:text-slate-300 line-clamp-1">
                                                {entry.descriptif || "—"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {entry.nom_banque ? (
                                                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                    <Landmark className="h-3 w-3" />
                                                    {entry.nom_banque}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Espèces</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={cn(
                                                "text-sm font-bold",
                                                entry.type === 'recette' ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                            )}>
                                                {entry.type === 'recette' ? "+" : "-"} {Number(entry.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DH
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                                        <MoreVertical className="h-4 w-4 text-slate-400" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                                    <DropdownMenuItem onClick={() => handleEdit(entry)} className="gap-2 focus:bg-amber-50 focus:text-amber-600">
                                                        <Edit className="h-4 w-4" /> Modifier
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setEntryToDelete(entry.id)} className="gap-2 focus:bg-rose-50 focus:text-rose-600">
                                                        <Trash className="h-4 w-4" /> Supprimer
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))
                            )}
                            {!isLoading && filteredEntries.length > 0 && (
                                <tr className="bg-slate-50/50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                                    <td colSpan={4} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        Totaux Filtrés
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-emerald-600 dark:text-emerald-400 text-xs">
                                                Recettes: +{filteredEntries.filter(e => e.type === 'recette').reduce((acc, curr) => acc + Number(curr.montant), 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DH
                                            </span>
                                            <span className="text-rose-600 dark:text-rose-400 text-xs">
                                                Dépenses: -{filteredEntries.filter(e => e.type === 'depense').reduce((acc, curr) => acc + Number(curr.montant), 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DH
                                            </span>
                                            <span className="text-indigo-600 dark:text-indigo-400 text-sm border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                                                Solde: {(filteredEntries.filter(e => e.type === 'recette').reduce((acc, curr) => acc + Number(curr.montant), 0) - filteredEntries.filter(e => e.type === 'depense').reduce((acc, curr) => acc + Number(curr.montant), 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DH
                                            </span>
                                        </div>
                                    </td>
                                    <td></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Delete Confirmation */}
            <AlertDialog open={!!entryToDelete} onOpenChange={(open) => !open && setEntryToDelete(null)}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette opération ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action est irréversible. Le montant sera retiré de l'historique de la caisse.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700 rounded-xl">
                            Confirmer la suppression
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
