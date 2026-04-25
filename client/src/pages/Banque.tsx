import { useEffect, useState } from "react";
import { Landmark, Plus, Edit, Trash, Search, Landmark as BankIcon, ArrowUpRight, TrendingUp, CreditCard, Activity, CheckCircle2, XCircle, MoreVertical } from "lucide-react";
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
import { Switch } from "@/components/common/ui/switch";
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

interface Banque {
    id: number;
    nom_banque: string;
    nom_compte: string;
    numero_compte: string;
    devise: string;
    solde_initial: number;
    solde_actuel: number;
    actif: boolean | number;
}

export default function Banque() {
    const [banques, setBanques] = useState<Banque[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [liquiditeTotale, setLiquiditeTotale] = useState(0);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBanque, setEditingBanque] = useState<Banque | null>(null);
    const [banqueToDelete, setBanqueToDelete] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        nom_banque: "",
        nom_compte: "",
        numero_compte: "",
        devise: "MAD",
        solde_initial: 0,
        solde_actuel: 0,
        actif: true,
    });

    const token = localStorage.getItem("token");

    const fetchBanques = async () => {
        setIsLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const [banqueRes, regCliRes, avoirRes, caisseRes, rembRes, regFourRes] = await Promise.all([
                fetch("/api/banque", { headers }),
                fetch("/api/reglements-clients", { headers }),
                fetch("/api/avoirs", { headers }),
                fetch("/api/caisse", { headers }),
                fetch("/api/remboursements", { headers }),
                fetch("/api/reglements-fournisseurs", { headers }),
            ]);

            const banqueData = banqueRes.ok ? await banqueRes.json() : [];
            const reglementsClients = regCliRes.ok ? await regCliRes.json() : [];
            const avoirs = avoirRes.ok ? await avoirRes.json() : [];
            const caisse = caisseRes.ok ? await caisseRes.json() : [];
            const remboursements = rembRes.ok ? await rembRes.json() : [];
            const reglementsFournisseurs = regFourRes.ok ? await regFourRes.json() : [];

            setBanques(Array.isArray(banqueData) ? banqueData : []);

            const soldeCourant = Array.isArray(banqueData)
                ? banqueData.reduce((sum: number, b: any) => sum + (Number(b.solde_actuel) || 0), 0)
                : 0;
            const totalReglementsClients = Array.isArray(reglementsClients)
                ? reglementsClients.reduce((sum: number, r: any) => sum + (Number(r.montant) || 0), 0)
                : 0;
            const totalAvoirs = Array.isArray(avoirs)
                ? avoirs.reduce((sum: number, a: any) => sum + (Number(a.montant_ttc) || 0), 0)
                : 0;
            const totalCaisse = Array.isArray(caisse)
                ? caisse.reduce((sum: number, c: any) => sum + (Number(c.montant) || 0), 0)
                : 0;
            const totalRemboursements = Array.isArray(remboursements)
                ? remboursements.reduce((sum: number, r: any) => sum + (Number(r.montant) || 0), 0)
                : 0;
            const totalReglementsFournisseurs = Array.isArray(reglementsFournisseurs)
                ? reglementsFournisseurs.reduce((sum: number, r: any) => sum + (Number(r.montant) || 0), 0)
                : 0;

            const liquidite =
                soldeCourant +
                totalReglementsClients -
                totalAvoirs -
                totalCaisse -
                totalRemboursements -
                totalReglementsFournisseurs;

            setLiquiditeTotale(liquidite);
        } catch (error) {
            console.error("Error fetching banques:", error);
            toast.error("Erreur lors du chargement des banques");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBanques();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: name.includes("solde") ? parseFloat(value) || 0 : value,
        }));
    };

    const handleSwitchChange = (checked: boolean) => {
        setFormData((prev) => ({
            ...prev,
            actif: checked,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const url = editingBanque ? `/api/banque/${editingBanque.id}` : "/api/banque";
            const method = editingBanque ? "PUT" : "POST";
            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                toast.success(editingBanque ? "Compte bancaire mis à jour" : "Compte bancaire créé");
                setIsDialogOpen(false);
                setEditingBanque(null);
                resetForm();
                fetchBanques();
            } else {
                toast.error("Échec de l'enregistrement");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    const handleEdit = (banque: Banque) => {
        setEditingBanque(banque);
        setFormData({
            nom_banque: banque.nom_banque,
            nom_compte: banque.nom_compte,
            numero_compte: banque.numero_compte,
            devise: banque.devise,
            solde_initial: banque.solde_initial,
            solde_actuel: banque.solde_actuel,
            actif: !!banque.actif,
        });
        setIsDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!banqueToDelete) return;
        try {
            const response = await fetch(`/api/banque/${banqueToDelete}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Compte bancaire supprimé");
                fetchBanques();
            } else {
                toast.error("Échec de la suppression");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        } finally {
            setBanqueToDelete(null);
        }
    };

    const resetForm = () => {
        setFormData({
            nom_banque: "",
            nom_compte: "",
            numero_compte: "",
            devise: "MAD",
            solde_initial: 0,
            solde_actuel: 0,
            actif: true,
        });
    };

    const filteredBanques = banques.filter((b) =>
        b.nom_banque.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.nom_compte.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.numero_compte.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeAccounts = banques.filter(b => b.actif).length;

    return (
        <div className="space-y-8 pb-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3 tracking-tight">
                        <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none">
                            <Landmark className="h-6 w-6 text-white" />
                        </div>
                        Trésorerie Bancaire
                    </h1>
                    <p className="text-muted-foreground mt-1 font-medium">Gestion centralisée de vos actifs et comptes financiers</p>
                </div>

                <div className="flex items-center gap-3">
                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) {
                            setEditingBanque(null);
                            resetForm();
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-100 dark:shadow-none h-11 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                                <Plus className="mr-2 h-5 w-5" /> Nouveau Compte
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[550px] rounded-2xl border-none shadow-2xl">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                                    <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                                        <Landmark className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    {editingBanque ? "Modifier le compte" : "Ajouter un compte"}
                                </DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="grid gap-6 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="nom_banque" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Banque</Label>
                                        <Input id="nom_banque" name="nom_banque" value={formData.nom_banque} onChange={handleInputChange} required className="h-12 border-muted-foreground/20 focus:border-indigo-500 bg-muted/5 rounded-xl" placeholder="ex: Attijariwafa" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="nom_compte" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Intitulé</Label>
                                        <Input id="nom_compte" name="nom_compte" value={formData.nom_compte} onChange={handleInputChange} required className="h-12 border-muted-foreground/20 focus:border-indigo-500 bg-muted/5 rounded-xl" placeholder="ex: Compte Courant" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="numero_compte" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Numéro de Compte / IBAN</Label>
                                    <Input id="numero_compte" name="numero_compte" value={formData.numero_compte} onChange={handleInputChange} required className="h-12 font-mono border-muted-foreground/20 focus:border-indigo-500 bg-muted/5 rounded-xl" placeholder="000 000 000..." />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="solde_initial" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Solde Initial</Label>
                                        <Input id="solde_initial" name="solde_initial" type="number" step="0.01" value={formData.solde_initial} onChange={handleInputChange} className="h-12 border-muted-foreground/20 focus:border-indigo-500 bg-muted/5 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="solde_actuel" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Solde Actuel</Label>
                                        <Input id="solde_actuel" name="solde_actuel" type="number" step="0.01" value={formData.solde_actuel} onChange={handleInputChange} className="h-12 border-muted-foreground/20 focus:border-indigo-500 bg-muted/5 rounded-xl" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="devise" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Devise</Label>
                                        <Input id="devise" name="devise" value={formData.devise} onChange={handleInputChange} className="h-12 border-muted-foreground/20 focus:border-indigo-500 bg-muted/5 rounded-xl" />
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <div className="flex items-center justify-between p-3 border border-muted-foreground/20 rounded-xl bg-muted/5 mt-4">
                                            <Label className="text-[10px] font-bold uppercase">Actif</Label>
                                            <Switch
                                                checked={formData.actif}
                                                onCheckedChange={handleSwitchChange}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter className="mt-2">
                                    <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white w-full h-12 rounded-xl font-bold shadow-lg shadow-indigo-100">
                                        {editingBanque ? "Enregistrer les modifications" : "Créer le compte"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats Cards Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-indigo-600 rounded-[2rem] p-8 text-white shadow-2xl shadow-indigo-200 dark:shadow-none relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-white/20 backdrop-blur-md rounded-lg">
                                <TrendingUp className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-indigo-100 text-xs font-bold uppercase tracking-widest">Liquidités Totales</span>
                        </div>
                        <h2 className="text-4xl font-black mb-1 tracking-tight">
                            {liquiditeTotale.toLocaleString()}
                            <span className="text-lg font-normal opacity-70 ml-2">MAD</span>
                        </h2>
                        <div className="flex items-center gap-1.5 text-indigo-100/80 text-sm mt-4 bg-white/10 w-fit px-3 py-1 rounded-full backdrop-blur-sm">
                            <Activity className="h-3.5 w-3.5" />
                            <span>Mise à jour en temps réel</span>
                        </div>
                    </div>
                    <BankIcon className="absolute -right-10 -bottom-10 h-48 w-48 text-white/10 rotate-12 group-hover:rotate-6 transition-transform duration-700" />
                </div>

                <div className="bg-card rounded-[2rem] p-8 border-none shadow-xl shadow-slate-100 dark:shadow-none flex flex-col justify-between group hover:shadow-2xl transition-all duration-500 border border-slate-100 dark:border-slate-800">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Comptes Actifs</span>
                        </div>
                        <h2 className="text-4xl font-black text-foreground">{activeAccounts}</h2>
                    </div>
                    <div className="mt-6 flex items-center justify-between">
                        <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mr-4">
                            <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${(activeAccounts / (banques.length || 1)) * 100}%` }}
                            />
                        </div>
                        <span className="text-xs font-bold text-emerald-600">{Math.round((activeAccounts / (banques.length || 1)) * 100)}%</span>
                    </div>
                </div>

                <div className="bg-card rounded-[2rem] p-8 border-none shadow-xl shadow-slate-100 dark:shadow-none flex flex-col justify-between group hover:shadow-2xl transition-all duration-500 border border-slate-100 dark:border-slate-800">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                                <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Banques Partenaires</span>
                        </div>
                        <h2 className="text-4xl font-black text-foreground">
                            {new Set(banques.map(b => b.nom_banque.toLowerCase())).size}
                        </h2>
                    </div>
                    <p className="text-muted-foreground text-sm mt-4 font-medium flex items-center gap-1">
                        <ArrowUpRight className="h-4 w-4 text-indigo-500" />
                        Diversité du portefeuille bancaire
                    </p>
                </div>
            </div>

            {/* Filter and Search Section */}
            <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-2xl w-fit">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher une banque, un compte..."
                        className="pl-12 h-12 w-80 bg-background border-none shadow-sm rounded-xl focus-visible:ring-indigo-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Bank Cards Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-64 rounded-[2rem] bg-muted animate-pulse border border-slate-100 dark:border-slate-800" />
                    ))}
                </div>
            ) : filteredBanques.length === 0 ? (
                <div className="text-center py-20 bg-muted/20 rounded-[2rem] border-2 border-dashed border-muted">
                    <BankIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-bold text-muted-foreground">Aucun résultat trouvé</h3>
                    <p className="text-muted-foreground/60 max-w-xs mx-auto mt-2 font-medium">Nous n'avons trouvé aucun compte correspondant à votre recherche.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBanques.map((banque) => (
                        <div
                            key={banque.id}
                            className={cn(
                                "group bg-card rounded-[2rem] p-6 border border-slate-100 dark:border-slate-800 shadow-lg hover:shadow-2xl transition-all duration-500 relative overflow-hidden",
                                !banque.actif && "grayscale opacity-80"
                            )}
                        >
                            {/* Card Background Pattern */}
                            <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                                <Landmark className="h-32 w-32" />
                            </div>

                            <div className="relative z-10 flex flex-col h-full">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-500">
                                            <CreditCard className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-xl text-foreground tracking-tight">{banque.nom_banque}</h3>
                                            <p className="text-sm font-bold text-muted-foreground/80">{banque.nom_compte}</p>
                                        </div>
                                    </div>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground">
                                                <MoreVertical className="h-5 w-5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 rounded-xl border-none shadow-xl">
                                            <DropdownMenuItem onClick={() => handleEdit(banque)} className="py-2.5 cursor-pointer rounded-lg">
                                                <Edit className="mr-2 h-4 w-4 text-amber-500" /> Modifier
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => setBanqueToDelete(banque.id)}
                                                className="py-2.5 text-red-600 focus:text-red-600 cursor-pointer rounded-lg"
                                            >
                                                <Trash className="mr-2 h-4 w-4" /> Supprimer
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <div className="mt-auto">
                                    <div className="mb-6 bg-muted/30 p-4 rounded-2xl">
                                        <p className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground mb-1">Numéro de Compte</p>
                                        <p className="font-mono text-sm break-all font-medium text-foreground tracking-tighter">
                                            {banque.numero_compte.replace(/(.{4})/g, '$1 ')}
                                        </p>
                                    </div>

                                    <div className="flex items-end justify-between">
                                        <div>
                                            <p className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground mb-1">Solde Actuel</p>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-black text-foreground tracking-tighter">
                                                    {banque.solde_actuel.toLocaleString()}
                                                </span>
                                                <span className="text-sm font-bold text-muted-foreground">{banque.devise}</span>
                                            </div>
                                        </div>

                                        <div className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                                            banque.actif
                                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                        )}>
                                            {banque.actif ? (
                                                <><CheckCircle2 className="h-3 w-3" /> Actif</>
                                            ) : (
                                                <><XCircle className="h-3 w-3" /> Inactif</>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AlertDialog open={banqueToDelete !== null} onOpenChange={(open) => !open && setBanqueToDelete(null)}>
                <AlertDialogContent className="rounded-2xl border-none shadow-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-bold">Confirmer la suppression</AlertDialogTitle>
                        <AlertDialogDescription className="text-medium">
                            Cette action est définitive. Êtes-vous sûr de vouloir supprimer ce compte bancaire de votre système ?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-0">
                        <AlertDialogCancel className="rounded-xl h-11 border-none bg-muted hover:bg-muted/80">Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-11 font-bold">Supprimer définitivement</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
