import { useState, useEffect } from "react";
import {
    
    Plus,
    Send,
    ChevronRight,
    Loader2,
    AlertCircle,
    CheckCircle,
    CheckCircle2,
    Clock as ClockIcon,
    ArrowUpCircle,
    ArrowRightCircle,
    Settings,
    Search,
    LayoutGrid,
    BarChart3,
    Calendar,
    User,
    ArrowDownCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Textarea } from "@/components/common/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/common/ui/tabs";
import {
    Dialog,
    DialogContent
} from "@/components/common/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/common/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import { toast } from "sonner";

interface TicketData {
    id: number;
    client_id: number;
    nom: string;
    prenom: string;
    sujet: string;
    description: string;
    statut: 'ouvert' | 'en_cours' | 'resolu' | 'ferme';
    priorite: 'faible' | 'moyenne' | 'haute';
    date_creation: string;
    date_mise_a_jour: string;
}

interface AppUser {
    id: number;
    nom: string;
    prenom: string;
    email: string;
    role: string;
}

interface TicketResponse {
    id: number;
    ticket_id: number;
    user_id: number;
    message: string;
    created_at: string;
    nom?: string;
    prenom?: string;
    role?: string;
}

const STAT_CARDS = [
    { label: "Total Tickets", key: "total", icon: BarChart3, color: "indigo", bg: "bg-indigo-50 dark:bg-indigo-950/30", text: "text-indigo-600 dark:text-indigo-300", border: "border-indigo-100 dark:border-indigo-900/50" },
    { label: "En Attente", key: "pending", icon: ClockIcon, color: "amber", bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-600 dark:text-amber-300", border: "border-amber-100 dark:border-amber-900/50" },
    { label: "Résolus", key: "resolved", icon: CheckCircle, color: "emerald", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-600 dark:text-emerald-300", border: "border-emerald-100 dark:border-emerald-900/50" },
];

export default function Tickets() {
    const [tickets, setTickets] = useState<TicketData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("list");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [responses, setResponses] = useState<TicketResponse[]>([]);
    const [isLoadingResponses, setIsLoadingResponses] = useState(false);
    const [responseMessage, setResponseMessage] = useState("");
    const [isSendingResponse, setIsSendingResponse] = useState(false);

    const [newTicket, setNewTicket] = useState({
        sujet: "",
        description: "",
        priorite: "moyenne"
    });
    const [assignedUserId, setAssignedUserId] = useState<string>("");

    const [ticketStats, setTicketStats] = useState({
        total: 0,
        pending: 0,
        resolved: 0
    });

    const [searchQuery, setSearchQuery] = useState("");

    const role = localStorage.getItem("role")?.toLowerCase() || "user";
    const isAdmin = role === "admin" || role === "responsable" || role === "superadmin";
    const token = localStorage.getItem("token");

    useEffect(() => {
        fetchTickets();
    }, []);

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        if (!selectedTicket) {
            setResponses([]);
            setResponseMessage("");
            return;
        }
        fetchTicketResponses(selectedTicket.id);
    }, [selectedTicket?.id]);

    const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const response = await fetch("/api/tickets/assignees", {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(Array.isArray(data) ? data : []);
            } else {
                const fallback = await fetch("/api/users/all-users", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (fallback.ok) {
                    const data = await fallback.json();
                    setUsers(Array.isArray(data?.users) ? data.users : []);
                } else {
                    toast.error("Impossible de charger la liste des utilisateurs");
                }
            }
        } catch {
            toast.error("Erreur lors du chargement des utilisateurs");
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const fetchTickets = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/tickets", {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setTickets(data);

                const stats = data.reduce((acc: any, t: TicketData) => {
                    acc.total++;
                    if (t.statut === 'ouvert' || t.statut === 'en_cours') acc.pending++;
                    if (t.statut === 'resolu') acc.resolved++;
                    return acc;
                }, { total: 0, pending: 0, resolved: 0 });

                setTicketStats(stats);
            }
        } catch (error) {
            toast.error("Erreur lors du chargement des tickets");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTicketResponses = async (ticketId: number) => {
        setIsLoadingResponses(true);
        try {
            const response = await fetch(`/api/tickets/${ticketId}/responses`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setResponses(Array.isArray(data) ? data : []);
            } else {
                setResponses([]);
                toast.error("Impossible de charger les réponses");
            }
        } catch {
            setResponses([]);
            toast.error("Erreur lors du chargement des réponses");
        } finally {
            setIsLoadingResponses(false);
        }
    };

    const handleSendResponse = async () => {
        if (!selectedTicket) return;
        const msg = responseMessage.trim();
        if (!msg) {
            toast.error("Écris une réponse avant d'envoyer");
            return;
        }
        setIsSendingResponse(true);
        try {
            const response = await fetch(`/api/tickets/${selectedTicket.id}/responses`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ message: msg })
            });
            if (response.ok) {
                setResponseMessage("");
                await Promise.all([fetchTicketResponses(selectedTicket.id), fetchTickets()]);
                toast.success("Réponse envoyée");
            } else {
                const err = await response.json().catch(() => ({}));
                toast.error(err?.message || "Erreur lors de l'envoi");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setIsSendingResponse(false);
        }
    };

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newTicket.sujet || !newTicket.description) {
            toast.error("Tous les champs sont obligatoires");
            return;
        }

        if (!assignedUserId) {
            toast.error("Veuillez sélectionner un utilisateur");
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch("/api/tickets", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...newTicket,
                    user_id: Number(assignedUserId)
                })
            });

            if (response.ok) {
                toast.success("Ticket créé avec succès");
                setNewTicket({ sujet: "", description: "", priorite: "moyenne" });
                setAssignedUserId("");
                fetchTickets();
                setActiveTab("list");
            } else {
                toast.error("Erreur lors de la création");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResolveTicket = async (id: number) => {
        try {
            const response = await fetch(`/api/tickets/${id}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ statut: "resolu" })
            });

            if (response.ok) {
                toast.success("Ticket résolu");
                fetchTickets();
                setSelectedTicket(null);
            } else {
                toast.error("Erreur lors de la mise à jour");
            }
        } catch {
            toast.error("Erreur serveur");
        }
    };

    const getStatusBadge = (statut: string) => {
        switch (statut) {
            case 'ouvert':
                return <Badge className="bg-sky-100 text-sky-600 hover:bg-sky-100 border-sky-200 flex items-center gap-1.5 px-2.5 py-0.5"><ClockIcon className="h-3.5 w-3.5" /> Ouvert</Badge>;
            case 'en_cours':
                return <Badge className="bg-amber-100 text-amber-600 hover:bg-amber-100 border-amber-200 flex items-center gap-1.5 px-2.5 py-0.5"><AlertCircle className="h-3.5 w-3.5" /> En cours</Badge>;
            case 'resolu':
                return <Badge className="bg-emerald-100 text-emerald-600 hover:bg-emerald-100 border-emerald-200 flex items-center gap-1.5 px-2.5 py-0.5"><CheckCircle className="h-3.5 w-3.5" /> Résolu</Badge>;
            case 'ferme':
                return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-slate-200 flex items-center gap-1.5 px-2.5 py-0.5"><CheckCircle2 className="h-3.5 w-3.5" /> Fermé</Badge>;
            default: return <Badge>{statut}</Badge>;
        }
    };

    const getPriorityBadge = (priorite: string) => {
        switch (priorite) {
            case 'haute':
                return <Badge className="bg-rose-100 text-rose-600 hover:bg-rose-100 border-rose-200 flex items-center gap-1.5 px-2.5 py-0.5"><ArrowUpCircle className="h-3.5 w-3.5" /> Haute</Badge>;
            case 'moyenne':
                return <Badge className="bg-indigo-100 text-indigo-600 hover:bg-indigo-100 border-indigo-200 flex items-center gap-1.5 px-2.5 py-0.5"><ArrowRightCircle className="h-3.5 w-3.5" /> Moyenne</Badge>;
            case 'faible':
                return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-slate-200 flex items-center gap-1.5 px-2.5 py-0.5"><ArrowDownCircle className="h-3.5 w-3.5" /> Faible</Badge>;
            default: return <Badge>{priorite}</Badge>;
        }
    };

    const filteredTickets = tickets.filter(t =>
        t.sujet.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (isAdmin && t.nom.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const handleUpdateTicket = async (id: number, updates: Partial<TicketData>) => {
        try {
            const response = await fetch(`/api/tickets/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(updates)
            });

            if (response.ok) {
                toast.success("Ticket mis à jour");
                fetchTickets();
                if (selectedTicket && selectedTicket.id === id) {
                    setSelectedTicket({ ...selectedTicket, ...updates });
                }
            } else {
                toast.error("Erreur lors de la mise à jour");
            }
        } catch {
            toast.error("Erreur serveur");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 md:p-6 lg:p-8 space-y-6">

            {/* HEADER & TOP ACTIONS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-none">Support & Tickets</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs font-medium">
                        {isAdmin ? "Gérez et répondez aux demandes d'assistance." : "Besoin d'aide ? Consultez vos tickets ou créez-en un nouveau."}
                    </p>
                </div>
                <Button
                    onClick={() => setActiveTab("form")}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 dark:shadow-none px-4 h-10 rounded-xl group transition-all"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    {isAdmin ? "Créer un Ticket" : "Nouveau Ticket"}
                </Button>
            </div>

            {/* STATS AREA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {STAT_CARDS.map((stat) => (
                    <Card key={stat.key} className={`${stat.bg} ${stat.border} border shadow-sm rounded-2xl overflow-hidden group hover:shadow-md transition-shadow`}>
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="space-y-1">
                                <p className={`text-[10px] font-bold uppercase tracking-wider ${stat.text} opacity-80`}>{stat.label}</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-none">
                                    {ticketStats[stat.key as keyof typeof ticketStats]}
                                </p>
                            </div>
                            <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.text} border border-white shadow-inner`}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <TabsList className="bg-transparent border-0 gap-1 h-9">
                            <TabsTrigger
                                value="list"
                                className="h-7 px-4 rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 font-bold text-xs"
                            >
                                <LayoutGrid className="h-3.5 w-3.5 mr-2" />
                                {isAdmin ? "Tableau de Bord" : "Mes Demandes"}
                            </TabsTrigger>
                            <TabsTrigger
                                value="form"
                                className="h-7 px-4 rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 font-bold text-xs"
                            >
                                <Plus className="h-3.5 w-3.5 mr-2" />
                                {isAdmin ? "Nouveau Ticket" : "Ouvrir un Ticket"}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="relative w-full md:w-80 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <Input
                            placeholder="Rechercher..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-indigo-100 dark:focus-visible:ring-indigo-900 text-sm"
                        />
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    {/* LISTE */}
                    <TabsContent value="list" className="mt-0">
                        <Card className="border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                            <Table>
                                <TableHeader className="bg-slate-50/50 dark:bg-slate-900/80">
                                    <TableRow className="hover:bg-transparent border-b">
                                        <TableHead className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">Ticket</TableHead>
                                        <TableHead className="py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">Priorité</TableHead>
                                        <TableHead className="py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">Date</TableHead>
                                        <TableHead className="py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">Statut</TableHead>
                                        <TableHead className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody className="bg-white dark:bg-slate-900">
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                                                    <span className="text-sm font-medium text-slate-400 dark:text-slate-500">Chargement...</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredTickets.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Search className="h-8 w-8 text-slate-200 dark:text-slate-700" />
                                                    <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Aucun résultat trouvé.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredTickets.map((t) => (
                                            <TableRow key={t.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-200 dark:border-slate-800 last:border-0">
                                                <TableCell className="py-2.5 px-4">
                                                    <div className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors tracking-tight truncate max-w-[260px]">
                                                        {t.sujet}
                                                    </div>
                                                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                                                        {t.description}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                                                            #{t.id}
                                                        </span>
                                                        {isAdmin && (
                                                            <>
                                                                <span className="h-0.5 w-0.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                                                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                                    <User className="h-2.5 w-2.5" />
                                                                    {t.nom}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="scale-75 origin-left">
                                                        {getPriorityBadge(t.priorite)}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-slate-500 dark:text-slate-400">
                                                    <div className="flex items-center gap-1.5 text-xs font-medium">
                                                        <Calendar className="h-3 w-3" />
                                                        {new Date(t.date_creation).toLocaleDateString()}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="scale-75 origin-left">
                                                        {getStatusBadge(t.statut)}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-300"
                                                        onClick={() => setSelectedTicket(t)}
                                                    >
                                                        <ChevronRight className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </Card>
                    </TabsContent>

                    {/* FORM */}
                    <TabsContent value="form">
                        <Card className="border border-slate-200 dark:border-slate-800 shadow-lg dark:shadow-none rounded-2xl overflow-hidden max-w-2xl mx-auto bg-white dark:bg-slate-900">
                            <CardHeader className="p-6 pb-4">
                                <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                                        <Plus className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    Ouvrir une Demande
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 space-y-4">
                                <form onSubmit={handleCreateTicket} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Assigner à</Label>
                                        <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                                            <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus-visible:ring-indigo-100 dark:focus-visible:ring-indigo-900 font-medium text-xs">
                                                <SelectValue placeholder={isLoadingUsers ? "Chargement..." : "Sélectionner un utilisateur"} />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-xl shadow-xl max-h-72">
                                                {users.length === 0 ? (
                                                    <SelectItem value="__none__" disabled className="text-xs">
                                                        {isLoadingUsers ? "Chargement..." : "Aucun utilisateur"}
                                                    </SelectItem>
                                                ) : (
                                                    users.map((u) => (
                                                        <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                                                            {u.nom} {u.prenom} ({u.email})
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Sujet</Label>
                                            <Input
                                                placeholder="Titre court..."
                                                value={newTicket.sujet}
                                                onChange={(e) => setNewTicket({ ...newTicket, sujet: e.target.value })}
                                                className="h-9 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus-visible:ring-indigo-100 dark:focus-visible:ring-indigo-900 font-medium text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Urgence</Label>
                                            <Select
                                                value={newTicket.priorite}
                                                onValueChange={(value) => setNewTicket({ ...newTicket, priorite: value })}
                                            >
                                                <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus-visible:ring-indigo-100 dark:focus-visible:ring-indigo-900 font-medium text-xs">
                                                    <SelectValue placeholder="Niveau" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-xl">
                                                    <SelectItem value="faible" className="text-xs">Faible</SelectItem>
                                                    <SelectItem value="moyenne" className="text-xs">Moyenne</SelectItem>
                                                    <SelectItem value="haute" className="text-xs">Haute</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Message</Label>
                                        <Textarea
                                            rows={4}
                                            placeholder="Détaillez votre problème..."
                                            value={newTicket.description}
                                            onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                                            className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus-visible:ring-indigo-100 dark:focus-visible:ring-indigo-900 font-medium text-xs resize-none"
                                        />
                                    </div>

                                    <div className="flex justify-end pt-2">
                                        <Button
                                            disabled={isSubmitting}
                                            className="bg-indigo-600 hover:bg-slate-900 dark:hover:bg-indigo-700 text-white shadow shadow-indigo-100 dark:shadow-none px-6 h-9 text-xs font-bold rounded-lg transition-all"
                                        >
                                            {isSubmitting ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-2" /> : <Send className="h-3.5 w-3.5 mr-2" />}
                                            Envoyer
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* DIALOG DETAILS */}
            <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
                <DialogContent className="max-w-xl p-0 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl">
                    {selectedTicket && (
                        <div className="flex flex-col">
                            <div className="bg-slate-900 dark:bg-slate-950 p-6 text-white relative">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black tracking-widest uppercase opacity-50">
                                            Ticket #T-{selectedTicket.id}
                                        </span>
                                        <div className="flex gap-2 scale-75 origin-right">
                                            {getStatusBadge(selectedTicket.statut)}
                                            {getPriorityBadge(selectedTicket.priorite)}
                                        </div>
                                    </div>
                                    <h2 className="text-xl font-bold tracking-tight uppercase">{selectedTicket.sujet}</h2>
                                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                        <span>Posté le {new Date(selectedTicket.date_creation).toLocaleDateString()}</span>
                                        {isAdmin && <span className="text-indigo-400 uppercase">{selectedTicket.nom} {selectedTicket.prenom}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 space-y-6 bg-white dark:bg-slate-900 overflow-y-auto max-h-[70vh]">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Message</Label>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                                        {selectedTicket.description}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Réponses</Label>
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2 max-h-52 overflow-y-auto">
                                        {isLoadingResponses ? (
                                            <p className="text-xs text-slate-500">Chargement des réponses...</p>
                                        ) : responses.length === 0 ? (
                                            <p className="text-xs text-slate-500">Aucune réponse pour le moment.</p>
                                        ) : (
                                            responses.map((resp) => (
                                                <div key={resp.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                                            {`${resp.nom || ""} ${resp.prenom || ""}`.trim() || `Utilisateur #${resp.user_id}`}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500">
                                                            {resp.created_at ? new Date(resp.created_at).toLocaleString("fr-FR") : "-"}
                                                        </p>
                                                    </div>
                                                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-wrap">
                                                        {resp.message}
                                                    </p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">Votre réponse</Label>
                                        <Textarea
                                            rows={3}
                                            placeholder="Écrire une réponse..."
                                            value={responseMessage}
                                            onChange={(e) => setResponseMessage(e.target.value)}
                                            className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg focus-visible:ring-indigo-100 dark:focus-visible:ring-indigo-900 text-xs resize-none"
                                        />
                                        <div className="flex justify-end">
                                            <Button
                                                size="sm"
                                                disabled={isSendingResponse}
                                                className="h-8 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                                                onClick={handleSendResponse}
                                            >
                                                {isSendingResponse ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                                                Envoyer réponse
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {isAdmin && (
                                    <div className="space-y-4 p-4 bg-slate-50/50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Settings className="h-3.5 w-3.5 text-slate-900 dark:text-slate-200" />
                                            <span className="text-xs font-bold uppercase tracking-tight text-slate-900 dark:text-slate-200">Administration</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">Statut</Label>
                                                <Select
                                                    value={selectedTicket.statut}
                                                    onValueChange={(value: any) => handleUpdateTicket(selectedTicket.id, { statut: value })}
                                                >
                                                    <SelectTrigger className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl">
                                                        <SelectItem value="ouvert" className="text-xs">Ouvert</SelectItem>
                                                        <SelectItem value="en_cours" className="text-xs">En cours</SelectItem>
                                                        <SelectItem value="resolu" className="text-xs">Résolu</SelectItem>
                                                        <SelectItem value="ferme" className="text-xs">Fermé</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">Priorité</Label>
                                                <Select
                                                    value={selectedTicket.priorite}
                                                    onValueChange={(value: any) => handleUpdateTicket(selectedTicket.id, { priorite: value })}
                                                >
                                                    <SelectTrigger className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl">
                                                        <SelectItem value="faible" className="text-xs">Faible</SelectItem>
                                                        <SelectItem value="moyenne" className="text-xs">Moyenne</SelectItem>
                                                        <SelectItem value="haute" className="text-xs">Haute</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {selectedTicket.statut !== "resolu" && (
                                            <Button
                                                size="sm"
                                                className="w-full bg-emerald-600 hover:bg-slate-900 dark:hover:bg-emerald-700 text-white shadow shadow-emerald-100 dark:shadow-none h-9 text-xs font-bold rounded-lg"
                                                onClick={() => handleResolveTicket(selectedTicket.id)}
                                            >
                                                <CheckCircle className="h-4 w-4 mr-2" />
                                                Clôturer définitivement
                                            </Button>
                                        )}
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 text-xs pt-2">
                                    <Button
                                        variant="outline"
                                        className="h-9 px-6 rounded-lg font-bold"
                                        onClick={() => setSelectedTicket(null)}
                                    >
                                        Fermer
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
