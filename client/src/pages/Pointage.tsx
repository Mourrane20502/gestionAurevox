import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import { toast } from "sonner";
import { ShieldAlert, Plus, Pencil, Trash2, Clock3, Search, FileSpreadsheet, Printer, BarChart3, MoreVertical } from "lucide-react";
import { exportToExcel } from "@/utils/exportExcel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

interface Employee {
    id: number;
    first_name?: string;
    last_name?: string;
    nom?: string;
    prenom?: string;
}

interface EmployeeDetails extends Employee {
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    salary?: number | null;
    hire_date?: string | null;
    adresse?: string | null;
    status?: string | null;
    point_de_vente_id?: number | null;
}

interface PointageRow {
    id: number;
    employe_id: number;
    date_pointage: string;
    heure_entree?: string | null;
    heure_sortie?: string | null;
    type_journee?: string | null;
    statut?: string | null;
    retard_minutes?: number;
    heures_sup?: number;
    note?: string | null;
    employe_nom?: string | null;
    employe_prenom?: string | null;
}

const statusBadgeClass = (status?: string | null) => {
    const s = String(status || "").toLowerCase();
    if (s === "present") return "bg-emerald-100 text-emerald-700 border border-emerald-300";
    if (s === "absent") return "bg-red-100 text-red-700 border border-red-300";
    if (s === "retard") return "bg-amber-100 text-amber-700 border border-amber-300";
    if (s === "conge") return "bg-blue-100 text-blue-700 border border-blue-300";
    if (s === "mission") return "bg-violet-100 text-violet-700 border border-violet-300";
    return "bg-muted text-muted-foreground border border-border";
};

const typeBadgeClass = (type?: string | null) => {
    const t = String(type || "").toLowerCase();
    if (t === "normal") return "bg-indigo-100 text-indigo-700 border border-indigo-300";
    if (t === "demi_journee") return "bg-cyan-100 text-cyan-700 border border-cyan-300";
    if (t === "absent") return "bg-rose-100 text-rose-700 border border-rose-300";
    if (t === "conge") return "bg-sky-100 text-sky-700 border border-sky-300";
    if (t === "ferie") return "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-300";
    return "bg-muted text-muted-foreground border border-border";
};

const emptyForm = {
    employe_id: "",
    date_pointage: new Date().toISOString().slice(0, 10),
    heure_entree: "",
    heure_sortie: "",
    type_journee: "normal",
    statut: "present",
    retard_minutes: "0",
    heures_sup: "0",
    note: "",
};

