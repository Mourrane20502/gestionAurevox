import { useState, useEffect } from "react";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/common/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/common/ui/table";
import { toast } from "sonner";
import {
    Megaphone,
    Plus,
    MessageCircle,
    Send,
    Trash2,
    Search,
    X,
    Users,
    Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/common/ui/badge";

interface Product {
    id: number;
    nom: string;
    reference: string;
}

interface Client {
    id: number;
    nom_complet: string;
    telephone: string;
    type: string;
}

interface NotifyTarget {
    type: 'all' | 'group' | 'client';
    id?: number;
    value?: string;
    label: string;
}

interface NotificationResult {
    client_name: string;
    phone: string;
    message: string;
    link: string;
}

interface Promotion {
    id: number;
    product_id: number | null;
    product_name?: string;
    product_ref?: string;
    label: string;
    description: string;
    discount_percent: number;
    start_date: string;
    end_date: string;
    is_active: boolean;
}

export default function Promotions() {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [showPromoDialog, setShowPromoDialog] = useState(false);
    const [showNotifyDialog, setShowNotifyDialog] = useState(false);
    const [selectedPromo, setSelectedPromo] = useState<Promotion | null>(null);
    const [promoFormData, setPromoFormData] = useState({
        product_id: "",
        label: "",
        description: "",
        discount_percent: "0",
        start_date: "",
        end_date: "",
    });

    // Notify Form
    const [notifyTargets, setNotifyTargets] = useState<NotifyTarget[]>([]);
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);

    const [messageTemplate, setMessageTemplate] = useState("Bonjour {client_name}, profitez de notre promotion '{promo_label}' : -{discount} !");
    const [notificationResults, setNotificationResults] = useState<NotificationResult[]>([]);
    // Aucun canal pré‑sélectionné pour éviter l'auto‑sélection confuse
    const [selectedChannel, setSelectedChannel] = useState<"whatsapp" | "sms" | null>(null);

    const token = localStorage.getItem("token");

    const fetchData = async () => {
        try {
            const [promoRes, prodRes, cliRes] = await Promise.all([
                fetch("/api/promotions", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/clients", { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (promoRes.ok) setPromotions(await promoRes.json());
            if (prodRes.ok) setProducts(await prodRes.json());
            if (cliRes.ok) setClients(await cliRes.json());
        } catch (error) {
            toast.error("Erreur de chargement des données");
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreatePromo = async () => {
        try {
            const res = await fetch("/api/promotions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...promoFormData,
                    product_id: promoFormData.product_id === "none" ? null : promoFormData.product_id
                }),
            });
            if (res.ok) {
                toast.success("Promotion créée avec succès");
                setShowPromoDialog(false);
                fetchData();
            } else {
                toast.error("Erreur lors de la création");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    };

    const handleDeletePromo = async (id: number) => {
        if (!confirm("Voulez-vous vraiment supprimer cette promotion ?")) return;
        try {
            const res = await fetch(`/api/promotions/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Promotion supprimée");
                fetchData();
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    };

    const handlePrepareNotification = (promo: Promotion) => {
        setSelectedPromo(promo);
        setNotificationResults([]);
        setNotifyTargets([]);
        
        const template = promo.product_id 
            ? `Bonjour {client_name},\n\nProfitez de notre promotion '{promo_label}' !\nL'article {product_name} passe de {old_price} à {new_price} (-{discount}).\n\nÀ très vite !`
            : `Bonjour {client_name},\n\nProfitez de notre promotion '{promo_label}' : -{discount} sur {product_name} !\n\nÀ très vite !`;
        setMessageTemplate(template);
        
        setShowNotifyDialog(true);
    };

    const handleSendNotifications = async () => {
        if (!selectedChannel) {
            toast.error("Choisissez d'abord le canal d'envoi (WhatsApp ou SMS)");
            return;
        }

        const targets: number[] = [];
        
        notifyTargets.forEach(target => {
            if (target.type === 'all') {
                clients.forEach(c => {
                    if (!targets.includes(c.id)) targets.push(c.id);
                });
            } else if (target.type === 'group' && target.value) {
                clients.filter(c => c.type === target.value).forEach(c => {
                    if (!targets.includes(c.id)) targets.push(c.id);
                });
            } else if (target.type === 'client' && target.id) {
                if (!targets.includes(target.id)) targets.push(target.id);
            }
        });

        if (targets.length === 0) {
            toast.error("Aucun destinataire sélectionné");
            return;
        }

        try {
            const res = await fetch("/api/promotions/notify", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    promotion_id: selectedPromo?.id,
                    client_ids: targets,
                    message_template: messageTemplate,
                    channel: selectedChannel
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const finalResults = data.results.map((r: any) => {
                    if (selectedChannel === "sms" && r.phone) {
                        const cleanPhone = r.phone.replace(/\D/g, '');
                        return { ...r, link: `sms:${cleanPhone}?body=${encodeURIComponent(r.message)}` };
                    }
                    return r;
                });
                setNotificationResults(finalResults);
                toast.success(`${data.results.length} notifications générées`);
            } else {
                toast.error("Erreur lors de la génération des notifications");
            }
        } catch (error) {
            toast.error("Erreur serveur");
        }
    };

    const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
    const [searchTerm, setSearchTerm] = useState("");

    const filteredPromotions = promotions.filter(p =>
        p.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.product_name && p.product_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                        <Megaphone className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Promotions & Notifications</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Gérez vos offres et communiquez avec vos clients</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode("cards")}
                            className={cn("rounded-lg h-8 px-3", viewMode === "cards" ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600" : "text-slate-500")}
                        >
                            Cartes
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode("table")}
                            className={cn("rounded-lg h-8 px-3", viewMode === "table" ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600" : "text-slate-500")}
                        >
                            Tableau
                        </Button>
                    </div>
                    <Button
                        onClick={() => setShowPromoDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 h-11 flex items-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none transition-all ml-auto md:ml-0"
                    >
                        <Plus className="h-5 w-5" />
                        Nouvelle Promotion
                    </Button>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Input
                        placeholder="Rechercher une promotion ou un produit..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-12 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                    <Megaphone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                </div>
            </div>

            {filteredPromotions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-full mb-4">
                        <Megaphone className="h-10 w-10 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Aucune promotion trouvée</h3>
                    <p className="text-slate-500 max-w-xs text-center mt-1">Créez votre première offre promotionnelle pour commencer à notifier vos clients.</p>
                </div>
            ) : viewMode === "cards" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPromotions.map((promo) => (
                        <Card key={promo.id} className="overflow-hidden border-none shadow-sm group hover:shadow-md transition-all duration-300 bg-white dark:bg-slate-900 rounded-2xl">
                            <CardHeader className="bg-slate-50 dark:bg-slate-800/50 pb-4">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">
                                            -{promo.discount_percent}%
                                        </span>
                                        <CardTitle className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                                            {promo.label}
                                        </CardTitle>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => handleDeletePromo(promo.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                                    {promo.description || "Aucune description"}
                                </p>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Période</span>
                                        <span className="font-medium text-slate-900 dark:text-slate-200">
                                            {new Date(promo.start_date).toLocaleDateString()} Au {new Date(promo.end_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Produit</span>
                                        <span className="font-medium text-indigo-600 truncate max-w-[150px]">
                                            {promo.product_name || "Tous les produits"}
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    onClick={() => handlePrepareNotification(promo)}
                                    className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-200 rounded-xl h-10 flex items-center justify-center gap-2 transition-all border-none"
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    Notifier les clients
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card className="border-none shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                                <TableHead className="font-bold">Libellé</TableHead>
                                <TableHead className="font-bold">Produit</TableHead>
                                <TableHead className="font-bold text-center">Remise</TableHead>
                                <TableHead className="font-bold text-center">Dates</TableHead>
                                <TableHead className="font-bold text-center">Statut</TableHead>
                                <TableHead className="text-right font-bold">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPromotions.map((promo) => (
                                <TableRow key={promo.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                    <TableCell className="font-medium text-slate-900 dark:text-white">{promo.label}</TableCell>
                                    <TableCell className="text-slate-600 dark:text-slate-400">{promo.product_name || "Tous"}</TableCell>
                                    <TableCell className="text-center font-bold text-emerald-600">-{promo.discount_percent}%</TableCell>
                                    <TableCell className="text-center text-xs text-slate-500">
                                        {new Date(promo.start_date).toLocaleDateString()} - {new Date(promo.end_date).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <span className={cn(
                                            "inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                                            promo.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                        )}>
                                            {promo.is_active ? "Actif" : "Inactif"}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600" onClick={() => handlePrepareNotification(promo)}>
                                            <Send className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDeletePromo(promo.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )
            }

            {/* Dialog Create Promo */}
            <Dialog open={showPromoDialog} onOpenChange={setShowPromoDialog}>
                <DialogContent className="max-w-3xl rounded-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <Plus className="h-5 w-5 text-indigo-600" />
                            Nouvelle Promotion
                        </DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Libellé</Label>
                            <Input
                                placeholder="Ex: Offre Spéciale Eid"
                                value={promoFormData.label}
                                onChange={(e) => setPromoFormData({ ...promoFormData, label: e.target.value })}
                                className="rounded-xl border-slate-200"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Remise (%)</Label>
                                <Input
                                    type="number"
                                    value={promoFormData.discount_percent}
                                    onChange={(e) => setPromoFormData({ ...promoFormData, discount_percent: e.target.value })}
                                    className="rounded-xl border-slate-200"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Produit Spécifique</Label>
                                <Select
                                    value={promoFormData.product_id || "none"}
                                    onValueChange={(v) => setPromoFormData({ ...promoFormData, product_id: v })}
                                >
                                    <SelectTrigger className="rounded-xl border-slate-200">
                                        <SelectValue placeholder="Sélectionner un produit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Tous les produits</SelectItem>
                                        {products.map(p => (
                                            <SelectItem key={p.id} value={p.id.toString()}>{p.nom} ({p.reference})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date Début</Label>
                                <Input
                                    type="date"
                                    value={promoFormData.start_date}
                                    onChange={(e) => setPromoFormData({ ...promoFormData, start_date: e.target.value })}
                                    className="rounded-xl border-slate-200"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date Fin</Label>
                                <Input
                                    type="date"
                                    value={promoFormData.end_date}
                                    onChange={(e) => setPromoFormData({ ...promoFormData, end_date: e.target.value })}
                                    className="rounded-xl border-slate-200"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</Label>
                            <Input
                                placeholder="Détails de l'offre..."
                                value={promoFormData.description}
                                onChange={(e) => setPromoFormData({ ...promoFormData, description: e.target.value })}
                                className="rounded-xl border-slate-200"
                            />
                        </div>
                    </div>
                    <DialogFooter className="p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" onClick={() => setShowPromoDialog(false)}>Annuler</Button>
                        <Button onClick={handleCreatePromo} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6">Enregistrer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog Send Notifications */}
            <Dialog open={showNotifyDialog} onOpenChange={setShowNotifyDialog}>
                <DialogContent className="w-[98vw] max-w-[1600px] h-[95vh] rounded-3xl p-0 overflow-hidden flex flex-col shadow-2xl border-none">
                    <DialogHeader className="p-8 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                        <DialogTitle className="text-2xl font-black flex items-center gap-3 text-slate-900 dark:text-white tracking-tight flex-wrap">
                            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl text-emerald-600">
                                <Send className="h-6 w-6" />
                            </div>
                            <span className="break-words">
                                Envoyer notifications : {selectedPromo?.label}
                            </span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 min-h-0 overflow-hidden p-8 bg-slate-50/30 dark:bg-slate-950/30 flex flex-col">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 min-h-0 flex-1 overflow-hidden">
                            <div className="flex flex-col gap-8 min-h-0 overflow-y-auto overflow-x-hidden pr-4 custom-scrollbar">
                                <div className="space-y-6">
                                    <div className="space-y-3 relative">
                                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Destinataires (Cible)</Label>
                                        <div className="relative group">
                                            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                            <Input 
                                                placeholder="Rechercher 'Tous', un groupe ou un client..." 
                                                value={clientSearch}
                                                onChange={(e) => {
                                                    setClientSearch(e.target.value);
                                                    setShowClientDropdown(e.target.value.trim().length > 0);
                                                }}
                                                onFocus={(e) => setShowClientDropdown(e.target.value.trim().length > 0)}
                                                onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                                                className="pl-10 h-12 rounded-2xl border-slate-200 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                                            />
                                            {showClientDropdown && clientSearch.trim().length > 0 && (
                                                <div className="absolute z-[100] w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl max-h-64 overflow-y-auto overflow-x-hidden p-2 space-y-1 animate-in fade-in slide-in-from-top-2">
                                                    {('tous les clients'.includes(clientSearch.toLowerCase())) && !notifyTargets.some(t => t.type === 'all') && (
                                                        <div 
                                                            className="px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl cursor-pointer flex items-center gap-3 transition-colors group/item"
                                                            onMouseDown={() => {
                                                                setNotifyTargets([{ type: 'all', label: 'Tous les clients' }]);
                                                                setClientSearch("");
                                                                setShowClientDropdown(false);
                                                            }}
                                                        >
                                                            <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600">
                                                                <Users className="h-4 w-4" />
                                                            </div>
                                                            <span className="text-sm font-bold">Tous les clients</span>
                                                        </div>
                                                    )}
                                                    
                                                    {['particulier', 'revendeur', 'grossiste'].map(type => (
                                                        (!clientSearch || type.includes(clientSearch.toLowerCase())) && !notifyTargets.some(t => t.type === 'group' && t.value === type) && (
                                                            <div 
                                                                key={type}
                                                                className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer flex items-center justify-between transition-colors"
                                                                onMouseDown={() => {
                                                                    setNotifyTargets([...notifyTargets, { type: 'group', value: type, label: `Groupe: ${type.charAt(0).toUpperCase() + type.slice(1)}s` }]);
                                                                    setClientSearch("");
                                                                    setShowClientDropdown(false);
                                                                }}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-2 w-2 rounded-full bg-indigo-400" />
                                                                    <span className="text-sm font-medium capitalize">Clients {type}s</span>
                                                                </div>
                                                                <Plus className="h-3 w-3 text-slate-300" />
                                                            </div>
                                                        )
                                                    ))}

                                                    {clients
                                                        .filter(c => c.nom_complet.toLowerCase().includes(clientSearch.toLowerCase()) && !notifyTargets.some(t => t.id === c.id))
                                                        .slice(0, 10)
                                                        .map(c => (
                                                            <div 
                                                                key={c.id}
                                                                className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer flex items-center justify-between transition-colors"
                                                                onMouseDown={() => {
                                                                    setNotifyTargets([...notifyTargets, { type: 'client', id: c.id, label: c.nom_complet }]);
                                                                    setClientSearch("");
                                                                    setShowClientDropdown(false);
                                                                }}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                                                        {c.nom_complet.charAt(0)}
                                                                    </div>
                                                                    <span className="text-sm font-medium">{c.nom_complet}</span>
                                                                </div>
                                                                <Plus className="h-3 w-3 text-slate-300" />
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-800 min-h-[50px] items-center">
                                            {notifyTargets.map((target, idx) => (
                                                <Badge key={idx} variant="secondary" className="pl-3 pr-1.5 py-1.5 gap-2 rounded-xl bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shadow-sm animate-in zoom-in-95">
                                                    <span className="text-[11px] font-bold">{target.label}</span>
                                                    <button 
                                                        onClick={() => setNotifyTargets(notifyTargets.filter((_, i) => i !== idx))}
                                                        className="p-1 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                            {notifyTargets.length === 0 && (
                                                <div className="flex items-center gap-2 px-3 text-slate-400">
                                                    <Users className="h-3.5 w-3.5 opacity-40" />
                                                    <span className="text-[11px] font-medium italic">Aucun destinataire...</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Modèle de Message</Label>
                                        <textarea
                                            className="w-full h-64 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-base focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-sm resize-none custom-scrollbar"
                                            value={messageTemplate}
                                            onChange={(e) => setMessageTemplate(e.target.value)}
                                            placeholder="Rédigez votre message ici..."
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            <span className="text-[10px] px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-lg font-bold text-indigo-600">{"{client_name}"}</span>
                                            <span className="text-[10px] px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-lg font-bold text-indigo-600">{"{promo_label}"}</span>
                                            <span className="text-[10px] px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-lg font-bold text-indigo-600">{"{discount}"}</span>
                                            <span className="text-[10px] px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-lg font-bold text-indigo-600">{"{product_name}"}</span>
                                            {selectedPromo?.product_id && (
                                                <>
                                                    <span className="text-[10px] px-3 py-1.5 bg-amber-50 dark:bg-amber-900/40 rounded-lg font-bold text-amber-600">{"{old_price}"}</span>
                                                    <span className="text-[10px] px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/40 rounded-lg font-bold text-emerald-600">{"{new_price}"}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Canal d'envoi</Label>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setSelectedChannel("whatsapp")}
                                            className={cn(
                                                "flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                                                selectedChannel === "whatsapp"
                                                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20"
                                                    : "border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200"
                                            )}
                                        >
                                            <MessageCircle className="h-6 w-6" />
                                            <span className="text-xs font-bold">WhatsApp</span>
                                        </button>
                                        <button
                                            onClick={() => setSelectedChannel("sms")}
                                            className={cn(
                                                "flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                                                selectedChannel === "sms"
                                                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20"
                                                    : "border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200"
                                            )}
                                        >
                                            <Send className="h-6 w-6" />
                                            <span className="text-xs font-bold">SMS</span>
                                        </button>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleSendNotifications}
                                    disabled={!selectedChannel}
                                    className={cn(
                                        "w-full rounded-xl h-12 flex items-center justify-center gap-2 shadow-lg dark:shadow-none transition-all",
                                        !selectedChannel
                                            ? "bg-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
                                            : selectedChannel === "whatsapp"
                                                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100"
                                                : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100"
                                    )}
                                >
                                    {!selectedChannel
                                        ? "Choisir un canal pour générer les messages"
                                        : selectedChannel === "whatsapp"
                                            ? "Générer les messages WhatsApp"
                                            : "Générer les messages SMS"}
                                </Button>
                            </div>

                            <div className="space-y-4 flex flex-col min-h-0 flex-1 overflow-hidden">
                                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between shrink-0">
                                    <span>Aperçu & Envoi</span>
                                    {notificationResults.length > 0 && (
                                        <Badge variant="outline" className="text-[10px] bg-slate-100 dark:bg-slate-800 border-none font-bold">
                                            {notificationResults.length} Cibles
                                        </Badge>
                                    )}
                                </Label>
                                <div className="border border-slate-200 dark:border-slate-800 rounded-3xl flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-950 p-4 space-y-4 custom-scrollbar shadow-inner">
                                    {notificationResults.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 py-20 animate-in fade-in duration-500">
                                            <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-full border border-dashed border-slate-200 dark:border-slate-800">
                                                <MessageCircle className="h-10 w-10 opacity-30" />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Aucun message généré</p>
                                                <p className="text-[11px] text-slate-400 mt-1">Sélectionnez vos cibles puis cliquez sur "Générer"</p>
                                            </div>
                                        </div>
                                    ) : (
                                        notificationResults.map((res, idx) => (
                                            <div
                                                key={idx}
                                                className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all group animate-in slide-in-from-right-4"
                                                style={{ animationDelay: `${idx * 50}ms` }}
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 border-2 border-white dark:border-slate-800 shadow-sm">
                                                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                                            {res.client_name.charAt(0)}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0 space-y-2">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div>
                                                                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                                    {res.client_name}
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 font-medium">
                                                                    {res.phone || "Sans numéro"}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold uppercase tracking-wide">
                                                                    {selectedChannel === "sms" ? "SMS" : "WhatsApp"}
                                                                </span>
                                                                {res.link ? (
                                                                    <div className="h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center overflow-hidden">
                                                                        <Check className="h-3 w-3 text-emerald-600" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="h-5 w-5 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                                                                        <X className="h-3 w-3 text-red-600" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed bg-white/80 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                                                            {res.message}
                                                        </p>
                                                        {res.link && (
                                                            <div className="mt-2">
                                                                <Button
                                                                    size="sm"
                                                                    disabled={!res.link}
                                                                    className={cn(
                                                                        "w-full h-8 text-[10px] rounded-lg gap-2 font-bold shadow-sm transition-all active:scale-95",
                                                                        selectedChannel === "whatsapp"
                                                                            ? "bg-[#25D366] hover:bg-[#20bd5c] text-white"
                                                                            : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                                                    )}
                                                                    onClick={() => window.open(res.link, "_blank")}
                                                                >
                                                                    {selectedChannel === "whatsapp" ? (
                                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                                    ) : (
                                                                        <Send className="h-3.5 w-3.5" />
                                                                    )}
                                                                    Ouvrir la conversation
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
