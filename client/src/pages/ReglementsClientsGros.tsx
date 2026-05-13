import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/common/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/common/ui/dialog";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/common/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/common/ui/dropdown-menu";
import { toast } from "sonner";
import { Banknote, CheckCircle2, Clock, Download, Filter, MoreVertical, RotateCcw, Search, XCircle, DollarSign, Trash2 } from "lucide-react";
import { generateRecuPaiementPdf } from "@/components/pdf/RecuPaiementPdf";
import { buildReglementCode } from "@/lib/reglementCode";

type ReglementGros = {
    id: number;
    numero_recu?: number | null;
    client_id: number;
    client_nom?: string;
    facture_gros_id?: number | null;
    commande_gros_id?: number | null;
    numero_facture?: string | null;
    numero_commande?: string | null;
    date_reglement: string;
    montant: number;
    mode_paiement: string;
    banque_nom?: string | null;
    statut: string;
    commentaire?: string | null;
    created_by_nom?: string | null;
};

type Client = { id: number; nom_complet: string };
type FactureGros = {
    id: number;
    numero_facture: string;
    client_id: number;
    statut?: string | null;
    commande_gros_id?: number | null;
};
type CommandeGros = {
    id: number;
    numero_commande: string;
    client_id: number;
    statut?: string | null;
};

type ReglementLine = {
    mode_paiement: string;
    montant: string;
    date_reglement: string;
    commentaire: string;
};

