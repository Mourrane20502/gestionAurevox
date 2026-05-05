import { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { FileSignature, Plus, Trash2, Edit, Download, Filter, PenSquare, MoreVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/common/ui/dialog";
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
import { Label } from "@/components/common/ui/label";
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";

type ContratRow = {
    id: number;
    pdf?: string | null;
    signature_client?: string | null;
    signature_gestionnaire?: string | null;
    gestionnaire_id?: number | null;
    gestionnaire_nom?: string | null;
    created_at?: string;
};

type Gestionnaire = {
    id: number;
    nom: string;
};

const apiBase = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const toUploadUrl = (value?: string | null) => {
    const v = String(value || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    return `${apiBase}/uploads/${v.replace(/^\/+/, "")}`;
};

export default function Contrat() {
    const token = localStorage.getItem("token");
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [contrats, setContrats] = useState<ContratRow[]>([]);
    const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingContrat, setEditingContrat] = useState<ContratRow | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [gestionnaireId, setGestionnaireId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [filterGestionnaireId, setFilterGestionnaireId] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [contratToDelete, setContratToDelete] = useState<ContratRow | null>(null);

    const clientSigRef = useRef<SignatureCanvas | null>(null);
    const gestionnaireSigRef = useRef<SignatureCanvas | null>(null);

    const loadSignatureIntoPad = (pad: SignatureCanvas | null, url: string) => {
        if (!pad || !url) return;
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
            const canvas = pad.getCanvas();
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
            const drawW = image.width * scale;
            const drawH = image.height * scale;
            const x = (canvas.width - drawW) / 2;
            const y = (canvas.height - drawH) / 2;
            ctx.drawImage(image, x, y, drawW, drawH);
        };
        image.src = url;
    };

    const loadData = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const [contratsRes, gestRes] = await Promise.all([
                fetch("/api/contrats", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/gestionnaires", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (contratsRes.ok) setContrats(await contratsRes.json());
            if (gestRes.ok) setGestionnaires(await gestRes.json());
        } catch (error) {
            console.error(error);
            toast.error("Erreur de chargement des contrats");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [token]);

    const resetForm = () => {
        setEditingContrat(null);
        setPdfFile(null);
        setGestionnaireId("");
        clientSigRef.current?.clear();
        gestionnaireSigRef.current?.clear();
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (row: ContratRow) => {
        resetForm();
        setEditingContrat(row);
        setGestionnaireId(String(row.gestionnaire_id || ""));
        setDialogOpen(true);
    };

    useEffect(() => {
        if (!dialogOpen || !editingContrat) return;
        const timer = setTimeout(() => {
            const clientUrl = toUploadUrl(editingContrat.signature_client);
            const gestionnaireUrl = toUploadUrl(editingContrat.signature_gestionnaire);
            if (clientUrl) loadSignatureIntoPad(clientSigRef.current, clientUrl);
            if (gestionnaireUrl) loadSignatureIntoPad(gestionnaireSigRef.current, gestionnaireUrl);
        }, 80);
        return () => clearTimeout(timer);
    }, [dialogOpen, editingContrat]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;

        const isEditing = Boolean(editingContrat);
        if (!gestionnaireId) {
            toast.error("Veuillez sélectionner un gestionnaire");
            return;
        }
        if (!isEditing && !pdfFile) {
            toast.error("Le fichier PDF du contrat est requis");
            return;
        }

        const clientSigData =
            clientSigRef.current && !clientSigRef.current.isEmpty()
                ? clientSigRef.current.toDataURL("image/png")
                : "";
        const gestionnaireSigData =
            gestionnaireSigRef.current && !gestionnaireSigRef.current.isEmpty()
                ? gestionnaireSigRef.current.toDataURL("image/png")
                : "";

        if (!isEditing && (!clientSigData || !gestionnaireSigData)) {
            toast.error("Les deux signatures sont obligatoires");
            return;
        }

        setIsSubmitting(true);
        try {
            const form = new FormData();
            form.append("gestionnaire_id", gestionnaireId);
            if (pdfFile) form.append("pdf", pdfFile);
            if (clientSigData) form.append("signature_client_data", clientSigData);
            if (gestionnaireSigData) form.append("signature_gestionnaire_data", gestionnaireSigData);

            const url = isEditing ? `/api/contrats/${editingContrat?.id}` : "/api/contrats";
            const method = isEditing ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Erreur d'enregistrement");

            toast.success(isEditing ? "Contrat mis à jour" : "Contrat créé");
            setDialogOpen(false);
            resetForm();
            loadData();
        } catch (error: any) {
            toast.error(error?.message || "Erreur de sauvegarde");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/contrats/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Erreur suppression");
            toast.success("Contrat supprimé");
            loadData();
        } catch (error: any) {
            toast.error(error?.message || "Erreur suppression");
        }
    };

    const filteredContrats = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return contrats.filter((row) => {
            const matchesSearch =
                !q ||
                String(row.id).includes(q) ||
                String(row.gestionnaire_nom || "").toLowerCase().includes(q) ||
                String(row.pdf || "").toLowerCase().includes(q);

            const matchesGestionnaire =
                filterGestionnaireId === "all" ||
                String(row.gestionnaire_id || "") === filterGestionnaireId;

            const rowDate = row.created_at ? String(row.created_at).slice(0, 10) : "";
            const matchesDateFrom = !dateFrom || (rowDate && rowDate >= dateFrom);
            const matchesDateTo = !dateTo || (rowDate && rowDate <= dateTo);

            return matchesSearch && matchesGestionnaire && matchesDateFrom && matchesDateTo;
        });
    }, [contrats, searchTerm, filterGestionnaireId, dateFrom, dateTo]);

    const stats = useMemo(() => {
        const total = contrats.length;
        const withPdf = contrats.filter((c) => !!String(c.pdf || "").trim()).length;
        const fullySigned = contrats.filter(
            (c) => !!String(c.signature_client || "").trim() && !!String(c.signature_gestionnaire || "").trim()
        ).length;
        return { total, withPdf, fullySigned };
    }, [contrats]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
                        <FileSignature className="h-7 w-7 text-indigo-600" />
                        Contrats
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Gestion des contrats clients avec signatures digitales (canvas).
                    </p>
                </div>

                <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Nouveau contrat
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingContrat ? "Modifier contrat" : "Créer contrat"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label>Gestionnaire</Label>
                                    <select
                                        value={gestionnaireId}
                                        onChange={(e) => setGestionnaireId(e.target.value)}
                                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                        required
                                    >
                                        <option value="">Sélectionner...</option>
                                        {gestionnaires.map((g) => (
                                            <option key={g.id} value={g.id}>{g.nom}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label>PDF contrat {editingContrat ? "(optionnel)" : ""}</Label>
                                    <Input
                                        type="file"
                                        accept="application/pdf"
                                        onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="rounded-xl border border-border p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="flex items-center gap-2">
                                            <PenSquare className="h-4 w-4 text-indigo-600" />
                                            Signature client
                                        </Label>
                                        <Button type="button" variant="outline" size="sm" onClick={() => clientSigRef.current?.clear()}>
                                            Effacer
                                        </Button>
                                    </div>
                                    <div className="border rounded-lg bg-white">
                                        <SignatureCanvas
                                            ref={clientSigRef}
                                            canvasProps={{ width: 520, height: 180, className: "w-full h-[180px]" }}
                                        />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="flex items-center gap-2">
                                            <PenSquare className="h-4 w-4 text-indigo-600" />
                                            Signature gestionnaire
                                        </Label>
                                        <Button type="button" variant="outline" size="sm" onClick={() => gestionnaireSigRef.current?.clear()}>
                                            Effacer
                                        </Button>
                                    </div>
                                    <div className="border rounded-lg bg-white">
                                        <SignatureCanvas
                                            ref={gestionnaireSigRef}
                                            canvasProps={{ width: 520, height: 180, className: "w-full h-[180px]" }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <Button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700">
                                {isSubmitting ? "Enregistrement..." : editingContrat ? "Mettre à jour" : "Créer contrat"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border border-indigo-200 bg-indigo-50/40">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Total contrats</p>
                        <p className="text-2xl font-black text-indigo-700 mt-1">{stats.total}</p>
                    </CardContent>
                </Card>
                <Card className="border border-emerald-200 bg-emerald-50/40">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Avec PDF</p>
                        <p className="text-2xl font-black text-emerald-700 mt-1">{stats.withPdf}</p>
                    </CardContent>
                </Card>
                <Card className="border border-violet-200 bg-violet-50/40">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">Signés complet</p>
                        <p className="text-2xl font-black text-violet-700 mt-1">{stats.fullySigned}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-border shadow-sm">
                <CardHeader>
                    <CardTitle>Liste des contrats</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 rounded-xl border border-border bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                            <Filter className="h-4 w-4 text-indigo-600" />
                            Filtres de recherche
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Rechercher (ID, gestionnaire, fichier)..."
                            className="bg-background"
                        />
                        <select
                            value={filterGestionnaireId}
                            onChange={(e) => setFilterGestionnaireId(e.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="all">Tous les gestionnaires</option>
                            {gestionnaires.map((g) => (
                                <option key={g.id} value={String(g.id)}>{g.nom}</option>
                            ))}
                        </select>
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setSearchTerm("");
                                setFilterGestionnaireId("all");
                                setDateFrom("");
                                setDateTo("");
                            }}
                        >
                            Réinitialiser
                        </Button>
                        </div>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Gestionnaire</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>PDF</TableHead>
                                <TableHead>Signatures</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
                                </TableRow>
                            ) : filteredContrats.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun contrat trouvé</TableCell>
                                </TableRow>
                            ) : (
                                filteredContrats.map((row, idx) => (
                                    <TableRow key={row.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                                        <TableCell className="font-semibold">#{row.id}</TableCell>
                                        <TableCell className="font-medium">{row.gestionnaire_nom || "—"}</TableCell>
                                        <TableCell>{row.created_at ? String(row.created_at).slice(0, 10) : "—"}</TableCell>
                                        <TableCell>
                                            {row.pdf ? (
                                                <a
                                                    href={toUploadUrl(row.pdf)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium"
                                                >
                                                    <Download className="h-4 w-4" />
                                                    Ouvrir PDF
                                                </a>
                                            ) : "—"}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2 flex-wrap">
                                                {row.signature_client ? (
                                                    <a href={toUploadUrl(row.signature_client)} target="_blank" rel="noreferrer" className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full hover:underline text-xs font-medium">
                                                        Signature client
                                                    </a>
                                                ) : <span className="text-xs text-muted-foreground">Client —</span>}
                                                {row.signature_gestionnaire ? (
                                                    <a href={toUploadUrl(row.signature_gestionnaire)} target="_blank" rel="noreferrer" className="text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full hover:underline text-xs font-medium">
                                                        Signature gestionnaire
                                                    </a>
                                                ) : <span className="text-xs text-muted-foreground">Gestionnaire —</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem
                                                        className="cursor-pointer"
                                                        onClick={() => {
                                                            if (!row.pdf) {
                                                                toast.error("Aucun PDF disponible pour ce contrat");
                                                                return;
                                                            }
                                                            window.open(toUploadUrl(row.pdf), "_blank", "noopener,noreferrer");
                                                        }}
                                                    >
                                                        <Download className="h-4 w-4" />
                                                        Voir contrat PDF
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(row)}>
                                                        <Edit className="h-4 w-4" />
                                                        Modifier
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer text-red-600 focus:text-red-600"
                                                        onClick={() => setContratToDelete(row)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
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
                </CardContent>
            </Card>

            <AlertDialog open={!!contratToDelete} onOpenChange={(open) => !open && setContratToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                        <AlertDialogDescription>
                            Êtes-vous sûr de vouloir supprimer ce contrat
                            {contratToDelete ? ` #${contratToDelete.id}` : ""} ?
                            Cette action est irréversible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={async () => {
                                if (!contratToDelete) return;
                                await handleDelete(contratToDelete.id);
                                setContratToDelete(null);
                            }}
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

