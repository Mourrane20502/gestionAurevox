import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Label } from "@/components/common/ui/label";
import { Switch } from "@/components/common/ui/switch";
import { Bell, Mail, MessageSquare, Volume2 } from "lucide-react";

const STORAGE_KEY = "settings_notifications";

interface NotificationPrefs {
    email: boolean;
    inApp: boolean;
    sound: boolean;
}

const defaults: NotificationPrefs = {
    email: true,
    inApp: true,
    sound: false,
};

function loadPrefs(): NotificationPrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...defaults, ...parsed };
        }
    } catch (_) {}
    return { ...defaults };
}

function savePrefs(prefs: NotificationPrefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export default function NotificationSettings() {
    const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        savePrefs(prefs);
    }, [prefs, mounted]);

    const update = (key: keyof NotificationPrefs, value: boolean) => {
        setPrefs((p) => ({ ...p, [key]: value }));
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                    <Bell className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Notifications</h1>
                    <p className="text-sm text-muted-foreground">
                        Choisissez comment vous souhaitez être informé (validations, rappels, etc.).
                    </p>
                </div>
            </div>

            <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Préférences</CardTitle>
                    <CardDescription>
                        Les réglages sont enregistrés automatiquement sur cet appareil.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/40">
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <Label className="text-base font-medium">Notifications par e-mail</Label>
                                <p className="text-xs text-muted-foreground">
                                    Recevoir des e-mails pour les validations et rappels importants.
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={prefs.email}
                            onCheckedChange={(v) => update("email", v)}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/40">
                        <div className="flex items-center gap-3">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <Label className="text-base font-medium">Notifications dans l’application</Label>
                                <p className="text-xs text-muted-foreground">
                                    Toasts et messages dans l’interface (succès, erreurs, infos).
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={prefs.inApp}
                            onCheckedChange={(v) => update("inApp", v)}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <Volume2 className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <Label className="text-base font-medium">Sons</Label>
                                <p className="text-xs text-muted-foreground">
                                    Jouer un son pour les notifications dans l’app.
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={prefs.sound}
                            onCheckedChange={(v) => update("sound", v)}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