export default function ReglementsClientsGros() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const location = useLocation();
    const role = localStorage.getItem("role") || "";
    const isApprover = ["admin", "responsable", "directeur", "superadmin"].includes(role.toLowerCase());

    const [rows, setRows] = useState<ReglementGros[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [factures, setFactures] = useState<FactureGros[]>([]);
    const [commandes, setCommandes] = useState<CommandeGros[]>([]);
    const [availableFactures, setAvailableFactures] = useState<FactureGros[]>([]);
    const [availableCommandes, setAvailableCommandes] = useState<CommandeGros[]>([]);
    const [isEligibleDocsLoading, setIsEligibleDocsLoading] = useState(false);
    const [paymentModes, setPaymentModes] = useState<{ label: string; value: string }[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState("");
    const [filterClient, setFilterClient] = useState("all");
    const [filterStatut, setFilterStatut] = useState("all");
    const [filterType, setFilterType] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<"facture" | "commande">("facture");
    const [selectedDocId, setSelectedDocId] = useState("none");
    const [reglementLines, setReglementLines] = useState<ReglementLine[]>([
        {
            mode_paiement: "espece",
            montant: "",
            date_reglement: new Date().toISOString().split("T")[0],
            commentaire: "",
        },
    ]);
    const [submitting, setSubmitting] = useState(false);


    const fillMontantFromDocument = async (type: "facture" | "commande", id: number) => {
        if (!token) return;
        const queryParam = type === "facture" ? `factureId=${id}` : `commandeId=${id}`;
        const res = await fetch(`/api/reglements-clients-gros/situation?${queryParam}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const reste = Number(data?.reste_a_payer || 0);
        const montantTtc = Number(data?.montant_ttc || 0);
        const toFill = reste > 0 ? reste : montantTtc;
        if (toFill > 0) {
            setReglementLines((prev) => {
                if (prev.length === 0) {
                    return [
                        {
                            mode_paiement: "espece",
                            montant: String(toFill),
                            date_reglement: new Date().toISOString().split("T")[0],
                            commentaire: "",
                        },
                    ];
                }
                return prev.map((line, idx) =>
                    idx === 0 ? { ...line, montant: String(toFill) } : line
                );
            });
        }
    };

    const openDialogForDocument = async (type: "facture" | "commande", id: number) => {
        setSelectedType(type);
        setSelectedDocId(String(id));
        setReglementLines([
            {
                mode_paiement: "espece",
                montant: "",
                date_reglement: new Date().toISOString().split("T")[0],
                commentaire: "",
            },
        ]);
        try {
            await fillMontantFromDocument(type, id);
        } catch {
            // ignore and open dialog anyway
        } finally {
            setDialogOpen(true);
        }
    };

    const loadAll = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const [regRes, cRes, fRes, cmdRes, modesRes] = await Promise.all([
                fetch("/api/reglements-clients-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/clients", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/factures-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/commandes-gros", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/settings/payment-modes", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            setRows(regRes.ok ? await regRes.json() : []);
            setClients(cRes.ok ? await cRes.json() : []);
            setFactures(fRes.ok ? await fRes.json() : []);
            setCommandes(cmdRes.ok ? await cmdRes.json() : []);
            setPaymentModes(modesRes.ok ? await modesRes.json() : []);
        } catch {
            toast.error("Erreur de chargement des règlements gros");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, [token]);

    useEffect(() => {
        const state = (location.state || {}) as { openDialog?: boolean; factureGrosId?: number; commandeGrosId?: number; factureId?: number; commandeId?: number };
        if (!state.openDialog) return;
        const factureId = Number(state.factureGrosId ?? state.factureId);
        const commandeId = Number(state.commandeGrosId ?? state.commandeId);
        if (Number.isFinite(factureId) && factureId > 0) {
            openDialogForDocument("facture", factureId);
        } else if (Number.isFinite(commandeId) && commandeId > 0) {
            openDialogForDocument("commande", commandeId);
        }
        window.history.replaceState({}, document.title);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state, token]);

    const filtered = useMemo(() => {
        const s = searchTerm.toLowerCase();
        return rows.filter((r) => {
            const hasFacture = Boolean(r.facture_gros_id);
            const hasCommande = Boolean(r.commande_gros_id);
            const matchSearch =
                !s ||
                String(r.client_nom || "").toLowerCase().includes(s) ||
                String(r.numero_facture || "").toLowerCase().includes(s) ||
                String(r.numero_commande || "").toLowerCase().includes(s) ||
                String(r.created_by_nom || "").toLowerCase().includes(s);
            const matchClient = filterClient === "all" || String(r.client_id) === filterClient;
            const matchStatut = filterStatut === "all" || r.statut === filterStatut;
            const matchType =
                filterType === "all" ||
                (filterType === "facture" && hasFacture) ||
                (filterType === "commande" && hasCommande);
            return matchSearch && matchClient && matchStatut && matchType;
        });
    }, [rows, searchTerm, filterClient, filterStatut, filterType]);

    useEffect(() => {
        let cancelled = false;
        const resolveEligibleDocuments = async () => {
            if (!token) return;
            if (factures.length === 0 && commandes.length === 0) {
                setAvailableFactures([]);
                setAvailableCommandes([]);
                return;
            }
            setIsEligibleDocsLoading(true);
            try {
                const [factureSituations, commandeSituations] = await Promise.all([
                    Promise.all(
                        factures.map(async (f) => {
                            try {
                                const res = await fetch(
                                    `/api/reglements-clients-gros/situation?factureId=${f.id}`,
                                    { headers: { Authorization: `Bearer ${token}` } }
                                );
                                if (!res.ok) return { id: f.id, reste: 0 };
                                const data = await res.json();
                                return { id: f.id, reste: Number(data?.reste_a_payer || 0) };
                            } catch {
                                return { id: f.id, reste: 0 };
                            }
                        })
                    ),
                    Promise.all(
                        commandes.map(async (c) => {
                            try {
                                const res = await fetch(
                                    `/api/reglements-clients-gros/situation?commandeId=${c.id}`,
                                    { headers: { Authorization: `Bearer ${token}` } }
                                );
                                if (!res.ok) return { id: c.id, reste: 0 };
                                const data = await res.json();
                                return { id: c.id, reste: Number(data?.reste_a_payer || 0) };
                            } catch {
                                return { id: c.id, reste: 0 };
                            }
                        })
                    ),
                ]);

                if (cancelled) return;
                const factureIds = new Set(
                    factureSituations
                        .filter((x) => Number(x.reste) > 0.01)
                        .map((x) => Number(x.id))
                );
                const commandeIds = new Set(
                    commandeSituations
                        .filter((x) => Number(x.reste) > 0.01)
                        .map((x) => Number(x.id))
                );
                setAvailableFactures(
                    factures.filter((f) => factureIds.has(Number(f.id)))
                );
                setAvailableCommandes(
                    commandes.filter((c) => commandeIds.has(Number(c.id)))
                );
            } finally {
                if (!cancelled) setIsEligibleDocsLoading(false);
            }
        };
        resolveEligibleDocuments();
        return () => {
            cancelled = true;
        };
    }, [token, factures, commandes]);

    const resetFilters = () => {
        setSearchTerm("");
        setFilterClient("all");
        setFilterStatut("all");
        setFilterType("all");
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterClient, filterStatut, filterType]);

    const computeTotalSaisi = () =>
        reglementLines.reduce((sum, l) => sum + (parseFloat(l.montant || "0") || 0), 0);

    const handleAddLine = () => {
        setReglementLines((prev) => [
            ...prev,
            {
                mode_paiement: paymentModes[0]?.value || "espece",
                montant: "",
                date_reglement: new Date().toISOString().split("T")[0],
                commentaire: "",
            },
        ]);
    };

    const handleRemoveLine = (index: number) => {
        setReglementLines((prev) => {
            if (prev.length <= 1) {
                return [
                    {
                        mode_paiement: paymentModes[0]?.value || "espece",
                        montant: "",
                        date_reglement: new Date().toISOString().split("T")[0],
                        commentaire: "",
                    },
                ];
            }
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const saveReglement = async () => {
        if (!selectedDocId || selectedDocId === "none") return toast.error("Sélectionnez une facture/commande gros");
        const totalSaisi = computeTotalSaisi();
        if (totalSaisi <= 0) return toast.error("Veuillez saisir au moins un montant strictement positif.");
        setSubmitting(true);
        try {
            const situationQuery =
                selectedType === "facture"
                    ? `factureId=${Number(selectedDocId)}`
                    : `commandeId=${Number(selectedDocId)}`;
            const situationRes = await fetch(`/api/reglements-clients-gros/situation?${situationQuery}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (situationRes.ok) {
                const situationData = await situationRes.json().catch(() => ({}));
                const resteAPayer = Number(situationData?.reste_a_payer || 0);
                if (totalSaisi > resteAPayer + 0.01) {
                    toast.error("Le total saisi dépasse le reste à payer.");
                    setSubmitting(false);
                    return;
                }
            }

            const lignes = reglementLines
                .map((l) => ({
                    montant: parseFloat(l.montant || "0") || 0,
                    mode_paiement: l.mode_paiement,
                    banque_id: null,
                    date_reglement: l.date_reglement,
                    commentaire: l.commentaire || null,
                }))
                .filter((l) => l.montant > 0);

            if (!lignes.length) {
                toast.error("Aucun montant valide saisi.");
                setSubmitting(false);
                return;
            }

            const body: Record<string, unknown> = {
                lignes,
            };
            if (selectedType === "facture") body.facture_gros_id = Number(selectedDocId);
            else body.commande_gros_id = Number(selectedDocId);

            const res = await fetch("/api/reglements-clients-gros", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return toast.error(err.message || "Erreur création règlement gros");
            }
            toast.success("Règlement gros enregistré");
            setDialogOpen(false);
            window.dispatchEvent(new CustomEvent("approvals-updated"));
            await loadAll();
        } catch {
            toast.error("Erreur réseau");
        } finally {
            setSubmitting(false);
        }
    };

    const updateStatus = async (id: number, action: "approve" | "reject" | "impaye") => {
        const res = await fetch(`/api/reglements-clients-gros/${id}/${action}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ commentaire: action === "impaye" ? "Marqué impayé (gros)" : undefined }),
        });
        if (!res.ok) return toast.error("Action refusée");
        toast.success("Action effectuée");
        window.dispatchEvent(new CustomEvent("approvals-updated"));
        await loadAll();
    };

    const downloadPdf = async (row: ReglementGros) => {
        await generateRecuPaiementPdf({
            id: row.id,
            date_reglement: row.date_reglement,
            montant: Number(row.montant) || 0,
            mode_paiement: row.mode_paiement,
            client_nom: row.client_nom || "Client",
            banque_nom: row.banque_nom || "",
            numero_facture: row.numero_facture || undefined,
            numero_commande: row.numero_commande || undefined,
            commentaire: row.commentaire || undefined,
            created_by_nom: row.created_by_nom || undefined,
        } as any);
    };

    const total = filtered.reduce((s, r) => s + (Number(r.montant) || 0), 0);
    const totalPending = filtered.filter((r) => r.statut === "en_attente").length;
    const totalApproved = filtered.filter((r) => r.statut === "approuve").reduce((s, r) => s + (Number(r.montant) || 0), 0);
    const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6 text-indigo-600" /> Règlements Clients Gros</h1>
                    <p className="text-sm text-muted-foreground">Workflow dédié aux factures/commandes gros</p>
                </div>
                <Button onClick={() => setDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">Nouveau règlement gros</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600"><DollarSign className="h-6 w-6" /></div>
                    <div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total sélection</p><p className="text-xl font-bold text-foreground">{total.toLocaleString()} DH</p></div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle2 className="h-6 w-6" /></div>
                    <div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Approuvés (montant)</p><p className="text-xl font-bold text-foreground">{totalApproved.toLocaleString()} DH</p></div>
                </Card>
                <Card className="p-4 border border-border shadow-sm flex items-center gap-4 bg-card">
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-600"><Clock className="h-6 w-6" /></div>
                    <div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">En attente</p><p className="text-xl font-bold text-foreground">{totalPending}</p></div>
                </Card>
            </div>

            <div className="bg-card p-4 rounded-2xl border border-border shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
                    <div className="relative w-full max-w-md flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Client, facture gros, commande gros..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-11 border-transparent bg-muted focus:bg-card focus:border-indigo-500 border rounded-xl" />
                    </div>
                    <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 rounded-xl" onClick={resetFilters}>
                        <RotateCcw className="h-4 w-4 mr-2" /> Réinitialiser
                    </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Filter className="h-3 w-3" /> Type</Label>
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="facture">Facture gros</SelectItem><SelectItem value="commande">Commande gros</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</Label>
                        <Select value={filterClient} onValueChange={setFilterClient}>
                            <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue placeholder="Tous" /></SelectTrigger>
                            <SelectContent><SelectItem value="all">Tous les clients</SelectItem>{clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nom_complet}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Statut</Label>
                        <Select value={filterStatut} onValueChange={setFilterStatut}>
                            <SelectTrigger className="h-11 rounded-xl bg-background border-border"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les statuts</SelectItem>
                                <SelectItem value="en_attente">En attente</SelectItem>
                                <SelectItem value="approuve">Approuvé</SelectItem>
                                <SelectItem value="rejete">Rejeté</SelectItem>
                                <SelectItem value="impaye">Impayé</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <Card className="border border-border shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/30 border-b border-border"><CardTitle>Historique règlements gros</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Client</TableHead><TableHead>Document gros</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Statut</TableHead><TableHead>Utilisateur</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {loading ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Chargement...</TableCell></TableRow> :
                                filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Aucun règlement gros</TableCell></TableRow> :
                                    paginated.map((r) => (
                                        <TableRow key={r.id} className="group hover:bg-muted/30">
                                            <TableCell className="font-semibold">
                                                <button
                                                    type="button"
                                                    className="text-indigo-600 hover:underline"
                                                    onClick={() => navigate(`/dashboard/reglements/details/client_gros/${r.id}`)}
                                                >
                                                    {buildReglementCode("client_gros", r.id, r.date_reglement, r.numero_recu, (r as any).sous_societe_nom, (r as any).numero_facture || (r as any).numero_commande)}
                                                </button>
                                            </TableCell>
                                            <TableCell>{r.client_nom || "—"}</TableCell>
                                            <TableCell className="font-semibold">{r.numero_facture || r.numero_commande || "—"}</TableCell>
                                            <TableCell>{new Date(r.date_reglement).toLocaleDateString("fr-FR")}</TableCell>
                                            <TableCell className="text-right font-bold">{Number(r.montant || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH</TableCell>
                                            <TableCell>
                                                {r.statut === "approuve" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-3 w-3" />Approuvé</span>}
                                                {r.statut === "en_attente" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700"><Clock className="h-3 w-3" />En attente</span>}
                                                {r.statut === "rejete" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700"><XCircle className="h-3 w-3" />Rejeté</span>}
                                                {r.statut === "impaye" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-orange-100 text-orange-700"><XCircle className="h-3 w-3" />Impayé</span>}
                                            </TableCell>
                                            <TableCell>{r.created_by_nom || "—"}</TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => downloadPdf(r)}><Download className="h-4 w-4 mr-2" />Télécharger PDF</DropdownMenuItem>
                                                        {isApprover && r.statut === "en_attente" && <DropdownMenuItem onClick={() => updateStatus(r.id, "approve")}><CheckCircle2 className="h-4 w-4 mr-2" />Approuver</DropdownMenuItem>}
                                                        {isApprover && r.statut === "en_attente" && <DropdownMenuItem onClick={() => updateStatus(r.id, "reject")} className="text-red-600"><XCircle className="h-4 w-4 mr-2" />Rejeter</DropdownMenuItem>}
                                                        {isApprover && r.statut === "approuve" && <DropdownMenuItem onClick={() => updateStatus(r.id, "impaye")} className="text-orange-600"><XCircle className="h-4 w-4 mr-2" />Marquer impayé</DropdownMenuItem>}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                        </TableBody>
                    </Table>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
                            <Button size="sm" variant="outline" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Préc.</Button>
                            <span className="text-xs text-muted-foreground">{currentPage} / {totalPages}</span>
                            <Button size="sm" variant="outline" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Suiv.</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-2xl w-[90vw] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
                    <div className="h-1.5 bg-indigo-600" />
                    <DialogHeader className="px-6 pt-5 pb-2">
                        <DialogTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                            <Banknote className="h-5 w-5 text-indigo-600" />
                            Nouveau règlement client gros
                        </DialogTitle>
                        <p className="text-xs text-muted-foreground">
                            Saisir un règlement pour facture/commande gros avec le même workflow d&apos;approbation.
                        </p>
                    </DialogHeader>

                    <div className="px-6 pb-2 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Type de document</Label>
                                <Select value={selectedType} onValueChange={(v) => {
                                    setSelectedType(v as "facture" | "commande");
                                    setSelectedDocId("none");
                                    setReglementLines([
                                        {
                                            mode_paiement: paymentModes[0]?.value || "espece",
                                            montant: "",
                                            date_reglement: new Date().toISOString().split("T")[0],
                                            commentaire: "",
                                        },
                                    ]);
                                }}>
                                    <SelectTrigger className="h-11 rounded-xl border-border"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="facture">Facture gros</SelectItem><SelectItem value="commande">Commande gros</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Document</Label>
                                <Select
                                    value={selectedDocId}
                                    onValueChange={async (value) => {
                                        setSelectedDocId(value);
                                        if (value === "none") {
                                            setReglementLines((prev) =>
                                                prev.map((line, idx) => (idx === 0 ? { ...line, montant: "" } : line))
                                            );
                                            return;
                                        }
                                        try {
                                            await fillMontantFromDocument(selectedType, Number(value));
                                        } catch {
                                            // ignore, user can still type manually
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-11 rounded-xl border-border"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Choisir...</SelectItem>
                                        {(selectedType === "facture" ? availableFactures : availableCommandes).map((d: any) => (
                                            <SelectItem key={d.id} value={String(d.id)}>
                                                {selectedType === "facture" ? d.numero_facture : d.numero_commande}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {isEligibleDocsLoading && (
                                    <p className="text-[11px] text-muted-foreground">Chargement des documents non réglés...</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {reglementLines.map((l, idx) => (
                                <div
                                    key={idx}
                                    className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end border border-border rounded-xl p-3 bg-muted/30"
                                >
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-semibold text-muted-foreground">Montant</p>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={l.montant}
                                            onChange={(e) =>
                                                setReglementLines((prev) =>
                                                    prev.map((p, i) => (i === idx ? { ...p, montant: e.target.value } : p))
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-semibold text-muted-foreground">Mode</p>
                                        <Select
                                            value={l.mode_paiement}
                                            onValueChange={(val) =>
                                                setReglementLines((prev) =>
                                                    prev.map((p, i) => (i === idx ? { ...p, mode_paiement: val } : p))
                                                )
                                            }
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Mode de paiement" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(paymentModes.length > 0 ? paymentModes : [{ label: "Espèce", value: "espece" }]).map((m) => (
                                                    <SelectItem key={m.value} value={m.value}>
                                                        {m.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-semibold text-muted-foreground">Date</p>
                                        <Input
                                            type="date"
                                            value={l.date_reglement}
                                            onChange={(e) =>
                                                setReglementLines((prev) =>
                                                    prev.map((p, i) =>
                                                        i === idx ? { ...p, date_reglement: e.target.value } : p
                                                    )
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-semibold text-muted-foreground">Commentaire</p>
                                        <div className="flex gap-2">
                                            <Input
                                                value={l.commentaire}
                                                onChange={(e) =>
                                                    setReglementLines((prev) =>
                                                        prev.map((p, i) =>
                                                            i === idx ? { ...p, commentaire: e.target.value } : p
                                                        )
                                                    )
                                                }
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => handleRemoveLine(idx)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    onClick={handleAddLine}
                                >
                                    + Ajouter une ligne
                                </Button>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>
                                        Total saisi :{" "}
                                        <span className="font-semibold text-foreground">
                                            {computeTotalSaisi().toLocaleString("fr-FR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            MAD
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="px-6 pb-4 flex gap-2">
                        <Button variant="ghost" className="h-11 rounded-xl" onClick={() => setDialogOpen(false)}>Annuler</Button>
                        <Button className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white" onClick={saveReglement} disabled={submitting}>
                            {submitting ? "Enregistrement..." : "Enregistrer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
