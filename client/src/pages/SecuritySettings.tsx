import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Label } from "@/components/common/ui/label";
import { Input } from "@/components/common/ui/input";
import { Button } from "@/components/common/ui/button";
import { Shield, Save, Eye, EyeOff, Lock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "settings_security_dismissed_tips";

export default function SecuritySettings() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dismissedTips, setDismissedTips] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || "false");
        } catch {
            return false;
        }
    });

    const token = localStorage.getItem("token");

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("Les deux nouveaux mots de passe ne correspondent pas.");
            return;
        }
        if (newPassword.length < 6) {
            toast.error("Le nouveau mot de passe doit contenir au moins 6 caractères.");
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch("/api/users/me/change-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || "Échec du changement de mot de passe");
            }
            toast.success("Mot de passe mis à jour avec succès.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: any) {
            toast.error(err.message || "Erreur lors du changement de mot de passe.");
        } finally {
            setIsSaving(false);
        }
    };

    const dismissTips = () => {
        setDismissedTips(true);
        localStorage.setItem(STORAGE_KEY, "true");
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                    <Shield className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Sécurité</h1>
                    <p className="text-sm text-muted-foreground">
                        Mettez à jour votre mot de passe et consultez les conseils de sécurité.
                    </p>
                </div>
            </div>

            <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-indigo-500" />
                        Changer le mot de passe
                    </CardTitle>
                    <CardDescription>
                        Utilisez un mot de passe fort et unique. Nous ne le conservons qu’après chiffrement.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Mot de passe actuel</Label>
                            <div className="relative">
                                <Input
                                    type={showCurrent ? "text" : "password"}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="pr-10"
                                    required
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowCurrent(!showCurrent)}
                                >
                                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Nouveau mot de passe</Label>
                            <div className="relative">
                                <Input
                                    type={showNew ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="pr-10"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowNew(!showNew)}
                                >
                                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Confirmer le nouveau mot de passe</Label>
                            <Input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {isSaving ? (
                                <span className="animate-pulse">Enregistrement...</span>
                            ) : (
                                <>
                                    <Save className="h-4 w-4" />
                                    Mettre à jour le mot de passe
                                </>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {!dismissedTips && (
                <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20">
                    <CardHeader className="pb-2 flex flex-row items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <CardTitle className="text-base">Conseils de sécurité</CardTitle>
                        </div>
                        <Button variant="ghost" size="sm" onClick={dismissTips} className="text-muted-foreground">
                            Masquer
                        </Button>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-2">
                        <p>• Utilisez au moins 8 caractères, avec des majuscules, chiffres et symboles.</p>
                        <p>• Ne réutilisez pas ce mot de passe sur d’autres sites.</p>
                        <p>• Déconnectez-vous si vous utilisez un ordinateur partagé.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
