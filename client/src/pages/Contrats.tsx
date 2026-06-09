import { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { Button } from "@/components/common/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/common/ui/dialog";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/common/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/common/ui/dropdown-menu";
import { Edit, Eye, FileText, MoreVertical, Plus, Search, Trash2 } from "lucide-react";

type Gestionnaire = { id: number; nom: string };
type Contrat = {
    id: number;
    gestionnaire_id: number;
    gestionnaire_nom?: string | null;
    signature_client: string | null;
    signature_gestionnaire: string | null;
    pdf_path?: string | null;
    created_at: string;
};

export default function Contrats() {
    const token = localStorage.getItem("token");
    const [rows, setRows] = useState<Contrat[]>([]);
    const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterGestionnaire, setFilterGestionnaire] = useState("all");
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Contrat | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Contrat | null>(null);

    const [gestionnaireId, setGestionnaireId] = useState("none");
    const [pdfPath, setPdfPath] = useState("");
    const [pdfFileName, setPdfFileName] = useState("");
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const clientSigRef = useRef<SignatureCanvas | null>(null);
    const gestionnaireSigRef = useRef<SignatureCanvas | null>(null);
    const [sigClientValue, setSigClientValue] = useState<string | null>(null);
    const [sigGestionnaireValue, setSigGestionnaireValue] = useState<string | null>(null);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerType, setViewerType] = useState<"pdf" | "image">("pdf");
    const [viewerTitle, setViewerTitle] = useState("");
    const [viewerSrc, setViewerSrc] = useState("");

    const loadAll = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const [contratsRes, gestRes] = await Promise.all([
                fetch("/api/contrats", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/gestionnaires", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            setRows(contratsRes.ok ? await contratsRes.json() : []);
            setGestionnaires(gestRes.ok ? await gestRes.json() : []);
        } catch {
            toast.error("Erreur chargement contrats");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, [token]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            const createdDate = r.created_at ? String(r.created_at).slice(0, 10) : "";
            if (filterGestionnaire !== "all" && String(r.gestionnaire_id) !== filterGestionnaire) {
                return false;
            }
            if (filterDateFrom && createdDate && createdDate < filterDateFrom) {
                return false;
            }
            if (filterDateTo && createdDate && createdDate > filterDateTo) {
                return false;
            }

            if (!q) return true;
            return (
                String(r.id).includes(q) ||
                String(r.gestionnaire_nom || "").toLowerCase().includes(q) ||
                String(r.gestionnaire_id || "").toLowerCase().includes(q) ||
                String(r.pdf_path || "").toLowerCase().includes(q)
            );
        });
    }, [
        rows,
        search,
        filterGestionnaire,
        filterDateFrom,
        filterDateTo,
    ]);

    const resetFilters = () => {
        setSearch("");
        setFilterGestionnaire("all");
        setFilterDateFrom("");
        setFilterDateTo("");
    };

    const openCreate = () => {
        setEditing(null);
        setGestionnaireId("none");
        setPdfPath("");
        setPdfFileName("");
        setPdfFile(null);
        setSigClientValue(null);
        setSigGestionnaireValue(null);
        clientSigRef.current?.clear();
        gestionnaireSigRef.current?.clear();
        setDialogOpen(true);
    };

    const openEdit = (row: Contrat) => {
        setEditing(row);
        setGestionnaireId(String(row.gestionnaire_id));
        setPdfPath(row.pdf_path || "");
        setPdfFileName("");
        setPdfFile(null);
        setSigClientValue(row.signature_client || null);
        setSigGestionnaireValue(row.signature_gestionnaire || null);
        setDialogOpen(true);
    };

    useEffect(() => {
        if (!dialogOpen) return;
        const timer = setTimeout(() => {
            if (sigClientValue) {
                clientSigRef.current?.clear();
                clientSigRef.current?.fromDataURL(sigClientValue);
            } else {
                clientSigRef.current?.clear();
            }
            if (sigGestionnaireValue) {
                gestionnaireSigRef.current?.clear();
                gestionnaireSigRef.current?.fromDataURL(sigGestionnaireValue);
            } else {
                gestionnaireSigRef.current?.clear();
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [dialogOpen, sigClientValue, sigGestionnaireValue]);

    const resolvePdfUrl = (path: string | null | undefined): string => {
        const s = String(path || "").trim();
        if (!s) return "";
        if (/^https?:\/\//i.test(s)) return s;
        return `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(s)}`;
    };

    const openPdfViewer = (row: Contrat) => {
        const src = resolvePdfUrl(row.pdf_path);
        if (!src) {
            toast.error("PDF introuvable");
            return;
        }
        setViewerType("pdf");
        setViewerTitle(`PDF contrat #${row.id}`);
        setViewerSrc(src);
        setViewerOpen(true);
    };

    const openSignatureViewer = (row: Contrat, kind: "client" | "gestionnaire") => {
        const src = kind === "client" ? row.signature_client : row.signature_gestionnaire;
        if (!src) {
            toast.error(`Signature ${kind === "client" ? "client" : "gestionnaire"} introuvable`);
            return;
        }
        setViewerType("image");
        setViewerTitle(`Signature ${kind === "client" ? "client" : "gestionnaire"} - contrat #${row.id}`);
        setViewerSrc(src);
        setViewerOpen(true);
    };

    const save = async () => {
        if (gestionnaireId === "none") {
            toast.error("Choisissez un gestionnaire");
            return;
        }
        if (!pdfPath.trim() && !pdfFile) {
            toast.error("Le PDF du contrat est obligatoire");
            return;
        }
        setIsSaving(true);
        try {
            let resolvedPdfPath = pdfPath.trim();
            if (pdfFile) {
                const fd = new FormData();
                fd.append("pdf", pdfFile);
                const uploadRes = await fetch("/api/contrats/pdf/upload", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd,
                });
                if (!uploadRes.ok) {
                    const upErr = await uploadRes.json().catch(() => ({}));
                    throw new Error(upErr.message || "Upload PDF impossible");
                }
                const upData = await uploadRes.json();
                resolvedPdfPath = String(upData?.pdf_path || "").trim();
            }
            if (!resolvedPdfPath) {
                throw new Error("PDF contrat obligatoire");
            }
            const drawnClient =
                clientSigRef.current && !clientSigRef.current.isEmpty()
                    ? clientSigRef.current.toDataURL("image/png")
                    : null;
            const drawnGestionnaire =
                gestionnaireSigRef.current && !gestionnaireSigRef.current.isEmpty()
                    ? gestionnaireSigRef.current.toDataURL("image/png")
                    : null;
            const clientSignatureFinal = drawnClient || sigClientValue;
            const gestionnaireSignatureFinal = drawnGestionnaire || sigGestionnaireValue;
            if (!clientSignatureFinal || !gestionnaireSignatureFinal) {
                toast.error("Les signatures client et gestionnaire sont obligatoires");
                setIsSaving(false);
                return;
            }
            const body = {
                gestionnaire_id: Number(gestionnaireId),
                signature_client: clientSignatureFinal,
                signature_gestionnaire: gestionnaireSignatureFinal,
                pdf_path: resolvedPdfPath,
            };
            const url = editing ? `/api/contrats/${editing.id}` : "/api/contrats";
            const method = editing ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur enregistrement contrat");
            }
            toast.success(editing ? "Contrat mis à jour" : "Contrat créé");
            setDialogOpen(false);
            await loadAll();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Erreur");
        } finally {
            setIsSaving(false);
        }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        try {
            const res = await fetch(`/api/contrats/${deleteTarget.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            toast.success("Contrat supprimé");
            setDeleteTarget(null);
            await loadAll();
        } catch {
            toast.error("Suppression impossible");
        }
    };

    return (
        <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="h-6 w-6 text-primary" /> Contrats
                    </h1>
                    <p className="text-sm text-muted-foreground">Gestion des contrats avec signatures client et gestionnaire.</p>
                </div>
                <Button onClick={openCreate} className="gap-2">
                    <Plus className="h-4 w-4" /> Nouveau contrat
                </Button>
            </div>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                <CardHeader className="pb-3">
                    <CardTitle>Filtres</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label>Gestionnaire</Label>
                            <Select value={filterGestionnaire} onValueChange={setFilterGestionnaire}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous</SelectItem>
                                    {gestionnaires.map((g) => (
                                        <SelectItem key={g.id} value={String(g.id)}>
                                            {g.nom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Date du</Label>
                            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Au</Label>
                            <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                        <div className="relative max-w-xl flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="Gestionnaire ou nom de PDF..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Button type="button" variant="outline" onClick={resetFilters}>
                            Réinitialiser
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Gestionnaire</TableHead>
                                <TableHead>Signature client</TableHead>
                                <TableHead>Signature gestionnaire</TableHead>
                                <TableHead>PDF</TableHead>
                                <TableHead>Créé le</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                        Chargement...
                                    </TableCell>
                                </TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                        Aucun contrat.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell>{r.gestionnaire_nom || `#${r.gestionnaire_id}`}</TableCell>
                                        <TableCell>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={!r.signature_client}
                                                onClick={() => openSignatureViewer(r, "client")}
                                            >
                                                Voir signature
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={!r.signature_gestionnaire}
                                                onClick={() => openSignatureViewer(r, "gestionnaire")}
                                            >
                                                Voir signature
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            {r.pdf_path ? (
                                                <button
                                                    type="button"
                                                    className="text-primary hover:underline text-left max-w-[260px] truncate"
                                                    title={r.pdf_path}
                                                    onClick={() => openPdfViewer(r)}
                                                >
                                                    {r.pdf_path}
                                                </button>
                                            ) : (
                                                "—"
                                            )}
                                        </TableCell>
                                        <TableCell>{new Date(r.created_at).toLocaleDateString("fr-FR")}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openPdfViewer(r)}>
                                                        <Eye className="h-4 w-4 mr-2" /> Voir PDF
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openEdit(r)}>
                                                        <Edit className="h-4 w-4 mr-2" /> Modifier
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(r)}>
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
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Modifier contrat" : "Nouveau contrat"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Gestionnaire</Label>
                            <Select value={gestionnaireId} onValueChange={setGestionnaireId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Sélectionner..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sélectionner...</SelectItem>
                                    {gestionnaires.map((g) => (
                                        <SelectItem key={g.id} value={String(g.id)}>
                                            {g.nom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>PDF contrat (obligatoire)</Label>
                            <Input
                                key={editing?.id ?? "new"}
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    setPdfFileName(file?.name || "");
                                    setPdfFile(file || null);
                                    if (!editing && file) {
                                        setPdfPath(file.name);
                                    }
                                }}
                            />
                            {pdfFileName && (
                                <p className="text-xs text-muted-foreground">
                                    Nouveau fichier : {pdfFileName}
                                </p>
                            )}
                            {pdfPath && !pdfFile && (
                                <p className="text-xs text-muted-foreground">
                                    PDF actuel :{" "}
                                    <a
                                        href={resolvePdfUrl(pdfPath)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary hover:underline font-medium"
                                    >
                                        {pdfPath}
                                    </a>
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Signature client (React Signature)</Label>
                                <div className="border rounded-md bg-white p-2">
                                    <SignatureCanvas
                                        ref={(ref) => {
                                            clientSigRef.current = ref;
                                        }}
                                        penColor="black"
                                        canvasProps={{ className: "w-full h-40" }}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            clientSigRef.current?.clear();
                                            setSigClientValue(null);
                                        }}
                                    >
                                        Effacer
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                            clientSigRef.current?.clear();
                                            setSigClientValue(null);
                                        }}
                                    >
                                        Réinitialiser
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Signature gestionnaire (React Signature)</Label>
                                <div className="border rounded-md bg-white p-2">
                                    <SignatureCanvas
                                        ref={(ref) => {
                                            gestionnaireSigRef.current = ref;
                                        }}
                                        penColor="black"
                                        canvasProps={{ className: "w-full h-40" }}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            gestionnaireSigRef.current?.clear();
                                            setSigGestionnaireValue(null);
                                        }}
                                    >
                                        Effacer
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                            gestionnaireSigRef.current?.clear();
                                            setSigGestionnaireValue(null);
                                        }}
                                    >
                                        Réinitialiser
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button onClick={save} disabled={isSaving}>
                            {isSaving ? "Enregistrement..." : "Enregistrer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{viewerTitle}</DialogTitle>
                    </DialogHeader>
                    {viewerType === "pdf" ? (
                        <div className="w-full h-[70vh] border rounded-md overflow-hidden bg-white">
                            <object data={viewerSrc} type="application/pdf" className="w-full h-full">
                                <div className="p-4 text-sm text-muted-foreground">
                                    Prévisualisation indisponible.{" "}
                                    <a className="underline text-primary" href={viewerSrc} target="_blank" rel="noreferrer">
                                        Ouvrir le PDF dans un nouvel onglet
                                    </a>
                                </div>
                            </object>
                        </div>
                    ) : (
                        <div className="border rounded-md p-3 bg-white">
                            <img src={viewerSrc} alt={viewerTitle} className="max-h-[70vh] w-auto mx-auto" />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer ce contrat ?</DialogTitle>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                            Annuler
                        </Button>
                        <Button variant="destructive" onClick={remove}>
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