export default function Pointage() {
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isPrivileged = role === "admin" || role === "responsable" || role === "directeur" || role === "superadmin";
    const isAuthorized = isPrivileged || permissions.includes("paie_view");
    const token = localStorage.getItem("token");

    const [rows, setRows] = useState<PointageRow[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState<PointageRow | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
    const [employeeDetail, setEmployeeDetail] = useState<EmployeeDetails | null>(null);
    const [employeeDetailLoading, setEmployeeDetailLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterMonth, setFilterMonth] = useState("all");
    const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
    const [filterStatut, setFilterStatut] = useState("all");
    const [filterEmploye, setFilterEmploye] = useState("all");

    const employeeName = (e: Employee) =>
        `${e.first_name || e.prenom || ""} ${e.last_name || e.nom || ""}`.trim() || `Employé #${e.id}`;

    const fetchData = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const [pointageRes, empRes] = await Promise.all([
                fetch("/api/pointage", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/employees", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (pointageRes.ok) setRows(await pointageRes.json());
            if (empRes.ok) setEmployees(await empRes.json());
        } catch (e) {
            console.error(e);
            toast.error("Erreur de chargement du pointage");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const resetForm = () => {
        setEditing(null);
        setForm(emptyForm);
        setDialogOpen(false);
    };

    const startEdit = (row: PointageRow) => {
        setEditing(row);
        setDialogOpen(true);
        setForm({
            employe_id: String(row.employe_id || ""),
            date_pointage: String(row.date_pointage || "").slice(0, 10),
            heure_entree: String(row.heure_entree || "").slice(0, 5),
            heure_sortie: String(row.heure_sortie || "").slice(0, 5),
            type_journee: row.type_journee || "normal",
            statut: row.statut || "present",
            retard_minutes: String(row.retard_minutes ?? 0),
            heures_sup: String(row.heures_sup ?? 0),
            note: row.note || "",
        });
    };

    const submitForm = async () => {
        if (!token) return;
        if (!form.employe_id || !form.date_pointage) {
            toast.error("Employé et date sont obligatoires");
            return;
        }
        setIsSubmitting(true);
        try {
            const payload = {
                employe_id: Number(form.employe_id),
                date_pointage: form.date_pointage,
                heure_entree: form.heure_entree || null,
                heure_sortie: form.heure_sortie || null,
                type_journee: form.type_journee,
                statut: form.statut,
                retard_minutes: Number(form.retard_minutes) || 0,
                heures_sup: Number(form.heures_sup) || 0,
                note: form.note || null,
            };
            const url = editing ? `/api/pointage/${editing.id}` : "/api/pointage";
            const method = editing ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Erreur lors de l'enregistrement");
            toast.success(editing ? "Pointage modifié" : "Pointage créé");
            resetForm();
            fetchData();
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de l'enregistrement");
        } finally {
            setIsSubmitting(false);
        }
    };

    const deleteRow = async (id: number) => {
        if (!token) return;
        if (!window.confirm("Supprimer ce pointage ?")) return;
        try {
            const res = await fetch(`/api/pointage/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Suppression impossible");
            toast.success("Pointage supprimé");
            fetchData();
        } catch (e: any) {
            toast.error(e.message || "Erreur lors de la suppression");
        }
    };

    const openEmployeeDialog = async (employeeId: number) => {
        if (!token) return;
        setEmployeeDialogOpen(true);
        setEmployeeDetailLoading(true);
        try {
            const res = await fetch(`/api/employees/${employeeId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setEmployeeDetail(data || null);
        } catch {
            setEmployeeDetail(null);
            toast.error("Impossible de charger les informations de l'employé");
        } finally {
            setEmployeeDetailLoading(false);
        }
    };

    const stats = useMemo(() => {
        const total = rows.length;
        const presents = rows.filter((r) => r.statut === "present").length;
        const absents = rows.filter((r) => r.statut === "absent").length;
        return { total, presents, absents };
    }, [rows]);

    const filteredRows = useMemo(() => {
        const s = searchTerm.trim().toLowerCase();
        return rows.filter((r) => {
            const employee = `${r.employe_prenom || ""} ${r.employe_nom || ""}`.trim().toLowerCase();
            const rowText = `${employee} ${r.date_pointage || ""} ${r.type_journee || ""} ${r.statut || ""} ${r.note || ""}`.toLowerCase();
            const matchesSearch = !s || rowText.includes(s);

            const d = r.date_pointage ? new Date(r.date_pointage) : null;
            const rowMonth = d && !Number.isNaN(d.getTime()) ? String(d.getMonth() + 1).padStart(2, "0") : "";
            const rowYear = d && !Number.isNaN(d.getTime()) ? String(d.getFullYear()) : "";
            const matchesMonth = filterMonth === "all" || rowMonth === filterMonth;
            const matchesYear = filterYear === "all" || rowYear === filterYear;
            const matchesStatut = filterStatut === "all" || String(r.statut || "") === filterStatut;
            const matchesEmploye = filterEmploye === "all" || String(r.employe_id) === filterEmploye;
            return matchesSearch && matchesMonth && matchesYear && matchesStatut && matchesEmploye;
        });
    }, [rows, searchTerm, filterMonth, filterYear, filterStatut, filterEmploye]);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        rows.forEach((r) => {
            const d = r.date_pointage ? new Date(r.date_pointage) : null;
            if (d && !Number.isNaN(d.getTime())) years.add(String(d.getFullYear()));
        });
        return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }, [rows]);

    const reportStats = useMemo(() => {
        const total = filteredRows.length;
        const presents = filteredRows.filter((r) => r.statut === "present").length;
        const absents = filteredRows.filter((r) => r.statut === "absent").length;
        const retards = filteredRows.filter((r) => r.statut === "retard").length;
        const totalRetard = filteredRows.reduce((acc, r) => acc + Number(r.retard_minutes || 0), 0);
        const totalHeuresSup = filteredRows.reduce((acc, r) => acc + Number(r.heures_sup || 0), 0);
        return { total, presents, absents, retards, totalRetard, totalHeuresSup };
    }, [filteredRows]);

    const handleExportExcel = () => {
        const headers = ["Employé", "Date", "Entrée", "Sortie", "Type", "Statut", "Retard (min)", "H. sup", "Note"];
        const rowsData = filteredRows.map((r) => [
            `${r.employe_prenom || ""} ${r.employe_nom || ""}`.trim() || `#${r.employe_id}`,
            String(r.date_pointage || "").slice(0, 10),
            String(r.heure_entree || "").slice(0, 5) || "—",
            String(r.heure_sortie || "").slice(0, 5) || "—",
            r.type_journee || "—",
            r.statut || "—",
            Number(r.retard_minutes || 0),
            Number(r.heures_sup || 0),
            r.note || "",
        ]);
        exportToExcel({
            headers,
            rows: rowsData,
            fileName: `pointage_${new Date().toISOString().slice(0, 10)}`,
            sheetName: "Pointage",
        });
        toast.success("Excel exporté avec succès");
    };

    const handleExportPdf = () => {
        try {
            const doc = new jsPDF({ orientation: "landscape" });
            doc.setFontSize(14);
            doc.text("Rapport de pointage", 14, 14);
            autoTable(doc, {
                startY: 22,
                head: [["Employé", "Date", "Entrée", "Sortie", "Type", "Statut", "Retard", "H. sup"]],
                body: filteredRows.map((r) => [
                    `${r.employe_prenom || ""} ${r.employe_nom || ""}`.trim() || `#${r.employe_id}`,
                    String(r.date_pointage || "").slice(0, 10),
                    String(r.heure_entree || "").slice(0, 5) || "—",
                    String(r.heure_sortie || "").slice(0, 5) || "—",
                    r.type_journee || "—",
                    r.statut || "—",
                    Number(r.retard_minutes || 0),
                    Number(r.heures_sup || 0),
                ]),
                styles: { fontSize: 8 },
                headStyles: { fillColor: [79, 70, 229] },
            });
            doc.save(`pointage_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            console.error(error);
            toast.error("Erreur lors de l'export PDF");
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="max-w-md w-full p-8 text-center">
                    <div className="mb-4 flex justify-center">
                        <ShieldAlert className="h-10 w-10 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold">Accès restreint</h2>
                    <p className="text-muted-foreground mt-2">Vous n'avez pas l'autorisation d'accéder au pointage.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Clock3 className="h-6 w-6 text-indigo-600" />
                        Pointage
                    </h1>
                    <p className="text-sm text-muted-foreground">Suivi des présences, absences et horaires.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExportExcel}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Excel
                    </Button>
                    <Button variant="outline" onClick={handleExportPdf}>
                        <Printer className="h-4 w-4 mr-2" />
                        PDF
                    </Button>
                    <Button variant="outline" onClick={() => setReportOpen(true)}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Rapport
                    </Button>
                    <Button
                        onClick={() => {
                            setEditing(null);
                            setForm(emptyForm);
                            setDialogOpen(true);
                        }}
                        variant="outline"
                    >
                    <Plus className="h-4 w-4 mr-2" />
                    Nouveau
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
                <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Présents</p><p className="text-2xl font-bold text-emerald-600">{stats.presents}</p></CardContent></Card>
                <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Absents</p><p className="text-2xl font-bold text-red-600">{stats.absents}</p></CardContent></Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Liste des pointages</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <div className="md:col-span-2 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="Rechercher employé, statut, note..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select value={filterMonth} onValueChange={setFilterMonth}>
                            <SelectTrigger><SelectValue placeholder="Mois" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les mois</SelectItem>
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const v = String(i + 1).padStart(2, "0");
                                    return <SelectItem key={v} value={v}>{v}</SelectItem>;
                                })}
                            </SelectContent>
                        </Select>
                        <Select value={filterYear} onValueChange={setFilterYear}>
                            <SelectTrigger><SelectValue placeholder="Année" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Toutes les années</SelectItem>
                                {availableYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filterStatut} onValueChange={setFilterStatut}>
                            <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les statuts</SelectItem>
                                <SelectItem value="present">Présent</SelectItem>
                                <SelectItem value="absent">Absent</SelectItem>
                                <SelectItem value="retard">Retard</SelectItem>
                                <SelectItem value="conge">Congé</SelectItem>
                                <SelectItem value="mission">Mission</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Select value={filterEmploye} onValueChange={setFilterEmploye}>
                            <SelectTrigger><SelectValue placeholder="Employé" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les employés</SelectItem>
                                {employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{employeeName(e)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden border border-indigo-100">
                <CardContent className="p-0">
                    <Table className="min-w-[980px]">
                        <TableHeader>
                            <TableRow className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100">
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground">Employé</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground">Date</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground">Entrée</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground">Sortie</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground">Type</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground">Statut</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground text-center">Retard</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground text-center">H. sup</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-muted-foreground text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Chargement...</TableCell></TableRow>
                            ) : filteredRows.length === 0 ? (
                                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Aucun pointage.</TableCell></TableRow>
                            ) : (
                                filteredRows.map((r) => (
                                    <TableRow key={r.id} className="hover:bg-indigo-50/40">
                                        <TableCell className="font-medium">
                                            <button
                                                type="button"
                                                className="text-indigo-600 hover:underline"
                                                onClick={() => openEmployeeDialog(r.employe_id)}
                                            >
                                                {`${r.employe_prenom || ""} ${r.employe_nom || ""}`.trim() || `#${r.employe_id}`}
                                            </button>
                                        </TableCell>
                                        <TableCell className="font-medium">{String(r.date_pointage || "").slice(0, 10)}</TableCell>
                                        <TableCell>{String(r.heure_entree || "").slice(0, 5) || "—"}</TableCell>
                                        <TableCell>{String(r.heure_sortie || "").slice(0, 5) || "—"}</TableCell>
                                        <TableCell>
                                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize", typeBadgeClass(r.type_journee))}>
                                                {String(r.type_journee || "—").replace("_", " ")}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize", statusBadgeClass(r.statut))}>
                                                {r.statut || "—"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={cn("font-semibold", Number(r.retard_minutes || 0) > 0 ? "text-amber-600" : "text-emerald-600")}>
                                                {Number(r.retard_minutes || 0)} min
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={cn("font-semibold", Number(r.heures_sup || 0) > 0 ? "text-indigo-600" : "text-muted-foreground")}>
                                                {Number(r.heures_sup || 0)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-44">
                                                    <DropdownMenuItem className="cursor-pointer" onClick={() => startEdit(r)}>
                                                        <Pencil className="h-4 w-4 mr-2" /> Modifier
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={() => deleteRow(r.id)}>
                                                        <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Modifier un pointage" : "Nouveau pointage"}</DialogTitle>
                        <DialogDescription>Renseignez les informations de pointage.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label>Employé</Label>
                            <Select value={form.employe_id} onValueChange={(v) => setForm((p) => ({ ...p, employe_id: v }))}>
                                <SelectTrigger><SelectValue placeholder="Choisir un employé" /></SelectTrigger>
                                <SelectContent>
                                    {employees.map((e) => (
                                        <SelectItem key={e.id} value={String(e.id)}>{employeeName(e)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Date</Label>
                            <Input type="date" value={form.date_pointage} onChange={(e) => setForm((p) => ({ ...p, date_pointage: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Type journée</Label>
                            <Select value={form.type_journee} onValueChange={(v) => setForm((p) => ({ ...p, type_journee: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="normal">Normal</SelectItem>
                                    <SelectItem value="demi_journee">Demi-journée</SelectItem>
                                    <SelectItem value="absent">Absent</SelectItem>
                                    <SelectItem value="conge">Congé</SelectItem>
                                    <SelectItem value="ferie">Férié</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Heure entrée</Label>
                            <Input type="time" value={form.heure_entree} onChange={(e) => setForm((p) => ({ ...p, heure_entree: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Heure sortie</Label>
                            <Input type="time" value={form.heure_sortie} onChange={(e) => setForm((p) => ({ ...p, heure_sortie: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Statut</Label>
                            <Select value={form.statut} onValueChange={(v) => setForm((p) => ({ ...p, statut: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="present">Présent</SelectItem>
                                    <SelectItem value="absent">Absent</SelectItem>
                                    <SelectItem value="retard">Retard</SelectItem>
                                    <SelectItem value="conge">Congé</SelectItem>
                                    <SelectItem value="mission">Mission</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Retard (min)</Label>
                            <Input type="number" value={form.retard_minutes} onChange={(e) => setForm((p) => ({ ...p, retard_minutes: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Heures sup</Label>
                            <Input type="number" step="0.25" value={form.heures_sup} onChange={(e) => setForm((p) => ({ ...p, heures_sup: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5 md:col-span-3">
                            <Label>Note</Label>
                            <Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={resetForm}>Annuler</Button>
                        <Button onClick={submitForm} disabled={isSubmitting}>
                            {isSubmitting ? "Enregistrement..." : editing ? "Mettre à jour" : "Créer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Rapport pointage</DialogTitle>
                        <DialogDescription>Synthèse selon les filtres actifs.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{reportStats.total}</p></CardContent></Card>
                        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Présents / Absents</p><p className="text-2xl font-bold">{reportStats.presents} / {reportStats.absents}</p></CardContent></Card>
                        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Retards</p><p className="text-2xl font-bold">{reportStats.retards}</p></CardContent></Card>
                        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Total retard (min)</p><p className="text-xl font-bold text-amber-600">{reportStats.totalRetard}</p></CardContent></Card>
                        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Total heures sup</p><p className="text-xl font-bold text-indigo-600">{reportStats.totalHeuresSup.toFixed(2)}</p></CardContent></Card>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setReportOpen(false)}>Fermer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Informations employé</DialogTitle>
                        <DialogDescription>Détails du profil et activité de pointage.</DialogDescription>
                    </DialogHeader>
                    {employeeDetailLoading ? (
                        <div className="py-8 text-center text-muted-foreground">Chargement...</div>
                    ) : !employeeDetail ? (
                        <div className="py-8 text-center text-muted-foreground">Employé introuvable.</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Nom complet</p><p className="font-semibold">{employeeName(employeeDetail)}</p></CardContent></Card>
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Rôle</p><p className="font-semibold">{employeeDetail.role || "—"}</p></CardContent></Card>
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Email</p><p className="font-semibold">{employeeDetail.email || "—"}</p></CardContent></Card>
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Téléphone</p><p className="font-semibold">{employeeDetail.phone || "—"}</p></CardContent></Card>
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Date embauche</p><p className="font-semibold">{String(employeeDetail.hire_date || "").slice(0, 10) || "—"}</p></CardContent></Card>
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Salaire</p><p className="font-semibold">{Number(employeeDetail.salary || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</p></CardContent></Card>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pointages total</p><p className="text-xl font-bold">{rows.filter((x) => x.employe_id === employeeDetail.id).length}</p></CardContent></Card>
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Présences</p><p className="text-xl font-bold text-emerald-600">{rows.filter((x) => x.employe_id === employeeDetail.id && x.statut === "present").length}</p></CardContent></Card>
                                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Absences</p><p className="text-xl font-bold text-red-600">{rows.filter((x) => x.employe_id === employeeDetail.id && x.statut === "absent").length}</p></CardContent></Card>
                            </div>
                        </>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEmployeeDialogOpen(false)}>Fermer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
