import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import { Textarea } from "@/components/common/ui/textarea";
import { toast } from "sonner";
import { Clock, Edit, Plus, RotateCcw, Search, ShieldAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_JOURNEE_OPTIONS: { value: string; label: string }[] = [
    { value: "normal", label: "Journée normale" },
    { value: "demi_journee", label: "Demi-journée" },
    { value: "absent", label: "Absent" },
    { value: "conge", label: "Congé" },
    { value: "ferie", label: "Férié" },
];

const STATUT_OPTIONS: { value: string; label: string }[] = [
    { value: "present", label: "Présent" },
    { value: "absent", label: "Absent" },
    { value: "retard", label: "Retard" },
    { value: "conge", label: "Congé" },
    { value: "mission", label: "Mission" },
];

/** Valeur Select « tous » (évite chaîne vide avec Radix). */
const FILTER_ALL = "__all__";

interface EmployeeOpt {
    id: number;
    prenom: string;
    nom: string;
    id_point_de_vente: number | null;
}

interface PointageRow {
    id: number;
    employee_id: number;
    date_pointage: string;
    heure_entree: string | null;
    heure_sortie: string | null;
    pause_minutes: number;
    commentaire: string | null;
    type_journee?: string | null;
    statut?: string | null;
    heures_sup?: number | string | null;
    point_de_vente_id: number | null;
    user_id: number | null;
    prenom?: string;
    nom?: string;
    pv_name?: string | null;
}

function formatTimeForInput(v: string | null | undefined): string {
    if (v == null || String(v).trim() === "") return "";
    const s = String(v);
    if (s.length >= 5) return s.slice(0, 5);
    return s;
}

function labelTypeJournee(v: string | null | undefined): string {
    if (!v) return "—";
    return TYPE_JOURNEE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function labelStatutPointage(v: string | null | undefined): string {
    if (!v) return "—";
    return STATUT_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function formatHeuresSupCell(v: number | string | null | undefined): string {
    if (v == null || String(v).trim() === "") return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function Pointage() {
    const roleLower = (localStorage.getItem("role") || "").toLowerCase();
    const permissions: string[] = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAdmin = roleLower === "admin" || roleLower === "superadmin";
    const isAuthorized = isAdmin || permissions.includes("pointage_view");

    const token = localStorage.getItem("token");
    const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    const [rows, setRows] = useState<PointageRow[]>([]);
    const [employees, setEmployees] = useState<EmployeeOpt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [monthFilter, setMonthFilter] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const [filterEmployeeId, setFilterEmployeeId] = useState(FILTER_ALL);
    const [filterTypeJournee, setFilterTypeJournee] = useState(FILTER_ALL);
    const [filterStatut, setFilterStatut] = useState(FILTER_ALL);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [editing, setEditing] = useState<PointageRow | null>(null);
    const [toDelete, setToDelete] = useState<PointageRow | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [formEmployeeId, setFormEmployeeId] = useState<string>("");
    const [formDate, setFormDate] = useState("");
    const [formEntree, setFormEntree] = useState("");
    const [formSortie, setFormSortie] = useState("");
    const [formPause, setFormPause] = useState("0");
    const [formComment, setFormComment] = useState("");
    const [formTypeJournee, setFormTypeJournee] = useState("normal");
    const [formStatut, setFormStatut] = useState("present");
    const [formHeuresSup, setFormHeuresSup] = useState("0");

    const loadAll = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const [listRes, lookRes] = await Promise.all([
                fetch("/api/pointage", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/pointage/lookup", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (listRes.ok) {
                const data = await listRes.json();
                setRows(Array.isArray(data) ? data : []);
            } else {
                setRows([]);
                if (listRes.status === 403) toast.error("Permission pointage refusée");
            }
            if (lookRes.ok) {
                const data = await lookRes.json();
                setEmployees(Array.isArray(data?.employees) ? data.employees : []);
            }
        } catch {
            toast.error("Erreur réseau");
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (isAuthorized) loadAll();
    }, [isAuthorized, loadAll]);

    const filtered = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const [y, m] = monthFilter.split("-").map(Number);
        const empFilter =
            filterEmployeeId !== FILTER_ALL ? Number(filterEmployeeId) : NaN;
        return rows.filter((r) => {
            const d = r.date_pointage ? String(r.date_pointage).slice(0, 10) : "";
            if (y && m) {
                const [ry, rm] = d.split("-").map(Number);
                if (ry !== y || rm !== m) return false;
            }
            if (Number.isFinite(empFilter) && empFilter > 0 && r.employee_id !== empFilter) {
                return false;
            }
            const tj = (r.type_journee || "normal").toLowerCase();
            if (filterTypeJournee !== FILTER_ALL && tj !== filterTypeJournee.toLowerCase()) {
                return false;
            }
            const st = (r.statut || "present").toLowerCase();
            if (filterStatut !== FILTER_ALL && st !== filterStatut.toLowerCase()) {
                return false;
            }
            if (!q) return true;
            const name = `${r.prenom || ""} ${r.nom || ""}`.toLowerCase();
            const c = (r.commentaire || "").toLowerCase();
            const tjLabel = labelTypeJournee(r.type_journee).toLowerCase();
            const stLabel = labelStatutPointage(r.statut).toLowerCase();
            return (
                name.includes(q) ||
                c.includes(q) ||
                String(r.id).includes(q) ||
                tjLabel.includes(q) ||
                stLabel.includes(q)
            );
        });
    }, [rows, searchTerm, monthFilter, filterEmployeeId, filterTypeJournee, filterStatut]);

    const resetFilters = () => {
        const d = new Date();
        setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        setSearchTerm("");
        setFilterEmployeeId(FILTER_ALL);
        setFilterTypeJournee(FILTER_ALL);
        setFilterStatut(FILTER_ALL);
    };

    const openCreate = () => {
        setEditing(null);
        setFormEmployeeId("");
        setFormDate(new Date().toISOString().slice(0, 10));
        setFormEntree("");
        setFormSortie("");
        setFormPause("0");
        setFormComment("");
        setFormTypeJournee("normal");
        setFormStatut("present");
        setFormHeuresSup("0");
        setDialogOpen(true);
    };

    const openEdit = (r: PointageRow) => {
        setEditing(r);
        setFormEmployeeId(String(r.employee_id));
        setFormDate(r.date_pointage ? String(r.date_pointage).slice(0, 10) : "");
        setFormEntree(formatTimeForInput(r.heure_entree));
        setFormSortie(formatTimeForInput(r.heure_sortie));
        setFormPause(String(r.pause_minutes ?? 0));
        setFormComment(r.commentaire || "");
        setFormTypeJournee(r.type_journee && TYPE_JOURNEE_OPTIONS.some((o) => o.value === r.type_journee) ? r.type_journee : "normal");
        setFormStatut(r.statut && STATUT_OPTIONS.some((o) => o.value === r.statut) ? r.statut : "present");
        const hs = r.heures_sup != null && r.heures_sup !== "" ? Number(r.heures_sup) : 0;
        setFormHeuresSup(Number.isFinite(hs) ? String(hs) : "0");
        setDialogOpen(true);
    };

    const save = async () => {
        if (!formEmployeeId || !formDate) {
            toast.error("Employé et date obligatoires");
            return;
        }
        setIsSaving(true);
        try {
            const body = {
                employee_id: Number(formEmployeeId),
                date_pointage: formDate,
                heure_entree: formEntree.trim() || null,
                heure_sortie: formSortie.trim() || null,
                pause_minutes: Number(formPause) || 0,
                commentaire: formComment.trim() || null,
                type_journee: formTypeJournee,
                statut: formStatut,
                heures_sup: Math.max(0, Math.min(99.99, Number(formHeuresSup) || 0)),
                point_de_vente_id: null,
            };
            const url = editing ? `/api/pointage/${editing.id}` : "/api/pointage";
            const method = editing ? "PUT" : "POST";
            const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur enregistrement");
            }
            toast.success(editing ? "Pointage mis à jour" : "Pointage créé");
            setDialogOpen(false);
            await loadAll();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Erreur");
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        try {
            const res = await fetch(`/api/pointage/${toDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Suppression impossible");
            toast.success("Pointage supprimé");
            setDeleteOpen(false);
            setToDelete(null);
            await loadAll();
        } catch {
            toast.error("Erreur suppression");
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="max-w-md w-full shadow-xl border-border/40 bg-card/80 backdrop-blur-sm p-8 text-center">
                    <div className="mb-6 flex justify-center">
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                            <ShieldAlert className="h-12 w-12 text-red-500" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Accès restreint</h2>
                    <p className="text-muted-foreground">
                        Vous n&apos;avez pas la permission d&apos;accéder au pointage.
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
                        <Clock className="h-8 w-8 text-primary" />
                        Pointage
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Feuilles de présence par employé et par jour (entrée / sortie).
                    </p>
                </div>
                <Button onClick={openCreate} className="gap-2 shrink-0">
                    <Plus className="h-4 w-4" />
                    Nouveau pointage
                </Button>
            </div>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Filtres</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>Mois</Label>
                            <Input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Employé</Label>
                            <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tous" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FILTER_ALL}>Tous les employés</SelectItem>
                                    {employees.map((e) => (
                                        <SelectItem key={e.id} value={String(e.id)}>
                                            {e.prenom} {e.nom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Type de journée</Label>
                            <Select value={filterTypeJournee} onValueChange={setFilterTypeJournee}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tous" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FILTER_ALL}>Tous les types</SelectItem>
                                    {TYPE_JOURNEE_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Statut</Label>
                            <Select value={filterStatut} onValueChange={setFilterStatut}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tous" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FILTER_ALL}>Tous les statuts</SelectItem>
                                    {STATUT_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                        <div className="flex-1 space-y-2">
                            <Label>Recherche</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    placeholder="Nom, prénom, note, type, statut…"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <Button type="button" variant="outline" className="shrink-0 gap-2" onClick={resetFilters}>
                            <RotateCcw className="h-4 w-4" />
                            Réinitialiser
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl overflow-hidden">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-12 text-center text-muted-foreground">Chargement…</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Employé</TableHead>
                                        <TableHead>Entrée</TableHead>
                                        <TableHead>Sortie</TableHead>
                                        <TableHead>Retard (min)</TableHead>
                                        <TableHead>Type journée</TableHead>
                                        <TableHead>Statut</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">H. sup.</TableHead>
                                        <TableHead>Note</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                                                Aucune ligne pour ce mois ou cette recherche.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filtered.map((r) => (
                                            <TableRow key={r.id}>
                                                <TableCell className="font-medium whitespace-nowrap">
                                                    {r.date_pointage
                                                        ? new Date(String(r.date_pointage).slice(0, 10)).toLocaleDateString(
                                                              "fr-FR"
                                                          )
                                                        : "—"}
                                                </TableCell>
                                                <TableCell>
                                                    {(r.prenom || r.nom) && (
                                                        <span>
                                                            {r.prenom} {r.nom}
                                                        </span>
                                                    )}
                                                    {!r.prenom && !r.nom && <span className="text-muted-foreground">#{r.employee_id}</span>}
                                                </TableCell>
                                                <TableCell className="font-mono text-sm">{formatTimeForInput(r.heure_entree) || "—"}</TableCell>
                                                <TableCell className="font-mono text-sm">{formatTimeForInput(r.heure_sortie) || "—"}</TableCell>
                                                <TableCell>{r.pause_minutes ?? 0}</TableCell>
                                                <TableCell className="text-sm">{labelTypeJournee(r.type_journee ?? undefined)}</TableCell>
                                                <TableCell className="text-sm">{labelStatutPointage(r.statut ?? undefined)}</TableCell>
                                                <TableCell className="text-right font-mono text-sm">
                                                    {formatHeuresSupCell(r.heures_sup)}
                                                </TableCell>
                                                <TableCell
                                                    className="max-w-[12rem] truncate text-muted-foreground text-sm"
                                                    title={r.commentaire || undefined}
                                                >
                                                    {r.commentaire?.trim() ? r.commentaire : "—"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-destructive"
                                                            onClick={() => {
                                                                setToDelete(r);
                                                                setDeleteOpen(true);
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Modifier le pointage" : "Nouveau pointage"}</DialogTitle>
                        <DialogDescription>
                            Jour travaillé, type de journée, statut, horaires, retard (minutes) et heures supplémentaires.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="space-y-2">
                            <Label>Employé</Label>
                            <Select value={formEmployeeId} onValueChange={setFormEmployeeId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choisir un employé" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map((e) => (
                                        <SelectItem key={e.id} value={String(e.id)}>
                                            {e.prenom} {e.nom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Type de journée</Label>
                                <Select value={formTypeJournee} onValueChange={setFormTypeJournee}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TYPE_JOURNEE_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Statut</Label>
                                <Select value={formStatut} onValueChange={setFormStatut}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUT_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Heure d&apos;entrée</Label>
                                <Input type="time" value={formEntree} onChange={(e) => setFormEntree(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Heure de sortie</Label>
                                <Input type="time" value={formSortie} onChange={(e) => setFormSortie(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Retard (minutes)</Label>
                                <Input type="number" min={0} max={480} value={formPause} onChange={(e) => setFormPause(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Heures sup.</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={99.99}
                                    step={0.25}
                                    value={formHeuresSup}
                                    onChange={(e) => setFormHeuresSup(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Commentaire</Label>
                            <Textarea rows={3} value={formComment} onChange={(e) => setFormComment(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button onClick={save} disabled={isSaving} className={cn(isSaving && "opacity-80")}>
                            {isSaving ? "Enregistrement…" : "Enregistrer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer ce pointage ?</DialogTitle>
                        <DialogDescription>Cette action est définitive.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                            Annuler
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
