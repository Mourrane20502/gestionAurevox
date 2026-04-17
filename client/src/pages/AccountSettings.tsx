import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Label } from "@/components/common/ui/label";
import { Input } from "@/components/common/ui/input";
import { Button } from "@/components/common/ui/button";
import { Building2, Briefcase, FileCheck, Phone, Mail, ShieldAlert, Upload, Lock } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/common/ui/dialog";
import { toast } from "sonner";

interface Gestionnaire {
    id: number;
    nom: string;
    logo?: string;
    adresse: string;
    type_entreprise: string;
    email: string;
    responsable: string;
    telephone: string;
    ice: string;
    identifiant_fiscale: string;
    patente: string;
    cnss: string;
}

export default function AccountSettings() {
    const role = localStorage.getItem("role");
    const permissions = JSON.parse(localStorage.getItem("permissions") || "[]");
    const isAdmin = role === "admin";
    const canViewGestionnaire = isAdmin || permissions.includes("gestionnaires_view");

    const [gestionnaire, setGestionnaire] = useState<Gestionnaire | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [formData, setFormData] = useState({
        nom: "",
        logo: "",
        adresse: "",
        type_entreprise: "",
        email: "",
        responsable: "",
        telephone: "",
        ice: "",
        identifiant_fiscale: "",
        patente: "",
        cnss: ""
    });
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [twoFaEnabled, setTwoFaEnabled] = useState(false);
    const [twoFaEnabledAt, setTwoFaEnabledAt] = useState<string | null>(null);
    const [twoFaSetupOpen, setTwoFaSetupOpen] = useState(false);
    const [twoFaSecret, setTwoFaSecret] = useState("");
    const [twoFaQr, setTwoFaQr] = useState("");
    const [twoFaCode, setTwoFaCode] = useState("");
    const [twoFaDisableCode, setTwoFaDisableCode] = useState("");
    const [twoFaLoading, setTwoFaLoading] = useState(false);

    const token = localStorage.getItem("token");

    useEffect(() => {
        if (!canViewGestionnaire) {
            setIsLoading(false);
            return;
        }

        const fetchGestionnaire = async () => {
            setIsLoading(true);
            try {
                const res = await fetch("/api/gestionnaires", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) {
                    throw new Error("Impossible de charger les informations du compte");
                }
                const data: Gestionnaire[] = await res.json();
                const first = data[0] || null;
                setGestionnaire(first);
                if (first) {
                    setFormData({
                        nom: first.nom || "",
                        logo: first.logo || "",
                        adresse: first.adresse || "",
                        type_entreprise: first.type_entreprise || "",
                        email: first.email || "",
                        responsable: first.responsable || "",
                        telephone: first.telephone || "",
                        ice: first.ice || "",
                        identifiant_fiscale: first.identifiant_fiscale || "",
                        patente: first.patente || "",
                        cnss: first.cnss || ""
                    });
                }
            } catch (err: any) {
                console.error(err);
                toast.error(err.message || "Erreur lors du chargement du compte");
            } finally {
                setIsLoading(false);
            }
        };

        fetchGestionnaire();
    }, [canViewGestionnaire, token]);

    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                const res = await fetch("/api/auth/2fa/status", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setTwoFaEnabled(Boolean(data.enabled));
                    setTwoFaEnabledAt(data.enabled_at || null);
                }
            } catch {
                // silent
            }
        })();
    }, [token]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setLogoFile(e.target.files[0]);
        } else {
            setLogoFile(null);
        }
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!formData.nom.trim()) errors.nom = "Le nom est requis";
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        setIsSaving(true);
        try {
            const method = gestionnaire ? "PUT" : "POST";
            const url = gestionnaire ? `/api/gestionnaires/${gestionnaire.id}` : "/api/gestionnaires";
            const data = new FormData();
            Object.entries(formData).forEach(([key, value]) => {
                if (key === "logo") return;
                if (value !== null && value !== "") {
                    data.append(key, value as string);
                }
            });
            if (logoFile) {
                data.append("logo", logoFile);
            }

            const res = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: data
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || "Erreur lors de l'enregistrement");
            }

            toast.success("Compte société mis à jour avec succès");
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Erreur lors de l'enregistrement du compte");
        } finally {
            setIsSaving(false);
        }
    };

    if (!canViewGestionnaire) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <Card className="max-w-md w-full text-center">
                    <CardHeader>
                        <CardTitle>Accès restreint</CardTitle>
                        <CardDescription>
                            Seuls les administrateurs peuvent voir et modifier les informations du compte société.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <ShieldAlert className="h-6 w-6 animate-pulse text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                    <Building2 className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Compte société</h1>
                    <p className="text-sm text-muted-foreground">
                        Consultez et mettez à jour les informations de votre gestionnaire (raison sociale, coordonnées, fiscalité).
                    </p>
                </div>
            </div>

            <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Lock className="h-4 w-4 text-indigo-500" />
                        Sécurité du compte - 2FA
                    </CardTitle>
                    <CardDescription>
                        Activez la double authentification avec une application Authenticator.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-muted-foreground">Statut</span>
                                <span
                                    className={
                                        twoFaEnabled
                                            ? "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                            : "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                                    }
                                >
                                    {twoFaEnabled ? "Activée" : "Désactivée"}
                                </span>
                            </div>
                            {twoFaEnabledAt && (
                                <span className="text-[11px] text-muted-foreground">
                                    Activée le {new Date(twoFaEnabledAt).toLocaleString("fr-FR")}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {!twoFaEnabled ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 px-3 text-xs"
                                    disabled={twoFaLoading}
                                    onClick={async () => {
                                        setTwoFaLoading(true);
                                        try {
                                            const res = await fetch("/api/auth/2fa/setup", {
                                                method: "POST",
                                                headers: { Authorization: `Bearer ${token}` },
                                            });
                                            const data = await res.json();
                                            if (!res.ok) {
                                                toast.error(data.message || "Impossible de démarrer la configuration 2FA.");
                                                return;
                                            }
                                            setTwoFaSecret(data.secret || "");
                                            setTwoFaQr(data.qrCodeDataUrl || "");
                                            setTwoFaCode("");
                                            setTwoFaSetupOpen(true);
                                        } catch {
                                            toast.error("Erreur de connexion.");
                                        } finally {
                                            setTwoFaLoading(false);
                                        }
                                    }}
                                >
                                    Activer 2FA
                                </Button>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={twoFaDisableCode}
                                        onChange={(e) => setTwoFaDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                        placeholder="Code 2FA"
                                        className="h-8 w-28 border rounded-md px-2 text-xs bg-background"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
                                        disabled={twoFaLoading || twoFaDisableCode.length < 6}
                                        onClick={async () => {
                                            setTwoFaLoading(true);
                                            try {
                                                const res = await fetch("/api/auth/2fa/disable", {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type": "application/json",
                                                        Authorization: `Bearer ${token}`,
                                                    },
                                                    body: JSON.stringify({ code: twoFaDisableCode }),
                                                });
                                                const data = await res.json();
                                                if (!res.ok) {
                                                    toast.error(data.message || "Impossible de désactiver la 2FA.");
                                                    return;
                                                }
                                                setTwoFaEnabled(false);
                                                setTwoFaEnabledAt(null);
                                                setTwoFaDisableCode("");
                                                toast.success("2FA désactivée.");
                                            } catch {
                                                toast.error("Erreur de connexion.");
                                            } finally {
                                                setTwoFaLoading(false);
                                            }
                                        }}
                                    >
                                        Désactiver
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {gestionnaire && (
                <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
                    <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Building2 className="h-4 w-4 text-indigo-500" />
                                Récapitulatif actuel
                            </CardTitle>
                            <CardDescription>Vue synthétique des informations enregistrées pour votre société.</CardDescription>
                        </div>
                        {gestionnaire.logo && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                                    Logo société
                                </span>
                                <div className="size-20 rounded-xl border border-border bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center">
                                    <img
                                        src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${gestionnaire.logo}`}
                                        alt={gestionnaire.nom || "Logo société"}
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Société</span>
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
                                {gestionnaire.nom}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {gestionnaire.type_entreprise || "Type d'entreprise non renseigné"}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Fiscalité</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <FileCheck className="h-3.5 w-3.5 text-blue-500" />
                                ICE: {gestionnaire.ice || "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                IF: {gestionnaire.identifiant_fiscale || "—"} · RC: {gestionnaire.patente || "—"}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Contact</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-emerald-500" />
                                {gestionnaire.telephone || "—"}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-indigo-400" />
                                {gestionnaire.email || "—"}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Upload className="h-4 w-4 text-indigo-500" />
                        Modifier les informations
                    </CardTitle>
                    <CardDescription>
                        Les champs suivants impactent vos documents (devis, factures, etc.) ainsi que le branding de l’interface.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Nom / Raison sociale *
                                </Label>
                                <Input
                                    name="nom"
                                    value={formData.nom}
                                    onChange={handleInputChange}
                                    placeholder="Ex: Bijouterie Luxe SARL"
                                />
                                {formErrors.nom && (
                                    <p className="text-xs text-red-500">{formErrors.nom}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Logo (fichier)
                                </Label>
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoChange}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Responsable
                                </Label>
                                <Input
                                    name="responsable"
                                    value={formData.responsable}
                                    onChange={handleInputChange}
                                    placeholder="Nom du responsable"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Type d'entreprise
                                </Label>
                                <Input
                                    name="type_entreprise"
                                    value={formData.type_entreprise}
                                    onChange={handleInputChange}
                                    placeholder="Ex: SARL, Auto-entrepreneur"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Email professionnel
                                </Label>
                                <Input
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    placeholder="contact@bijouterie.com"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Téléphone
                                </Label>
                                <Input
                                    name="telephone"
                                    value={formData.telephone}
                                    onChange={handleInputChange}
                                    placeholder="+212..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    ICE
                                </Label>
                                <Input
                                    name="ice"
                                    value={formData.ice}
                                    onChange={handleInputChange}
                                    placeholder="Identifiant Commun Entreprise"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Identifiant fiscal
                                </Label>
                                <Input
                                    name="identifiant_fiscale"
                                    value={formData.identifiant_fiscale}
                                    onChange={handleInputChange}
                                    placeholder="IF"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Patente
                                </Label>
                                <Input
                                    name="patente"
                                    value={formData.patente}
                                    onChange={handleInputChange}
                                    placeholder="N° Patente"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    CNSS
                                </Label>
                                <Input
                                    name="cnss"
                                    value={formData.cnss}
                                    onChange={handleInputChange}
                                    placeholder="N° CNSS"
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Adresse
                                </Label>
                                <Input
                                    name="adresse"
                                    value={formData.adresse}
                                    onChange={handleInputChange}
                                    placeholder="Adresse complète"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button
                                type="submit"
                                disabled={isSaving}
                                className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                            >
                                {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Dialog open={twoFaSetupOpen} onOpenChange={setTwoFaSetupOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Activer la 2FA</DialogTitle>
                        <DialogDescription>
                            Scannez le QR code avec votre application d&apos;authentification puis entrez le code à 6 chiffres.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {twoFaQr ? (
                            <div className="flex justify-center">
                                <img src={twoFaQr} alt="QR Code 2FA" className="h-44 w-44 rounded-md border bg-white p-2" />
                            </div>
                        ) : null}
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Clé manuelle</p>
                            <code className="block text-center break-all rounded-md bg-muted p-2 text-xs">{twoFaSecret || "-"}</code>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Code de vérification</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={twoFaCode}
                                onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="123456"
                                className="h-10 w-full border rounded-md px-3 text-sm"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTwoFaSetupOpen(false)}>
                            Annuler
                        </Button>
                        <Button
                            disabled={twoFaLoading || twoFaCode.length < 6}
                            onClick={async () => {
                                setTwoFaLoading(true);
                                try {
                                    const res = await fetch("/api/auth/2fa/enable", {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                        },
                                        body: JSON.stringify({ code: twoFaCode }),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) {
                                        toast.error(data.message || "Code invalide.");
                                        return;
                                    }
                                    setTwoFaEnabled(true);
                                    setTwoFaEnabledAt(new Date().toISOString());
                                    setTwoFaSetupOpen(false);
                                    setTwoFaCode("");
                                    toast.success("2FA activée avec succès.");
                                } catch {
                                    toast.error("Erreur de connexion.");
                                } finally {
                                    setTwoFaLoading(false);
                                }
                            }}
                        >
                            Confirmer l&apos;activation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

