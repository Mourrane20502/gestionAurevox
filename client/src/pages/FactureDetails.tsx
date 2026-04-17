import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/common/ui/dialog";
import { Input } from "@/components/common/ui/input";
import { Textarea } from "@/components/common/ui/textarea";
import { Label } from "@/components/common/ui/label";
import { Button } from "@/components/common/ui/button";
import { 
    FileText, 
    User, 
    Calendar, 
    ArrowUpRight, 
    Printer, 
    Clock, 
    CheckCircle2, 
    AlertCircle, 
    AlertTriangle, 
    XCircle,
    ArrowLeft,
    ExternalLink,
    Receipt,
    ShoppingCart,
    Info,
    RefreshCcw,
    Tag,
    Mail,
    Send,
    Link as LinkIcon,
    Check,
    RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { generateFacturePdf } from "@/components/pdf/FacturePdf";
import { cn } from "@/lib/utils";
import { buildReglementCode } from "@/lib/reglementCode";

interface FactureItem {
  id?: number;
  designation: string;
  reference?: string | null;
  produit_reference?: string | null;
  product_reference?: string | null;
  quantite: number;
  prix_unitaire: number;
  tva: number;
  reduction?: number;
  montant_ht: number;
}

function formatDesignationWithReference(
  designation?: string | null,
  reference?: string | null
): string {
  const label = String(designation || "").trim() || "—";
  const ref = String(reference || "").trim();
  return ref ? `${label} (${ref})` : label;
}

interface FactureDetails {
  id: number;
  numero_facture: string;
  date_facture: string;
  date_echeance: string;
  client_nom: string;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  statut: string;
  mode_paiement: string;
  client_email?: string;
  reduction?: number;
  items?: FactureItem[];
  commande_id?: number | null;
  devis_id?: number | null;
  total_regle?: number;
  reste_a_payer?: number;
}

interface ComparableDocument {
  id: number;
  numero?: string | null;
  montant_ht?: number;
  montant_tva?: number;
  montant_ttc?: number;
  reduction?: number;
  items?: FactureItem[];
}

export default function FactureDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [facture, setFacture] = useState<FactureDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [linkedCommandeNumero, setLinkedCommandeNumero] = useState<string | null>(null);
  const [linkedDevisNumero, setLinkedDevisNumero] = useState<string | null>(null);
  const [linkedAvoir, setLinkedAvoir] = useState<{ id: number; numero_avoir?: string } | null>(null);

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailData, setEmailData] = useState({ to: '', subject: '', message: '' });
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [reglements, setReglements] = useState<any[]>([]);
  const [isReglementsModalOpen, setIsReglementsModalOpen] = useState(false);
  const [linkedRemboursement, setLinkedRemboursement] = useState<{ id: number; created_at: string } | null>(null);
  const [linkedCommandeDoc, setLinkedCommandeDoc] = useState<ComparableDocument | null>(null);
  const [linkedDevisDoc, setLinkedDevisDoc] = useState<ComparableDocument | null>(null);

  const token = localStorage.getItem("token");
  const linkedReglement =
    (reglements || []).find((r: any) => String(r?.statut || "").toLowerCase() === "valide") ||
    (reglements || [])[0] ||
    null;
  const mergeReglements = (rowsA: any[], rowsB: any[]) => {
    const merged = [...(Array.isArray(rowsA) ? rowsA : []), ...(Array.isArray(rowsB) ? rowsB : [])];
    const seen = new Set<number>();
    return merged.filter((r: any) => {
      const idNum = Number(r?.id);
      if (!Number.isFinite(idNum)) return true;
      if (seen.has(idNum)) return false;
      seen.add(idNum);
      return true;
    });
  };

  useEffect(() => {
    const fetchDetails = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const res = await fetch(`/api/factures/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setFacture(data);
          
          setEmailData({
              to: data.client_email || '',
              subject: `[Facture] ${data.numero_facture}`,
              message: `Bonjour,\n\nVeuillez trouver ci-joint votre facture ${data.numero_facture}.\n\nCordialement,`
          });
          
          // Fetch linked commande / devis numbers if any
          if (data.commande_id) {
            fetch(`/api/commandes/${data.commande_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(r => r.ok ? r.json() : null)
              .then(cmd => {
                if (cmd && cmd.numero_commande) setLinkedCommandeNumero(cmd.numero_commande);
                if (cmd) {
                  setLinkedCommandeDoc({
                    id: Number(cmd.id) || Number(data.commande_id),
                    numero: cmd.numero_commande || null,
                    montant_ht: Number(cmd.montant_ht) || 0,
                    montant_tva: Number(cmd.montant_tva) || 0,
                    montant_ttc: Number(cmd.montant_ttc) || 0,
                    reduction: Number(cmd.reduction) || 0,
                    items: Array.isArray(cmd.items) ? cmd.items : [],
                  });
                  if (!data.devis_id && cmd.devis_id) {
                    fetch(`/api/devis/${cmd.devis_id}`, {
                      headers: { Authorization: `Bearer ${token}` },
                    })
                      .then(rd => rd.ok ? rd.json() : null)
                      .then(dv => {
                        if (dv && dv.numero_devis) setLinkedDevisNumero(dv.numero_devis);
                        if (dv) {
                          setLinkedDevisDoc({
                            id: Number(dv.id) || Number(cmd.devis_id),
                            numero: dv.numero_devis || null,
                            montant_ht: Number(dv.montant_ht) || 0,
                            montant_tva: Number(dv.montant_tva) || 0,
                            montant_ttc: Number(dv.montant_ttc) || 0,
                            reduction: Number(dv.reduction) || 0,
                            items: Array.isArray(dv.items) ? dv.items : [],
                          });
                        }
                      })
                      .catch(() => { /* ignore */ });
                  }
                } else {
                  setLinkedCommandeDoc(null);
                }
              })
              .catch(() => { /* ignore */ });
            
            // Fetch remboursement linked to this commande (if validated)
            fetch("/api/remboursements", {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(r => r.ok ? r.json() : [])
              .then((rembs: any[]) => {
                const found = rembs.find((rem: any) =>
                  rem.commande_id === data.commande_id && rem.statut === "valide"
                );
                if (found) {
                  setLinkedRemboursement({ id: found.id, created_at: found.created_at });
                }
              })
              .catch(() => { /* ignore */ });
          }
          if (!data.commande_id) {
            setLinkedCommandeDoc(null);
          }
          if (data.devis_id) {
            fetch(`/api/devis/${data.devis_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(r => r.ok ? r.json() : null)
              .then(d => {
                if (d && d.numero_devis) setLinkedDevisNumero(d.numero_devis);
                if (d) {
                  setLinkedDevisDoc({
                    id: Number(d.id) || Number(data.devis_id),
                    numero: d.numero_devis || null,
                    montant_ht: Number(d.montant_ht) || 0,
                    montant_tva: Number(d.montant_tva) || 0,
                    montant_ttc: Number(d.montant_ttc) || 0,
                    reduction: Number(d.reduction) || 0,
                    items: Array.isArray(d.items) ? d.items : [],
                  });
                } else {
                  setLinkedDevisDoc(null);
                }
              })
              .catch(() => { /* ignore */ });
          }
          if (!data.devis_id) {
            setLinkedDevisDoc(null);
          }

          fetch("/api/avoirs", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then((avos: any[]) => {
              const avoir = avos.find((a: any) => a.facture_id === data.id);
              if (avoir) setLinkedAvoir({ id: avoir.id, numero_avoir: avoir.numero_avoir });
            })
            .catch(() => { /* ignore */ });

          Promise.all([
            fetch(`/api/reglements-clients?factureId=${data.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.ok ? r.json() : []),
            data.commande_id
              ? fetch(`/api/reglements-clients?commandeId=${data.commande_id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                }).then(r => r.ok ? r.json() : [])
              : Promise.resolve([]),
          ])
            .then(([regFacture, regCommande]) => {
              setReglements(mergeReglements(regFacture, regCommande));
            })
            .catch(() => { /* ignore */ });
        } else {
          toast.error("Impossible de charger la facture");
        }
      } catch (error) {
        console.error("error fetching details", error);
        toast.error("Erreur lors du chargement de la facture");
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetails();
  }, [id, token, navigate]);

  const handleSendEmail = async () => {
      if (!emailData.to) {
          toast.error("Veuillez renseigner l'adresse email du destinataire.");
          return;
      }
      setIsSendingEmail(true);
      try {
          const res = await fetch(`/api/factures/${id}/send-email`, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`
              },
              body: JSON.stringify(emailData)
          });
          if (res.ok) {
              toast.success("Email envoyé avec succès");
              setIsEmailModalOpen(false);
          } else {
              const data = await res.json();
              toast.error(data.message || "Erreur lors de l'envoi de l'email");
          }
      } catch (error) {
          toast.error("Erreur serveur");
      } finally {
          setIsSendingEmail(false);
      }
  };

  const formatRemboursementCode = (remb: { id: number; created_at: string }) => {
    const d = new Date(remb.created_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `RM/${y}${m}${day}/${remb.id}`;
  };

  const handleCopyLink = () => {
      const downloadUrl = `${window.location.origin}/api/factures/${id}/pdf/download`;
      navigator.clipboard.writeText(downloadUrl)
          .then(() => {
              setIsLinkCopied(true);
              toast.success("Lien de téléchargement sécurisé copié");
              setTimeout(() => setIsLinkCopied(false), 3000);
          })
          .catch(() => toast.error("Échec de la copie du lien"));
  };

  const items = facture?.items || [];
  const totalRegleFromReglements = reglements
    .filter(r => r.statut === 'approuve')
    .reduce((sum, r) => sum + (Number(r.montant) || 0), 0);
  const totalRegleComputed = Math.max(Number(facture?.total_regle) || 0, totalRegleFromReglements);

  const anomalyMessages = useMemo(() => {
    if (!facture) return [] as string[];

    const epsilon = 0.01;
    const formatDh = (v: number) =>
      `${Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
    const formatPct = (v: number) =>
      `${Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    const normalize = (s: string) => (s || "").trim().toLowerCase();
    const keyOf = (it: FactureItem) =>
      [
        normalize(it.designation || ""),
        Number(it.prix_unitaire || 0).toFixed(2),
        Number(it.tva || 0).toFixed(2),
        Number(it.reduction || 0).toFixed(2),
      ].join("|");
    const quantityByKey = (list: FactureItem[]) => {
      const map = new Map<string, number>();
      for (const it of list || []) {
        const k = keyOf(it);
        map.set(k, (map.get(k) || 0) + Number(it.quantite || 0));
      }
      return map;
    };

    const messages: string[] = [];
    const facItems = Array.isArray(facture.items) ? facture.items : [];
    const refs: Array<{ label: string; doc: ComparableDocument | null }> = [
      { label: "Commande", doc: linkedCommandeDoc },
      { label: "Devis", doc: linkedDevisDoc },
    ];

    for (const { label, doc } of refs) {
      if (!doc) continue;

      const refReduction = Number(doc.reduction || 0);
      const facReduction = Number(facture.reduction || 0);
      if (Math.abs(refReduction - facReduction) > epsilon) {
        messages.push(
          `${label}: écart de réduction (${formatPct(refReduction)} vs facture ${formatPct(facReduction)}).`
        );
      }

      const refHt = Number(doc.montant_ht || 0);
      const refTva = Number(doc.montant_tva || 0);
      const refTtc = Number(doc.montant_ttc || 0);
      const facHt = Number(facture.montant_ht || 0);
      const facTva = Number(facture.montant_tva || 0);
      const facTtc = Number(facture.montant_ttc || 0);
      if (Math.abs(refHt - facHt) > epsilon) {
        messages.push(`${label}: écart montant HT (${formatDh(refHt)} vs facture ${formatDh(facHt)}).`);
      }
      if (Math.abs(refTva - facTva) > epsilon) {
        messages.push(`${label}: écart montant TVA (${formatDh(refTva)} vs facture ${formatDh(facTva)}).`);
      }
      if (Math.abs(refTtc - facTtc) > epsilon) {
        messages.push(`${label}: écart montant TTC (${formatDh(refTtc)} vs facture ${formatDh(facTtc)}).`);
      }

      const refItems = Array.isArray(doc.items) ? doc.items : [];
      if (refItems.length !== facItems.length) {
        messages.push(`${label}: nombre de lignes différent (${refItems.length} vs facture ${facItems.length}).`);
      }

      const refMap = quantityByKey(refItems);
      const facMap = quantityByKey(facItems);
      const allKeys = new Set<string>([...refMap.keys(), ...facMap.keys()]);
      for (const k of allKeys) {
        const rq = Number(refMap.get(k) || 0);
        const fq = Number(facMap.get(k) || 0);
        if (Math.abs(rq - fq) > epsilon) {
          const [designation, pu, tva, red] = k.split("|");
          messages.push(
            `${label}: ligne "${designation || "article"}" (PU ${pu}, TVA ${tva}%, Red ${red}%) quantité ${rq} vs facture ${fq}.`
          );
        }
      }
    }

    return messages;
  }, [facture, linkedCommandeDoc, linkedDevisDoc]);

  if (isLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent shadow-lg shadow-indigo-200"></div>
            <p className="text-muted-foreground text-sm font-medium animate-pulse">Chargement facture...</p>
        </div>
    );
  }

  if (!facture) {
    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full p-8 text-center border-border shadow-2xl">
                <div className="mx-auto h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Facture introuvable</h2>
                <p className="text-muted-foreground mt-2">Ce document n&apos;existe plus ou a été déplacé.</p>
                <Button className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={() => navigate(-1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Retourner à la liste
                </Button>
            </Card>
        </div>
    );
  }

  const reductionAmountDh = (facture.items || []).reduce((acc, it) => {
    const bruteHT = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
    const redPct = Number(it.reduction) || 0;
    return acc + (bruteHT * redPct) / 100;
  }, 0);

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="rounded-full h-12 w-12 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
            >
                <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
                <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                    <span className="text-indigo-600">Facture</span>
                    <span className="text-muted-foreground font-mono">#{facture.numero_facture}</span>
                </h1>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                    <Calendar className="h-3.5 w-3.5" />
                    Émise le {new Date(facture.date_facture).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
            </div>
        </div>
        
        <div className="flex items-center gap-2.5 flex-wrap">
            <Button
                variant="outline"
                onClick={handleCopyLink}
                className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
            >
                {isLinkCopied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
                {isLinkCopied ? "Lien copié!" : "Générer lien"}
            </Button>
            
            {(() => {
                const totalRegle = totalRegleComputed;
                const montantTtc = Number(facture.montant_ttc) || 0;
                const isFullyPaid = montantTtc > 0 && totalRegle >= montantTtc;
                return isFullyPaid && (
                    <Button
                        variant="outline"
                        disabled={isProcessingPdf}
                        onClick={async () => {
                            try {
                                setIsProcessingPdf(true);
                                await generateFacturePdf(facture as any);
                            } catch (error) {
                                console.error("Erreur génération PDF facture:", error);
                                toast.error("Erreur lors de la génération du PDF");
                            } finally {
                                setIsProcessingPdf(false);
                            }
                        }}
                        className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        {isProcessingPdf ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Imprimer PDF
                    </Button>
                );
            })()}

            <Button
                variant="outline"
                onClick={() => setIsEmailModalOpen(true)}
                className="gap-2 h-11 px-5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold rounded-xl shadow-sm transition-all active:scale-95"
            >
                <Mail className="h-4 w-4" />
                Envoyer par Email
            </Button>
            
            <Button
                size="sm"
                onClick={() => navigate("/dashboard/factures", { state: { factureId: facture.id } })}
                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 gap-2"
            >
                Modifier Facture
                <ArrowUpRight className="h-4 w-4" />
            </Button>
        </div>
      </div>

      {/* Statut règlement (Payé / Impayé / Règlement commencé) */}
      {(() => {
        const baseTotalRegle = totalRegleComputed;
        const montantTtc = Number(facture.montant_ttc) || 0;
        const totalRegle = baseTotalRegle;
        const rawReste = typeof facture.reste_a_payer !== "undefined"
          ? Math.max(Number(facture.reste_a_payer), montantTtc - totalRegle, 0)
          : Math.max(montantTtc - totalRegle, 0);

        const paidByAmounts = montantTtc > 0 && totalRegle >= montantTtc - 0.01;
        // Si le backend marque la facture comme "paye" ou "payee", on force l'affichage "Payé (réglé)"
        const isRegle = facture.statut === "paye" || facture.statut === "payee" || paidByAmounts;
        const isReglementCommence = !isRegle && totalRegle > 0 && totalRegle < montantTtc - 0.01;
        const reste = isRegle ? 0 : Math.max(rawReste, 0);
        return (
          <Card className={cn(
            "border rounded-xl overflow-hidden shadow-sm",
            isRegle ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10" : isReglementCommence ? "border-amber-200 bg-amber-50/50 dark:bg-amber-900/10" : "border-red-200 bg-red-50/50 dark:bg-red-900/10"
          )}>
            <CardContent className="py-3 px-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <span className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold uppercase",
                  isRegle ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : isReglementCommence ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {isRegle ? <CheckCircle2 className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                  {isRegle ? "Payé (réglé)" : isReglementCommence ? "Règlement commencé" : "Impayé (non réglé)"}
                </span>
                {reste > 0 && (
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Reste à payer</span>
                    <span className="text-sm font-black text-foreground">{reste.toLocaleString()} DH</span>
                  </div>
                )}
                {totalRegle > 0 && (
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Déjà réglé</span>
                    <span className="text-sm font-bold text-indigo-600">{totalRegle.toLocaleString()} DH <span className="text-muted-foreground font-normal">/ {montantTtc.toLocaleString()} DH</span></span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsReglementsModalOpen(true)}
                  className="h-9 px-4 border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold gap-2 rounded-lg transition-all"
                >
                  <Clock className="h-4 w-4" />
                  Historique
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Approval/Payment Warning */}
      {(() => {
        const hasPendingReglement = reglements.some(r => r.statut === 'en_attente');
        const montantTtc = Number(facture.montant_ttc) || 0;
        const totalRegleGlob = totalRegleComputed;
        const resteGlobRaw = typeof facture.reste_a_payer !== "undefined"
          ? Math.max(Number(facture.reste_a_payer), montantTtc - totalRegleGlob, 0)
          : Math.max(montantTtc - totalRegleGlob, 0);
        const paidByAmounts = montantTtc > 0 && totalRegleGlob >= montantTtc - 0.01;
        const isGloballyPaid = facture.statut === "paye" || paidByAmounts;
        const resteGlob = isGloballyPaid ? 0 : Math.max(resteGlobRaw, 0);

        const showsWarning =
          !isGloballyPaid &&
          (facture.statut === 'en_attente' ||
            facture.statut === 'non_payee' ||
            hasPendingReglement) &&
          (resteGlob > 0 || facture.statut === 'en_attente');
        if (!showsWarning) return null;

        const isApprovalContext = facture.statut === 'en_attente' || hasPendingReglement;

        return (
          <Card className={cn(
              "border-l-4 overflow-hidden shadow-none rounded-xl",
              isApprovalContext ? "border-l-amber-500 border-amber-100 bg-amber-50/40" : "border-l-red-500 border-red-100 bg-red-50/40"
          )}>
            <CardContent className="py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-start gap-4 text-center sm:text-left">
                <div className={cn(
                    "h-10 w-10 shrink-0 rounded-full flex items-center justify-center shadow-sm",
                    isApprovalContext ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
                )}>
                  {isApprovalContext ? <Clock className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </div>
                <div className="flex flex-col">
                  <span className={cn(
                      "text-sm font-black uppercase tracking-wider",
                      isApprovalContext ? "text-amber-700" : "text-red-700"
                  )}>
                    {facture.statut === 'en_attente' 
                      ? "Facture en attente de validation" 
                      : hasPendingReglement 
                        ? "Paiement en attente d'approbation" 
                        : "Facture validée, en attente de règlement"}
                  </span>
                  <span className={cn(
                      "text-xs font-medium",
                      isApprovalContext ? "text-amber-800/80" : "text-red-800/80"
                  )}>
                    {facture.statut === 'en_attente' 
                      ? "Cette facture est en cours de validation par un administrateur." 
                      : hasPendingReglement 
                        ? "Un ou plusieurs règlements sont en attente de confirmation par l'administration." 
                        : "Cette facture n'a pas encore été réglée en totalité."}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className={cn(
                    "shadow-sm font-bold text-xs h-10 px-6 rounded-lg transition-transform active:scale-95",
                    isApprovalContext ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-200" : "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700"
                )}
                onClick={() => {
                  if (isApprovalContext) {
                    navigate("/dashboard/approvals", { state: { fromDetails: true, type: "factures", id: facture.id } });
                  } else {
                    navigate("/dashboard/reglements", { state: { factureId: facture.id, openDialog: true } });
                  }
                }}
              >
                {isApprovalContext ? "Aller aux approbations" : "Payer / Terminer le règlement"}
              </Button>
            </CardContent>
          </Card>
        );
      })()}

      {anomalyMessages.length > 0 && (
        <Card className="border-l-4 border-l-red-500 border-red-200 bg-red-50/40 dark:bg-red-900/10 overflow-hidden shadow-none rounded-xl">
          <CardContent className="py-4 px-6 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-red-100 flex items-center justify-center text-red-600 shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black uppercase tracking-wider text-red-700">
                  Anomalies détectées entre devis / commande / facture
                </p>
                <p className="text-xs text-red-700/80 font-medium">
                  Vérifiez ces écarts avant validation finale ({anomalyMessages.length} écart{anomalyMessages.length > 1 ? "s" : ""}).
                </p>
              </div>
            </div>
            <ul className="space-y-1 pl-2">
              {anomalyMessages.map((msg, idx) => (
                <li key={`${idx}-${msg}`} className="text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
            <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <User className="h-3.5 w-3.5 text-indigo-500" /> Client
            </CardHeader>
            <CardContent className="p-4 pt-1">
                <p className="text-lg font-black text-foreground truncate">{facture.client_nom}</p>
                <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                        {facture.mode_paiement}
                    </span>
                </div>
            </CardContent>
        </Card>

        <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
            <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <Info className="h-3.5 w-3.5 text-indigo-500" /> Statut
            </CardHeader>
            <CardContent className="p-4 pt-1">
                <div className="mt-1">
                    {facture.statut === 'paye' || facture.statut === 'payee' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                            <CheckCircle2 className="h-3 w-3" /> Payée
                        </span>
                    ) : facture.statut === 'en_attente' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 shadow-sm animate-pulse">
                            <Clock className="h-3 w-3" /> En attente
                        </span>
                    ) : facture.statut === 'non_payee' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200 shadow-sm">
                            <AlertCircle className="h-3 w-3" /> Impayée
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-slate-100 text-slate-700 border border-slate-200 shadow-sm">
                            <XCircle className="h-3 w-3" /> {facture.statut}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>

        <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
            <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Échéance
            </CardHeader>
            <CardContent className="p-4 pt-1">
                <p className={cn(
                    "text-lg font-black",
                    new Date(facture.date_echeance) < new Date() && facture.statut === 'non_payee' ? "text-red-600" : "text-foreground"
                )}>
                    {new Date(facture.date_echeance).toLocaleDateString("fr-FR")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-wide">Date limite de paiement</p>
            </CardContent>
        </Card>

        <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-shadow duration-300">
            <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <ExternalLink className="h-3.5 w-3.5 text-indigo-500" /> Documents Liés
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-1.5">
                {facture.devis_id ? (
                    <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                        onClick={() => navigate(`/dashboard/devis/${facture.devis_id}`)}
                    >
                        <div className="flex items-center gap-1.5">
                            <FileText className="h-3 w-3" />
                            <span>Devis {linkedDevisNumero || facture.devis_id}</span>
                        </div>
                        <ArrowUpRight className="h-3 w-3" />
                    </button>
                ) : null}
                {facture.commande_id ? (
                    <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                        onClick={() => navigate(`/dashboard/commandes/${facture.commande_id}`)}
                    >
                        <div className="flex items-center gap-1.5">
                            <ShoppingCart className="h-3 w-3" />
                            <span>Commande {linkedCommandeNumero || facture.commande_id}</span>
                        </div>
                        <ArrowUpRight className="h-3 w-3" />
                    </button>
                ) : (
                    <p className="text-[10px] text-muted-foreground italic mt-2">Aucune commande liée</p>
                )}
                {linkedAvoir ? (
                    <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100 transition-colors"
                        onClick={() => navigate(`/dashboard/avoirs/${linkedAvoir.id}`)}
                    >
                        <div className="flex items-center gap-1.5">
                            <RotateCcw className="h-3 w-3" />
                            <span>Avoir {linkedAvoir.numero_avoir || linkedAvoir.id}</span>
                        </div>
                        <ArrowUpRight className="h-3 w-3" />
                    </button>
                ) : null}
                {linkedReglement ? (
                    <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-100 transition-colors"
                        onClick={() => navigate(`/dashboard/reglements/details/client/${linkedReglement.id}`)}
                    >
                        <div className="flex items-center gap-1.5">
                            <Receipt className="h-3 w-3" />
                            <span>
                                Règlement {buildReglementCode("client", Number(linkedReglement.id), String(linkedReglement.date_reglement || linkedReglement.created_at || ""), Number(linkedReglement.numero_recu || 0) || null, linkedReglement.sous_societe_nom, linkedReglement.numero_facture || linkedReglement.numero_commande)}
                            </span>
                        </div>
                        <ArrowUpRight className="h-3 w-3" />
                    </button>
                ) : null}
                {linkedRemboursement && (
                    <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100 transition-colors"
                        onClick={() => navigate(`/dashboard/remboursements/${linkedRemboursement.id}`)}
                    >
                        <div className="flex items-center gap-1.5">
                            <RotateCcw className="h-3 w-3" />
                            <span>Remboursement {formatRemboursementCode(linkedRemboursement)}</span>
                        </div>
                        <ArrowUpRight className="h-3 w-3" />
                    </button>
                )}
            </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card className="border border-border shadow-md overflow-hidden bg-card">
        <CardHeader className="bg-muted/30 border-b border-border py-4 px-6 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> Détail de la facture
                </CardTitle>
                <p className="text-[10px] text-muted-foreground font-semibold">Récapitulatif des prestations et articles</p>
            </div>
            <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
                {items.length} Article(s)
            </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 border-b border-border">
                  <TableHead className="w-[40%] text-[10px] font-black uppercase tracking-widest py-5 pl-8 text-foreground">Désignation</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">Qté</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">P.U. (HT)</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">TVA</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center py-5 text-foreground">Remise</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-right py-5 pr-8 text-foreground">Total HT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx} className="border-b border-border/50 hover:bg-muted/5 transition-all">
                    <TableCell className="pl-8 py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-slate-400">
                                <Tag className="h-4 w-4" />
                            </div>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {formatDesignationWithReference(
                                item.designation,
                                item.reference || item.produit_reference || item.product_reference || null
                              )}
                            </span>
                        </div>
                    </TableCell>
                    <TableCell className="text-center font-black text-slate-700 dark:text-slate-300">
                      {Number(item.quantite).toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-center font-medium text-slate-600 dark:text-slate-400">
                      {Number(item.prix_unitaire).toLocaleString("fr-FR")} DH
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-[10px] font-bold text-slate-500">
                        {Number(item.tva).toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                        <span className={cn(
                            "px-2.5 py-1 rounded text-[10px] font-bold",
                            (item.reduction || 0) > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-50 text-slate-300"
                        )}>
                            {Number(item.reduction || 0).toFixed(1).replace('.', ',')}%
                        </span>
                    </TableCell>
                    <TableCell className="text-right pr-8 font-extrabold text-slate-800 dark:text-slate-200">
                      {Number(item.montant_ht).toLocaleString("fr-FR")} DH
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16">
                        <div className="flex flex-col items-center gap-2 opacity-30">
                            <Receipt className="h-12 w-12" />
                            <p className="text-sm font-bold uppercase tracking-widest">Aucune ligne facturée</p>
                        </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Totals Summary */}
      <div className="flex flex-col items-end gap-4">
        <Card className="w-full md:w-[320px] border border-border overflow-hidden bg-white dark:bg-zinc-900 shadow-xl relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 rounded-full -mr-16 -mt-16 transition-transform hover:scale-125" />
            <CardContent className="p-6 space-y-4">
                <div className="space-y-3">
                    <div className="flex justify-between items-center group text-sm">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">Sous-total HT</span>
                        <span className="font-bold text-foreground">{Number(facture.montant_ht).toLocaleString("fr-FR")} DH</span>
                    </div>
                    <div className="flex justify-between items-center group text-sm">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">TVA collectée</span>
                        <span className="font-bold text-amber-500">+{Number(facture.montant_tva).toLocaleString("fr-FR")} DH</span>
                    </div>
                    {facture.reduction && Number(facture.reduction) > 0 && (
                      <div className="flex justify-between items-center group text-sm">
                          <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Remise Global</span>
                          <span className="font-bold text-red-500">
                            -{facture.reduction}% ({reductionAmountDh.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH)
                          </span>
                      </div>
                    )}
                </div>
                
                <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />
                
                <div className="flex flex-col gap-1 items-end pt-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Montant Net à Payer</span>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black text-indigo-700 tracking-tight">
                            {Number(facture.montant_ttc).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-sm font-black text-indigo-600/60 uppercase">DH</span>
                    </div>
                </div>
            </CardContent>
            <div className="bg-indigo-600 h-1.5 w-full" />
        </Card>
        
     
      </div>

      {/* Email Modal */}
      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-indigo-600">
                      <Mail className="h-5 w-5" />
                      Envoyer la facture par email
                  </DialogTitle>
                  <DialogDescription>
                      Envoyez ce document directement au client. Le PDF sera joint automatiquement.
                  </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                  <div className="space-y-2">
                      <Label htmlFor="to">Email du destinataire <span className="text-red-500">*</span></Label>
                      <Input
                          id="to"
                          type="email"
                          placeholder="client@exemple.com"
                          value={emailData.to}
                          onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                      />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="subject">Sujet</Label>
                      <Input
                          id="subject"
                          value={emailData.subject}
                          onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                      />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                          id="message"
                          rows={5}
                          value={emailData.message}
                          onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
                          className="resize-none"
                      />
                  </div>
                  <div className="pt-2">
                      <span className="text-sm font-semibold mb-2 block">Pièce(s) jointe(s)</span>
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                          <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded bg-red-100 text-red-600">
                              <FileText className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">Facture_{facture.numero_facture}.pdf</p>
                              <p className="text-xs text-muted-foreground">Document PDF généré automatiquement</p>
                          </div>
                      </div>
                  </div>
              </div>
              <DialogFooter className="sm:justify-between">
                  <Button
                      variant="ghost"
                      onClick={() => setIsEmailModalOpen(false)}
                      disabled={isSendingEmail}
                  >
                      Annuler
                  </Button>
                  <Button
                      onClick={handleSendEmail}
                      disabled={isSendingEmail || !emailData.to}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                  >
                      {isSendingEmail ? (
                          <>
                              <RefreshCcw className="h-4 w-4 animate-spin" />
                              Envoi en cours...
                          </>
                      ) : (
                          <>
                              <Send className="h-4 w-4" />
                              Envoyer
                          </>
                      )}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Reglements History Modal */}
      <Dialog open={isReglementsModalOpen} onOpenChange={setIsReglementsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600 font-black">
              <Clock className="h-5 w-5" />
              Historique des règlements
            </DialogTitle>
            <DialogDescription className="font-medium">
              Liste de tous les règlements enregistrés pour la facture #{facture.numero_facture}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground">Référence</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground">Date</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground">Mode</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground">Banque</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-right text-foreground">Montant</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-center text-foreground">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reglements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground font-medium">
                      <div className="flex flex-col items-center gap-2 opacity-40">
                        <Receipt className="h-8 w-8" />
                        <span>Aucun règlement saisi pour cette facture.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  reglements.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/reglements/details/client/${r.id}`)}
                          className="text-indigo-700 hover:underline"
                        >
                          {buildReglementCode("client", Number(r.id), String(r.date_reglement || r.created_at || ""), Number(r.numero_recu || 0) || null, (r as any).sous_societe_nom, (r as any).numero_facture || (r as any).numero_commande)}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {new Date(r.date_reglement).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-xs font-bold capitalize text-indigo-600">{r.mode_paiement}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium">{r.banque_nom || "—"}</TableCell>
                      <TableCell className="text-right font-black text-sm">
                        {Number(r.montant).toLocaleString()} DH
                      </TableCell>
                      <TableCell className="text-center">
                        {r.statut === 'approuve' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Validé
                          </span>
                        ) : r.statut === 'en_attente' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-amber-100 text-amber-700 border border-amber-200 animate-pulse">
                            <Clock className="h-2.5 w-2.5" /> En attente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-red-100 text-red-700 border border-red-200">
                            <XCircle className="h-2.5 w-2.5" /> {r.statut}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          <DialogFooter className="bg-muted/10 p-4 -mx-6 -mb-6 border-t">
            <Button variant="outline" onClick={() => setIsReglementsModalOpen(false)} className="font-bold">Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


