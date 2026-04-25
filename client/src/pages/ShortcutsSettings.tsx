import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Label } from "@/components/common/ui/label";
import { Switch } from "@/components/common/ui/switch";
import { Keyboard, Command } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "settings_shortcuts_enabled";

const SHORTCUTS: { keys: string; description: string; context?: string }[] = [
    { keys: "Ctrl + S", description: "Enregistrer / Soumettre le formulaire", context: "Formulaires" },
    { keys: "Ctrl + K", description: "Recherche globale (si activée)", context: "Navigation" },
    { keys: "Échap", description: "Fermer la modale ou annuler", context: "Modales" },
    { keys: "Entrée", description: "Valider dans les champs de recherche", context: "Recherche" },
];

function isShortcutsEnabled(): boolean {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v !== "false";
    } catch {
        return true;
    }
}

export default function ShortcutsSettings() {
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        setEnabled(isShortcutsEnabled());
    }, []);

    const handleToggle = (v: boolean) => {
        setEnabled(v);
        localStorage.setItem(STORAGE_KEY, v ? "true" : "false");
        toast.success(v ? "Raccourcis activés" : "Raccourcis désactivés");
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                    <Keyboard className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Raccourcis clavier</h1>
                    <p className="text-sm text-muted-foreground">
                        Liste des raccourcis disponibles et option pour les activer ou les désactiver.
                    </p>
                </div>
            </div>

            <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                        <Command className="h-4 w-4 text-indigo-500" />
                        Activer les raccourcis
                    </CardTitle>
                    <CardDescription>
                        Quand ils sont activés, les raccourcis clavier (Ctrl+S, etc.) fonctionnent dans l’application.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between gap-4">
                        <Label className="text-base">Raccourcis clavier</Label>
                        <Switch checked={enabled} onCheckedChange={handleToggle} />
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Raccourcis disponibles</CardTitle>
                    <CardDescription>
                        Ces touches sont reconnues dans les écrans concernés.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-3">
                        {SHORTCUTS.map((s, i) => (
                            <li
                                key={i}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-border/40 last:border-0"
                            >
                                <span className="text-sm text-muted-foreground">{s.description}</span>
                                <kbd className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-muted text-foreground font-mono text-xs border border-border/60">
                                    {s.keys.includes("+") ? (
                                        s.keys.split("+").map((k, j) => (
                                            <span key={j} className="flex items-center gap-0.5">
                                                {j > 0 && <span className="text-muted-foreground">+</span>}
                                                <span>{k.trim()}</span>
                                            </span>
                                        ))
                                    ) : (
                                        <span>{s.keys}</span>
                                    )}
                                </kbd>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
