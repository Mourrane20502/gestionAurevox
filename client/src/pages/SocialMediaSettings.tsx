import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/ui/card";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import { Globe2, Save } from "lucide-react";
import { toast } from "sonner";

export default function SocialMediaSettings() {
    const token = localStorage.getItem("token");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [fbPageId, setFbPageId] = useState("");
    const [fbApiVersion, setFbApiVersion] = useState("v20.0");
    const [fbApiUrl, setFbApiUrl] = useState("https://graph.facebook.com");
    const [fbAccessToken, setFbAccessToken] = useState("");
    const [hasFbAccessToken, setHasFbAccessToken] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!token) return;
            setIsLoading(true);
            try {
                const res = await fetch("/api/settings/facebook", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("Impossible de charger la configuration Facebook");
                const data = await res.json();
                setFbPageId(data.fbPageId || "");
                setFbApiVersion(data.fbApiVersion || "v20.0");
                setFbApiUrl(data.fbApiUrl || "https://graph.facebook.com");
                setHasFbAccessToken(Boolean(data.hasAccessToken));
            } catch (err: any) {
                toast.error(err.message || "Erreur de chargement");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [token]);

    const handleSave = async () => {
        if (!token) return;
        setIsSaving(true);
        try {
            const res = await fetch("/api/settings/facebook", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    fbPageId,
                    fbApiVersion,
                    fbApiUrl,
                    ...(fbAccessToken.trim() ? { fbPageAccessToken: fbAccessToken.trim() } : {}),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Erreur lors de la sauvegarde");
            setFbAccessToken("");
            setHasFbAccessToken(true);
            toast.success("Parametres Facebook enregistres.");
        } catch (err: any) {
            toast.error(err.message || "Erreur serveur");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                    <Globe2 className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Reseaux sociaux</h1>
                    <p className="text-sm text-muted-foreground">
                        Configurez Facebook pour l&apos;autoposting.
                    </p>
                </div>
            </div>

            <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Facebook Autopost</CardTitle>
                    <CardDescription>
                        Cette configuration est stockee en base et utilisee par le module d&apos;autopost.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLoading ? (
                        <div className="text-sm text-muted-foreground">Chargement...</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>Facebook Page ID</Label>
                                    <Input
                                        value={fbPageId}
                                        onChange={(e) => setFbPageId(e.target.value)}
                                        placeholder="1637..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>API Version</Label>
                                    <Input
                                        value={fbApiVersion}
                                        onChange={(e) => setFbApiVersion(e.target.value)}
                                        placeholder="v25.0"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>API URL</Label>
                                <Input
                                    value={fbApiUrl}
                                    onChange={(e) => setFbApiUrl(e.target.value)}
                                    placeholder="https://graph.facebook.com"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>
                                    Page Access Token
                                    {hasFbAccessToken ? " (deja enregistre)" : ""}
                                </Label>
                                <Input
                                    type="password"
                                    value={fbAccessToken}
                                    onChange={(e) => setFbAccessToken(e.target.value)}
                                    placeholder={hasFbAccessToken ? "Laisser vide pour conserver le token actuel" : "EAA..."}
                                />
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={handleSave} disabled={isSaving}>
                                    <Save className="h-4 w-4 mr-2" />
                                    {isSaving ? "Enregistrement..." : "Enregistrer"}
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

