import { useEffect, useMemo, useState } from "react";
import { Shield, Save, RefreshCcw, Check } from "lucide-react";
import { Button } from "@/components/common/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/common/ui/card";
import { Switch } from "@/components/common/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/common/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Role {
    id: number;
    name: string;
}

interface Permission {
    id: number;
    name: string;
    description: string;
}

type ProductActionConfig = {
    canEdit: boolean;
    canDelete: boolean;
};

type ProductActionConfigByRole = Record<string, ProductActionConfig>;

const defaultProductActionConfigByRole = (): ProductActionConfigByRole => ({
    admin: { canEdit: true, canDelete: true },
    responsable: { canEdit: true, canDelete: true },
    directeur: { canEdit: true, canDelete: true },
    comptable: { canEdit: false, canDelete: false },
    user: { canEdit: false, canDelete: false },
});

const GROS_APPROVAL_KEYS = ["devis_gros", "commande_gros", "facture_gros", "avoir_gros"] as const;

const isGrosPermission = (p: Permission) => /gros/i.test(p.name) || /gros/i.test(p.description);

const stripGrosFromApprovalConfigs = (configs: Record<string, string[]>) => {
    const next = { ...configs };
    for (const key of GROS_APPROVAL_KEYS) delete next[key];
    return next;
};

const APPROVAL_DOC_TYPES = [
    { key: "devis", label: "Devis" },
    { key: "facture", label: "Factures" },
    { key: "commande", label: "Commandes" },
    { key: "avoir", label: "Avoirs" },
    { key: "inventaire", label: "Inventaire" },
    { key: "achats_fournisseurs", label: "Achats fournisseurs" },
    { key: "reglements", label: "Règlements" },
    { key: "remboursements", label: "Remboursements" },
] as const;

