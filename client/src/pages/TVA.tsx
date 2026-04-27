import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Input } from "@/components/common/ui/input";
import { FileText, ArrowUpRight, CalendarDays, Filter } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

type TvaRow = {
    id: number;
    kind: "facture_client" | "commande_client" | "fournisseur";
    numero: string;
    detailHref?: string;
    partyType: "client" | "fournisseur";
    tiers: string;
    statut: string;
    date: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
};

const normalize = (s: unknown) => String(s || "").toLowerCase().trim();
const toMoney = (value: number) => `${Math.round(value).toLocaleString("fr-FR")} MAD`;
const toPaymentStatus = (isPaid: boolean) => (isPaid ? "payee" : "non_payee");
const toPaymentStatusLabel = (status: string) => (normalize(status) === "payee" ? "Payée" : "Non payée");

const getTypeBadge = (kind: TvaRow["kind"]) => {
    if (kind === "facture_client") return "bg-indigo-100 text-indigo-700 border-indigo-200";
    if (kind === "commande_client") return "bg-sky-100 text-sky-700 border-sky-200";
    return "bg-amber-100 text-amber-700 border-amber-200";
};

const getTypeLabel = (kind: TvaRow["kind"]) => {
    if (kind === "facture_client") return "Facture client";
    if (kind === "commande_client") return "Commande client";
    return "Fournisseur";
};

const getStatusBadge = (statut: string) => {
    const s = normalize(statut);
    return s === "payee"
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : "bg-rose-100 text-rose-700 border-rose-200";
};

