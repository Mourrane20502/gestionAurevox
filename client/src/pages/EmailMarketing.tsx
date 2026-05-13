import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Textarea } from "@/components/common/ui/textarea";
import { toast } from "sonner";
import { Users, Send, LayoutTemplate, Sparkles, CheckCircle2, Wand2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type TemplateType = "simple" | "medium" | "newsletter";
type TargetMode = "all" | "specific";

interface ClientItem {
    id: number;
    nom_complet: string;
    email?: string | null;
}

const TEMPLATE_LABELS: Record<TemplateType, string> = {
    simple: "Simple",
    medium: "Medium",
    newsletter: "Newsletter",
};

const DEFAULT_CONTENT: Record<TemplateType, { intro: string; body: string; ctaText: string; ctaUrl: string }> = {
    simple: {
        intro: "Bonjour, nous avons une nouveauté à vous partager.",
        body: "Profitez d'une offre exclusive pendant une durée limitée.",
        ctaText: "Découvrir l'offre",
        ctaUrl: "https://votre-site.com",
    },
    medium: {
        intro: "Découvrez nos dernières sélections bijouterie.",
        body: "Cette semaine, nous mettons en avant des pièces élégantes avec des remises spéciales.",
        ctaText: "Voir la collection",
        ctaUrl: "https://votre-site.com/collection",
    },
    newsletter: {
        intro: "Votre newsletter mensuelle est arrivée.",
        body: "Retrouvez nos nouveautés, conseils, tendances et offres personnalisées.",
        ctaText: "Lire la newsletter",
        ctaUrl: "https://votre-site.com/newsletter",
    },
};

function buildTemplateHtml(
    template: TemplateType,
    subject: string,
    intro: string,
    body: string,
    ctaText: string,
    ctaUrl: string,
    imageUrl: string
) {
    const heading = subject || "Newsletter";
    const imageBlock = imageUrl
        ? `<img src="${imageUrl}" alt="Visuel" style="width:100%;max-width:600px;border-radius:12px;margin:12px 0;" />`
        : "";

    if (template === "simple") {
        return `
            <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;color:#111827;">
              <h1 style="font-size:24px;margin:0 0 12px;">${heading}</h1>
              <p style="font-size:15px;line-height:1.6;">${intro}</p>
              ${imageBlock}
              <p style="font-size:14px;line-height:1.6;">${body}</p>
              <a href="${ctaUrl}" style="display:inline-block;margin-top:12px;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;">${ctaText}</a>
            </div>
        `;
    }

    if (template === "medium") {
        return `
            <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
              <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
                <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:20px 24px;">
                  <h1 style="margin:0;font-size:24px;">${heading}</h1>
                  <p style="margin:10px 0 0;font-size:14px;opacity:.95;">${intro}</p>
                </div>
                <div style="padding:20px 24px;">
                  ${imageBlock}
                  <p style="font-size:14px;line-height:1.7;color:#111827;">${body}</p>
                  <a href="${ctaUrl}" style="display:inline-block;margin-top:10px;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;">${ctaText}</a>
                </div>
              </div>
            </div>
        `;
    }

    return `
        <div style="font-family:Arial,sans-serif;background:#eef2ff;padding:28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbeafe;">
            <tr>
              <td style="padding:24px;background:#1e293b;color:#fff;">
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Newsletter</div>
                <h1 style="margin:8px 0 0;font-size:28px;">${heading}</h1>
              </td>
            </tr>
            <tr><td style="padding:20px 24px 8px;"><p style="margin:0;font-size:14px;line-height:1.6;">${intro}</p></td></tr>
            <tr><td style="padding:0 24px;">${imageBlock}</td></tr>
            <tr><td style="padding:8px 24px 20px;"><p style="margin:0;font-size:14px;line-height:1.7;">${body}</p></td></tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;">${ctaText}</a>
              </td>
            </tr>
          </table>
        </div>
    `;
}

export default function EmailMarketing() {
    const token = localStorage.getItem("token");
    const [clients, setClients] = useState<ClientItem[]>([]);
    const [loadingClients, setLoadingClients] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const [template, setTemplate] = useState<TemplateType>("simple");
    const [subject, setSubject] = useState("Nouveautés  Gestion ERP");
    const [intro, setIntro] = useState(DEFAULT_CONTENT.simple.intro);
    const [body, setBody] = useState(DEFAULT_CONTENT.simple.body);
    const [ctaText, setCtaText] = useState(DEFAULT_CONTENT.simple.ctaText);
    const [ctaUrl, setCtaUrl] = useState(DEFAULT_CONTENT.simple.ctaUrl);
    const [imageUrl, setImageUrl] = useState("");
    const [customHtml, setCustomHtml] = useState("");
    const [useCustomHtml, setUseCustomHtml] = useState(false);

    const [targetMode, setTargetMode] = useState<TargetMode>("all");
    const [searchClient, setSearchClient] = useState("");
    const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);

    useEffect(() => {
        const loadClients = async () => {
            if (!token) return;
            setLoadingClients(true);
            try {
                const res = await fetch("/api/clients", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("Impossible de charger les clients");
                const data = await res.json();
                setClients(Array.isArray(data) ? data : []);
            } catch (error: any) {
                toast.error(error?.message || "Erreur lors du chargement des clients");
            } finally {
                setLoadingClients(false);
            }
        };
        loadClients();
    }, [token]);

    const filteredClients = useMemo(() => {
        const term = searchClient.trim().toLowerCase();
        return clients
            .filter((c) => c.email && c.email.trim())
            .filter((c) =>
                !term ||
                c.nom_complet?.toLowerCase().includes(term) ||
                String(c.email || "").toLowerCase().includes(term)
            );
    }, [clients, searchClient]);

    const generatedHtml = useMemo(
        () => buildTemplateHtml(template, subject, intro, body, ctaText, ctaUrl, imageUrl),
        [template, subject, intro, body, ctaText, ctaUrl, imageUrl]
    );

    const finalHtml = useMemo(
        () => (useCustomHtml ? customHtml : generatedHtml),
        [useCustomHtml, customHtml, generatedHtml]
    );
    const selectedCount = selectedClientIds.length;
    const allReachableCount = useMemo(
        () => clients.filter((c) => c.email && c.email.trim()).length,
        [clients]
    );

    const toggleClient = (id: number) => {
        setSelectedClientIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const applyTemplate = (nextTemplate: TemplateType) => {
        setTemplate(nextTemplate);
        setIntro(DEFAULT_CONTENT[nextTemplate].intro);
        setBody(DEFAULT_CONTENT[nextTemplate].body);
        setCtaText(DEFAULT_CONTENT[nextTemplate].ctaText);
        setCtaUrl(DEFAULT_CONTENT[nextTemplate].ctaUrl);
    };

    const handleSend = async () => {
        if (!token) return;
        if (!subject.trim()) {
            toast.error("Ajoutez un sujet");
            return;
        }
        if (!finalHtml.trim()) {
            toast.error("Ajoutez du contenu HTML");
            return;
        }
        if (targetMode === "specific" && selectedClientIds.length === 0) {
            toast.error("Sélectionnez au moins un client");
            return;
        }

        setIsSending(true);
        const sendingToast = toast.loading("Envoi de la campagne en cours...");
        try {
            const res = await fetch("/api/clients/newsletter/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    subject,
                    html: finalHtml,
                    target: targetMode,
                    client_ids: targetMode === "specific" ? selectedClientIds : [],
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || "Échec de l'envoi de la campagne");
            }
            toast.success(`Campagne envoyée (${data.sent_count || 0} destinataire(s))`, { id: sendingToast });
        } catch (error: any) {
            toast.error(error?.message || "Erreur d'envoi", { id: sendingToast });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="space-y-6 lg:space-y-8">
            <Card className="relative overflow-hidden rounded-3xl border border-indigo-200/40 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_white,_transparent_60%)] opacity-20" />
                <CardContent className="relative p-6 md:p-8">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
                                <Sparkles className="h-3.5 w-3.5" />
                                Campaign Builder
                            </div>
                            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Email Marketing Studio</h1>
                            <p className="max-w-2xl text-sm text-indigo-100">
                                Créez une newsletter professionnelle, personnalisez le contenu et envoyez-la en masse
                                en quelques étapes.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                            <div className="min-w-[120px] rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">Templates</div>
                                <div className="text-xl font-black">3</div>
                            </div>
                            <div className="min-w-[120px] rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">Clients email</div>
                                <div className="text-xl font-black">{allReachableCount}</div>
                            </div>
                            <div className="min-w-[120px] rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">Cible active</div>
                                <div className="text-xl font-black">
                                    {targetMode === "all" ? allReachableCount : selectedCount}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="space-y-6 xl:col-span-7">
                    <Card className="rounded-3xl border border-border/70 shadow-sm">
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2 text-lg font-black">
                                <LayoutTemplate className="h-5 w-5 text-indigo-600" />
                                1. Choisir un modèle
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                {(["simple", "medium", "newsletter"] as TemplateType[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => applyTemplate(t)}
                                        className={cn(
                                            "rounded-2xl border px-4 py-4 text-left transition-all",
                                            template === t
                                                ? "border-indigo-500 bg-indigo-50 shadow-sm dark:bg-indigo-950/40"
                                                : "border-border hover:border-indigo-300 hover:bg-muted/30"
                                        )}
                                    >
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-sm font-bold">{TEMPLATE_LABELS[t]}</span>
                                            {template === t && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {t === "simple" && "Rapide et minimal"}
                                            {t === "medium" && "Équilibré et élégant"}
                                            {t === "newsletter" && "Complet et éditorial"}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-3xl border border-border/70 shadow-sm">
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2 text-lg font-black">
                                <Wand2 className="h-5 w-5 text-indigo-600" />
                                2. Éditer le contenu
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sujet</Label>
                                <Input
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Intro</Label>
                                    <Textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={5} className="rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Corps</Label>
                                    <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="rounded-xl" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Texte bouton</Label>
                                    <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} className="rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL bouton</Label>
                                    <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} className="rounded-xl" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Image (URL)</Label>
                                <Input
                                    placeholder="https://..."
                                    value={imageUrl}
                                    onChange={(e) => setImageUrl(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>

                            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                <label className="inline-flex items-center gap-2 text-sm font-medium">
                                    <input
                                        type="checkbox"
                                        checked={useCustomHtml}
                                        onChange={(e) => setUseCustomHtml(e.target.checked)}
                                    />
                                    Personnalisation avancée (HTML libre)
                                </label>
                                {useCustomHtml && (
                                    <Textarea
                                        value={customHtml}
                                        onChange={(e) => setCustomHtml(e.target.value)}
                                        rows={12}
                                        className="mt-3 rounded-xl font-mono text-xs"
                                        placeholder="<html>...</html>"
                                    />
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6 xl:col-span-5">
                    <Card className="rounded-3xl border border-border/70 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base font-black">
                                <Users className="h-4 w-4 text-indigo-600" />
                                3. Ciblage d'audience
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTargetMode("all")}
                                    className={cn(
                                        "rounded-xl border px-3 py-2 text-sm font-semibold transition-all",
                                        targetMode === "all"
                                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                                            : "border-border hover:bg-muted/40"
                                    )}
                                >
                                    Tous les clients
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetMode("specific")}
                                    className={cn(
                                        "rounded-xl border px-3 py-2 text-sm font-semibold transition-all",
                                        targetMode === "specific"
                                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                                            : "border-border hover:bg-muted/40"
                                    )}
                                >
                                    Clients spécifiques
                                </button>
                            </div>

                            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                Audience estimée :{" "}
                                <span className="font-bold text-foreground">
                                    {targetMode === "all" ? allReachableCount : selectedCount}
                                </span>{" "}
                                destinataire(s)
                            </div>

                            {targetMode === "specific" && (
                                <div className="space-y-2">
                                    <Input
                                        placeholder="Rechercher client ou email..."
                                        value={searchClient}
                                        onChange={(e) => setSearchClient(e.target.value)}
                                        className="rounded-xl"
                                    />
                                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border/70 p-2">
                                        {loadingClients ? (
                                            <div className="p-2 text-xs text-muted-foreground">Chargement...</div>
                                        ) : filteredClients.length === 0 ? (
                                            <div className="p-2 text-xs text-muted-foreground">Aucun client trouvé.</div>
                                        ) : (
                                            filteredClients.map((client) => (
                                                <label
                                                    key={client.id}
                                                    className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-muted/50"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedClientIds.includes(client.id)}
                                                        onChange={() => toggleClient(client.id)}
                                                    />
                                                    <span className="leading-tight">
                                                        <span className="font-medium">{client.nom_complet}</span>
                                                        <span className="block text-xs text-muted-foreground">{client.email}</span>
                                                    </span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="rounded-3xl border border-border/70 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base font-black">
                                <Eye className="h-4 w-4 text-indigo-600" />
                                Aperçu live
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="h-[360px] overflow-hidden rounded-xl border border-border/70 bg-white">
                                <iframe title="preview-newsletter" srcDoc={finalHtml} className="h-full w-full" />
                            </div>

                            <Button
                                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700"
                                onClick={handleSend}
                                disabled={isSending}
                            >
                                <Send className="mr-2 h-4 w-4" />
                                {isSending ? "Envoi en cours..." : "4. Envoyer la campagne"}
                            </Button>
                            <p className="text-center text-[11px] text-muted-foreground">
                                Vérifiez l’aperçu avant l’envoi massif.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
