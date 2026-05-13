import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import { Badge } from "@/components/common/ui/badge";
import { DeleteSvgIcon, EditSvgIcon } from "@/components/icons/actionSvgIcons";
import { toast } from "sonner";
import {
    Users,
    Plus,
    Search,
    UserCheck,
    Briefcase,
    ShieldAlert,
    Phone,
    Mail,
    Copy,
    MessageCircle,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    MoreVertical,
    Upload,
    FileSpreadsheet,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface Client {
    id: number;
    nom_complet: string;
    type: string;
    ice?: string | null;
    numero_tva?: string | null;
    rc?: string | null;
    if_number?: string | null;
    cnss?: string | null;
    patente?: string | null;
    telephone?: string | null;
    email?: string | null;
    adresse?: string | null;
}

export default function Clients() {
    const navigate = useNavigate();
    const role = localStorage.getItem("role");
    const roleLower = (role || "").toLowerCase();
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isSuperAdmin = roleLower === "superadmin";
    const isAuthorized = isSuperAdmin || role === "admin" || permissions.includes("clients_view");
    const isAdmin = role === "admin" || isSuperAdmin;

    const [clients, setClients] = useState<Client[]>([]);
    const [clientTypeOptions, setClientTypeOptions] = useState<Array<{ label: string; value: string }>>([
        { label: "Particulier", value: "particulier" },
        { label: "Revendeur", value: "revendeur" },
        { label: "Société", value: "societe" },
    ]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterClientType, setFilterClientType] = useState("all");
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [isImportWarningOpen, setIsImportWarningOpen] = useState(false);
    const [isImportTypeDialogOpen, setIsImportTypeDialogOpen] = useState(false);
    const [importAccept, setImportAccept] = useState(".csv");
    const [clientImportColumns, setClientImportColumns] = useState<string[]>([]);
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const itemsPerPage = 10;

    const normalizePhoneForTel = (phone: string) => phone.replace(/[^\d+]/g, "");
    const normalizePhoneForWhatsApp = (phone: string) => {
        let digits = phone.replace(/\D/g, "");
        if (digits.startsWith("00")) digits = digits.slice(2);
        if (digits.startsWith("0") && digits.length === 10) digits = `212${digits.slice(1)}`;
        return digits;
    };

    const getMailtoHref = (email: string, fullName?: string) => {
        const cleanEmail = email.trim();
        const subjectText = ` Contact${fullName ? ` (${fullName})` : ""}`;
        const bodyText = fullName ? `Bonjour ${fullName},\n\n` : "Bonjour,\n\n";
        return `mailto:${cleanEmail}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
    };

    const getTelHref = (phone: string) => `tel:${normalizePhoneForTel(phone)}`;

    const getWhatsAppHref = (phone: string, fullName?: string) => {
        const waNumber = normalizePhoneForWhatsApp(phone);
        const text = fullName ? `Bonjour ${fullName}, ` : "Bonjour, ";
        return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    };

    const getGmailComposeHref = (email: string, fullName?: string) => {
        const cleanEmail = email.trim();
        const subjectText = ` Contact${fullName ? ` (${fullName})` : ""}`;
        const bodyText = fullName ? `Bonjour ${fullName},\n\n` : "Bonjour,\n\n";
        return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cleanEmail)}&su=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
    };

    const copyText = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copié`);
        } catch {
            try {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
                toast.success(`${label} copié`);
            } catch {
                toast.error("Impossible de copier");
            }
        }
    };

    const [formData, setFormData] = useState({
        nom_complet: "",
        type: "particulier",
        ice: "",
        numero_tva: "",
        rc: "",
        if_number: "",
        cnss: "",
        patente: "",
        telephone: "",
        email: "",
        adresse: "",
    });
    const token = localStorage.getItem("token");

    const fetchClientTypes = async () => {
        try {
            const response = await fetch("/api/settings/client-types", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            const data = await response.json();
            const options = (Array.isArray(data) ? data : [])
                .map((t: any) => ({
                    label: String(t?.label || t?.value || "").trim(),
                    value: String(t?.value || "").trim().toLowerCase(),
                }))
                .filter((t: any) => t.label && t.value);
            if (options.length > 0) {
                setClientTypeOptions(options);
            }
        } catch (error) {
            console.error("Error fetching client types:", error);
        }
    };

    const fetchClients = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/clients", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) setClients(await response.json());
        } catch (error) {
            console.error("Error fetching clients:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
        fetchClientTypes();
    }, []);

    useEffect(() => {
        if (editingClient) {
            setFormData({
                nom_complet: editingClient.nom_complet,
                type: editingClient.type || "particulier",
                ice: editingClient.ice || "",
                numero_tva: editingClient.numero_tva || "",
                rc: editingClient.rc || "",
                if_number: editingClient.if_number || "",
                cnss: editingClient.cnss || "",
                patente: editingClient.patente || "",
                telephone: editingClient.telephone || "",
                email: editingClient.email || "",
                adresse: editingClient.adresse || "",
            });
            setIsFormVisible(true);
        }
    }, [editingClient]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterClientType]);

    const fetchClientImportColumns = async () => {
        if (clientImportColumns.length > 0) return clientImportColumns;

        const response = await fetch("/api/clients/import-template-columns", {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            throw new Error("Impossible de récupérer les colonnes du modèle");
        }

        const data = await response.json();
        const columns = Array.isArray(data.columns) ? data.columns : [];
        setClientImportColumns(columns);
        return columns;
    };

    const handleImportClick = () => {
        setIsImportWarningOpen(true);
    };

    const downloadImportSample = async () => {
        try {
            const columns = await fetchClientImportColumns();
            if (columns.length === 0) {
                toast.error("Aucune colonne trouvée pour le modèle");
                return;
            }

            const sampleRow: Record<string, string> = {};
            columns.forEach((col: string) => { sampleRow[col] = ""; });

            if ("nom_complet" in sampleRow) sampleRow.nom_complet = "Client Exemple";
            if ("type" in sampleRow) sampleRow.type = "particulier";
            if ("numero_tva" in sampleRow) sampleRow.numero_tva = "TVA-EXEMPLE";
            if ("rc" in sampleRow) sampleRow.rc = "RC-EXEMPLE";
            if ("if_number" in sampleRow) sampleRow.if_number = "IF-EXEMPLE";
            if ("cnss" in sampleRow) sampleRow.cnss = "CNSS-EXEMPLE";
            if ("patente" in sampleRow) sampleRow.patente = "PATENTE-EXEMPLE";
            if ("telephone" in sampleRow) sampleRow.telephone = "0612345678";
            if ("email" in sampleRow) sampleRow.email = "client@example.com";
            if ("adresse" in sampleRow) sampleRow.adresse = "Casablanca";

            const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: columns });
            worksheet["!cols"] = columns.map((col: string) => ({ wch: Math.max(16, col.length + 4) }));

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Template_Clients");
            XLSX.writeFile(workbook, "clients_exemplaire.xlsx");

            toast.success("Fichier exemplaire téléchargé");
        } catch (error) {
            console.error("Erreur téléchargement modèle import clients:", error);
            toast.error("Impossible de télécharger le fichier exemplaire");
        }
    };

    const handleContinueImport = () => {
        setIsImportWarningOpen(false);
        setIsImportTypeDialogOpen(true);
    };

    const handleImportTypeSelect = (type: "csv" | "excel") => {
        setImportAccept(type === "csv" ? ".csv" : ".xlsx,.xls");
        setIsImportTypeDialogOpen(false);
        setTimeout(() => importInputRef.current?.click(), 0);
    };

    const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const selectedType = importAccept.includes("csv") ? "CSV" : "Excel";
            const columns = await fetchClientImportColumns();

            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];

            if (!firstSheetName) {
                toast.error("Le fichier importé est vide");
                return;
            }

            const worksheet = workbook.Sheets[firstSheetName];
            const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });

            if (rawRows.length === 0) {
                toast.error("Aucune donnée trouvée dans le fichier");
                return;
            }

            const normalizedRows = rawRows.map((row) => {
                const normalized: Record<string, any> = {};
                columns.forEach((col: string) => {
                    normalized[col] = row[col] ?? "";
                });
                return normalized;
            });

            const response = await fetch("/api/clients/import", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ clients: normalizedRows }),
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(result.message || "Erreur lors de l'import");
                return;
            }

            const createdCount = Number(result.createdCount || 0);
            const skippedCount = Number(result.skippedCount || 0);
            if (createdCount > 0) {
                toast.success(`${createdCount} client(s) importé(s) depuis ${selectedType}`);
            }
            if (skippedCount > 0) {
                toast.warning(`${skippedCount} ligne(s) ignorée(s)`, {
                    description: Array.isArray(result.errors) ? result.errors.slice(0, 2).join(" | ") : undefined,
                });
            }

            fetchClients();
        } catch (error) {
            console.error("Erreur import clients:", error);
            toast.error("Erreur lors de la lecture/import du fichier");
        }

        e.target.value = "";
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!formData.nom_complet.trim()) errors.nom_complet = "Le nom complet est requis";
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const method = editingClient ? "PUT" : "POST";
            const url = editingClient ? `/api/clients/${editingClient.id}` : "/api/clients";
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                toast.success(editingClient ? "Client mis à jour !" : "Client ajouté !");
                resetForm();
                fetchClients();
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
            nom_complet: "",
            type: "particulier",
            ice: "",
            numero_tva: "",
            rc: "",
            if_number: "",
            cnss: "",
            patente: "",
            telephone: "",
            email: "",
            adresse: "",
        });
        setEditingClient(null);
        setFormErrors({});
        setIsFormVisible(false);
    };

    const handleDelete = (client: Client) => {
        setClientToDelete(client);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!clientToDelete) return;
        try {
            const response = await fetch(`/api/clients/${clientToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Client supprimé");
                fetchClients();
            } else {
                const data = await response.json().catch(() => null);
                if (data?.message) {
                    toast.error(data.message);
                } else {
                    toast.error("Échec de la suppression du client");
                }
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setDeleteDialogOpen(false);
            setClientToDelete(null);
        }
    };

    const filteredClients = clients.filter((c) => {
        const matchesSearch = c.nom_complet.toLowerCase().includes(searchTerm.toLowerCase());
        const normalizedType = String(c.type || "").trim().toLowerCase();
        const matchesType = filterClientType === "all" || normalizedType === filterClientType;
        return matchesSearch && matchesType;
    });

    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const paginatedClients = filteredClients.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

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
                        Seuls les administrateurs peuvent gérer la base de données des clients.
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Users className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Clients
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gérez votre base de données clients</p>
                </div>
                <Button
                    onClick={() => {
                        setEditingClient(null);
                        setFormData({
                            nom_complet: "",
                            type: "particulier",
                            ice: "",
                            numero_tva: "",
                            rc: "",
                            if_number: "",
                            cnss: "",
                            patente: "",
                            telephone: "",
                            email: "",
                            adresse: "",
                        });
                        setFormErrors({});
                        setIsFormVisible(true);
                    }}
                    className="shadow-sm transition-all cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700"
                >
                    <Plus className="mr-2 h-4 w-4" /> Nouveau Client
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400"><Users className="h-6 w-6" /></div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Clients</p>
                        <p className="text-2xl font-bold text-foreground">{clients.length}</p>
                    </div>
                </div>
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400"><UserCheck className="h-6 w-6" /></div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clients Actifs</p>
                        <p className="text-2xl font-bold text-foreground">{clients.length}</p>
                    </div>
                </div>
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400"><Briefcase className="h-6 w-6" /></div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nouveaux (Mois)</p>
                        <p className="text-2xl font-bold text-foreground">0</p>
                    </div>
                </div>
            </div>

            <Dialog
                open={isFormVisible}
                onOpenChange={(open) => {
                    setIsFormVisible(open);
                    if (!open) {
                        setEditingClient(null);
                        setFormErrors({});
                    }
                }}
            >
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-lg flex items-center gap-2">
                            {editingClient ? <EditSvgIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : <Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
                            {editingClient ? "Modifier le Client" : "Ajouter un Client"}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="nom_complet" className="text-sm font-medium">Nom Complet *</Label>
                            <Input
                                id="nom_complet"
                                name="nom_complet"
                                value={formData.nom_complet}
                                onChange={handleInputChange}
                                placeholder="Ex: Jean Dupont"
                                className={cn("h-10", formErrors.nom_complet && "border-red-500 focus-visible:ring-red-500")}
                            />
                            {formErrors.nom_complet && <p className="text-red-500 text-xs mt-1">{formErrors.nom_complet}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="type" className="text-sm font-medium">Type Client</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
                            >
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Choisir un type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {clientTypeOptions.map((typeOpt) => (
                                        <SelectItem key={typeOpt.value} value={typeOpt.value}>
                                            {typeOpt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="rounded-xl border border-border p-3 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Informations fiscales (optionnel)
                            </p>
                            <div className="space-y-1.5">
                                <Label htmlFor="ice" className="text-sm font-medium">ICE</Label>
                                <Input id="ice" name="ice" value={formData.ice} onChange={handleInputChange} placeholder="ICE" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="numero_tva" className="text-sm font-medium">Numéro TVA</Label>
                                <Input id="numero_tva" name="numero_tva" value={formData.numero_tva} onChange={handleInputChange} placeholder="Numéro TVA" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="rc" className="text-sm font-medium">RC</Label>
                                <Input id="rc" name="rc" value={formData.rc} onChange={handleInputChange} placeholder="RC" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="if_number" className="text-sm font-medium">IF</Label>
                                <Input id="if_number" name="if_number" value={formData.if_number} onChange={handleInputChange} placeholder="IF" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="cnss" className="text-sm font-medium">CNSS</Label>
                                <Input id="cnss" name="cnss" value={formData.cnss} onChange={handleInputChange} placeholder="CNSS" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="patente" className="text-sm font-medium">Patente</Label>
                                <Input id="patente" name="patente" value={formData.patente} onChange={handleInputChange} placeholder="Patente" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                            <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="Email du client" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="telephone" className="text-sm font-medium">Téléphone</Label>
                            <Input id="telephone" name="telephone" value={formData.telephone} onChange={handleInputChange} placeholder="Téléphone du client" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="adresse" className="text-sm font-medium">Adresse</Label>
                            <Input id="adresse" name="adresse" value={formData.adresse} onChange={handleInputChange} placeholder="Adresse du client" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsFormVisible(false)}>
                                Annuler
                            </Button>
                            <Button disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
                                {isSubmitting ? "Traitement..." : editingClient ? "Mettre à jour" : "Créer le Client"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <div className="space-y-4">
                    <div className="bg-card p-3 rounded-xl border border-border shadow-sm flex justify-between items-center gap-3 backdrop-blur-sm">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher un client..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 border-transparent bg-muted focus:bg-card focus:border-indigo-500 transition-all border"
                            />
                        </div>
                        <div className="w-full max-w-[220px]">
                            <Select value={filterClientType} onValueChange={setFilterClientType}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Tous les types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les types</SelectItem>
                                    {clientTypeOptions.map((typeOpt) => (
                                        <SelectItem key={`filter-${typeOpt.value}`} value={typeOpt.value}>
                                            {typeOpt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {isAdmin && (
                            <>
                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept={importAccept}
                                    className="hidden"
                                    onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
                                    onChange={handleImportFileChange}
                                />
                                <Button
                                    variant="outline"
                                    className="h-10 gap-2 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300 cursor-pointer"
                                    onClick={handleImportClick}
                                >
                                    <Upload className="h-4 w-4" />
                                    Importer
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 border-b border-border">
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 pl-6">Nom du Client</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-center">Type</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">ICE</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Adresse</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Téléphone</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4">Email</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right">Outils</TableHead>
                                    <TableHead className="text-xs font-bold text-muted-foreground uppercase py-4 text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i} className="animate-pulse border-b border-border">
                                            <TableCell className="pl-6"><div className="h-4 bg-muted rounded w-48" /></TableCell>
                                            <TableCell><div className="h-4 bg-muted rounded w-16 mx-auto" /></TableCell>
                                            <TableCell><div className="h-4 bg-muted rounded w-24" /></TableCell>
                                            <TableCell><div className="h-4 bg-muted rounded w-40" /></TableCell>
                                            <TableCell><div className="h-4 bg-muted rounded w-32" /></TableCell>
                                            <TableCell><div className="h-4 bg-muted rounded w-40" /></TableCell>
                                            <TableCell><div className="h-8 bg-muted rounded w-24 ml-auto" /></TableCell>
                                            <TableCell className="pr-6"><div className="h-8 bg-muted rounded w-20 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredClients.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-20">
                                            <div className="flex flex-col items-center text-muted">
                                                <Users className="h-12 w-12 mb-3 stroke-1" />
                                                <p className="font-medium">Aucun client trouvé</p>
                                                <p className="text-sm">Commencez par en ajouter un nouveau</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedClients.map((client, idx) => (
                                        <TableRow key={client.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0 text-sm">
                                            <TableCell className="py-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
                                                        idx % 3 === 0 ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" :
                                                            idx % 3 === 1 ? "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400")}>
                                                        {client.nom_complet.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="font-semibold text-foreground">{client.nom_complet}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 text-center">
                                                <Badge className={cn(
                                                    "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                                                    client.type === 'revendeur'
                                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                                                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                                                )}>
                                                    {client.type || 'Particulier'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                {client.ice ? (
                                                    <span className="text-foreground font-medium">{client.ice}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-4 max-w-[220px]">
                                                {client.adresse ? (
                                                    <span className="text-foreground font-medium truncate block" title={client.adresse}>
                                                        {client.adresse}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-4">
                                                {client.telephone ? (
                                                    <span className="text-foreground font-medium">{client.telephone}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-4">
                                                {client.email ? (
                                                    <span className="text-foreground font-medium">{client.email}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-4 text-right">
                                                <div className="inline-flex items-center rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/20 p-1 shadow-sm">
                                                    <Button
                                                        asChild
                                                        size="icon-sm"
                                                        variant="ghost"
                                                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                                                        disabled={!client.telephone}
                                                        title="WhatsApp"
                                                    >
                                                        {client.telephone ? (
                                                            <a href={getWhatsAppHref(client.telephone, client.nom_complet)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                                                                <MessageCircle className="h-4 w-4" />
                                                            </a>
                                                        ) : (
                                                            <span aria-hidden="true">
                                                                <MessageCircle className="h-4 w-4" />
                                                            </span>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        asChild
                                                        size="icon-sm"
                                                        variant="ghost"
                                                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                                                        disabled={!client.telephone}
                                                        title="Appeler"
                                                    >
                                                        {client.telephone ? (
                                                            <a href={getTelHref(client.telephone)} aria-label="Appeler">
                                                                <Phone className="h-4 w-4" />
                                                            </a>
                                                        ) : (
                                                            <span aria-hidden="true">
                                                                <Phone className="h-4 w-4" />
                                                            </span>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        size="icon-sm"
                                                        variant="ghost"
                                                        className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/20"
                                                        disabled={!client.email}
                                                        title="Envoyer email"
                                                        type="button"
                                                        onClick={() => {
                                                            if (!client.email) {
                                                                toast.error("Email manquant");
                                                                return;
                                                            }

                                                            const win = window.open(
                                                                getGmailComposeHref(client.email, client.nom_complet),
                                                                "_blank",
                                                                "noopener,noreferrer"
                                                            );

                                                            if (!win) {
                                                                window.location.href = getMailtoHref(client.email, client.nom_complet);
                                                                toast.message("Autorisez les popups pour ouvrir Gmail. Sinon, utilisez votre application mail.", { duration: 4000 });
                                                            }
                                                        }}
                                                    >
                                                        <Mail className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon-sm"
                                                        variant="ghost"
                                                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                                                        disabled={!client.telephone && !client.email}
                                                        onClick={() => {
                                                            const value = client.telephone || client.email || "";
                                                            if (!value) return;
                                                            void copyText(value, client.telephone ? "Téléphone" : "Email");
                                                        }}
                                                        title="Copier"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-4 pr-6">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Actions">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                navigate(`/dashboard/clients/situation?clientId=${client.id}`)
                                                            }
                                                            className="cursor-pointer"
                                                        >
                                                            <UserCheck className="h-4 w-4" />
                                                            Situation client
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setEditingClient(client)} className="cursor-pointer">
                                                            <EditSvgIcon className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDelete(client)} variant="destructive" className="cursor-pointer text-red-600 focus:text-red-600">
                                                            <DeleteSvgIcon className="h-4 w-4" />
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
                        <div className="flex items-center justify-between px-2 py-4 bg-card border-t border-border rounded-b-2xl shadow-sm">
                            <div className="text-xs text-muted-foreground font-medium hidden sm:block">
                                <span className="text-foreground font-bold">{(currentPage - 1) * itemsPerPage + 1}</span>-
                                <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredClients.length)}</span> sur
                                <span className="text-foreground font-bold"> {filteredClients.length}</span>
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
                </div>
            {/* Delete Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Supprimer le client ?</DialogTitle>
                        <DialogDescription className="py-2">
                            Êtes-vous sûr de vouloir supprimer <span className="font-bold text-foreground">"{clientToDelete?.nom_complet}"</span> ?
                            <br /><br />
                            Toutes les données associées seront définitivement effacées.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Supprimer définitivement</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import Warning */}
            <AlertDialog open={isImportWarningOpen} onOpenChange={setIsImportWarningOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Import clients</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vous devez télécharger d'abord notre fichier exemplaire avant de lancer un import.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={downloadImportSample}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Télécharger le fichier exemplaire
                        </Button>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={handleContinueImport} className="bg-indigo-600 hover:bg-indigo-700">
                            Continuer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Import Type Selection */}
            <Dialog open={isImportTypeDialogOpen} onOpenChange={setIsImportTypeDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Choisir le type de fichier</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            onClick={() => handleImportTypeSelect("csv")}
                        >
                            Import CSV
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            onClick={() => handleImportTypeSelect("excel")}
                        >
                            Import Excel
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
