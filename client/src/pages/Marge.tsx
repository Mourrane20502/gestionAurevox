import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { TrendingUp, FileText, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

type Bloc = {
    total_docs: number;
    total_vente: number;
    total_cout: number;
    total_marge: number;
};

type MargeResponse = {
    commandes: Bloc;
    factures: Bloc;
    global: Bloc;
    commandes_details: Array<{
        id: number;
        code: string;
        date_document: string | null;
        total_vente: number;
        total_cout: number;
        total_marge: number;
        type: "commande";
    }>;
    factures_details: Array<{
        id: number;
        code: string;
        date_document: string | null;
        total_vente: number;
        total_cout: number;
        total_marge: number;
        type: "facture";
    }>;
};

const fmt = (value: number) =>
    Number(value || 0).toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

export default function Marge() {
    const token = localStorage.getItem("token");
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<MargeResponse | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!token) return;
            setIsLoading(true);
            try {
                const res = await fetch("/api/marge/summary", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("Erreur de chargement");
                const payload = await res.json();
                setData(payload);
            } catch (error) {
                console.error(error);
                setData(null);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [token]);

    const rows = useMemo(
        () => [
            { label: "Commandes vendues", ...data?.commandes },
            { label: "Factures vendues", ...data?.factures },
            { label: "Total global", ...data?.global },
        ],
        [data]
    );

    const details = useMemo(() => {
        const list = [
            ...(data?.commandes_details || []),
            ...(data?.factures_details || []),
        ];
        return list.sort((a, b) => {
            const da = a.date_document ? new Date(a.date_document).getTime() : 0;
            const db = b.date_document ? new Date(b.date_document).getTime() : 0;
            return db - da;
        });
    }, [data]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="h-7 w-7 text-indigo-600" />
                    Marge
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Totaux des ventes et marges (vente - coût d&apos;achat) pour commandes et factures.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border border-indigo-200 bg-indigo-50/40">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Ventes globales</p>
                        <p className="text-xl font-black text-indigo-700 mt-1">{fmt(data?.global?.total_vente || 0)} DH</p>
                    </CardContent>
                </Card>
                <Card className="border border-amber-200 bg-amber-50/40">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Coût global</p>
                        <p className="text-xl font-black text-amber-700 mt-1">{fmt(data?.global?.total_cout || 0)} DH</p>
                    </CardContent>
                </Card>
                <Card className="border border-emerald-200 bg-emerald-50/40">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Marge globale</p>
                        <p className="text-xl font-black text-emerald-700 mt-1">{fmt(data?.global?.total_marge || 0)} DH</p>
                    </CardContent>
                </Card>
                <Card className="border border-zinc-200 bg-zinc-50/40">
                    <CardContent className="pt-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">Documents</p>
                        <p className="text-2xl font-black text-zinc-700 mt-1">{data?.global?.total_docs || 0}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-border shadow-sm overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-lg">Détail par source</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b border-border">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold">Source</th>
                                    <th className="text-right px-4 py-3 font-semibold">Documents</th>
                                    <th className="text-right px-4 py-3 font-semibold">Ventes</th>
                                    <th className="text-right px-4 py-3 font-semibold">Coûts</th>
                                    <th className="text-right px-4 py-3 font-semibold">Marge</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                                            Chargement...
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row, idx) => (
                                        <tr key={row.label} className={idx === 2 ? "bg-indigo-50/40 font-semibold" : "border-b border-border/50"}>
                                            <td className="px-4 py-3">{row.label}</td>
                                            <td className="px-4 py-3 text-right">{row.total_docs || 0}</td>
                                            <td className="px-4 py-3 text-right">{fmt(row.total_vente || 0)} DH</td>
                                            <td className="px-4 py-3 text-right">{fmt(row.total_cout || 0)} DH</td>
                                            <td className="px-4 py-3 text-right">{fmt(row.total_marge || 0)} DH</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border p-3 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-indigo-600" />
                            <span className="text-sm text-muted-foreground">
                                La marge est calculee par <strong>vente - cout d&apos;achat</strong> sur les lignes produits.
                            </span>
                        </div>
                        <div className="rounded-lg border border-border p-3 flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-emerald-600" />
                            <span className="text-sm text-muted-foreground">
                                Les totaux commandes et factures sont affiches separement puis additionnes.
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border border-border shadow-sm overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-lg">Détails commandes et factures</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b border-border">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold">Type</th>
                                    <th className="text-left px-4 py-3 font-semibold">Code</th>
                                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                                    <th className="text-right px-4 py-3 font-semibold">Total vendu</th>
                                    <th className="text-right px-4 py-3 font-semibold">Total coût</th>
                                    <th className="text-right px-4 py-3 font-semibold">Total marge</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                                            Chargement...
                                        </td>
                                    </tr>
                                ) : details.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                                            Aucun document vendu trouvé.
                                        </td>
                                    </tr>
                                ) : (
                                    details.map((row) => {
                                        const href =
                                            row.type === "commande"
                                                ? `/dashboard/commandes/${row.id}`
                                                : `/dashboard/factures/${row.id}`;
                                        return (
                                            <tr key={`${row.type}-${row.id}`} className="border-b border-border/50">
                                                <td className="px-4 py-3 capitalize">{row.type}</td>
                                                <td className="px-4 py-3">
                                                    <Link to={href} className="text-indigo-600 hover:underline font-medium">
                                                        {row.code || `#${row.id}`}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3">{row.date_document ? String(row.date_document).slice(0, 10) : "—"}</td>
                                                <td className="px-4 py-3 text-right">{fmt(row.total_vente)} DH</td>
                                                <td className="px-4 py-3 text-right">{fmt(row.total_cout)} DH</td>
                                                <td className="px-4 py-3 text-right font-semibold">{fmt(row.total_marge)} DH</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
