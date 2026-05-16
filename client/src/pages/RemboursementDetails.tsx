import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Banknote, ArrowLeft, CheckCircle2, Clock, XCircle, Download, Hash, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateRecuRemboursementPdf } from "@/components/pdf/RecuRemboursementPdf";
import { formatLineTotalPuQty } from "@/lib/documentLineTotal";

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

type CommandeItem = {
  id?: number;
  designation?: string;
  reference?: string | null;
  produit_reference?: string | null;
  product_reference?: string | null;
  photo?: string | null;
  quantite?: number;
  prix_unitaire?: number;
  tva?: number;
  reduction?: number;
  montant_ht?: number;
};

type CommandeLiee = {
  montant_ht?: number;
  montant_tva?: number;
  montant_ttc?: number;
  items?: CommandeItem[];
};

function formatDesignationWithReference(
  designation?: string | null,
  reference?: string | null
): string {
  const label = String(designation || "").trim() || "—";
  const ref = String(reference || "").trim();
  if (ref) return `${label} (${ref})`;
  return label;
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
  const [commande, setCommande] = useState<CommandeLiee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const token = localStorage.getItem("token");

  const getProductPhotoUrl = (photo?: string | null) => {
    const p = String(photo || "").trim();
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) return p;
    const base = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
    return `${base}/uploads/${encodeURIComponent(p)}`;
  };

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
          if (body.commande_id) {
            fetch(`/api/commandes/${body.commande_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((c) => {
                if (c) setCommande(c);
              })
              .catch(() => {
                /* ignore */
              });
          }
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

  const commandeItems = commande?.items || [];

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
                <TableCell className="font-semibold">Montant remboursé</TableCell>
                <TableCell className="font-bold text-indigo-700 tabular-nums">
                  {Number(data.montant).toLocaleString("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  DH
                </TableCell>
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

      <Card className="border border-border shadow-md overflow-hidden bg-card">
        <CardHeader className="bg-muted/30 border-b border-border py-4 px-6 flex flex-row items-center justify-between">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
              <Hash className="h-4 w-4" /> Détail de la commande liée
            </CardTitle>
            <CardDescription className="text-[10px] font-semibold">
              Articles de la commande #{data.numero_commande}
            </CardDescription>
          </div>
          <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
            {commandeItems.length} article(s)
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 border-b border-border">
                  <TableHead className="w-[40%] text-[10px] font-black uppercase tracking-widest py-5 pl-8 text-foreground">
                    Désignation
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                    Qté
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                    P.U
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                    TVA
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">
                    Remise
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-right py-5 pr-8 text-foreground">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commandeItems.map((item, idx) => (
                  <TableRow key={item.id ?? idx} className="border-b border-border/50 hover:bg-muted/5 transition-all">
                    <TableCell className="pl-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-slate-400 overflow-hidden">
                          {getProductPhotoUrl(item.photo) ? (
                            <img
                              src={getProductPhotoUrl(item.photo) || ""}
                              alt={item.designation || "Produit"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Tag className="h-4 w-4" />
                          )}
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatDesignationWithReference(
                            item.designation,
                            item.reference || item.produit_reference || item.product_reference || null
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-black text-slate-700 dark:text-slate-300 tabular-nums">
                      {Number(item.quantite || 0).toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-center font-medium text-slate-600 dark:text-slate-400 tabular-nums">
                      {Number(item.prix_unitaire || 0).toLocaleString("fr-FR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      DH
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-[10px] font-bold text-slate-500">
                        {Number(item.tva || 0).toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded text-[10px] font-bold",
                          Number(item.reduction) > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-50 text-slate-300"
                        )}
                      >
                        {Number(item.reduction || 0).toFixed(1).replace(".", ",")}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-8 font-extrabold text-slate-800 dark:text-slate-200 tabular-nums">
                      {formatLineTotalPuQty(item)}
                    </TableCell>
                  </TableRow>
                ))}
                {commandeItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16">
                      <div className="flex flex-col items-center gap-2 opacity-30">
                        <Banknote className="h-12 w-12" />
                        <p className="text-sm font-bold uppercase tracking-widest">
                          {commande ? "Aucun article sur cette commande" : "Chargement des articles…"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-end gap-4">
        <Card className="w-full md:w-[320px] border border-border overflow-hidden bg-white dark:bg-zinc-900 shadow-xl relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 rounded-full -mr-16 -mt-16 transition-transform hover:scale-125" />
          <CardContent className="p-6 space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center group text-sm">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">
                  Total HT
                </span>
                <span className="font-bold text-foreground tabular-nums">
                  {Number(commande?.montant_ht ?? 0).toLocaleString("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  DH
                </span>
              </div>
              <div className="flex justify-between items-center group text-sm">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">
                  TVA appliquée
                </span>
                <span className="font-bold text-amber-500 tabular-nums">
                  +{Number(commande?.montant_tva ?? 0).toLocaleString("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  DH
                </span>
              </div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />

            <div className="flex flex-col gap-1 items-end pt-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Total net à payer TTC</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-indigo-700 tracking-tight">
                  {Number(commande?.montant_ttc ?? data.commande_montant_ttc ?? 0).toLocaleString("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-sm font-black text-indigo-600/60 uppercase">DH</span>
              </div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-2" />

            <div className="flex justify-between items-center group text-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Montant remboursé</span>
              <span className="font-bold text-red-600 tabular-nums">
                −{Number(data.montant).toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                DH
              </span>
            </div>
          </CardContent>
          <div className="bg-indigo-600 h-1.5 w-full" />
        </Card>
      </div>
    </div>
  );
}
