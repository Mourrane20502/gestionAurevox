import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Badge } from "@/components/common/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/common/ui/dialog";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Textarea } from "@/components/common/ui/textarea";
import { ArrowLeft, Banknote, Check, CheckCircle2, Clock, Eye, FileText, Link as LinkIcon, Mail, RefreshCcw, Send, Upload, User, Truck } from "lucide-react";
import { toast } from "sonner";
import { buildReglementCode, type ReglementCodeType } from "@/lib/reglementCode";
import { generateRecuPaiementPdf, type RecuPaiementData } from "@/components/pdf/RecuPaiementPdf";
import { metalTypeLabelFromProductTypeName } from "@/lib/metalTypeLabel";

type ReglementDetailsData = {
    id: number;
    numero_recu?: number | null;
    date_reglement: string;
    montant: number;
    mode_paiement: string;
    statut: string;
    commentaire?: string | null;
    banque_nom?: string | null;
    created_at?: string;
    updated_at?: string;
    created_by_nom?: string | null;
    approved_by_nom?: string | null;
    approved_at?: string | null;
    client_id?: number | null;
    client_nom?: string | null;
    fournisseur_nom?: string | null;
    numero_facture?: string | null;
    numero_commande?: string | null;
    facture_id?: number | null;
    commande_id?: number | null;
    facture_gros_id?: number | null;
    commande_gros_id?: number | null;
    achat_designation?: string | null;
    pdf_path?: string | null;
};

type SituationReglement = {
    montant_ttc: number;
    total_regle: number;
    reste_a_payer: number;
};

type LinkedFactureInfo = {
    id: number;
    numero_facture?: string | null;
};