export default function TVA() {
    const token = localStorage.getItem("token");
    const [rows, setRows] = useState<TvaRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statutFilter, setStatutFilter] = useState("all");
    const [partyFilter, setPartyFilter] = useState<"all" | "client" | "fournisseur">("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [facturesRes, commandesRes, achatsRes, regCliRes, regFourRes] = await Promise.all([
                    fetch("/api/factures", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/commandes", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/achats-fournisseurs", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/reglements-clients", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/reglements-fournisseurs", { headers: { Authorization: `Bearer ${token}` } }),
                ]);

                if (!facturesRes.ok) throw new Error("Impossible de charger les factures.");
                if (!commandesRes.ok) throw new Error("Impossible de charger les commandes.");
                if (!achatsRes.ok) throw new Error("Impossible de charger les achats fournisseurs.");
                if (!regCliRes.ok) throw new Error("Impossible de charger les règlements clients.");
                if (!regFourRes.ok) throw new Error("Impossible de charger les règlements fournisseurs.");

                const facturesData = await facturesRes.json();
                const commandesData = await commandesRes.json();
                const achatsData = await achatsRes.json();
                const reglementsClients = await regCliRes.json();
                const reglementsFournisseurs = await regFourRes.json();

                const reglementsClientsApprouves = (Array.isArray(reglementsClients) ? reglementsClients : []).filter(
                    (r: any) => normalize(r?.statut) === "approuve"
                );
                const reglementsFournisseursApprouves = (
                    Array.isArray(reglementsFournisseurs) ? reglementsFournisseurs : []
                ).filter((r: any) => normalize(r?.statut) === "approuve");

                const factureRows: TvaRow[] = (Array.isArray(facturesData) ? facturesData : []).map((f: any) => ({
                    id: Number(f.id),
                    kind: "facture_client",
                    numero: String(f.numero_facture || `FAC-${f.id}`),
                    detailHref: `/dashboard/factures/${f.id}`,
                    partyType: "client",
                    tiers: String(f.client_nom || "-"),
                    statut: (() => {
                        const factureId = Number(f?.id || 0);
                        const commandeId = Number(f?.commande_id || 0);
                        const hasApprovedReglement = reglementsClientsApprouves.some((r: any) => {
                            const sameFacture = Number(r?.facture_id || 0) === factureId && factureId > 0;
                            const sameCommande = Number(r?.commande_id || 0) === commandeId && commandeId > 0;
                            return sameFacture || sameCommande;
                        });
                        return toPaymentStatus(hasApprovedReglement);
                    })(),
                    date: String(f.date_facture || f.created_at || ""),
                    montant_ht: Number(f.montant_ht || 0),
                    montant_tva: Number(f.montant_tva || 0),
                    montant_ttc: Number(f.montant_ttc || 0),
                }));

                const commandeRows: TvaRow[] = (Array.isArray(commandesData) ? commandesData : []).map((c: any) => ({
                    id: Number(c.id),
                    kind: "commande_client",
                    numero: String(c.numero_commande || `CMD-${c.id}`),
                    detailHref: `/dashboard/commandes/${c.id}`,
                    partyType: "client",
                    tiers: String(c.client_nom || "-"),
                    statut: (() => {
                        const commandeId = Number(c?.id || 0);
                        const hasApprovedReglement = reglementsClientsApprouves.some(
                            (r: any) => Number(r?.commande_id || 0) === commandeId
                        );
                        return toPaymentStatus(hasApprovedReglement);
                    })(),
                    date: String(c.date_commande || c.created_at || ""),
                    montant_ht: Number(c.montant_ht || 0),
                    montant_tva: Number(c.montant_tva || 0),
                    montant_ttc: Number(c.montant_ttc || 0),
                }));

                const fournisseurRows: TvaRow[] = (Array.isArray(achatsData) ? achatsData : [])
                    .filter((a: any) => Boolean(a?.facture_fournisseur))
                    .map((a: any) => {
                        const qte = Number(a.quantite || 0);
                        const pu = Number(a.prix_unitaire || 0);
                        const tva = Number(a.tva || 0);
                        const montantHt = qte * pu;
                        const montantTva = montantHt * (tva / 100);
                        const montantTtc = montantHt + montantTva;
                        return {
                            id: Number(a.id),
                            kind: "fournisseur" as const,
                            numero: String(a.numero || `ACH-${a.id}`),
                            partyType: "fournisseur" as const,
                            tiers: String(a.fournisseur_nom || "-"),
                            statut: (() => {
                                const achatId = Number(a?.id || 0);
                                const hasApprovedReglement = reglementsFournisseursApprouves.some(
                                    (r: any) => Number(r?.achat_id || 0) === achatId
                                );
                                return toPaymentStatus(hasApprovedReglement);
                            })(),
                            date: String(a.date_achat || a.created_at || ""),
                            montant_ht: montantHt,
                            montant_tva: montantTva,
                            montant_ttc: montantTtc,
                        };
                    });

                setRows([...factureRows, ...commandeRows, ...fournisseurRows]);
            } catch (e: any) {
                toast.error(e.message || "Erreur lors du chargement TVA.");
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const filtered = useMemo(() => {
        const q = normalize(search);
        return rows.filter((r) => {
            const statut = normalize(r.statut);
            if (statutFilter !== "all" && statut !== normalize(statutFilter)) return false;
            if (partyFilter !== "all" && r.partyType !== partyFilter) return false;

            const dt = new Date(r.date || "");
            const hasDate = !Number.isNaN(dt.getTime());
            if (dateFrom && hasDate && dt < new Date(`${dateFrom}T00:00:00`)) return false;
            if (dateTo && hasDate && dt > new Date(`${dateTo}T23:59:59`)) return false;

            if (!q) return true;
            return (
                normalize(r.numero).includes(q) ||
                normalize(r.tiers).includes(q) ||
                normalize(r.statut).includes(q)
            );
        });
    }, [rows, search, statutFilter, partyFilter, dateFrom, dateTo]);

    const totals = useMemo(() => {
        const collectee = filtered
            .filter((r) => r.kind === "facture_client" || r.kind === "commande_client")
            .reduce((sum, r) => sum + r.montant_tva, 0);
        const deductible = filtered
            .filter((r) => r.kind === "fournisseur")
            .reduce((sum, r) => sum + r.montant_tva, 0);
        return { collectee, deductible, aPayer: collectee - deductible };
    }, [filtered]);

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-4">
            <Card>
                <CardHeader className="space-y-3 border-b">
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-indigo-600" />
                        TVA - Declaration et suivi
                    </CardTitle>
                    <CardDescription>
                        Total TVA a payer (collectee - deductible) avec factures/commandes associees et filtrage par date.
                    </CardDescription>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Periode dynamique selon les filtres
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <Filter className="h-3.5 w-3.5" />
                            Recherche par numero, tiers ou statut
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border p-4 bg-emerald-50/50">
                            <div className="text-xs text-muted-foreground">TVA collectee (ventes)</div>
                            <div className="text-2xl font-bold text-emerald-700">{toMoney(totals.collectee)}</div>
                        </div>
                        <div className="rounded-xl border p-4 bg-amber-50/50">
                            <div className="text-xs text-muted-foreground">TVA deductible (achats)</div>
                            <div className="text-2xl font-bold text-amber-700">{toMoney(totals.deductible)}</div>
                        </div>
                        <div className="rounded-xl border p-4 bg-indigo-50/50">
                            <div className="text-xs text-muted-foreground">TVA a payer (Etat)</div>
                            <div className="text-2xl font-black text-indigo-700">{toMoney(totals.aPayer)}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                        <Input
                            placeholder="Recherche (N°, tiers, statut)..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select
                            className="h-10 border rounded-md px-3 bg-background text-sm"
                            value={statutFilter}
                            onChange={(e) => setStatutFilter(e.target.value)}
                        >
                            <option value="all">Tous les statuts</option>
                            <option value="payee">Payee</option>
                            <option value="non_payee">Non payee</option>
                        </select>
                        <select
                            className="h-10 border rounded-md px-3 bg-background text-sm"
                            value={partyFilter}
                            onChange={(e) => setPartyFilter(e.target.value as "all" | "client" | "fournisseur")}
                        >
                            <option value="all">Tous les tiers</option>
                            <option value="client">Clients</option>
                            <option value="fournisseur">Fournisseurs</option>
                        </select>
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                        <div className="text-sm text-muted-foreground flex items-center px-1">
                            {filtered.length} document(s) trouve(s)
                        </div>
                    </div>

                    <div className="border rounded-xl overflow-hidden shadow-sm">
                        <div className="max-h-[520px] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0 z-10">
                                    <tr>
                                        <th className="text-left px-3 py-2">Type</th>
                                        <th className="text-left px-3 py-2">N° Document</th>
                                        <th className="text-left px-3 py-2">Type de tiers</th>
                                        <th className="text-left px-3 py-2">Nom</th>
                                        <th className="text-left px-3 py-2">Date</th>
                                        <th className="text-right px-3 py-2">Montant HT</th>
                                        <th className="text-right px-3 py-2">Montant TVA</th>
                                        <th className="text-right px-3 py-2">Montant TTC</th>
                                        <th className="text-left px-3 py-2">Statut</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td className="px-3 py-4 text-muted-foreground" colSpan={9}>Chargement...</td>
                                        </tr>
                                    ) : filtered.length === 0 ? (
                                        <tr>
                                            <td className="px-3 py-4 text-muted-foreground" colSpan={9}>Aucun document.</td>
                                        </tr>
                                    ) : (
                                        filtered.map((r) => (
                                            <tr key={`${r.kind}-${r.id}`} className="border-t hover:bg-muted/40 transition-colors">
                                                <td className="px-3 py-2">
                                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${getTypeBadge(r.kind)}`}>
                                                        {getTypeLabel(r.kind)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 font-medium">
                                                    {(r.kind === "facture_client" || r.kind === "commande_client") && r.detailHref ? (
                                                        <Link
                                                            to={r.detailHref}
                                                            className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 hover:underline"
                                                        >
                                                            {r.numero}
                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                        </Link>
                                                    ) : (
                                                        r.numero
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span
                                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                                            r.partyType === "client"
                                                                ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                                                                : "bg-amber-100 text-amber-700 border-amber-200"
                                                        }`}
                                                    >
                                                        {r.partyType === "client" ? "Client" : "Fournisseur"}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">{r.tiers}</td>
                                                <td className="px-3 py-2">{new Date(r.date || "").toLocaleDateString("fr-FR")}</td>
                                                <td className="px-3 py-2 text-right">{toMoney(r.montant_ht)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-indigo-700">{toMoney(r.montant_tva)}</td>
                                                <td className="px-3 py-2 text-right">{toMoney(r.montant_ttc)}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${getStatusBadge(r.statut || "-")}`}>
                                                        {toPaymentStatusLabel(r.statut || "-")}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
