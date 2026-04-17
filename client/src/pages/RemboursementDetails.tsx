import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/common/ui/table";
import { Banknote, ArrowLeft, CheckCircle2, Clock, XCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { generateRecuRemboursementPdf } from "@/components/pdf/RecuRemboursementPdf";

interface RemboursementDetails {
  id: number;
  commande_id: number;
  numero_commande: string;
  client_nom: string;
  montant: number;
  motif: string;
  statut: string;
  commande_montant_ttc?: number;
  commande_total_regle?: number;
  created_by_prenom?: string;
  created_by_nom?: string;
  valide_par_prenom?: string;
  valide_par_nom?: string;
  created_at: string;
}

const formatRemboursementCode = (remb: RemboursementDetails) => {
  const d = new Date(remb.created_at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `RM/${y}${m}${day}/${remb.id}`;
};

export default function RemboursementDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<RemboursementDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchDetails = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const res = await fetch(`/api/remboursements/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = await res.json();
          setData(body);
        } else {
          toast.error("Impossible de charger le remboursement.");
        }
      } catch {
        toast.error("Erreur lors du chargement du remboursement.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetails();
  }, [id, token]);

  const handleDownloadRecu = async () => {
    if (!data) return;
    if (data.statut !== "valide") {
      toast.error("Seuls les remboursements validés peuvent générer un reçu.");
      return;
    }
    setIsDownloading(true);
    try {
      await generateRecuRemboursementPdf({
        id: data.id,
        client_nom: data.client_nom || "Client",
        numero_commande: data.numero_commande,
        montant: Number(data.montant),
        motif: data.motif || "",
        created_at: data.created_at,
        valide_par_nom: data.valide_par_nom,
        valide_par_prenom: data.valide_par_prenom,
        commande_montant_ttc: Number(data.commande_montant_ttc || 0),
        commande_total_regle: Number(data.commande_total_regle || 0),
      });
      toast.success("Reçu de remboursement téléchargé.");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la génération du reçu.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Chargement du remboursement...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full p-8 text-center shadow-md">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4">
            <XCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Remboursement introuvable</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Ce remboursement n&apos;existe plus ou vous n&apos;y avez pas accès.
          </p>
          <Button className="mt-6 w-full" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </Card>
      </div>
    );
  }

  const statutBadge =
    data.statut === "valide" ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Validé
      </span>
    ) : data.statut === "rejete" ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <XCircle className="h-3 w-3" /> Rejeté
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        <Clock className="h-3 w-3" /> En attente
      </span>
    );

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full border border-border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <Banknote className="h-6 w-6 text-indigo-600" />
              Remboursement {formatRemboursementCode(data)}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Demande liée à la commande #{data.numero_commande}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statutBadge}
          <Button
            size="sm"
            variant="outline"
            disabled={isDownloading || data.statut !== "valide"}
            onClick={handleDownloadRecu}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Télécharger le reçu
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détails</CardTitle>
          <CardDescription>Informations principales sur cette demande de remboursement.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold w-40">Code</TableCell>
                <TableCell className="font-mono">{formatRemboursementCode(data)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Commande</TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    className="px-0 text-indigo-600"
                    onClick={() => navigate(`/dashboard/commandes/${data.commande_id}`)}
                  >
                    #{data.numero_commande}
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Client</TableCell>
                <TableCell>{data.client_nom || "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Montant</TableCell>
                <TableCell>{Number(data.montant).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Motif</TableCell>
                <TableCell>{data.motif}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Créé le</TableCell>
                <TableCell>
                  {new Date(data.created_at).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Créé par</TableCell>
                <TableCell>
                  {data.created_by_prenom && data.created_by_nom
                    ? `${data.created_by_prenom} ${data.created_by_nom}`
                    : "—"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Validé par</TableCell>
                <TableCell>
                  {data.valide_par_prenom && data.valide_par_nom
                    ? `${data.valide_par_prenom} ${data.valide_par_nom}`
                    : "—"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

