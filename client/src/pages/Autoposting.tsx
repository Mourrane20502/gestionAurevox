import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Textarea } from "@/components/common/ui/textarea";
import { Badge } from "@/components/common/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/common/ui/alert-dialog";
import { toast } from "sonner";
import { CalendarClock, Clock3, Send, RefreshCw, Trash2, Sparkles, ImageIcon, CheckCircle2, AlertTriangle, Layers3, Loader2, Wand2, Hash, Copy, Eye, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

type Platform = "tiktok" | "facebook" | "instagram";
type PostStatus = "scheduled" | "processing" | "published" | "partial" | "failed" | "cancelled";

interface Autopost {
    id: number;
    content: string;
    media_url: string | null;
    scheduled_for: string;
    status: PostStatus;
    published_at: string | null;
    created_at: string;
    last_error: string | null;
    platforms: Platform[];
    platform_results?: Record<string, { success: boolean; error?: string; external_id?: string }> | null;
}

interface PlatformConfigStatus {
    facebook: {
        page_id: string | null;
        api_version: string;
        api_url: string;
        has_access_token: boolean;
        ready: boolean;
        missing: string[];
    };
}

const PLATFORM_LABELS: Record<Platform, string> = {
    tiktok: "TikTok",
    facebook: "Facebook",
    instagram: "Instagram",
};

const statusClassMap: Record<PostStatus, string> = {
    scheduled: "bg-indigo-100 text-indigo-700 border-indigo-200",
    processing: "bg-amber-100 text-amber-700 border-amber-200",
    published: "bg-emerald-100 text-emerald-700 border-emerald-200",
    partial: "bg-orange-100 text-orange-700 border-orange-200",
    failed: "bg-rose-100 text-rose-700 border-rose-200",
    cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

const formatStatus = (status: PostStatus) => {
    switch (status) {
        case "scheduled":
            return "Planifie";
        case "processing":
            return "En cours";
        case "published":
            return "Publie";
        case "partial":
            return "Partiel";
        case "failed":
            return "Echec";
        case "cancelled":
            return "Annule";
        default:
            return status;
    }
};

const toInputDateTime = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function Autoposting() {
    const [items, setItems] = useState<Autopost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [content, setContent] = useState("");
    const [mediaUrl, setMediaUrl] = useState("");
    const [mediaFileName, setMediaFileName] = useState<string | null>(null);
    const [scheduledFor, setScheduledFor] = useState(() => {
        const d = new Date();
        d.setMinutes(d.getMinutes() + 15);
        return toInputDateTime(d);
    });
    const [selectedPlatforms, setSelectedPlatforms] = useState<Record<Platform, boolean>>({
        tiktok: false,
        facebook: true,
        instagram: false,
    });
    const [platformConfig, setPlatformConfig] = useState<PlatformConfigStatus | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [showMediaPreview, setShowMediaPreview] = useState(true);
    const [aiTopic, setAiTopic] = useState("");
    const [aiTone, setAiTone] = useState("professionnel");
    const [aiGoal, setAiGoal] = useState("promotion");
    const [isAiWorking, setIsAiWorking] = useState(false);
    const [aiVariants, setAiVariants] = useState<string[]>([]);
    const [aiHashtags, setAiHashtags] = useState<string[]>([]);

    const token = localStorage.getItem("token");

    const selectedPlatformList = useMemo(
        () => (Object.entries(selectedPlatforms)
            .filter(([, checked]) => checked)
            .map(([platform]) => platform) as Platform[]),
        [selectedPlatforms]
    );

    const fetchItems = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const res = await fetch("/api/autoposts", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Impossible de charger les autoposts");
            const data = await res.json();
            setItems(Array.isArray(data) ? data : []);
        } catch (err: any) {
            toast.error(err.message || "Erreur de chargement");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPlatformConfig = async () => {
        if (!token) return;
        try {
            const res = await fetch("/api/autoposts/config-status", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Impossible de verifier la configuration");
            const data = await res.json();
            setPlatformConfig(data);
        } catch {
            setPlatformConfig(null);
        }
    };

    useEffect(() => {
        fetchItems();
        fetchPlatformConfig();
    }, []);

    const togglePlatform = (platform: Platform) => {
        setSelectedPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));
    };

    const resetForm = () => {
        setContent("");
        setMediaUrl("");
        const d = new Date();
        d.setMinutes(d.getMinutes() + 15);
        setScheduledFor(toInputDateTime(d));
        setSelectedPlatforms({ tiktok: false, facebook: true, instagram: false });
    };

    const submitAutopost = async (scheduledIso: string, loadingLabel: string, successLabel: string) => {
        if (!token) return;
        if (!content.trim()) {
            toast.error("Renseignez le contenu du post");
            return;
        }
        if (selectedPlatformList.length === 0) {
            toast.error("Selectionnez au moins une plateforme");
            return;
        }
        if (selectedPlatformList.includes("facebook") && platformConfig && !platformConfig.facebook.ready) {
            toast.error("Configuration Facebook manquante (FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN)");
            return;
        }

        const planningToastId = toast.loading(loadingLabel);
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/autoposts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    content,
                    media_url: mediaUrl || null,
                    scheduled_for: scheduledIso,
                    platforms: selectedPlatformList,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || "Echec de creation de l'autopost");
            }

            toast.success(successLabel, { id: planningToastId });
            resetForm();
            fetchItems();
        } catch (err: any) {
            toast.error(err.message || "Erreur serveur", { id: planningToastId });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreate = async () => {
        await submitAutopost(
            new Date(scheduledFor).toISOString(),
            "Planification en cours...",
            "Autopost planifie avec succes"
        );
    };

    const handlePublishNow = async () => {
        await submitAutopost(
            new Date().toISOString(),
            "Publication immediate en cours...",
            "Post envoye avec succes"
        );
    };

    const handleCancel = async (id: number) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/autoposts/${id}/cancel`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Echec annulation");
            toast.success("Autopost annule");
            fetchItems();
        } catch (err: any) {
            toast.error(err.message || "Erreur serveur");
        }
    };

    const handleDelete = async (id: number) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/autoposts/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Echec suppression");
            toast.success("Autopost supprime");
            fetchItems();
        } catch (err: any) {
            toast.error(err.message || "Erreur serveur");
        } finally {
            setDeleteTargetId(null);
        }
    };

    const handleMediaUpload = async (file: File | null) => {
        setMediaFileName(file?.name ?? null);
        setShowMediaPreview(true);
        if (!file || !token) return;
        const isImage = file.type.startsWith("image/");
        if (!isImage) {
            toast.error("Veuillez selectionner une image valide");
            return;
        }

        const formData = new FormData();
        formData.append("media", file);

        setIsUploadingMedia(true);
        const uploadToastId = toast.loading("Upload image en cours...");
        try {
            const res = await fetch("/api/autoposts/upload-media", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.media_url) {
                throw new Error(data.message || "Echec upload image");
            }
            setMediaUrl(data.media_url);
            toast.success("Image uploadée avec succes", { id: uploadToastId });
        } catch (err: any) {
            toast.error(err.message || "Erreur upload image", { id: uploadToastId });
        } finally {
            setIsUploadingMedia(false);
        }
    };

    const buildFallbackCaption = () => {
        const topic = aiTopic.trim() || "notre collection";
        const toneMap: Record<string, string> = {
            professionnel: "Découvrez",
            amical: "On vous présente",
            premium: "Laissez-vous séduire par",
            dynamique: "Nouveau :",
        };
        const intro = toneMap[aiTone] || "Découvrez";
        return `${intro} ${topic}. ${aiGoal === "promotion"
            ? "Profitez de notre offre du moment en boutique."
            : aiGoal === "engagement"
                ? "Dites-nous en commentaire ce que vous en pensez."
                : "Restez connectés pour la suite."}`;
    };

    const parseHashtags = (text: string) => {
        const tags = Array.from(new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.trim())));
        return tags.slice(0, 12);
    };

    const generateTextWithAi = async () => {
        if (!token) return;
        setIsAiWorking(true);
        try {
            const res = await fetch("/api/autoposts/ai-assist", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    task: "caption",
                    topic: aiTopic,
                    tone: aiTone,
                    goal: aiGoal,
                    content,
                    platforms: selectedPlatformList,
                }),
            });
            const data = await res.json().catch(() => ({}));
            const answer = String(data?.text || "").trim();
            const generated = answer && answer.length > 20 ? answer.replace(/\*\*/g, "") : buildFallbackCaption();
            setContent(generated);
            toast.success("Caption générée");
        } catch {
            setContent(buildFallbackCaption());
            toast.success("Caption générée (mode local)");
        } finally {
            setIsAiWorking(false);
        }
    };

    const generateHashtagsWithAi = async () => {
        if (!token) return;
        setIsAiWorking(true);
        try {
            const res = await fetch("/api/autoposts/ai-assist", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    task: "hashtags",
                    topic: aiTopic,
                    tone: aiTone,
                    goal: aiGoal,
                    content,
                    platforms: selectedPlatformList,
                }),
            });
            const data = await res.json().catch(() => ({}));
            const answer = String(data?.text || "");
            const tags = parseHashtags(answer);
            const fallback = ["#bijouterie", "#bijoux", "#style", "#elegance", "#mode", "#tendance"];
            setAiHashtags(tags.length ? tags : fallback);
            toast.success("Hashtags proposés");
        } catch {
            setAiHashtags(["#bijouterie", "#bijoux", "#style", "#elegance", "#mode", "#tendance"]);
            toast.success("Hashtags proposés (mode local)");
        } finally {
            setIsAiWorking(false);
        }
    };

    const generateVariantsWithAi = async () => {
        if (!token) return;
        setIsAiWorking(true);
        try {
            const res = await fetch("/api/autoposts/ai-assist", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    task: "variants",
                    topic: aiTopic,
                    tone: aiTone,
                    goal: aiGoal,
                    content,
                    platforms: selectedPlatformList,
                }),
            });
            const data = await res.json().catch(() => ({}));
            const answer = String(data?.text || "");
            const variants = answer
                .split(/\n+/)
                .map((l) => l.replace(/^\s*[\d\-\*\)\.]+\s*/, "").trim())
                .filter((l) => l.length > 20)
                .slice(0, 3);
            setAiVariants(
                variants.length
                    ? variants
                    : [
                        `${buildFallbackCaption()} #1`,
                        `${buildFallbackCaption()} #2`,
                        `${buildFallbackCaption()} #3`,
                    ]
            );
            toast.success("Variantes générées");
        } catch {
            setAiVariants([
                `${buildFallbackCaption()} #1`,
                `${buildFallbackCaption()} #2`,
                `${buildFallbackCaption()} #3`,
            ]);
            toast.success("Variantes générées (mode local)");
        } finally {
            setIsAiWorking(false);
        }
    };

    const stats = useMemo(() => {
        const scheduled = items.filter((i) => i.status === "scheduled").length;
        const published = items.filter((i) => i.status === "published").length;
        const failed = items.filter((i) => i.status === "failed").length;
        return { total: items.length, scheduled, published, failed };
    }, [items]);

    const canPreviewImage = useMemo(() => {
        if (!mediaUrl) return false;
        return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(mediaUrl) || mediaUrl.includes("/uploads/");
    }, [mediaUrl]);

    return (
        <div className="space-y-6 lg:space-y-8">
            <Card className="relative overflow-hidden rounded-3xl border border-indigo-200/40 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white shadow-2xl">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_white,_transparent_55%)]" />
                <CardContent className="relative p-6 md:p-8">
                    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-[11px] font-bold uppercase tracking-wider">
                                <Sparkles className="h-3.5 w-3.5" />
                                Social Automation
                            </div>
                            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Autoposting Center</h1>
                            <p className="text-sm text-indigo-100 max-w-2xl">
                                Gérez vos publications planifiées avec une vue claire, moderne et centralisée.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full xl:w-auto">
                            <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3 min-w-[120px]">
                                <div className="text-[10px] uppercase tracking-wider text-indigo-100 font-bold">Total</div>
                                <div className="text-xl font-black">{stats.total}</div>
                            </div>
                            <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3 min-w-[120px]">
                                <div className="text-[10px] uppercase tracking-wider text-indigo-100 font-bold">Planifies</div>
                                <div className="text-xl font-black">{stats.scheduled}</div>
                            </div>
                            <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3 min-w-[120px]">
                                <div className="text-[10px] uppercase tracking-wider text-indigo-100 font-bold">Publies</div>
                                <div className="text-xl font-black">{stats.published}</div>
                            </div>
                            <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3 min-w-[120px]">
                                <div className="text-[10px] uppercase tracking-wider text-indigo-100 font-bold">Echecs</div>
                                <div className="text-xl font-black">{stats.failed}</div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <Card className="xl:col-span-8 rounded-3xl border border-border/70 shadow-sm">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-xl font-black">
                            <Layers3 className="h-5 w-5 text-indigo-600" />
                            Nouveau post programme
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contenu du post</Label>
                                <span className="text-[10px] font-bold text-muted-foreground">{content.trim().length} caractere(s)</span>
                            </div>
                            <Textarea
                                placeholder="Ecrivez votre post ici..."
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={8}
                                className="rounded-2xl border-border/70 focus-visible:ring-indigo-500"
                            />
                        </div>
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between gap-3">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                    <ImageIcon className="h-3.5 w-3.5" />
                                    Media image
                                </Label>
                                <span className="text-[10px] font-bold text-muted-foreground">
                                    {mediaFileName ? `Fichier: ${mediaFileName}` : mediaUrl ? "Image prête" : "Optionnel"}
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                <label
                                    className={cn(
                                        "inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-semibold cursor-pointer transition-colors",
                                        isUploadingMedia ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/50"
                                    )}
                                >
                                    <ImageIcon className="h-4 w-4 text-indigo-600" />
                                    Choisir une image
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={(e) =>
                                            handleMediaUpload(e.target.files?.[0] || null)
                                        }
                                        disabled={isUploadingMedia}
                                    />
                                </label>

                                {isUploadingMedia && (
                                    <span className="inline-flex items-center gap-2 text-[11px] text-indigo-600">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Upload en cours...
                                    </span>
                                )}
                            </div>

                            {canPreviewImage && showMediaPreview && (
                                <div className="mt-1 rounded-xl border border-border/70 bg-muted/20 p-2">
                                    <div className="text-[10px] font-semibold text-muted-foreground mb-1">
                                        Apercu image
                                    </div>
                                    <img
                                        src={mediaUrl}
                                        alt="Apercu media"
                                        className="h-20 w-20 rounded-lg object-cover border border-border/60"
                                        onError={() => setShowMediaPreview(false)}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                            Astuce: commencez par un hook court, ajoutez une offre claire, puis un appel a l'action.
                        </div>

                        <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-4 space-y-4 dark:border-indigo-900/40 dark:from-indigo-950/30 dark:to-violet-950/20">
                            <div className="flex items-center justify-between gap-3">
                                <div className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-300">
                                    <Bot className="h-4 w-4" />
                                    Assistant IA de contenu
                                </div>
                                <span className="text-[10px] font-semibold text-muted-foreground">Préparer avant publication</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <Input
                                    placeholder="Sujet (ex: bague or 18k)"
                                    value={aiTopic}
                                    onChange={(e) => setAiTopic(e.target.value)}
                                    className="rounded-xl bg-background"
                                />
                                <select
                                    value={aiTone}
                                    onChange={(e) => setAiTone(e.target.value)}
                                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                >
                                    <option value="professionnel">Ton professionnel</option>
                                    <option value="amical">Ton amical</option>
                                    <option value="premium">Ton premium</option>
                                    <option value="dynamique">Ton dynamique</option>
                                </select>
                                <select
                                    value={aiGoal}
                                    onChange={(e) => setAiGoal(e.target.value)}
                                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                >
                                    <option value="promotion">Objectif: promotion</option>
                                    <option value="engagement">Objectif: engagement</option>
                                    <option value="visibilite">Objectif: visibilité</option>
                                </select>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" className="rounded-xl" onClick={generateTextWithAi} disabled={isAiWorking}>
                                    {isAiWorking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                                    Générer texte
                                </Button>
                                <Button type="button" variant="outline" className="rounded-xl" onClick={generateHashtagsWithAi} disabled={isAiWorking}>
                                    <Hash className="h-4 w-4 mr-2" />
                                    Suggestions hashtags
                                </Button>
                                <Button type="button" variant="outline" className="rounded-xl" onClick={generateVariantsWithAi} disabled={isAiWorking}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Variantes captions
                                </Button>
                            </div>

                            {aiHashtags.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hashtags suggérés</div>
                                    <div className="flex flex-wrap gap-2">
                                        {aiHashtags.map((tag) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => setContent((prev) => `${prev.trim()} ${tag}`.trim())}
                                                className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:bg-background dark:border-indigo-900/40 dark:text-indigo-300"
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {aiVariants.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Variantes prêtes à utiliser</div>
                                    <div className="space-y-2">
                                        {aiVariants.map((variant, idx) => (
                                            <button
                                                key={`${idx}-${variant.slice(0, 12)}`}
                                                type="button"
                                                onClick={() => setContent(variant)}
                                                className="w-full rounded-xl border border-border/70 bg-background p-2.5 text-left text-xs hover:bg-muted/40"
                                            >
                                                <span className="font-bold text-indigo-600 mr-1">V{idx + 1}.</span>
                                                {variant}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-4 rounded-3xl border border-border/70 shadow-sm">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base font-bold">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Planifier pour</Label>
                            <Input
                                type="datetime-local"
                                value={scheduledFor}
                                onChange={(e) => setScheduledFor(e.target.value)}
                                className="rounded-xl bg-background"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <ImageIcon className="h-3.5 w-3.5" />
                                Media URL (optionnel)
                            </Label>
                            <Input
                                placeholder="https://..."
                                value={mediaUrl}
                                onChange={(e) => {
                                    setMediaUrl(e.target.value);
                                    setMediaFileName(null);
                                    setShowMediaPreview(true);
                                }}
                                className="rounded-xl bg-background"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Pour un upload, utilisez le champ <b>“Media image”</b> sous “Contenu du post”.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Plateformes</Label>
                                <span className="text-[10px] font-bold text-muted-foreground">{selectedPlatformList.length} selectionnee(s)</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {(["tiktok", "facebook", "instagram"] as Platform[]).map((platform) => (
                                    <button
                                        key={platform}
                                        type="button"
                                        onClick={() => togglePlatform(platform)}
                                        className={cn(
                                            "h-10 rounded-xl border text-sm font-semibold transition-all",
                                            selectedPlatforms[platform]
                                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                                : "bg-background text-foreground border-border hover:bg-muted hover:border-indigo-200"
                                        )}
                                    >
                                        {PLATFORM_LABELS[platform]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Eye className="h-3.5 w-3.5" />
                                Aperçu avant envoi
                            </Label>
                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {selectedPlatformList.length === 0 ? (
                                        <span className="text-[10px] text-muted-foreground">Aucune plateforme sélectionnée</span>
                                    ) : (
                                        selectedPlatformList.map((p) => (
                                            <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                                {PLATFORM_LABELS[p]}
                                            </span>
                                        ))
                                    )}
                                </div>
                                <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-5">
                                    {content.trim() || "Votre caption apparaîtra ici..."}
                                </p>
                                {canPreviewImage && showMediaPreview ? (
                                    <img
                                        src={mediaUrl}
                                        alt="Preview post"
                                        className="h-24 w-24 rounded-lg object-cover border border-border/60"
                                        onError={() => setShowMediaPreview(false)}
                                    />
                                ) : null}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-3xl border border-border/70 shadow-sm">
                <CardContent className="pt-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Send className="h-3.5 w-3.5 text-indigo-500" />
                            Publication automatique multi-plateformes
                        </div>
                        {selectedPlatforms.facebook && (
                            <div className={cn(
                                "rounded-lg border px-3 py-2 text-xs",
                                platformConfig?.facebook?.ready
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : "bg-amber-50 border-amber-200 text-amber-700"
                            )}>
                                {platformConfig?.facebook?.ready
                                    ? "Facebook pret (Page configuree)"
                                    : "Facebook non configure (FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN)"}
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                                variant="outline"
                                onClick={handlePublishNow}
                                disabled={isSubmitting}
                                className="rounded-xl px-4"
                            >
                                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                                {isSubmitting ? "En cours..." : "Publier maintenant"}
                            </Button>
                            <Button
                                onClick={handleCreate}
                                disabled={isSubmitting}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5"
                            >
                                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                                {isSubmitting ? "Planification..." : "Planifier le post"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border border-border/70 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-lg">
                        <span className="flex items-center gap-2">
                            <CalendarClock className="h-5 w-5 text-indigo-600" />
                            Posts planifies et historiques
                        </span>
                        <Button variant="outline" size="sm" onClick={fetchItems} disabled={isLoading} className="rounded-xl">
                            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="py-12 flex items-center justify-center text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Chargement des posts...
                        </div>
                    ) : items.length === 0 ? (
                        <div className="py-12 text-center">
                            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                                <CalendarClock className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="text-sm font-medium">Aucun autopost pour le moment</div>
                            <div className="text-xs text-muted-foreground mt-1">Créez votre premier post programmé pour commencer.</div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {items.map((item) => (
                                <div
                                    key={item.id}
                                    className="rounded-2xl border border-border/80 p-4 md:p-5 space-y-3 bg-gradient-to-br from-background to-muted/20"
                                >
                                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                                        <div className="space-y-2 min-w-0">
                                            <div className="text-sm font-semibold leading-relaxed whitespace-pre-wrap">{item.content}</div>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                <Clock3 className="h-3.5 w-3.5" />
                                                Planifie: {new Date(item.scheduled_for).toLocaleString("fr-FR")}
                                                {item.published_at ? ` · Publie: ${new Date(item.published_at).toLocaleString("fr-FR")}` : ""}
                                            </div>
                                            {item.media_url && (
                                                <div className="text-xs text-indigo-600 break-all">Media: {item.media_url}</div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {item.platforms.map((p) => (
                                                <Badge key={p} variant="outline" className="text-xs rounded-lg">{PLATFORM_LABELS[p]}</Badge>
                                            ))}
                                            <Badge variant="outline" className={cn("text-xs rounded-lg", statusClassMap[item.status])}>
                                                {formatStatus(item.status)}
                                            </Badge>
                                            {item.status === "scheduled" && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 rounded-lg"
                                                    onClick={() => handleCancel(item.id)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                    Annuler
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 rounded-lg text-rose-600 border-rose-200 hover:bg-rose-50"
                                                onClick={() => setDeleteTargetId(item.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                Supprimer
                                            </Button>
                                        </div>
                                    </div>

                                    {item.last_error && (
                                        <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2.5 flex items-start gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                            {item.last_error}
                                        </div>
                                    )}

                                    {item.status === "published" && !item.last_error && (
                                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-2.5 inline-flex items-center gap-2">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Publication effectuee avec succes.
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cet autopost ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action supprimera definitivement ce post de l&apos;historique.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-rose-600 hover:bg-rose-700"
                            onClick={() => {
                                if (deleteTargetId !== null) handleDelete(deleteTargetId);
                            }}
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