export default function Permissions() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
    const [rolePermissionIds, setRolePermissionIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [approvalConfigs, setApprovalConfigs] = useState<Record<string, string[]>>({});
    const [availableRoles] = useState(['admin', 'responsable', 'directeur', 'comptable', 'user']);
    const [isSavingApproval, setIsSavingApproval] = useState(false);
    const [productActionConfigs, setProductActionConfigs] = useState<ProductActionConfigByRole>(() =>
        defaultProductActionConfigByRole()
    );

    const token = localStorage.getItem("token");

    const visiblePermissions = useMemo(
        () => permissions.filter((p) => !isGrosPermission(p)),
        [permissions],
    );

    const activeVisiblePermissionIds = useMemo(
        () => rolePermissionIds.filter((id) => visiblePermissions.some((p) => p.id === id)),
        [rolePermissionIds, visiblePermissions],
    );

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [rolesRes, permsRes] = await Promise.all([
                fetch("/api/role-permissions/roles", {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch("/api/role-permissions/permissions", {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            if (rolesRes.ok && permsRes.ok) {
                const rolesData = await rolesRes.json();
                const permsData = await permsRes.json();
                const rolesWithoutSuperadmin = rolesData.filter((r: Role) => r.name !== "superadmin");
                setRoles(rolesWithoutSuperadmin);
                setPermissions(permsData);

                if (rolesWithoutSuperadmin.length > 0) {
                    setSelectedRoleId(rolesWithoutSuperadmin[0].id);
                }
            } else {
                toast.error("Erreur lors du chargement des données");
            }
        } catch (error) {
            console.error("Error fetching RBAC data:", error);
            toast.error("Erreur réseau");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchApprovalConfigs = async () => {
        if (!token) return;
        try {
            const res = await fetch("/api/settings/approval", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setApprovalConfigs(stripGrosFromApprovalConfigs(data));
            }
        } catch (error) {
            console.error("Error fetching approval configs:", error);
        }
    };

    const fetchProductActionConfigs = async () => {
        if (!token) return;
        try {
            const res = await fetch("/api/settings/product-actions", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            setProductActionConfigs({
                ...defaultProductActionConfigByRole(),
                ...(data || {}),
            });
        } catch (error) {
            console.error("Error fetching product action configs:", error);
        }
    };

    const fetchRolePermissions = async (roleId: number) => {
        try {
            const response = await fetch(`/api/role-permissions/role-permissions/${roleId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setRolePermissionIds(data);
            }
        } catch (error) {
            console.error("Error fetching role permissions:", error);
        }
    };

    useEffect(() => {
        fetchData();
        fetchApprovalConfigs();
        fetchProductActionConfigs();
    }, []);

    const persistProductActionConfigs = async (next: ProductActionConfigByRole) => {
        if (!token) return;
        setProductActionConfigs(next);
        try {
            const res = await fetch("/api/settings/product-actions", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(next),
            });
            if (!res.ok) throw new Error("Échec de sauvegarde");
            toast.success("Actions produits mises à jour");
        } catch {
            toast.error("Erreur lors de l'enregistrement des actions produits");
        }
    };

    useEffect(() => {
        if (selectedRoleId) {
            fetchRolePermissions(selectedRoleId);
        }
    }, [selectedRoleId]);

    const handleTogglePermission = async (permissionId: number) => {
        if (!selectedRoleId) return;
        const nextPermissionIds = rolePermissionIds.includes(permissionId)
            ? rolePermissionIds.filter(id => id !== permissionId)
            : [...rolePermissionIds, permissionId];
        setRolePermissionIds(nextPermissionIds);
        setIsSaving(true);
        try {
            const response = await fetch("/api/role-permissions/update-role-permissions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    roleId: selectedRoleId,
                    permissionIds: nextPermissionIds
                })
            });

            if (response.ok) {
                toast.success("Permissions mises à jour avec succès");
            } else {
                setRolePermissionIds(rolePermissionIds);
                toast.error("Échec de la mise à jour");
            }
        } catch (error) {
            setRolePermissionIds(rolePermissionIds);
            toast.error("Erreur réseau");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveApproval = async () => {
        if (!token) return;
        setIsSavingApproval(true);
        try {
            const res = await fetch("/api/settings/approval", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(stripGrosFromApprovalConfigs(approvalConfigs)),
            });
            if (res.ok) {
                toast.success("Configurations d'approbation enregistrées");
            } else {
                toast.error("Erreur lors de l'enregistrement");
            }
        } catch {
            toast.error("Erreur de connexion");
        } finally {
            setIsSavingApproval(false);
        }
    };

    const formatRoleName = (name: string) => {
        if (name.toLowerCase() === 'user') return 'Commercial';
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    };

    const editableRoleNames = ["admin", "responsable", "directeur", "comptable", "user"];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCcw className="h-8 w-8 animate-spin text-primary/40" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-start">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Shield className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                        Permissions & Rôles
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Configurez les accès pour chaque rôle d'utilisateur.
                    </p>
                </div>
            </div>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl">Gestion des accès</CardTitle>
                    <CardDescription>
                        Activez ou désactivez les fonctionnalités pour le rôle sélectionné.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col gap-4">
                        <label className="text-sm font-medium text-muted-foreground">Choisir un rôle :</label>
                        <Tabs
                            value={selectedRoleId?.toString()}
                            onValueChange={(val) => setSelectedRoleId(parseInt(val))}
                            className="w-full"
                        >
                            <TabsList className="bg-muted/50 p-1 mb-6">
                                {roles.map(role => (
                                    <TabsTrigger
                                        key={role.id}
                                        value={role.id.toString()}
                                        className="px-8 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-950/40 data-[state=active]:text-indigo-600 transition-all duration-300"
                                    >
                                        <span>
                                            {formatRoleName(role.name)}
                                        </span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {visiblePermissions.map((permission) => (
                            <div
                                key={permission.id}
                                className={cn(
                                    "p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4",
                                    rolePermissionIds.includes(permission.id)
                                        ? "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50"
                                        : "bg-background/40 border-border/40"
                                )}
                            >
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-foreground">{permission.description}</p>
                                </div>
                                <Switch
                                    checked={rolePermissionIds.includes(permission.id)}
                                    disabled={isSaving || !selectedRoleId}
                                    onCheckedChange={() => handleTogglePermission(permission.id)}

                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Check className="h-4 w-4 text-emerald-500" />
                            Résumé des permissions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {visiblePermissions.filter(p => rolePermissionIds.includes(p.id)).slice(0, 5).map(p => (
                                <li key={p.id} className="text-xs text-muted-foreground flex items-center gap-2">
                                    <div className="h-1 w-1 bg-emerald-500 rounded-full" />
                                    {p.description}
                                </li>
                            ))}
                            {activeVisiblePermissionIds.length > 5 && (
                                <li className="text-[10px] italic text-muted-foreground ml-3">
                                    + {activeVisiblePermissionIds.length - 5} autres permissions...
                                </li>
                            )}
                            {activeVisiblePermissionIds.length === 0 && (
                                <li className="text-xs text-muted-foreground italic">Aucune permission activée</li>
                            )}
                        </ul>
                    </CardContent>
                </Card>

                <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Shield className="h-4 w-4 text-indigo-500" />
                            Info Rôle
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Le rôle{" "}
                                    <span className="text-foreground font-bold underline decoration-indigo-500/30 uppercase">
                                        {(() => {
                                            const r = roles.find(r => r.id === selectedRoleId);
                                            if (!r) return "NÉANT";
                                            return formatRoleName(r.name).toUpperCase();
                                        })()}
                                    </span>{" "}
                            a accès à{" "}
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                                {activeVisiblePermissionIds.length}
                            </span>{" "}
                            fonctionnalités du système sur un total de {visiblePermissions.length}.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                <CardHeader>
                    <CardTitle className="text-xl">Actions Produits par rôle</CardTitle>
                    <CardDescription>
                        Activez ou désactivez l&apos;édition et la suppression des produits sans modifier la base de données.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                        <p className="text-sm font-semibold text-foreground">
                            Contrôle global des rôles
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            En tant qu&apos;admin, vous pouvez activer/désactiver Modifier et Supprimer pour tous les rôles.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {editableRoleNames.map((roleName) => {
                            const roleActions = productActionConfigs[roleName] || { canEdit: false, canDelete: false };
                            return (
                                <div key={roleName} className="p-4 rounded-2xl border border-border/40 bg-background/40 space-y-3">
                                    <p className="text-sm font-bold text-foreground">
                                        {formatRoleName(roleName)}
                                    </p>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium">Éditer produit</p>
                                            <p className="text-xs text-muted-foreground">Bouton Modifier</p>
                                        </div>
                                        <Switch
                                            checked={roleActions.canEdit}
                                            onCheckedChange={async (checked) => {
                                                await persistProductActionConfigs({
                                                    ...productActionConfigs,
                                                    [roleName]: {
                                                        ...roleActions,
                                                        canEdit: checked,
                                                    },
                                                });
                                            }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium">Supprimer produit</p>
                                            <p className="text-xs text-muted-foreground">Bouton Supprimer</p>
                                        </div>
                                        <Switch
                                            checked={roleActions.canDelete}
                                            onCheckedChange={async (checked) => {
                                                await persistProductActionConfigs({
                                                    ...productActionConfigs,
                                                    [roleName]: {
                                                        ...roleActions,
                                                        canDelete: checked,
                                                    },
                                                });
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle className="text-xl">Niveaux d&apos;approbation</CardTitle>
                        <CardDescription>
                            Définissez qui peut approuver les documents (Devis, Factures, Commandes, Avoirs, Inventaire, Achats fournisseurs, Règlements, Remboursements).
                        </CardDescription>
                    </div>
                    <Button 
                        onClick={handleSaveApproval} 
                        disabled={isSavingApproval}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {isSavingApproval ? (
                            <RefreshCcw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Enregistrer
                    </Button>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {APPROVAL_DOC_TYPES.map(({ key: docType, label }) => (
                            <div key={docType} className="p-4 rounded-2xl border border-border/40 bg-background/40 space-y-4">
                                <h4 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                    {label}
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {availableRoles.map((role) => {
                                        const isSelected = approvalConfigs[docType]?.includes(role);
                                        return (
                                            <button
                                                key={role}
                                                type="button"
                                                onClick={() => {
                                                    const current = approvalConfigs[docType as string] || [];
                                                    const next = isSelected
                                                        ? current.filter((r: string) => r !== role)
                                                        : [...current, role];
                                                    setApprovalConfigs({ ...approvalConfigs, [docType]: next });
                                                }}
                                                className={cn(
                                                    "px-4 py-2 rounded-xl text-xs font-medium transition-all border",
                                                    isSelected
                                                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                                                        : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                                                )}
                                            >
                                                {formatRoleName(role)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
