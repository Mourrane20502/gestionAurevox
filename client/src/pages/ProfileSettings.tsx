import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Label } from "@/components/common/ui/label";
import { Input } from "@/components/common/ui/input";
import { Button } from "@/components/common/ui/button";
import { Loader2, User, Mail, ShieldCheck, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface CurrentUser {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  role: string;
}

export default function ProfileSettings() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchMe = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error("Impossible de charger le profil");
        }
        const data = await res.json();
        setUser(data);
        setNom(data.nom || "");
        setPrenom(data.prenom || "");
        setEmail(data.email || "");
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || "Erreur lors du chargement du profil");
      } finally {
        setIsLoading(false);
      }
    };
    fetchMe();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const body: any = { nom, prenom, email };
      if (password.trim()) {
        body.password = password.trim();
      }

      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erreur lors de la mise à jour du profil");
      }

      toast.success("Profil mis à jour avec succès");
      setPassword("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erreur lors de la mise à jour du profil");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
          <User className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Profil</h1>
          <p className="text-sm text-muted-foreground">
            Mettez à jour vos informations personnelles et vos identifiants.
          </p>
        </div>
      </div>

      <Card className="border-border/40 bg-card/70 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
            Informations du compte
          </CardTitle>
          <CardDescription>
            Ces informations sont utilisées dans tout le système (devis, factures, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Nom
                </Label>
                <Input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Votre nom"
                  className="h-10"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Prénom
                </Label>
                <Input
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Votre prénom"
                  className="h-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Email
              </Label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="h-10 pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Nouveau mot de passe (optionnel)
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Laisser vide pour ne pas changer"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {user && (
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-3">
                <span>
                  ID utilisateur: <span className="font-mono text-foreground">{user.id}</span>
                </span>
                <span className="uppercase tracking-widest text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-2 py-1 rounded-md">
                  {user.role === 'user' ? 'Commercial' : (user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase())}
                </span>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <Button
                type="submit"
                disabled={isSaving}
                className="h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sauvegarde...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Enregistrer
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

