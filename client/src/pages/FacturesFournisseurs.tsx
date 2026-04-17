import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Input } from "@/components/common/ui/input";
import { Button } from "@/components/common/ui/button";
import { FileText, Download, Search } from "lucide-react";
import { toast } from "sonner";

type SupplierInvoiceRow = {
    id: number;
    numero: string | null;
    fournisseur_nom: string | null;
    created_at?: string | null;
    facture_fournisseur?: string | null;
};

export default function FacturesFournisseurs() {
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAuthorized = role === "admin" || permissions.includes("fournisseurs_view");
    const token = localStorage.getItem("token");

    const [rows, setRows] = useState<SupplierInvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const run = async () => {
            if (!token) return;
            setLoading(true);
            try {
                const res = await fetch("/api/achats-fournisseurs", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("Erreur chargement des factures fournisseurs");
                const data = await res.json();
                const withInvoice = (Array.isArray(data) ? data : []).filter((a: any) => a?.facture_fournisseur);
                setRows(withInvoice);
            } catch (e: any) {
                toast.error(e?.message || "Erreur lors du chargement");
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [token]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            String(r.numero || "").toLowerCase().includes(q) ||
            String(r.fournisseur_nom || "").toLowerCase().includes(q) ||
            String(r.facture_fournisseur || "").toLowerCase().includes(q)
        );
    }, [rows, search]);

    if (!isAuthorized) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Vous n&apos;avez pas les droits pour consulter les factures fournisseurs.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-indigo-600" />
                        Factures fournisseurs
                    </CardTitle>
                    <CardDescription>
                        Liste des factures fournisseurs téléversées.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            className="pl-9"
                            placeholder="Rechercher (numéro, fournisseur, fichier)..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left px-4 py-3">N° Facture</th>
                                    <th className="text-left px-4 py-3">Fournisseur</th>
                                    <th className="text-left px-4 py-3">Date</th>
                                    <th className="text-right px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                                            Chargement...
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                                            Aucune facture fournisseur trouvée.
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((r) => (
                                        <tr key={r.id} className="border-t border-border">
                                            <td className="px-4 py-3 font-mono text-xs font-semibold">
                                                {r.numero || `#${r.id}`}
                                            </td>
                                            <td className="px-4 py-3">{r.fournisseur_nom || "-"}</td>
                                            <td className="px-4 py-3">
                                                {r.created_at
                                                    ? new Date(r.created_at).toLocaleDateString("fr-FR")
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 gap-1.5"
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch(`/api/factures/fournisseur/${r.id}/pdf/download`, {
                                                                headers: { Authorization: `Bearer ${token}` },
                                                            });
                                                            if (!res.ok) throw new Error("Impossible de générer le PDF fournisseur");
                                                            const blob = await res.blob();
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement("a");
                                                            a.href = url;
                                                            a.download = `Facture_Fournisseur_${r.numero || r.id}.pdf`;
                                                            document.body.appendChild(a);
                                                            a.click();
                                                            a.remove();
                                                            URL.revokeObjectURL(url);
                                                        } catch (e: any) {
                                                            toast.error(e?.message || "Erreur lors du téléchargement du PDF");
                                                        }
                                                    }}
                                                >
                                                    <Download className="h-3.5 w-3.5" />
                                                    Télécharger PDF
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