export default function ReglementDetails() {
    const { type, id } = useParams<{ type: string; id: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [data, setData] = useState<ReglementDetailsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLinkCopied, setIsLinkCopied] = useState(false);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailData, setEmailData] = useState({ to: "", subject: "", message: "" });
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
    const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
    const [linkedFactureFromCommande, setLinkedFactureFromCommande] = useState<LinkedFactureInfo | null>(null);
    const [situation, setSituation] = useState<SituationReglement | null>(null);
    const uploadInputRef = useRef<HTMLInputElement | null>(null);

    const normalizedType: ReglementCodeType | null = useMemo(() => {
        if (type === "client" || type === "client_gros" || type === "fournisseur") return type;
        return null;
    }, [type]);

    useEffect(() => {
        const run = async () => {
            if (!token || !id || !normalizedType) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const endpoint =
                    normalizedType === "client"
                        ? `/api/reglements-clients/${id}`
                        : normalizedType === "client_gros"
                            ? `/api/reglements-clients-gros/${id}`
                        : `/api/reglements-fournisseurs/${id}`;
                const res = await fetch(endpoint, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    toast.error(body.message || "Règlement introuvable");
                    setData(null);
                    return;
                }
                const payload = await res.json();
                setData(payload);
                const p = String(payload?.pdf_path || "").trim();
                if (p) {
                    const base = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
                    setUploadedPdfUrl(/^https?:\/\//i.test(p) ? p : `${base}/uploads/${encodeURIComponent(p)}`);
                } else {
                    setUploadedPdfUrl(null);
                }
            } catch (e) {
                console.error(e);
                toast.error("Erreur lors du chargement du règlement");
                setData(null);
            } finally {
                setIsLoading(false);
            }
        };
        run();
    }, [id, normalizedType, token]);

    useEffect(() => {
        const run = async () => {
            if (!token || (normalizedType !== "client" && normalizedType !== "client_gros")) {
                setLinkedFactureFromCommande(null);
                return;
            }
            if (!data) {
                setLinkedFactureFromCommande(null);
                return;
            }
            const currentCommandeId = normalizedType === "client_gros" ? data?.commande_gros_id : data?.commande_id;
            const currentFactureId = normalizedType === "client_gros" ? data?.facture_gros_id : data?.facture_id;
            // Si le règlement contient déjà une facture liée, pas besoin de fallback.
            if (currentFactureId || data.numero_facture) {
                setLinkedFactureFromCommande(null);
                return;
            }
            if (!currentCommandeId) {
                setLinkedFactureFromCommande(null);
                return;
            }
            try {
                const res = await fetch(normalizedType === "client_gros" ? "/api/factures-gros" : "/api/factures", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    setLinkedFactureFromCommande(null);
                    return;
                }
                const rows = await res.json();
                if (!Array.isArray(rows)) {
                    setLinkedFactureFromCommande(null);
                    return;
                }
                const linked = rows.find((f: any) => {
                    const key = normalizedType === "client_gros" ? "commande_gros_id" : "commande_id";
                    return Number(f?.[key]) === Number(currentCommandeId);
                });
                if (linked?.id) {
                    setLinkedFactureFromCommande({
                        id: Number(linked.id),
                        numero_facture: linked.numero_facture || null,
                    });
                } else {
                    setLinkedFactureFromCommande(null);
                }
            } catch {
                setLinkedFactureFromCommande(null);
            }
        };
        run();
    }, [data?.commande_id, data?.commande_gros_id, data?.facture_id, data?.facture_gros_id, data?.numero_facture, normalizedType, token]);

    useEffect(() => {
        const run = async () => {
            if (!token || !data || (normalizedType !== "client" && normalizedType !== "client_gros")) {
                setSituation(null);
                return;
            }
            const isGros = normalizedType === "client_gros";
            const factureId = isGros ? data.facture_gros_id : data.facture_id;
            const commandeId = isGros ? data.commande_gros_id : data.commande_id;
            const query = factureId ? `factureId=${factureId}` : commandeId ? `commandeId=${commandeId}` : "";
            if (!query) {
                setSituation(null);
                return;
            }
            try {
                const url = isGros ? `/api/reglements-clients-gros/situation?${query}` : `/api/reglements-clients/situation?${query}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) {
                    setSituation(null);
                    return;
                }
                const s = await res.json();
                setSituation({
                    montant_ttc: Number(s?.montant_ttc || 0),
                    total_regle: Number(s?.total_regle || 0),
                    reste_a_payer: Number(s?.reste_a_payer || 0),
                });
            } catch {
                setSituation(null);
            }
        };
        run();
    }, [data, normalizedType, token]);

    if (!normalizedType) {
        return (
            <div className="p-6">
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        Type de règlement invalide.
                    </CardContent>
                </Card>
            </div>
        );
    }

    const code = data
        ? buildReglementCode(
              normalizedType,
              data.id,
              data.date_reglement || data.created_at,
              (normalizedType === "client" || normalizedType === "client_gros") ? data.numero_recu : null,
              (data as any).sous_societe_nom,
              (data as any).numero_facture || (data as any).numero_commande
          )
        : "-";
    const extractedMotifs = useMemo(() => {
        if (!data?.commentaire) return [];
        // On conserve le statut selon le tag d'origine :
        // [IMPAYÉ] => source "Impayé"
        // [PAYÉ]   => source "Payé"
        const docLabel = data.numero_facture
            ? `Facture ${data.numero_facture}`
            : data.numero_commande
                ? `Commande ${data.numero_commande}`
                : "Document lié";

        const parseMs = (value: string | null | undefined) => {
            if (!value) return null;
            const normalized = String(value).replace(" ", "T");
            const ms = new Date(normalized).getTime();
            return Number.isFinite(ms) ? ms : null;
        };

        const formatAt = (ms: number | null) => {
            if (ms == null) return "-";
            return new Date(ms).toLocaleString("fr-FR");
        };

        const fallbackMs =
            parseMs(data.updated_at) ?? parseMs(data.approved_at) ?? parseMs(data.created_at) ?? null;

        const lines = data.commentaire
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        const items: Array<{
            id: number;
            label: string;
            comment: string;
            source: "Payé" | "Impayé" | "Commentaire";
            atMs: number | null;
            at: string;
            document: string;
        }> = [];

        for (const line of lines) {
            const match = line.match(
                /^\[(IMPAYÉ|IMPAYE|PAYÉ|PAYE)\]\s*(.*?)\s*(?:@\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}))?\s*$/i
            );
            if (!match) continue;

            const rawTag = String(match[1] || "");
            const rawMotif = String(match[2] || "").trim();
            const dateStr = match[3] ? String(match[3]).trim() : null;

            const atMs = dateStr ? parseMs(dateStr) : fallbackMs;
            const isPayeTag = /^\[(PAYÉ|PAYE)\]/i.test(line) || /^(PAYÉ|PAYE)$/i.test(rawTag);
            const isImpayTag = /^\[(IMPAYÉ|IMPAYE)\]/i.test(line) || /^(IMPAYÉ|IMPAYE)$/i.test(rawTag);

            const source: "Payé" | "Impayé" | "Commentaire" = (() => {
                if (isPayeTag) return "Payé";
                if (isImpayTag) {
                    return "Impayé";
                }
                return "Commentaire";
            })();

            items.push({
                id: items.length + 1,
                label: rawMotif || "Motif (non précisé)",
                comment: rawMotif || "",
                source,
                atMs,
                at: formatAt(atMs),
                document: docLabel,
            });
        }

        // Trie du plus récent au plus ancien.
        // Si aucune date n'est parsable, on utilise `id` comme proxy (dernier tag ajouté => id le plus élevé).
        return items.sort((a, b) => {
            const aMs = a.atMs ?? -1;
            const bMs = b.atMs ?? -1;
            if (bMs !== aMs) return bMs - aMs;
            // Tie-break: quand la date est manquante / non parsable,
            // on veut garder le "latest" en premier selon l'ordre d'apparition.
            return a.id - b.id;
        });
    }, [data?.commentaire, data?.statut, data?.numero_facture, data?.numero_commande, data?.updated_at, data?.approved_at, data?.created_at]);

    const latestMotif =
        extractedMotifs.length > 0
            ? extractedMotifs.reduce((best, m) => {
                  if (!best) return m;
                  const bestMs = best.atMs ?? -1;
                  const mMs = m.atMs ?? -1;
                  if (mMs !== bestMs) return mMs > bestMs ? m : best;
                  // Tie-break: keep the highest id.
                  return m.id > best.id ? m : best;
              }, null as (typeof extractedMotifs)[number] | null)
            : null;
    const topRightMotifSource = (() => {
        const normalizeStatus = (s: unknown) =>
            String(s || "")
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/\p{Diacritic}/gu, "");
        const statutNorm = normalizeStatus(data?.statut);
        if (statutNorm === "impaye") return "Impayé";
        if (statutNorm === "approuve" || statutNorm === "paye" || statutNorm === "payee" || statutNorm === "reglee") {
            return "Payé";
        }
        return latestMotif?.source ?? null;
    })();
    const topRightMotifBadgeClass =
        topRightMotifSource === "Payé"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            : topRightMotifSource === "Impayé"
                ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    const userComment = useMemo(() => {
        const raw = String(data?.commentaire || "");
        if (!raw.trim()) return "";
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !/^\[(IMPAYÉ|IMPAYE|PAYÉ|PAYE)\]\b/i.test(line))
            .join("\n")
            .trim();
    }, [data?.commentaire]);

    const movements = useMemo(() => {
        if (!data) return [];

        const docLabel = data.numero_facture
            ? `Facture ${data.numero_facture}`
            : data.numero_commande
                ? `Commande ${data.numero_commande}`
                : "Document lié";

        const parseMs = (value: string | null | undefined) => {
            if (!value) return null;
            const normalized = String(value).replace(" ", "T");
            const ms = new Date(normalized).getTime();
            return Number.isFinite(ms) ? ms : null;
        };

        const formatAt = (value: string | null | undefined) => {
            if (!value) return "-";
            const ms = parseMs(value);
            if (ms == null) return "-";
            return new Date(ms).toLocaleString("fr-FR");
        };

        type Movement = {
            title: string;
            by: string;
            at: string;
            atMs: number;
            icon: "clock" | "check";
            details?: string;
        };

        const list: Movement[] = [];

        const createdMs = parseMs(data.created_at);
        list.push({
            title: "Création du règlement",
            by: data.created_by_nom || "Utilisateur",
            at: formatAt(data.created_at),
            atMs: createdMs ?? 0,
            icon: "clock",
            details: docLabel,
        });

        const approvedMs = parseMs(data.approved_at);
        if (data.approved_by_nom) {
            list.push({
                title: "Validation / approbation",
                by: data.approved_by_nom,
                at: formatAt(data.approved_at),
                atMs: approvedMs ?? 0,
                icon: "check",
                details: docLabel,
            });
        }

        // Tags dans le champ commentaire :
        // - [IMPAYÉ] <motif> @ YYYY-MM-DD HH:mm:ss
        // - [PAYÉ] <motif> @ YYYY-MM-DD HH:mm:ss
        if (data.commentaire) {
            const lines = data.commentaire
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);

            for (const line of lines) {
                const impMatch = line.match(/^\[(IMPAYÉ|IMPAYE)\]\s*(.*?)\s*@\s*(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2})\s*$/i);
                if (impMatch) {
                    const motif = (impMatch[2] || "").trim();
                    const dateStr = impMatch[3];
                    const atMs = parseMs(dateStr) ?? (data.updated_at ? parseMs(data.updated_at) ?? 0 : 0);
                    list.push({
                        title: "Passage en impayé",
                        by: "Workflow règlement",
                        at: formatAt(dateStr),
                        atMs,
                        icon: "clock",
                        details: motif ? `Motif: ${motif} • ${docLabel}` : docLabel,
                    });
                    continue;
                }

                const payMatch = line.match(/^\[(PAYÉ|PAYE)\]\s*(.*?)\s*@\s*(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2})\s*$/i);
                if (payMatch) {
                    const motif = (payMatch[2] || "").trim();
                    const dateStr = payMatch[3];
                    const atMs = parseMs(dateStr) ?? (data.updated_at ? parseMs(data.updated_at) ?? 0 : 0);
                    list.push({
                        title: "Passage en payé",
                        by: "Workflow règlement",
                        at: formatAt(dateStr),
                        atMs,
                        icon: "check",
                        details: motif ? `Motif: ${motif} • ${docLabel}` : docLabel,
                    });
                    continue;
                }
            }
        }

        // Fallback si aucun tag de statut n'a été parsé
        if (list.filter((x) => x.title === "Passage en impayé").length === 0 && data.statut === "impaye") {
            list.push({
                title: "Passage en impayé",
                by: "Workflow règlement",
                at: formatAt(data.updated_at),
                atMs: parseMs(data.updated_at) ?? 0,
                icon: "clock",
                details: docLabel,
            });
        }

        if (list.filter((x) => x.title === "Passage en payé").length === 0 && data.statut === "approuve") {
            list.push({
                title: "Passage en payé",
                by: "Workflow règlement",
                at: formatAt(data.approved_at || data.updated_at),
                atMs: parseMs(data.approved_at || data.updated_at) ?? 0,
                icon: "check",
                details: docLabel,
            });
        }

        return list.sort((a, b) => b.atMs - a.atMs);
    }, [data]);

    const canPrintAndEmail = (normalizedType === "client" || normalizedType === "client_gros") && data?.statut === "approuve";
    const hasDocumentPdf = Boolean(uploadedPdfUrl);

    // Revoke old object URL to avoid memory leaks.
    useEffect(() => {
        return () => {
            if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
        };
         
    }, [pdfObjectUrl]);

    const blobToBase64 = (blob: Blob) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || "");
                const base64 = result.includes(",") ? result.split(",")[1] : result;
                resolve(base64);
            };
            reader.onerror = () => reject(new Error("FileReader error"));
            reader.readAsDataURL(blob);
        });

    const buildReceiptDataForClient = async (isCadeau = false): Promise<RecuPaiementData | null> => {
        if (normalizedType !== "client" && normalizedType !== "client_gros") return null;
        if (!data) return null;
        if (!token) return null;

        const isFacture = !!data.numero_facture;
        const isGros = normalizedType === "client_gros";
        const docType = isFacture ? (isGros ? "factures-gros" : "factures") : (isGros ? "commandes-gros" : "commandes");
        const docId = isFacture ? (isGros ? data.facture_gros_id : data.facture_id) : (isGros ? data.commande_gros_id : data.commande_id);
        const document_numero = isFacture ? data.numero_facture : data.numero_commande;

        if (!docId || !document_numero) return null;

        const designation = "";
        const poids = "";
        let prixTotal = 0;
        let resteAPayer = 0;
        let recuItems: RecuPaiementData["items"] = [];

        try {
            const [docRes, sitRes] = await Promise.all([
                fetch(`/api/${docType}/${docId}`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(
                    `${isGros ? "/api/reglements-clients-gros/situation" : "/api/reglements-clients/situation"}?${
                        isFacture ? "factureId=" + docId : "commandeId=" + docId
                    }`,
                    { headers: { Authorization: `Bearer ${token}` } }
                ),
            ]);

            if (docRes.ok) {
                const docData = await docRes.json();
                prixTotal = Number(docData.montant_ttc) || 0;
                if (docData.items && docData.items.length > 0) {
                    recuItems =
                        docData.items.map((it: any) => ({
                            designation: it.designation || "—",
                            type_or_silver: metalTypeLabelFromProductTypeName(it.product_type_name) ?? undefined,
                            quantite: Number(it.quantite) || undefined,
                            poids:
                                it.grammage != null && it.grammage !== ""
                                    ? `${it.grammage} G`
                                    : undefined,
                            montant_ht: Number(it.montant_ht) || 0,
                            image_url: it.photo ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(it.photo)}` : undefined,
                        })) || [];
                }
            }

            if (sitRes.ok) {
                const sitData = await sitRes.json();
                resteAPayer = Number(sitData.reste_a_payer) || 0;
            }
        } catch (e) {
            console.error(e);
            return null;
        }

        const initials = (data.client_nom || "CL")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase();
        const clientCode =
            data.client_id != null ? `${initials}${data.client_id}GT` : undefined;

        return {
            id: data.id,
            numero_recu: data.numero_recu ?? null,
            client_nom: data.client_nom || "Client",
            client_code: clientCode,
            document_type: isFacture ? "facture" : "commande",
            document_numero: document_numero,
            montant: Number(data.montant) || 0,
            date_reglement: data.date_reglement,
            mode_paiement: data.mode_paiement,
            banque_nom: data.banque_nom || null,
            items: recuItems && recuItems.length > 0 ? recuItems : undefined,
            designation: recuItems && recuItems.length === 0 ? designation : undefined,
            poids: recuItems && recuItems.length === 0 ? poids : undefined,
            prix_total: prixTotal,
            reste_a_payer: resteAPayer,
            is_cadeau: isCadeau,
        };
    };

    const generateReceiptBlob = async (isCadeau = false): Promise<Blob | null> => {
        const receiptData = await buildReceiptDataForClient(isCadeau);
        if (!receiptData) return null;
        const blob = await generateRecuPaiementPdf(receiptData, { output: "blob" });
        if (!blob || !(blob instanceof Blob)) return null;
        return blob;
    };

    const handleCopyLink = async () => {
        if (!canPrintAndEmail || !data) return;
        setIsProcessingPdf(true);
        try {
            const blob = await generateReceiptBlob();
            if (!blob) {
                toast.error("Impossible de générer le reçu");
                return;
            }
            const url = URL.createObjectURL(blob);
            if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
            setPdfObjectUrl(url);
            await navigator.clipboard.writeText(url);
            setIsLinkCopied(true);
            toast.success("Lien copié");
            setTimeout(() => setIsLinkCopied(false), 3000);
        } catch {
            toast.error("Echec de la copie du lien");
        } finally {
            setIsProcessingPdf(false);
        }
    };

    const handleUploadPdfChange = (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.target;
        const run = async () => {
            const file = input.files?.[0];
            if (!file || !data?.id || !token || (normalizedType !== "client" && normalizedType !== "client_gros")) return;
            if (file.type !== "application/pdf") {
                toast.error("Veuillez sélectionner un fichier PDF");
                return;
            }
            setIsProcessingPdf(true);
            try {
                const formData = new FormData();
                formData.append("pdf", file);
                const endpoint =
                    normalizedType === "client_gros"
                        ? `/api/reglements-clients-gros/${data.id}/pdf/upload`
                        : `/api/reglements-clients/${data.id}/pdf/upload`;
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                    toast.error(body?.message || "Erreur lors du téléversement du PDF");
                    return;
                }
                const nextPath = String(body?.pdf_path || "").trim();
                const base = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
                const nextUrl = nextPath
                    ? /^https?:\/\//i.test(nextPath)
                        ? nextPath
                        : `${base}/uploads/${encodeURIComponent(nextPath)}`
                    : null;
                setUploadedPdfUrl(nextUrl);
                setData((prev) => (prev ? { ...prev, pdf_path: nextPath || null } : prev));
                toast.success("PDF téléversé");
            } catch {
                toast.error("Erreur lors du téléversement du PDF");
            } finally {
                input.value = "";
                setIsProcessingPdf(false);
            }
        };
        run();
    };

    const handleViewPdf = async () => {
        if (uploadedPdfUrl) {
            window.open(uploadedPdfUrl, "_blank", "noopener,noreferrer");
            return;
        }
        toast.error("Aucun PDF disponible");
    };

    const handleSendEmail = async () => {
        if (!token) {
            toast.error("Session expirée. Veuillez vous reconnecter.");
            return;
        }
        if (!data) return;
        if (!emailData.to) {
            toast.error("Veuillez renseigner l'adresse email du destinataire.");
            return;
        }

        setIsSendingEmail(true);
        try {
            const blob = await generateReceiptBlob();
            if (!blob) {
                toast.error("Impossible de générer le reçu");
                return;
            }
            const pdfBase64 = await blobToBase64(blob);
            const safeNumero = String(data.numero_facture || data.numero_commande || data.id);
            const filename = `Recu_Paiement_${safeNumero}.pdf`;

            const endpoint = normalizedType === "client_gros" ? `/api/reglements-clients-gros/${data.id}/send-email` : `/api/reglements-clients/${data.id}/send-email`;
            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...emailData,
                    pdfBase64,
                    filename,
                }),
            });

            if (res.ok) {
                toast.success("Email envoyé avec succès");
                setIsEmailModalOpen(false);
            } else {
                const body = await res.json().catch(() => ({}));
                toast.error(body.message || "Erreur lors de l'envoi de l'email");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setIsSendingEmail(false);
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Banknote className="h-6 w-6 text-emerald-600" />
                            Détail règlement {normalizedType === "fournisseur" ? "fournisseur" : normalizedType === "client_gros" ? "client gros" : "client"}
                        </h1>
                        <p className="text-sm text-muted-foreground">Code unique: {code}</p>
                    </div>
                </div>
                {(normalizedType === "client" || normalizedType === "client_gros") && data && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant="outline"
                            onClick={handleCopyLink}
                            disabled={!canPrintAndEmail || isProcessingPdf}
                            className="gap-2 h-11 px-5 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                        >
                            {isProcessingPdf ? (
                                <RefreshCcw className="h-4 w-4 animate-spin" />
                            ) : isLinkCopied ? (
                                <Check className="h-4 w-4" />
                            ) : (
                                <LinkIcon className="h-4 w-4" />
                            )}
                            {isLinkCopied ? "Lien copié!" : "Générer lien"}
                        </Button>

                        {normalizedType === "client" && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (!data) return;
                                    setEmailData({
                                        to: "",
                                        subject: `Reçu de paiement - ${data.numero_facture || data.numero_commande || "#" + data.id}`,
                                        message: "",
                                    });
                                    setIsEmailModalOpen(true);
                                }}
                                disabled={!canPrintAndEmail || isProcessingPdf}
                                className="gap-2 h-11 px-5 font-bold rounded-xl shadow-sm transition-all active:scale-95"
                                title={!canPrintAndEmail ? "Envoi disponible après approbation" : undefined}
                            >
                                <Mail className="h-4 w-4" />
                                Envoyer par Email
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {isLoading ? (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        Chargement...
                    </CardContent>
                </Card>
            ) : !data ? (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        Aucune donnée trouvée pour ce règlement.
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <Card className="lg:col-span-2">
                            <CardHeader>
                                <CardTitle>Informations générales</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">Date règlement</span>
                                    <span className="font-semibold">
                                        {new Date(data.date_reglement).toLocaleDateString("fr-FR")}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">Montant</span>
                                    <span className="font-semibold">
                                        {Number(data.montant || 0).toLocaleString("fr-FR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{" "}
                                        MAD
                                    </span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">Mode</span>
                                    <span className="font-semibold capitalize">{data.mode_paiement || "-"}</span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">Banque</span>
                                    <span className="font-semibold">{data.banque_nom || "-"}</span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">Statut</span>
                                    <Badge variant="outline" className={`capitalize ${topRightMotifBadgeClass}`}>
                                        {data.statut}
                                    </Badge>
                                </div>
                                {userComment && (
                                    <div className="space-y-1">
                                        <span className="text-muted-foreground">Commentaire saisi</span>
                                        <p className="text-sm font-medium whitespace-pre-wrap break-words">
                                            {userComment}
                                        </p>
                                    </div>
                                )}
                                {situation && (
                                    <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                                        <div className="flex justify-between gap-3 text-xs">
                                            <span className="text-muted-foreground">Montant document</span>
                                            <span className="font-semibold">{situation.montant_ttc.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span>
                                        </div>
                                        <div className="flex justify-between gap-3 text-xs">
                                            <span className="text-muted-foreground">Total réglé</span>
                                            <span className="font-semibold text-emerald-600">{situation.total_regle.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span>
                                        </div>
                                        <div className="flex justify-between gap-3 text-xs">
                                            <span className="text-muted-foreground">Reste à payer</span>
                                            <span className={`font-semibold ${situation.reste_a_payer > 0.01 ? "text-amber-600" : "text-emerald-600"}`}>
                                                {situation.reste_a_payer.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                                            </span>
                                        </div>
                                    </div>
                                )}
                             
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Liens document</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                {normalizedType === "client" || normalizedType === "client_gros" ? (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            <span>{data.client_nom || "-"}</span>
                                        </div>
                                        {data.numero_facture && (
                                            <Button
                                                variant="outline"
                                                className="w-full justify-start"
                                                onClick={() =>
                                                    (normalizedType === "client_gros" ? data.facture_gros_id : data.facture_id)
                                                        ? navigate(normalizedType === "client_gros" ? `/dashboard/factures-gros/${data.facture_gros_id}` : `/dashboard/factures/${data.facture_id}`)
                                                        : navigate(normalizedType === "client_gros" ? "/dashboard/factures-gros" : "/dashboard/factures")
                                                }
                                            >
                                                <FileText className="h-4 w-4 mr-2" />
                                                {data.numero_facture}
                                            </Button>
                                        )}
                                        {!data.numero_facture && linkedFactureFromCommande && (
                                            <Button
                                                variant="outline"
                                                className="w-full justify-start"
                                                onClick={() => navigate(normalizedType === "client_gros" ? `/dashboard/factures-gros/${linkedFactureFromCommande.id}` : `/dashboard/factures/${linkedFactureFromCommande.id}`)}
                                            >
                                                <FileText className="h-4 w-4 mr-2" />
                                                {linkedFactureFromCommande.numero_facture ||
                                                    `Facture #${linkedFactureFromCommande.id}`}
                                            </Button>
                                        )}
                                        {data.numero_commande && (
                                            <Button
                                                variant="outline"
                                                className="w-full justify-start"
                                                onClick={() =>
                                                    (normalizedType === "client_gros" ? data.commande_gros_id : data.commande_id)
                                                        ? navigate(normalizedType === "client_gros" ? `/dashboard/commandes-gros/${data.commande_gros_id}` : `/dashboard/commandes/${data.commande_id}`)
                                                        : navigate(normalizedType === "client_gros" ? "/dashboard/commandes-gros" : "/dashboard/commandes")
                                                }
                                            >
                                                <FileText className="h-4 w-4 mr-2" />
                                                {data.numero_commande}
                                            </Button>
                                        )}
                                        {hasDocumentPdf ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full justify-start"
                                                onClick={handleViewPdf}
                                                disabled={isProcessingPdf}
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                                Voir le reçu original
                                            </Button>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Upload className="h-4 w-4" />
                                                    <span>Téléverser le reçu original</span>
                                                </div>
                                                <Input
                                                    ref={uploadInputRef}
                                                    type="file"
                                                    accept="application/pdf"
                                                    onChange={handleUploadPdfChange}
                                                    disabled={isProcessingPdf}
                                                />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <Truck className="h-4 w-4 text-muted-foreground" />
                                            <span>{data.fournisseur_nom || "-"}</span>
                                        </div>
                                        <div className="text-muted-foreground">
                                            Achat: <span className="text-foreground">{data.achat_designation || "-"}</span>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Historique des règlements</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            {movements.map((m, idx) => (
                                <div key={idx} className="flex items-start gap-3">
                                    {m.icon === "check" ? (
                                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600" />
                                    ) : (
                                        <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                    )}
                                    <div>
                                        <p className="font-semibold">{m.title}</p>
                                        <p className="text-muted-foreground">
                                            {m.by} • {m.at}
                                            {m.details ? ` • ${m.details}` : ""}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {movements.length === 0 && (
                                <p className="text-muted-foreground">Aucun mouvement enregistré.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Tous mouvements liés aux règlements</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border">
                                <span className="text-muted-foreground">Code règlement</span>
                                <span className="font-semibold">{code}</span>
                            </div>
                            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border">
                                <span className="text-muted-foreground">Dernière mise à jour</span>
                                <span className="font-semibold">
                                    {data.updated_at ? new Date(data.updated_at).toLocaleString("fr-FR") : "-"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border">
                                <span className="text-muted-foreground">Statut actuel</span>
                                <Badge variant="outline" className="capitalize">
                                    {data.statut || "-"}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {normalizedType === "client" && data && (
                <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-indigo-600">
                                <Mail className="h-5 w-5" />
                                Envoyer le reçu par email
                            </DialogTitle>
                            <DialogDescription>
                                Le PDF sera généré automatiquement et joint à l'email.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="to">
                                    Email du destinataire <span className="text-red-500">*</span>
                                </Label>
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
                        </div>

                        <DialogFooter className="sm:justify-between">
                            <Button variant="ghost" onClick={() => setIsEmailModalOpen(false)} disabled={isSendingEmail}>
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
            )}
        </div>
    );
}
