import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { User, Bell, Lock, Building2, Trash2, AlertTriangle, Plus, Edit, Package, Globe2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/common/ui/button";
import { toast } from "sonner";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/common/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";

export default function Settings() {
    const navigate = useNavigate();
    const isAdmin = localStorage.getItem("role")?.toLowerCase() === "admin";
    const token = localStorage.getItem("token");
    const [maxDevisDiscount, setMaxDevisDiscount] = useState<number>(() => {
        const stored = localStorage.getItem("maxDevisDiscount");
        const n = stored != null ? Number(stored) : 10;
        return Number.isFinite(n) ? n : 10;
    });
    const [devisLifetimeValue, setDevisLifetimeValue] = useState<number>(() => {
        const stored = localStorage.getItem("devisLifetimeValue");
        const n = stored != null ? Number(stored) : 1;
        return Number.isFinite(n) ? Math.max(0, n) : 1;
    });
    const [devisLifetimeUnit, setDevisLifetimeUnit] = useState<"minutes" | "heures" | "jours">(() => {
        const stored = localStorage.getItem("devisLifetimeUnit") as "minutes" | "heures" | "jours" | null;
        return stored || "jours";
    });
    const [invoiceStartOffset, setInvoiceStartOffset] = useState<number>(() => {
        const stored = localStorage.getItem("invoiceStartOffset");
        const n = stored != null ? Number(stored) : 20;
        return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 20;
    });
    const [devisStartOffset, setDevisStartOffset] = useState<number>(() => {
        const stored = localStorage.getItem("devisStartOffset");
        const n = stored != null ? Number(stored) : 0;
        return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    });
    const [commandeStartOffset, setCommandeStartOffset] = useState<number>(() => {
        const stored = localStorage.getItem("commandeStartOffset");
        const n = stored != null ? Number(stored) : 0;
        return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    });
    const [avoirStartOffset, setAvoirStartOffset] = useState<number>(() => {
        const stored = localStorage.getItem("avoirStartOffset");
        const n = stored != null ? Number(stored) : 0;
        return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    });
    const [recuClientStartOffset, setRecuClientStartOffset] = useState<number>(() => {
        const stored = localStorage.getItem("recuClientStartOffset");
        const n = stored != null ? Number(stored) : 0;
        return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    });

    const [paymentModes, setPaymentModes] = useState<any[]>([]);
    const [sousSocietes, setSousSocietes] = useState<Array<{
        id: number;
        gestionnaire_id: number;
        gestionnaire_nom?: string | null;
        nom_sous_societe: string;
    }>>([]);
    const [gestionnaires, setGestionnaires] = useState<Array<{ id: number; nom: string }>>([]);
    const [newSousSocieteName, setNewSousSocieteName] = useState("");
    const [newSousSocieteGestionnaireId, setNewSousSocieteGestionnaireId] = useState<string>("");
    const [editingSousSocieteId, setEditingSousSocieteId] = useState<number | null>(null);
    const [editingSousSocieteName, setEditingSousSocieteName] = useState("");
    const [editingSousSocieteGestionnaireId, setEditingSousSocieteGestionnaireId] = useState<string>("");
    const [isSavingSousSociete, setIsSavingSousSociete] = useState(false);
    const [selectedSousSocieteId, setSelectedSousSocieteId] = useState<string>(() => {
        try {
            return localStorage.getItem("settings_selectedSousSocieteId") || "";
        } catch {
            return "";
        }
    });
    const [newModeLabel, setNewModeLabel] = useState("");
    const [newModeValue, setNewModeValue] = useState("");

    const [productTypes, setProductTypes] = useState<{ id: number; name: string; description: string | null }[]>([]);
    const [isProductTypeDialogOpen, setIsProductTypeDialogOpen] = useState(false);
    const [editingProductType, setEditingProductType] = useState<{ id: number; name: string; description: string | null } | null>(null);
    const [newProductTypeName, setNewProductTypeName] = useState("");
    const [newProductTypeDescription, setNewProductTypeDescription] = useState("");
    const [autoApprovalHour, setAutoApprovalHour] = useState<string>("");
    const [autoApprovalEnabled, setAutoApprovalEnabled] = useState(true);
    const [autoApprovalSaving, setAutoApprovalSaving] = useState(false);
    const [showNumberingDetails, setShowNumberingDetails] = useState(false);
    const [isSavingNumbering, setIsSavingNumbering] = useState(false);
    const [showAutoApproval, setShowAutoApproval] = useState(false);
    const [showSousSocietes, setShowSousSocietes] = useState(false);
    const [showProductTypes, setShowProductTypes] = useState(false);
    const [showPriceSettings, setShowPriceSettings] = useState(false);
    const [metalPricingLoading, setMetalPricingLoading] = useState(false);
    const [pricingMetal, setPricingMetal] = useState<"or" | "silver">("or");
    const [priceOrResign, setPriceOrResign] = useState("");
    const [priceOrRafinity, setPriceOrRafinity] = useState("");
    const [priceOrBeldi, setPriceOrBeldi] = useState("");
    const [priceOrOccasion, setPriceOrOccasion] = useState("");
    const [priceSilverBeldy, setPriceSilverBeldy] = useState("");
    const [priceSilverRafinity, setPriceSilverRafinity] = useState("");

    const saveMetalPricingPatch = async (patch: Record<string, string>) => {
        if (!token) return false;
        try {
            const res = await fetch("/api/settings/metal-pricing", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(patch),
            });
            if (!res.ok) {
                toast.error("Impossible d'enregistrer les tarifs.");
                return false;
            }
            const data = await res.json();
            if (data.defaultMetal === "silver" || data.defaultMetal === "or") setPricingMetal(data.defaultMetal);
            if (typeof data.priceOrResign === "string") setPriceOrResign(data.priceOrResign);
            if (typeof data.priceOrRafinity === "string") setPriceOrRafinity(data.priceOrRafinity);
            if (typeof data.priceOrBeldi === "string") setPriceOrBeldi(data.priceOrBeldi);
            if (typeof data.priceOrOccasion === "string") setPriceOrOccasion(data.priceOrOccasion);
            if (typeof data.priceSilverBeldy === "string") setPriceSilverBeldy(data.priceSilverBeldy);
            if (typeof data.priceSilverRafinity === "string") setPriceSilverRafinity(data.priceSilverRafinity);
            return true;
        } catch {
            toast.error("Erreur réseau lors de l'enregistrement.");
            return false;
        }
    };

    const [showDevisAdvanced, setShowDevisAdvanced] = useState(false);
    const [showPaymentModes, setShowPaymentModes] = useState(false);
    const [showDashboardSettings, setShowDashboardSettings] = useState(false);
    const [dashboardVisibility, setDashboardVisibility] = useState<any>({});
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [modeToDelete, setModeToDelete] = useState<any>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const selectedSousSocieteName =
        sousSocietes.find((s) => String(s.id) === selectedSousSocieteId)?.nom_sous_societe || "";
    const sousSocieteTag = (() => {
        const raw = String(selectedSousSocieteName || "").trim();
        if (!raw) return "";
        const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const first = normalized.match(/[A-Za-z0-9]/)?.[0] || "";
        return first ? first.toUpperCase() : "";
    })();
    const toDocPreview = (prefix: string, offset: number) => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const raw = Math.max(0, Number(offset) || 0);
        const next = String(raw === 0 ? 1 : raw).padStart(6, "0");
        const scope = sousSocieteTag ? `-${sousSocieteTag}` : "";
        return `${prefix}${scope}-${y}/${m}/${next}`;
    };

    const fetchPaymentModes = async () => {
        if (!token) return;
        try {
            const [pRes, ptRes] = await Promise.all([
                fetch("/api/settings/payment-modes", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/product-types", { headers: { Authorization: `Bearer ${token}` } })
            ]);
            if (pRes.ok) setPaymentModes(await pRes.json());
            if (ptRes.ok) setProductTypes(await ptRes.json());
        } catch {
            console.error("Failed to load settings data");
        }
    };

    const handleCreateUpdateProductType = async () => {
        if (!newProductTypeName.trim()) {
            toast.error("Le nom est requis.");
            return;
        }
        const method = editingProductType ? "PUT" : "POST";
        const url = editingProductType ? `/api/product-types/${editingProductType.id}` : "/api/product-types";
        try {
            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ name: newProductTypeName, description: newProductTypeDescription }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || "Une erreur est survenue.");
                return;
            }
            toast.success(editingProductType ? "Type mis à jour." : "Type créé.");
            setIsProductTypeDialogOpen(false);
            setEditingProductType(null);
            setNewProductTypeName("");
            setNewProductTypeDescription("");
            fetchPaymentModes();
        } catch {
            toast.error("Erreur de connexion.");
        }
    };

    const handleDeleteProductType = async (id: number) => {
        if (!confirm("Supprimer ce type de produit ?")) return;
        try {
            const res = await fetch(`/api/product-types/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || "Erreur lors de la suppression.");
                return;
            }
            toast.success("Type de produit supprimé.");
            fetchPaymentModes();
        } catch {
            toast.error("Erreur de connexion.");
        }
    };

    const handleEditProductType = (type: { id: number; name: string; description: string | null }) => {
        setEditingProductType(type);
        setNewProductTypeName(type.name);
        setNewProductTypeDescription(type.description || "");
        setIsProductTypeDialogOpen(true);
    };

    const fetchNumberingSettings = async (sousSocieteId: string) => {
        if (!token) return;
        try {
            const qs = sousSocieteId ? `?sousSocieteId=${encodeURIComponent(sousSocieteId)}` : "";
            console.log("[Settings][numbering][fetch:start]", { sousSocieteId, qs });
            const res = await fetch(`/api/settings/numbering${qs}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                console.log("[Settings][numbering][fetch:error]", {
                    sousSocieteId,
                    status: res.status,
                    statusText: res.statusText,
                });
                return;
            }
            const data = await res.json();
            console.log("[Settings][numbering][fetch:ok]", { sousSocieteId, data });
            if (typeof data.invoiceStartOffset === "number") setInvoiceStartOffset(data.invoiceStartOffset);
            if (typeof data.devisStartOffset === "number") setDevisStartOffset(data.devisStartOffset);
            if (typeof data.commandeStartOffset === "number") setCommandeStartOffset(data.commandeStartOffset);
            if (typeof data.avoirStartOffset === "number") setAvoirStartOffset(data.avoirStartOffset);
            if (typeof data.recuClientStartOffset === "number") setRecuClientStartOffset(data.recuClientStartOffset);
        } finally {
            // no-op
        }
    };

    const persistSingleNumberingSetting = async (
        key: "invoiceStartOffset" | "devisStartOffset" | "commandeStartOffset" | "avoirStartOffset" | "recuClientStartOffset",
        value: number
    ) => {
        if (!token || !selectedSousSocieteId) {
            toast.error("Choisissez d'abord une sous-société.");
            return false;
        }
        setIsSavingNumbering(true);
        try {
            const qs = `?sousSocieteId=${encodeURIComponent(selectedSousSocieteId)}`;
            const bodyMap: Record<string, number> = { [key]: value };
            const res = await fetch(`/api/settings/numbering${qs}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(bodyMap),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || "Erreur lors de l'enregistrement.");
                return false;
            }
            localStorage.setItem(key, String(value));
            toast.success("Valeur enregistrée.");
            return true;
        } catch {
            toast.error("Erreur de connexion au serveur.");
            return false;
        } finally {
            setIsSavingNumbering(false);
        }
    };

    const refreshSousSocietes = async (keepSelection = true) => {
        if (!token) return [];
        const res = await fetch("/api/settings/sous-societes", {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        const safe = Array.isArray(data) ? data : [];
        setSousSocietes(safe);

        const persistedId = (() => {
            try {
                return localStorage.getItem("settings_selectedSousSocieteId") || "";
            } catch {
                return "";
            }
        })();
        const preferredId = keepSelection && selectedSousSocieteId ? selectedSousSocieteId : persistedId;
        const hasPreferred = preferredId ? safe.some((s) => String(s.id) === preferredId) : false;
        const nextSelected = hasPreferred ? preferredId : (safe[0] ? String(safe[0].id) : "");
        setSelectedSousSocieteId(nextSelected);
        return safe;
    };

    const startEditSousSociete = (ss: { id: number; nom_sous_societe: string; gestionnaire_id: number }) => {
        setEditingSousSocieteId(ss.id);
        setEditingSousSocieteName(ss.nom_sous_societe || "");
        setEditingSousSocieteGestionnaireId(String(ss.gestionnaire_id || ""));
    };

    const cancelEditSousSociete = () => {
        setEditingSousSocieteId(null);
        setEditingSousSocieteName("");
        setEditingSousSocieteGestionnaireId("");
    };

    const createSousSociete = async () => {
        if (!newSousSocieteName.trim()) {
            toast.error("Le nom de la sous-société est requis.");
            return;
        }
        if (!newSousSocieteGestionnaireId) {
            toast.error("Choisissez un gestionnaire.");
            return;
        }
        setIsSavingSousSociete(true);
        try {
            const res = await fetch("/api/settings/sous-societes", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    nom_sous_societe: newSousSocieteName.trim(),
                    gestionnaire_id: Number(newSousSocieteGestionnaireId),
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err?.message || "Impossible d'ajouter la sous-société.");
                return;
            }
            toast.success("Sous-société ajoutée.");
            setNewSousSocieteName("");
            await refreshSousSocietes(false);
        } catch {
            toast.error("Erreur de connexion.");
        } finally {
            setIsSavingSousSociete(false);
        }
    };

    const saveSousSocieteUpdate = async () => {
        if (!editingSousSocieteId) return;
        if (!editingSousSocieteName.trim()) {
            toast.error("Le nom de la sous-société est requis.");
            return;
        }
        if (!editingSousSocieteGestionnaireId) {
            toast.error("Choisissez un gestionnaire.");
            return;
        }
        setIsSavingSousSociete(true);
        try {
            const res = await fetch(`/api/settings/sous-societes/${editingSousSocieteId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    nom_sous_societe: editingSousSocieteName.trim(),
                    gestionnaire_id: Number(editingSousSocieteGestionnaireId),
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err?.message || "Impossible de mettre à jour la sous-société.");
                return;
            }
            toast.success("Sous-société mise à jour.");
            cancelEditSousSociete();
            await refreshSousSocietes();
        } catch {
            toast.error("Erreur de connexion.");
        } finally {
            setIsSavingSousSociete(false);
        }
    };

    const deleteSousSociete = async (ss: { id: number; nom_sous_societe: string }) => {
        if (!confirm(`Supprimer la sous-société "${ss.nom_sous_societe}" ?`)) return;
        setIsSavingSousSociete(true);
        try {
            const res = await fetch(`/api/settings/sous-societes/${ss.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err?.message || "Impossible de supprimer la sous-société.");
                return;
            }
            toast.success("Sous-société supprimée.");
            if (editingSousSocieteId === ss.id) cancelEditSousSociete();
            await refreshSousSocietes();
        } catch {
            toast.error("Erreur de connexion.");
        } finally {
            setIsSavingSousSociete(false);
        }
    };


    useEffect(() => {
        if (!isAdmin || !token) return;
        (async () => {
            fetchPaymentModes();
            try {
                const res = await fetch("/api/settings/auto-approval", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setAutoApprovalHour(data.auto_approval_hour || "");
                    setAutoApprovalEnabled(
                        typeof data.auto_approval_enabled === "boolean" ? data.auto_approval_enabled : true
                    );
                }
            } catch {
                // silencieux
            }

            try {
                const res = await fetch("/api/settings/dashboard-visibility", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    setDashboardVisibility(await res.json());
                }
            } catch {
                // silencieux
            }

            try {
                const safe = await refreshSousSocietes(false);
                const persistedId = (() => {
                    try {
                        return localStorage.getItem("settings_selectedSousSocieteId") || "";
                    } catch {
                        return "";
                    }
                })();
                const initialId =
                    (selectedSousSocieteId && safe.some((s) => String(s.id) === selectedSousSocieteId) && selectedSousSocieteId) ||
                    (persistedId && safe.some((s) => String(s.id) === persistedId) && persistedId) ||
                    (safe[0] ? String(safe[0].id) : "");
                if (initialId) {
                    setSelectedSousSocieteId(initialId);
                    await fetchNumberingSettings(initialId);
                }
            } catch {
                // silencieux
            }

            try {
                const res = await fetch("/api/gestionnaires", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const safe = Array.isArray(data) ? data : [];
                    setGestionnaires(safe);
                    if (safe.length > 0) {
                        setNewSousSocieteGestionnaireId(String(safe[0].id));
                    }
                }
            } catch {
                // silencieux
            }

            setMetalPricingLoading(true);
            try {
                const res = await fetch("/api/settings/metal-pricing", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const d = await res.json();
                    if (d.defaultMetal === "silver" || d.defaultMetal === "or") setPricingMetal(d.defaultMetal);
                    setPriceOrResign(typeof d.priceOrResign === "string" ? d.priceOrResign : "");
                    setPriceOrRafinity(typeof d.priceOrRafinity === "string" ? d.priceOrRafinity : "");
                    setPriceOrBeldi(typeof d.priceOrBeldi === "string" ? d.priceOrBeldi : "");
                    setPriceOrOccasion(typeof d.priceOrOccasion === "string" ? d.priceOrOccasion : "");
                    setPriceSilverBeldy(typeof d.priceSilverBeldy === "string" ? d.priceSilverBeldy : "");
                    setPriceSilverRafinity(typeof d.priceSilverRafinity === "string" ? d.priceSilverRafinity : "");
                }
            } catch {
                /* ignore */
            } finally {
                setMetalPricingLoading(false);
            }

        })();
    }, [isAdmin, token]);

    useEffect(() => {
        if (!isAdmin || !token || !selectedSousSocieteId) return;
        try {
            localStorage.setItem("settings_selectedSousSocieteId", selectedSousSocieteId);
        } catch {
            // ignore
        }
        console.log("[Settings][numbering][selectedSousSocieteId]", { selectedSousSocieteId });
        fetchNumberingSettings(selectedSousSocieteId).catch(() => {
            // silencieux
        });
    }, [selectedSousSocieteId, isAdmin, token]);

    const sections = [
        {
            title: "Profil",
            description: "Gérez vos informations personnelles et votre avatar.",
            icon: User,
            path: "/dashboard/settings/profile"
        },
        {
            title: "Compte",
            description: "Voir et modifier les informations de votre société (gestionnaire).",
            icon: Building2,
            path: "/dashboard/settings/account"
        },
        ...(isAdmin ? [
            {
                title: "Permissions",
                description: "Gérez les accès et les rôles du système.",
                icon: Lock,
                path: "/dashboard/settings/permissions"
            },
            {
                title: "Reseaux sociaux",
                description: "Configurez les integrations sociales et l'autoposting.",
                icon: Globe2,
                path: "/dashboard/settings/social-media"
            }
        ] : []),
        {
            title: "Notifications",
            description: "Choisissez comment vous souhaitez être informé.",
            icon: Bell,
            path: "/dashboard/settings/notifications"
        }
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Paramètres</h1>
                <p className="text-muted-foreground mt-2">
                    Gérez vos préférences de compte et personnalisez votre expérience.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sections.map((section) => (
                    <Card
                        key={section.title}
                        onClick={() => section.path && navigate(section.path)}
                        className={cn(
                            "hover:shadow-md transition-shadow cursor-pointer border-border/40 bg-card/60 backdrop-blur-sm",
                            !section.path && "cursor-default opacity-80"
                        )}
                    >
                        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                            <div className="p-2 bg-primary/10 rounded-xl text-primary font-semibold">
                                <section.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">{section.title}</CardTitle>
                                <CardDescription>{section.description}</CardDescription>
                            </div>
                        </CardHeader>
                    </Card>
                ))}
            </div>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Détails du compte</CardTitle>
                    <CardDescription>Informations relatives à votre compte système.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-border/40">
                        <span className="text-sm font-medium text-muted-foreground">Rôle actuel</span>
                        <span className="text-sm font-semibold text-foreground uppercase bg-primary/10 px-2 py-1 rounded-md">
                            {localStorage.getItem("role") || "Utilisateur"}
                        </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/40">
                        <span className="text-sm font-medium text-muted-foreground">Version du système</span>
                        <span className="text-sm font-semibold text-foreground">v2.1.0-premium</span>
                    </div>
                    <div className="py-2 border-b border-border/40 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-muted-foreground">Sous-sociétés</span>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">{sousSocietes.length} élément(s)</span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs shrink-0"
                                    onClick={() => setShowSousSocietes((v) => !v)}
                                >
                                    {showSousSocietes ? "Masquer" : "Afficher"}
                                </Button>
                            </div>
                        </div>
                        {showSousSocietes && (
                            <>
                        <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                            <p className="text-xs font-semibold text-foreground">Ajouter une sous-société</p>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-2 items-end">
                                <input
                                    type="text"
                                    value={newSousSocieteName}
                                    onChange={(e) => setNewSousSocieteName(e.target.value)}
                                    className="h-9 border rounded-md px-2 text-sm bg-background w-full"
                                    placeholder="Nom de la sous-société"
                                />
                                <Select
                                    value={newSousSocieteGestionnaireId}
                                    onValueChange={setNewSousSocieteGestionnaireId}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Compte (gestionnaire)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {gestionnaires.map((g) => (
                                            <SelectItem key={g.id} value={String(g.id)}>
                                                {g.nom}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={createSousSociete}
                                    disabled={isSavingSousSociete}
                                >
                                    Ajouter
                                </Button>
                            </div>
                        </div>
                        {sousSocietes.length > 0 ? (
                            <div className="rounded-lg border border-border/40 overflow-hidden">
                                <div className="grid grid-cols-[1.1fr_1fr_auto] gap-2 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <span>Sous-société</span>
                                    <span>Compte</span>
                                    <span className="text-right">Actions</span>
                                </div>
                                <div className="divide-y divide-border/40">
                                    {sousSocietes.map((ss) => (
                                        <div key={ss.id} className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr_auto] gap-2 px-3 py-2 items-center">
                                            {editingSousSocieteId === ss.id ? (
                                                <>
                                                    <input
                                                        type="text"
                                                        value={editingSousSocieteName}
                                                        onChange={(e) => setEditingSousSocieteName(e.target.value)}
                                                        className="h-8 border rounded-md px-2 text-sm bg-background w-full"
                                                    />
                                                    <Select
                                                        value={editingSousSocieteGestionnaireId}
                                                        onValueChange={setEditingSousSocieteGestionnaireId}
                                                    >
                                                        <SelectTrigger className="h-8">
                                                            <SelectValue placeholder="Compte" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {gestionnaires.map((g) => (
                                                                <SelectItem key={g.id} value={String(g.id)}>
                                                                    {g.nom}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            className="h-8"
                                                            disabled={isSavingSousSociete}
                                                            onClick={saveSousSocieteUpdate}
                                                        >
                                                            Enregistrer
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8"
                                                            onClick={cancelEditSousSociete}
                                                        >
                                                            Annuler
                                                        </Button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-sm font-medium text-foreground">{ss.nom_sous_societe}</span>
                                                    <span className="text-xs text-muted-foreground">{ss.gestionnaire_nom || "—"}</span>
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8"
                                                            onClick={() => startEditSousSociete(ss)}
                                                            title="Modifier"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-red-600 hover:text-red-700"
                                                            onClick={() => deleteSousSociete(ss)}
                                                            title="Supprimer"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="mt-1 text-xs text-muted-foreground">Aucune sous-société trouvée.</p>
                        )}
                            </>
                        )}
                    </div>

                    {isAdmin && (
                        <div className="flex flex-col gap-4 pt-2">
                            <div className="flex flex-col gap-4 border border-border/40 rounded-lg p-3 bg-muted/30">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            Paramétrage des prix
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            Tarifs DH/g sur le serveur (calcul produit).
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs shrink-0"
                                        onClick={() => setShowPriceSettings(!showPriceSettings)}
                                    >
                                        {showPriceSettings ? "Masquer" : "Afficher"}
                                    </Button>
                                </div>

                                {showPriceSettings && metalPricingLoading && (
                                    <p className="text-xs text-muted-foreground py-2">Chargement des tarifs…</p>
                                )}
                                {showPriceSettings && !metalPricingLoading && (
                                    <>
                                        <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Aperçu des tarifs (DH/g)
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                                                <div className="font-medium text-foreground/80 col-span-full">Or</div>
                                                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Resign</span><span className="font-mono tabular-nums">{priceOrResign || "—"}</span></div>
                                                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Rafinity</span><span className="font-mono tabular-nums">{priceOrRafinity || "—"}</span></div>
                                                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Beldi</span><span className="font-mono tabular-nums">{priceOrBeldi || "—"}</span></div>
                                                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Occasion</span><span className="font-mono tabular-nums">{priceOrOccasion || "—"}</span></div>
                                                <div className="font-medium text-foreground/80 col-span-full pt-1">Silver</div>
                                                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Beldy</span><span className="font-mono tabular-nums">{priceSilverBeldy || "—"}</span></div>
                                                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Rafinity</span><span className="font-mono tabular-nums">{priceSilverRafinity || "—"}</span></div>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                                                Métal par défaut (formulaire produit) : <span className="font-semibold text-foreground">{pricingMetal === "silver" ? "Silver" : "Or"}</span>
                                            </p>
                                        </div>

                                        <div className="space-y-5 pt-2 border-t border-border/40">
                                        <div className="flex flex-col gap-2 max-w-xs">
                                            <span className="text-sm font-medium text-muted-foreground">Métal par défaut</span>
                                            <Select
                                                value={pricingMetal}
                                                onValueChange={async (v) => {
                                                    const m = v === "silver" ? "silver" : "or";
                                                    setPricingMetal(m);
                                                    const ok = await saveMetalPricingPatch({ defaultMetal: m });
                                                    if (ok) toast.success("Métal par défaut enregistré");
                                                }}
                                            >
                                                <SelectTrigger className="h-9 text-sm">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="or">Or</SelectItem>
                                                    <SelectItem value="silver">Silver</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {pricingMetal === "or" ? (
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                {(
                                                    [
                                                        ["Resign", priceOrResign, setPriceOrResign, "priceOrResign"] as const,
                                                        ["Rafinity", priceOrRafinity, setPriceOrRafinity, "priceOrRafinity"] as const,
                                                        ["Beldi", priceOrBeldi, setPriceOrBeldi, "priceOrBeldi"] as const,
                                                        ["Occasion", priceOrOccasion, setPriceOrOccasion, "priceOrOccasion"] as const,
                                                    ] as const
                                                ).map(([label, value, setVal, apiKey]) => (
                                                    <div key={apiKey} className="flex flex-col gap-2">
                                                        <span className="text-sm font-medium text-muted-foreground">{label}</span>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={value}
                                                                onChange={(e) => setVal(e.target.value)}
                                                                className="h-9 min-w-[140px] flex-1 border rounded-md px-2 text-sm bg-background"
                                                                placeholder="DH/g"
                                                            />
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                className="h-9 px-3 text-xs shrink-0"
                                                                onClick={async () => {
                                                                    const ok = await saveMetalPricingPatch({ [apiKey]: value.trim() });
                                                                    if (ok) toast.success(`${label} enregistré`);
                                                                }}
                                                            >
                                                                Enregistrer
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                {(
                                                    [
                                                        ["Beldy", priceSilverBeldy, setPriceSilverBeldy, "priceSilverBeldy"] as const,
                                                        ["Rafinity", priceSilverRafinity, setPriceSilverRafinity, "priceSilverRafinity"] as const,
                                                    ] as const
                                                ).map(([label, value, setVal, apiKey]) => (
                                                    <div key={apiKey} className="flex flex-col gap-2">
                                                        <span className="text-sm font-medium text-muted-foreground">{label}</span>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={value}
                                                                onChange={(e) => setVal(e.target.value)}
                                                                className="h-9 min-w-[140px] flex-1 border rounded-md px-2 text-sm bg-background"
                                                                placeholder="DH/g"
                                                            />
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                className="h-9 px-3 text-xs shrink-0"
                                                                onClick={async () => {
                                                                    const ok = await saveMetalPricingPatch({ [apiKey]: value.trim() });
                                                                    if (ok) toast.success(`${label} enregistré`);
                                                                }}
                                                            >
                                                                Enregistrer
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex flex-col gap-4 border border-border/40 rounded-lg p-3 bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            Paramètres avancés devis
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            Réduction maximale autorisée et durée de vie des devis.
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => setShowDevisAdvanced(!showDevisAdvanced)}
                                    >
                                        {showDevisAdvanced ? "Masquer" : "Afficher"}
                                    </Button>
                                </div>

                                {showDevisAdvanced && (
                                    <div className="mt-4 space-y-6 pt-2 border-t border-border/40">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-sm font-medium text-muted-foreground">
                                                Réduction maximale autorisée sur les devis (%)
                                            </span>
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={maxDevisDiscount}
                                                    onChange={(e) => {
                                                        const n = Number(e.target.value);
                                                        const safe = Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
                                                        setMaxDevisDiscount(safe);
                                                    }}
                                                    className="h-9 w-20 border rounded-md px-2 text-sm bg-background"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-9 px-3 text-xs"
                                                    onClick={() => {
                                                        localStorage.setItem("maxDevisDiscount", String(maxDevisDiscount));
                                                        toast.success(`Réduction maximale globale définie à ${maxDevisDiscount} %`);
                                                    }}
                                                >
                                                    Valider
                                                </Button>
                                                <span className="text-xs text-muted-foreground">
                                                    Au-delà, le devis sera signalé dans les approbations.
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <span className="text-sm font-medium text-muted-foreground">
                                                Durée de vie d&apos;un devis
                                            </span>
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={devisLifetimeValue}
                                                    onChange={(e) => {
                                                        const n = Number(e.target.value);
                                                        const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
                                                        setDevisLifetimeValue(safe);
                                                    }}
                                                    className="h-9 w-20 border rounded-md px-2 text-sm bg-background"
                                                />
                                                <Select
                                                    value={devisLifetimeUnit}
                                                    onValueChange={(v) => setDevisLifetimeUnit(v as any)}
                                                >
                                                    <SelectTrigger className="h-9 w-28 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="minutes">Minutes</SelectItem>
                                                        <SelectItem value="heures">Heures</SelectItem>
                                                        <SelectItem value="jours">Jours</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-9 px-3 text-xs"
                                                    onClick={() => {
                                                        localStorage.setItem("devisLifetimeValue", String(devisLifetimeValue));
                                                        localStorage.setItem("devisLifetimeUnit", devisLifetimeUnit);
                                                        toast.success(
                                                            devisLifetimeValue > 0
                                                                ? `Durée de vie des devis définie à ${devisLifetimeValue} ${devisLifetimeUnit}`
                                                                : "Durée de vie désactivée (aucune expiration automatique des devis)"
                                                        );
                                                    }}
                                                >
                                                    Valider
                                                </Button>
                                                <span className="text-xs text-muted-foreground">
                                                    Passé ce délai sans approbation, les devis seront automatiquement refusés.
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-4 border border-border/40 rounded-lg p-3 bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            Modes de paiement
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            Gérez les options de paiement disponibles dans le système.
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => setShowPaymentModes(!showPaymentModes)}
                                    >
                                        {showPaymentModes ? "Masquer" : "Gérer"}
                                    </Button>
                                </div>

                                {showPaymentModes && (
                                    <div className="mt-4 space-y-4">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Label (ex: Effet)"
                                                value={newModeLabel}
                                                onChange={(e) => setNewModeLabel(e.target.value)}
                                                className="h-9 flex-1 border rounded-md px-2 text-sm"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Valeur (ex: effet)"
                                                value={newModeValue}
                                                onChange={(e) => setNewModeValue(e.target.value)}
                                                className="h-9 flex-1 border rounded-md px-2 text-sm"
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={async () => {
                                                    if (!newModeLabel || !newModeValue) {
                                                        toast.error("Veuillez remplir les deux champs.");
                                                        return;
                                                    }
                                                    try {
                                                        const res = await fetch("/api/settings/payment-modes", {
                                                            method: "POST",
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                Authorization: `Bearer ${token}`,
                                                            },
                                                            body: JSON.stringify({ label: newModeLabel, value: newModeValue }),
                                                        });
                                                        if (res.ok) {
                                                            toast.success("Mode de paiement ajouté.");
                                                            setNewModeLabel("");
                                                            setNewModeValue("");
                                                            fetchPaymentModes();
                                                        } else {
                                                            toast.error("Erreur lors de l'ajout.");
                                                        }
                                                    } catch {
                                                        toast.error("Erreur de connexion.");
                                                    }
                                                }}
                                            >
                                                Ajouter
                                            </Button>
                                        </div>

                                        <div className="max-h-48 overflow-y-auto border rounded-md text-foreground">
                                            <table className="w-full text-sm">
                                                <thead className="bg-muted text-muted-foreground sticky top-0">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left">Label</th>
                                                        <th className="px-3 py-2 text-left">Valeur</th>
                                                        <th className="px-3 py-2 text-right">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/40">
                                                    {paymentModes.map((mode: any) => (
                                                        <tr key={mode.id} className="hover:bg-muted/40">
                                                            <td className="px-3 py-2">{mode.label}</td>
                                                            <td className="px-3 py-2">
                                                                <code className="text-[11px] bg-muted px-1 rounded">{mode.value}</code>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                                    onClick={() => {
                                                                        setModeToDelete(mode);
                                                                        setDeleteDialogOpen(true);
                                                                    }}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                                <DialogContent className="sm:max-w-md border-none shadow-2xl rounded-3xl overflow-hidden p-0">
                                    <div className="h-1.5 bg-red-500 w-full" />
                                    <div className="p-6">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-3 text-xl">
                                                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                                                    <AlertTriangle className="h-6 w-6 text-red-600" />
                                                </div>
                                                Confirmer la suppression
                                            </DialogTitle>
                                            <DialogDescription className="pt-4 text-base">
                                                Êtes-vous sûr de vouloir supprimer le mode de paiement{" "}
                                                <span className="font-bold text-foreground inline-flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-lg">
                                                    {modeToDelete?.label}
                                                </span> ?
                                                <p className="mt-2 text-sm text-red-500 font-medium">
                                                    Cette action est irréversible et pourrait affecter l'affichage des anciens règlements.
                                                </p>
                                            </DialogDescription>
                                        </DialogHeader>
                                        <DialogFooter className="mt-8 flex gap-3 sm:justify-end">
                                            <Button
                                                variant="outline"
                                                onClick={() => setDeleteDialogOpen(false)}
                                                className="rounded-xl h-11 px-6 font-semibold"
                                            >
                                                Annuler
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                disabled={isDeleting}
                                                onClick={async () => {
                                                    if (!modeToDelete || !token) return;
                                                    setIsDeleting(true);
                                                    try {
                                                        const res = await fetch(`/api/settings/payment-modes/${modeToDelete.id}`, {
                                                            method: "DELETE",
                                                            headers: {
                                                                Authorization: `Bearer ${token}`,
                                                            },
                                                        });
                                                        if (res.ok) {
                                                            toast.success("Mode de paiement supprimé avec succès.");
                                                            setDeleteDialogOpen(false);
                                                            setModeToDelete(null);
                                                            fetchPaymentModes();
                                                        } else {
                                                            toast.error("Erreur lors de la suppression.");
                                                        }
                                                    } catch {
                                                        toast.error("Erreur de connexion au serveur.");
                                                    } finally {
                                                        setIsDeleting(false);
                                                    }
                                                }}
                                                className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-11 px-6 font-semibold shadow-lg shadow-red-200 dark:shadow-none"
                                            >
                                                {isDeleting ? "Suppression..." : "Supprimer définitivement"}
                                            </Button>
                                        </DialogFooter>
                                    </div>
                                </DialogContent>
                            </Dialog>



                            <div className="flex flex-col gap-2 border border-border/40 rounded-lg p-3 bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            Numérotation des documents
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            Configurez le point de départ des numéros pour chaque type.
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => setShowNumberingDetails((v) => !v)}
                                    >
                                        {showNumberingDetails ? "Masquer" : "Configurer"}
                                    </Button>
                                </div>

                                {showNumberingDetails && (
                                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-2 md:col-span-2">
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Sous-société ciblée
                                            </span>
                                            <Select
                                                value={selectedSousSocieteId}
                                                onValueChange={setSelectedSousSocieteId}
                                            >
                                                <SelectTrigger className="h-9 max-w-sm">
                                                    <SelectValue placeholder="Choisir une sous-société" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {sousSocietes.map((ss) => (
                                                        <SelectItem key={ss.id} value={String(ss.id)}>
                                                            {ss.nom_sous_societe}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Factures – prochain numéro
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={invoiceStartOffset}
                                                    onChange={(e) => {
                                                        const n = Number(e.target.value);
                                                        const safe = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
                                                        setInvoiceStartOffset(safe);
                                                    }}
                                                    className="h-9 w-24 border rounded-md px-2 text-sm"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 px-3 text-xs"
                                                    disabled={isSavingNumbering}
                                                    onClick={() =>
                                                        persistSingleNumberingSetting(
                                                            "invoiceStartOffset",
                                                            invoiceStartOffset
                                                        )
                                                    }
                                                >
                                                    Enregistrer
                                                </Button>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground">
                                                Format: <span className="font-semibold text-foreground">{toDocPreview("FA", invoiceStartOffset)}</span>
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Devis – prochain numéro
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={devisStartOffset}
                                                    onChange={(e) => {
                                                        const n = Number(e.target.value);
                                                        const safe = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
                                                        setDevisStartOffset(safe);
                                                    }}
                                                    className="h-9 w-24 border rounded-md px-2 text-sm"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 px-3 text-xs"
                                                    disabled={isSavingNumbering}
                                                    onClick={() =>
                                                        persistSingleNumberingSetting(
                                                            "devisStartOffset",
                                                            devisStartOffset
                                                        )
                                                    }
                                                >
                                                    Enregistrer
                                                </Button>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground">
                                                Format: <span className="font-semibold text-foreground">{toDocPreview("DE", devisStartOffset)}</span>
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Commandes – prochain numéro
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={commandeStartOffset}
                                                    onChange={(e) => {
                                                        const n = Number(e.target.value);
                                                        const safe = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
                                                        setCommandeStartOffset(safe);
                                                    }}
                                                    className="h-9 w-24 border rounded-md px-2 text-sm"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 px-3 text-xs"
                                                    disabled={isSavingNumbering}
                                                    onClick={() =>
                                                        persistSingleNumberingSetting(
                                                            "commandeStartOffset",
                                                            commandeStartOffset
                                                        )
                                                    }
                                                >
                                                    Enregistrer
                                                </Button>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground">
                                                Format: <span className="font-semibold text-foreground">{toDocPreview("CO", commandeStartOffset)}</span>
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Avoirs – prochain numéro
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={avoirStartOffset}
                                                    onChange={(e) => {
                                                        const n = Number(e.target.value);
                                                        const safe = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
                                                        setAvoirStartOffset(safe);
                                                    }}
                                                    className="h-9 w-24 border rounded-md px-2 text-sm"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 px-3 text-xs"
                                                    disabled={isSavingNumbering}
                                                    onClick={() =>
                                                        persistSingleNumberingSetting(
                                                            "avoirStartOffset",
                                                            avoirStartOffset
                                                        )
                                                    }
                                                >
                                                    Enregistrer
                                                </Button>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground">
                                                Format: <span className="font-semibold text-foreground">{toDocPreview("AV", avoirStartOffset)}</span>
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Reçus clients – prochain numéro
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={recuClientStartOffset}
                                                    onChange={(e) => {
                                                        const n = Number(e.target.value);
                                                        const safe = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
                                                        setRecuClientStartOffset(safe);
                                                    }}
                                                    className="h-9 w-24 border rounded-md px-2 text-sm"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 px-3 text-xs"
                                                    disabled={isSavingNumbering}
                                                    onClick={() =>
                                                        persistSingleNumberingSetting(
                                                            "recuClientStartOffset",
                                                            recuClientStartOffset
                                                        )
                                                    }
                                                >
                                                    Enregistrer
                                                </Button>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground">
                                                Format: <span className="font-semibold text-foreground">{toDocPreview("RCL", recuClientStartOffset)}</span>
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>



                            {/* Gestion des types de produits */}
                            <div className="flex flex-col gap-2 border border-border/40 rounded-lg p-3 bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <Package className="h-4 w-4" /> Types de produits
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            Gérez les types de produits (e.g. Bijou, Montre, Accessoire).
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8 px-3 text-xs"
                                            onClick={() => setShowProductTypes((v) => !v)}
                                        >
                                            {showProductTypes ? "Masquer" : "Afficher"}
                                        </Button>
                                        {showProductTypes && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-8 px-3 text-xs bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                                                onClick={() => {
                                                    setEditingProductType(null);
                                                    setNewProductTypeName("");
                                                    setNewProductTypeDescription("");
                                                    setIsProductTypeDialogOpen(true);
                                                }}
                                            >
                                                <Plus className="h-3 w-3 mr-1" /> Ajouter
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {showProductTypes && (
                                    <div className="mt-2 space-y-1">
                                        {productTypes.length === 0 ? (
                                            <p className="text-xs text-muted-foreground italic p-2">Aucun type de produit configuré.</p>
                                        ) : (
                                            productTypes.map((type) => (
                                                <div key={type.id} className="flex items-center justify-between p-2 rounded-md hover:bg-white/50 dark:hover:bg-slate-800/50 group transition-colors border border-transparent hover:border-border/40">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{type.name}</span>
                                                        {type.description && <span className="text-[10px] text-muted-foreground">{type.description}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                                            onClick={() => handleEditProductType(type)}
                                                        >
                                                            <Edit className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                            onClick={() => handleDeleteProductType(type.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Validation Automatique */}
                            <div className="flex flex-col gap-4 border border-border/40 rounded-lg p-3 bg-muted/30">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-medium text-muted-foreground flex items-center gap-2 flex-wrap">
                                            <Bell className="h-4 w-4" /> Validation automatique
                                            <span
                                                className={
                                                    autoApprovalEnabled
                                                        ? "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                                        : "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                                                }
                                            >
                                                {autoApprovalEnabled ? "Activée" : "Désactivée"}
                                            </span>
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {autoApprovalEnabled
                                                ? "Approbation auto des ventes après l'heure configurée (rôle Commercial)."
                                                : "Aucune validation automatique : les commerciaux passent toujours par les approbations."}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {autoApprovalEnabled ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-8 px-3 text-xs border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
                                                disabled={autoApprovalSaving}
                                                onClick={async () => {
                                                    setAutoApprovalSaving(true);
                                                    try {
                                                        const res = await fetch("/api/settings/auto-approval", {
                                                            method: "PUT",
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                Authorization: `Bearer ${token}`,
                                                            },
                                                            body: JSON.stringify({ auto_approval_enabled: false }),
                                                        });
                                                        if (res.ok) {
                                                            setAutoApprovalEnabled(false);
                                                            toast.success("Validation automatique désactivée.");
                                                        } else {
                                                            toast.error("Erreur lors de la mise à jour.");
                                                        }
                                                    } catch {
                                                        toast.error("Erreur de connexion.");
                                                    } finally {
                                                        setAutoApprovalSaving(false);
                                                    }
                                                }}
                                            >
                                                Tout désactiver
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="default"
                                                className="h-8 px-3 text-xs"
                                                disabled={autoApprovalSaving}
                                                onClick={async () => {
                                                    setAutoApprovalSaving(true);
                                                    try {
                                                        const res = await fetch("/api/settings/auto-approval", {
                                                            method: "PUT",
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                Authorization: `Bearer ${token}`,
                                                            },
                                                            body: JSON.stringify({ auto_approval_enabled: true }),
                                                        });
                                                        if (res.ok) {
                                                            setAutoApprovalEnabled(true);
                                                            toast.success("Validation automatique réactivée.");
                                                        } else {
                                                            toast.error("Erreur lors de la mise à jour.");
                                                        }
                                                    } catch {
                                                        toast.error("Erreur de connexion.");
                                                    } finally {
                                                        setAutoApprovalSaving(false);
                                                    }
                                                }}
                                            >
                                                Réactiver
                                            </Button>
                                        )}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8 px-3 text-xs"
                                            onClick={() => setShowAutoApproval(!showAutoApproval)}
                                        >
                                            {showAutoApproval ? "Masquer" : "Gérer l'heure"}
                                        </Button>
                                    </div>
                                </div>

                                {showAutoApproval && (
                                    <div className="mt-2 space-y-4 pt-2 border-t border-border/40">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Heure de clôture (active après cette heure si la fonctionnalité est activée)
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="time"
                                                    value={autoApprovalHour}
                                                    onChange={(e) => setAutoApprovalHour(e.target.value)}
                                                    className="h-9 w-32 border rounded-md px-2 text-sm bg-background"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch("/api/settings/auto-approval", {
                                                                method: "PUT",
                                                                headers: {
                                                                    "Content-Type": "application/json",
                                                                    Authorization: `Bearer ${token}`,
                                                                },
                                                                body: JSON.stringify({ auto_approval_hour: autoApprovalHour }),
                                                            });
                                                            if (res.ok) {
                                                                toast.success("Heure de validation automatique mise à jour.");
                                                            } else {
                                                                toast.error("Erreur lors de la mise à jour.");
                                                            }
                                                        } catch {
                                                            toast.error("Erreur de connexion.");
                                                        }
                                                    }}
                                                >
                                                    Enregistrer
                                                </Button>
                                                {autoApprovalHour === "" && (
                                                    <span className="text-[10px] text-orange-500 italic">
                                                        Désactivé si vide
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-1">
                                                * Uniquement pour les utilisateurs avec le rôle &quot;Commercial&quot; (user), et uniquement si la validation automatique est activée (bouton ci-dessus).
                                                Les documents créés après cette heure peuvent être validés par défaut selon les règles métier (devis, commandes, etc.).
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Visibilité Tableau de Bord (masquée temporairement) */}
                            {false && <div className="flex flex-col gap-4 border border-border/40 rounded-lg p-3 bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <Package className="h-4 w-4" /> Visibilité Tableau de bord
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            Configurez les widgets visibles par rôle sur le dashboard.
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => setShowDashboardSettings(!showDashboardSettings)}
                                    >
                                        {showDashboardSettings ? "Masquer" : "Gérer"}
                                    </Button>
                                </div>

                                {showDashboardSettings && (
                                    <div className="mt-2 space-y-6 pt-2 border-t border-border/40">
                                        {['admin', 'responsable', 'user'].map((role) => (
                                            <div key={role} className="space-y-3">
                                                <h3 className="text-sm font-semibold uppercase text-primary">{role === 'user' ? 'Commercial' : role}</h3>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {[
                                                        { id: "stats_revenue", label: "CA Global" },
                                                        { id: "stats_month", label: "Ventes Mois" },
                                                        { id: "stats_products", label: "Nb Produits" },
                                                        { id: "stats_clients", label: "Nb Clients" },
                                                        { id: "stats_ca_today", label: "CA Aujourd'hui" },
                                                        { id: "stats_total_avoirs", label: "Total Avoirs" },
                                                        { id: "stats_fournisseurs", label: "Nb Fournisseurs" },
                                                        { id: "stats_pending_commandes", label: "Attentes" },
                                                        { id: "chart_monthly_sales", label: "Graph Mensuel" },
                                                        { id: "chart_pdv_sales", label: "Ventes par PDV" },
                                                        { id: "chart_client_types", label: "Types Clients" },
                                                        { id: "chart_caisse_recap", label: "Récap Caisse" },
                                                        { id: "sales_insights", label: "Insights ventes" },
                                                        { id: "table_top_products", label: "Top Produits" },
                                                        { id: "table_least_products", label: "Moins vendus" },
                                                        { id: "table_low_stock", label: "Stock Bas" },
                                                        { id: "quick_actions", label: "Actions Rapides" },
                                                    ].map((widget) => (
                                                        <label key={widget.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-muted transition-colors">
                                                            <input
                                                                type="checkbox"
                                                                checked={dashboardVisibility[role]?.includes(widget.id)}
                                                                onChange={(e) => {
                                                                    const current = dashboardVisibility[role] || [];
                                                                    const updated = e.target.checked
                                                                        ? [...current, widget.id]
                                                                        : current.filter((id: string) => id !== widget.id);
                                                                    setDashboardVisibility({
                                                                        ...dashboardVisibility,
                                                                        [role]: updated
                                                                    });
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                            />
                                                            <span className="text-xs">{widget.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        <div className="flex justify-end pt-2 border-t border-border/40">
                                            <Button
                                                size="sm"
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch("/api/settings/dashboard-visibility", {
                                                            method: "PUT",
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                Authorization: `Bearer ${token}`
                                                            },
                                                            body: JSON.stringify(dashboardVisibility)
                                                        });
                                                        if (res.ok) {
                                                            toast.success("Visibilité du dashboard mise à jour.");
                                                        } else {
                                                            toast.error("Erreur lors de la sauvegarde.");
                                                        }
                                                    } catch {
                                                        toast.error("Erreur de connexion.");
                                                    }
                                                }}
                                            >
                                                Sauvegarder la visibilité
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>}

                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isProductTypeDialogOpen} onOpenChange={setIsProductTypeDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editingProductType ? "Modifier le type" : "Ajouter un type"}</DialogTitle>
                        <DialogDescription>
                            Saisissez le nom et optionnellement une description pour le type de produit.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <label htmlFor="pt-name" className="text-sm font-medium">Nom</label>
                            <input
                                id="pt-name"
                                value={newProductTypeName}
                                onChange={(e) => setNewProductTypeName(e.target.value)}
                                className="h-10 w-full border rounded-md px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. Bijou"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label htmlFor="pt-desc" className="text-sm font-medium">Description</label>
                            <input
                                id="pt-desc"
                                value={newProductTypeDescription}
                                onChange={(e) => setNewProductTypeDescription(e.target.value)}
                                className="h-10 w-full border rounded-md px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Optionnel..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsProductTypeDialogOpen(false)}>Annuler</Button>
                        <Button onClick={handleCreateUpdateProductType} className="bg-indigo-600 text-white hover:bg-indigo-700">
                            {editingProductType ? "Mettre à jour" : "Enregistrer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
