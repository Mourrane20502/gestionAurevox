import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/common/ui/card";
import {
    Activity,
    AlertTriangle,
    TrendingUp,
    Wallet,
    Receipt,
    ArrowRight,
    Store,
    Package,
    Users,
    FileText,
    
    TrendingDown,
    Sparkles,
    Clock,
    ChevronRight,
    Search,
    Bell,
    LayoutDashboard,
    ShoppingBag,
    BarChart3,
    ListOrdered,
    RotateCcw,
    Truck,
    CircleDollarSign,
    Banknote,
    Megaphone,
    Send,
    Ticket,
    Shield,
    Zap,
    ShieldAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    BarChart as ReBarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    PieChart,
    Pie,
    Cell,
    Area,
    AreaChart,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND_ACCENT = "#E09536"; // Warm amber/orange brand accent
/** Taux fixe pour affichage indicatif sur le dashboard (USD → MAD). */
const USD_TO_MAD = 9.37;
const COLORS = [
    '#6366f1', // Indigo 500
    '#10b981', // Emerald 500
    BRAND_ACCENT, // Brand accent
    '#ef4444', // Red 500
    '#8b5cf6', // Violet 500
    '#ec4899', // Pink 500
    '#06b6d4', // Cyan 500
];

/** Cartes vitrées — même langage visuel que la section « Aperçu de l’activité » */
const dashGlassCard =
    "relative overflow-hidden rounded-[2rem] border border-slate-200/70 dark:border-white/[0.08] bg-gradient-to-br from-white via-white to-slate-50/90 dark:from-[#181818] dark:via-[#151515] dark:to-[#0c0c0c] shadow-[0_22px_56px_-28px_rgba(79,70,229,0.2)] dark:shadow-[0_28px_70px_-24px_rgba(0,0,0,0.72)] backdrop-blur-md";
const dashSectionShell =
    "relative overflow-hidden rounded-[2.5rem] border border-slate-200/55 dark:border-white/[0.07] bg-gradient-to-br from-white via-indigo-50/25 to-emerald-50/20 dark:from-[#101012] dark:via-[#12161c] dark:to-[#0a0e12] shadow-[0_32px_80px_-36px_rgba(67,56,202,0.22)] dark:shadow-[0_40px_100px_-40px_rgba(0,0,0,0.8)]";

/** Commandes déjà couvertes par au moins une facture — ne pas additionner leur TTC à celui des factures (double comptage). */
function getCommandeIdsLinkedToFactures(factures: any[]): Set<number> {
    const set = new Set<number>();
    if (!Array.isArray(factures)) return set;
    for (const f of factures) {
        if (f?.commande_id == null) continue;
        const id = Number(f.commande_id);
        if (Number.isFinite(id)) set.add(id);
    }
    return set;
}

function AnimatedCounter({
    value,
    format,
    className,
}: {
    value: number;
    format: (n: number) => string;
    className?: string;
}) {
    const [display, setDisplay] = useState<number>(value);
    const previous = useRef<number>(value);

    useEffect(() => {
        const prefersReduced =
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        if (prefersReduced) {
            setDisplay(value);
            previous.current = value;
            return;
        }

        const from = previous.current;
        const to = value;
        if (from === to) return;

        const duration = 700;
        const start = performance.now();
        let raf = 0;

        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        const step = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(1, elapsed / duration);
            const eased = easeOutCubic(progress);
            const current = from + (to - from) * eased;
            setDisplay(current);
            if (progress < 1) {
                raf = requestAnimationFrame(step);
            } else {
                previous.current = to;
            }
        };

        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value]);

    return <span className={className}>{format(display)}</span>;
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [role, setRole] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>("Utilisateur");
    const [gestionnaireName, setGestionnaireName] = useState<string>("");
    const [greeting, setGreeting] = useState("");
    const [counts, setCounts] = useState({
        products: 0,
        clients: 0,
        fournisseurs: 0,
        pendingDevis: 0,
        pendingCommandes: 0,
        pendingFactures: 0,
        pendingAvoirs: 0,
        totalSalesDevis: 0,
        totalSalesFactures: 0,
        totalSalesCommandes: 0,
        totalRegleCommandes: 0,
        totalAvoirs: 0,
        liquiditesTotales: 0,
        lowStockCount: 0,
        lowStockProducts: [] as any[],
        impayeCount: 0,
    });
    const [monthlySales, setMonthlySales] = useState<{ label: string; mois: string; commandes: number; factures: number; total: number; achats: number }[]>([]);
    const [pdvSales, setPdvSales] = useState<{ name: string; value: number }[]>([]);
    const [clientTypes, setClientTypes] = useState<{ name: string; value: number }[]>([]);
    const [topProducts, setTopProducts] = useState<{ name: string; quantity: number }[]>([]);
    const [salesInsights, setSalesInsights] = useState({
        caLast30d: 0,
        caMonthTotal: 0,
        caMonthFactures: 0,
        caMonthCommandes: 0,
        invoicesThisMonthCount: 0,
        validatedOrdersThisMonthCount: 0,
        avgFactureTtc: 0,
        facturePayee: 0,
        factureNonPayee: 0,
        factureEnAttente: 0,
        partFacturesPct: 0,
    });
    const [caToday, setCaToday] = useState<number>(0);
    const [caYesterday, setCaYesterday] = useState<number>(0);
    const [transactionsToday, setTransactionsToday] = useState<number>(0);
    const [averageBasketToday, setAverageBasketToday] = useState<number>(0);
    
    // UI States
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [visibility, setVisibility] = useState<any>({});
    const [goldPriceUsd, setGoldPriceUsd] = useState<number | null>(null);
    const [goldUpdatedAt, setGoldUpdatedAt] = useState<string>("");
    const [goldLoading, setGoldLoading] = useState<boolean>(true);
    const [silverPriceUsd, setSilverPriceUsd] = useState<number | null>(null);
    const [silverUpdatedAt, setSilverUpdatedAt] = useState<string>("");
    const [silverLoading, setSilverLoading] = useState<boolean>(true);

    // Superadmin: rediriger vers Point de Vente (pas de dashboard)
    useEffect(() => {
        const r = (localStorage.getItem("role") || "").toLowerCase();
        if (r === "superadmin") {
            navigate("/dashboard/pdv", { replace: true });
        }
    }, [navigate]);

    useEffect(() => {
        let mounted = true;

        const fetchMetalPrices = async () => {
            if (mounted) {
                setGoldLoading(true);
                setSilverLoading(true);
            }
            try {
                const [goldRes, silverRes] = await Promise.all([
                    fetch("https://api.gold-api.com/price/XAU"),
                    fetch("https://api.gold-api.com/price/XAG"),
                ]);
                if (!goldRes.ok) throw new Error("Gold API request failed");
                if (!silverRes.ok) throw new Error("Silver API request failed");

                const [goldData, silverData] = await Promise.all([
                    goldRes.json(),
                    silverRes.json(),
                ]);
                if (!mounted) return;

                const goldPrice = Number(goldData?.price);
                setGoldPriceUsd(Number.isFinite(goldPrice) ? goldPrice : null);
                setGoldUpdatedAt(goldData?.updatedAtReadable || "");

                const silverPrice = Number(silverData?.price);
                setSilverPriceUsd(Number.isFinite(silverPrice) ? silverPrice : null);
                setSilverUpdatedAt(silverData?.updatedAtReadable || "");
            } catch {
                if (!mounted) return;
                setGoldPriceUsd(null);
                setGoldUpdatedAt("");
                setSilverPriceUsd(null);
                setSilverUpdatedAt("");
            } finally {
                if (mounted) {
                    setGoldLoading(false);
                    setSilverLoading(false);
                }
            }
        };

        fetchMetalPrices();
        const timer = window.setInterval(fetchMetalPrices, 5 * 60 * 1000);
        return () => {
            mounted = false;
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        const storedRole = localStorage.getItem("role");
        setRole(storedRole);

        const jwtToken = localStorage.getItem("token");
        if (jwtToken) {
            try {
                const payload = JSON.parse(atob(jwtToken.split(".")[1]));
                const fullName = `${payload.prenom || ""} ${payload.nom || ""}`.trim();
                if (fullName) setUserName(fullName);
            } catch {
                /* ignore */
            }
        }

        const hour = new Date().getHours();
        if (hour < 12) setGreeting("Bonjour");
        else if (hour < 18) setGreeting("Bon après-midi");
        else setGreeting("Bonsoir");

        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        const fetchData = async () => {
            try {
                const [prodRes, clientRes, devisRes, fournisseursRes, commandesRes, facturesRes, avoirsRes, achatsRes, reglementsRes, banqueRes, reglementsFournisseursRes, caisseRes, remboursementsRes, topProductsRes, visRes, gestionnairesRes] =
                    await Promise.all([
                    fetch("/api/products", { headers }),
                    fetch("/api/clients", { headers }),
                    fetch("/api/devis", { headers }),
                    fetch("/api/fournisseurs", { headers }),
                    fetch("/api/commandes", { headers }),
                    fetch("/api/factures", { headers }),
                    fetch("/api/avoirs", { headers }),
                    fetch("/api/achats", { headers }),
                    fetch("/api/reglements-clients", { headers }),
                    fetch("/api/banque", { headers }),
                    fetch("/api/reglements-fournisseurs", { headers }),
                    fetch("/api/caisse", { headers }),
                    fetch("/api/remboursements", { headers }),
                    fetch("/api/factures/top-products?limit=5&months=6", { headers }),
                    fetch("/api/settings/dashboard-visibility", { headers }),
                    fetch("/api/gestionnaires", { headers }),
                ]);

                const products = prodRes.ok ? await prodRes.json() : [];
                const clients = clientRes.ok ? await clientRes.json() : [];
                const devis = devisRes.ok ? await devisRes.json() : [];
                const commandes = commandesRes.ok ? await commandesRes.json() : [];
                const factures = facturesRes.ok ? await facturesRes.json() : [];
                const avoirs = avoirsRes.ok ? await avoirsRes.json() : [];
                const fournisseurs = fournisseursRes.ok ? await fournisseursRes.json() : [];
                const achats = achatsRes.ok ? await achatsRes.json() : [];
                const reglements = reglementsRes.ok ? await reglementsRes.json() : [];
                const banqueData = banqueRes.ok ? await banqueRes.json() : [];
                const reglementsFournisseurs = reglementsFournisseursRes.ok ? await reglementsFournisseursRes.json() : [];
                const remboursements = remboursementsRes.ok ? await remboursementsRes.json() : [];
                const caisse = caisseRes.ok ? await caisseRes.json() : [];
                const topProductsApi = topProductsRes.ok ? await topProductsRes.json() : [];
                const visibilityData = visRes.ok ? await visRes.json() : {};
                const gestionnairesData = gestionnairesRes.ok ? await gestionnairesRes.json() : [];
                setVisibility(visibilityData);
                setGestionnaireName(
                    Array.isArray(gestionnairesData) && gestionnairesData[0]?.nom
                        ? String(gestionnairesData[0].nom)
                        : ""
                );

                const commandeIdsFacturees = getCommandeIdsLinkedToFactures(factures);

                // Total avoirs (montant TTC des avoirs)
                const totalAvoirs = Array.isArray(avoirs)
                    ? avoirs.reduce((sum: number, a: any) => sum + Number(a.montant_ttc || 0), 0)
                    : 0;

                // Liquidités Totales (même logique que `Banque.tsx`)
                const soldeCourant = Array.isArray(banqueData)
                    ? banqueData.reduce((sum: number, b: any) => sum + (Number(b.solde_actuel) || 0), 0)
                    : 0;
                const totalReglementsClients = Array.isArray(reglements)
                    ? reglements.reduce((sum: number, r: any) => sum + (Number(r.montant) || 0), 0)
                    : 0;
                const totalCaisse = Array.isArray(caisse)
                    ? caisse.reduce((sum: number, c: any) => sum + (Number(c.montant) || 0), 0)
                    : 0;
                const totalRemboursements = Array.isArray(remboursements)
                    ? remboursements.reduce((sum: number, r: any) => sum + (Number(r.montant) || 0), 0)
                    : 0;
                const totalReglementsFournisseurs = Array.isArray(reglementsFournisseurs)
                    ? reglementsFournisseurs.reduce((sum: number, r: any) => sum + (Number(r.montant) || 0), 0)
                    : 0;

                const liquiditesTotales = soldeCourant + totalReglementsClients - totalAvoirs - totalCaisse - totalRemboursements - totalReglementsFournisseurs;

                // Dernières commandes
                // Note: Logic removed as variables are currently unused.


                const pendingDevis = Array.isArray(devis) ? devis.filter((d: any) => d.statuts_devis === "en attente").length : 0;
                const pendingCommandes = Array.isArray(commandes) ? commandes.filter((c: any) => c.statut === "en_attente").length : 0;
                const pendingFactures = Array.isArray(factures) ? factures.filter((f: any) => f.statut === "en_attente").length : 0;
                const pendingAvoirs = Array.isArray(avoirs) ? avoirs.filter((a: any) => a.statut === "en_attente").length : 0;

                const acceptedDevis = Array.isArray(devis) ? devis.filter((d: any) => d.statuts_devis === "accepté") : [];
                const totalSalesDevis = acceptedDevis.reduce((sum: number, d: any) => {
                    const ttcStored = Number(d.montant_ttc);
                    if (Number.isFinite(ttcStored) && ttcStored > 0) return sum + ttcStored;
                    const ttc = (Number(d.montant_ht) || 0) + (Number(d.montant_tva) || 0);
                    return sum + ttc;
                }, 0);

                const totalSalesFactures = Array.isArray(factures)
                    ? factures.reduce((sum: number, f: any) => sum + Number(f.montant_ttc || 0), 0)
                    : 0;
                const totalCommandesBrut = Array.isArray(commandes)
                    ? commandes.reduce((sum: number, c: any) => sum + Number(c.montant_ttc || 0), 0)
                    : 0;
                const totalCommandesFacturees = Array.isArray(commandes)
                    ? commandes
                          .filter((c: any) => commandeIdsFacturees.has(Number(c.id)))
                          .reduce((sum: number, c: any) => sum + Number(c.montant_ttc || 0), 0)
                    : 0;
                const totalSalesCommandes = Array.isArray(commandes)
                    ? Math.max(totalCommandesBrut - totalCommandesFacturees, 0)
                    : 0;
                const totalRegleCommandes = Array.isArray(commandes)
                    ? commandes.reduce((sum: number, c: any) => sum + Number(c.total_regle || 0), 0)
                    : 0;

                const lowStockProducts = Array.isArray(products)
                    ? products.filter((p: any) => typeof p.stock === "number" && typeof p.stock_alert === "number" && p.stock <= p.stock_alert).slice(0, 8)
                    : [];
                const impayeCount = Array.isArray(reglements)
                    ? reglements.filter((r: any) => r.statut === "impaye").length
                    : 0;

                const now = new Date();
                const d30start = new Date(now.getTime() - 30 * 86400000);
                let caLast30d = 0;
                (Array.isArray(factures) ? factures : []).forEach((f: any) => {
                    const fd = new Date(f.date_facture || f.created_at);
                    if (!Number.isNaN(fd.getTime()) && fd >= d30start) {
                        caLast30d += Number(f.montant_ttc || 0);
                    }
                });
                (Array.isArray(commandes) ? commandes : []).forEach((c: any) => {
                    if (commandeIdsFacturees.has(Number(c.id))) return;
                    const cd = new Date(c.date_commande || c.created_at);
                    if (!Number.isNaN(cd.getTime()) && cd >= d30start) {
                        caLast30d += Number(c.montant_ttc || 0);
                    }
                });

                const cm = now.getMonth();
                const cy = now.getFullYear();
                let invoicesThisMonthCount = 0;
                let caMonthFactures = 0;
                let validatedOrdersThisMonthCount = 0;
                let caMonthCommandes = 0;
                (Array.isArray(factures) ? factures : []).forEach((f: any) => {
                    const fd = new Date(f.date_facture || f.created_at);
                    if (Number.isNaN(fd.getTime())) return;
                    if (fd.getMonth() !== cm || fd.getFullYear() !== cy) return;
                    invoicesThisMonthCount += 1;
                    caMonthFactures += Number(f.montant_ttc || 0);
                });
                (Array.isArray(commandes) ? commandes : []).forEach((c: any) => {
                    if (commandeIdsFacturees.has(Number(c.id))) return;
                    const cd = new Date(c.date_commande || c.created_at);
                    if (Number.isNaN(cd.getTime())) return;
                    if (cd.getMonth() !== cm || cd.getFullYear() !== cy) return;
                    validatedOrdersThisMonthCount += 1;
                    caMonthCommandes += Number(c.montant_ttc || 0);
                });

                let facturePayee = 0;
                let factureNonPayee = 0;
                let factureEnAttente = 0;
                (Array.isArray(factures) ? factures : []).forEach((f: any) => {
                    const s = String(f.statut || "").trim();
                    if (s === "payee" || s === "payée") facturePayee += 1;
                    else if (s === "non_payee" || s === "non payée") factureNonPayee += 1;
                    else if (s === "en_attente") factureEnAttente += 1;
                });

                const facturesPourMoyenne = (Array.isArray(factures) ? factures : []).filter(
                    (f: any) => String(f.statut || "").trim() !== "en_attente" && Number(f.montant_ttc) > 0,
                );
                const avgFactureTtc = facturesPourMoyenne.length
                    ? facturesPourMoyenne.reduce((s: number, f: any) => s + Number(f.montant_ttc || 0), 0) /
                      facturesPourMoyenne.length
                    : 0;

                const caMonthTotal = caMonthFactures + caMonthCommandes;
                const partFacturesPct =
                    caMonthTotal > 0 ? Math.round((caMonthFactures / caMonthTotal) * 100) : 0;

                setSalesInsights({
                    caLast30d,
                    caMonthTotal,
                    caMonthFactures,
                    caMonthCommandes,
                    invoicesThisMonthCount,
                    validatedOrdersThisMonthCount,
                    avgFactureTtc,
                    facturePayee,
                    factureNonPayee,
                    factureEnAttente,
                    partFacturesPct,
                });

                // Monthly Sales & comparison with Expenses
                const chartData = [];
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const month = d.getMonth();
                    const year = d.getFullYear();
                    const label = d.toLocaleDateString("fr-FR", { month: "short" });
                    
                    const cmdVal = Array.isArray(commandes)
                        ? commandes
                              .filter((c: any) => {
                                  if (commandeIdsFacturees.has(Number(c.id))) return false;
                                  const cd = new Date(c.date_commande || c.created_at);
                                  return cd.getMonth() === month && cd.getFullYear() === year;
                              })
                              .reduce((sum: number, c: any) => sum + Number(c.montant_ttc || 0), 0)
                        : 0;
                    const facVal = Array.isArray(factures)
                        ? factures
                              .filter((f: any) => {
                                  const fd = new Date(f.date_facture || f.created_at);
                                  return fd.getMonth() === month && fd.getFullYear() === year;
                              })
                              .reduce((sum: number, f: any) => sum + Number(f.montant_ttc || 0), 0)
                        : 0;
                    
                    const achatVal = Array.isArray(achats)
                        ? achats
                              .filter((a: any) => {
                                  const ad = new Date(a.created_at);
                                  return ad.getMonth() === month && ad.getFullYear() === year;
                              })
                              .reduce((sum: number, a: any) => sum + (Number(a.quantite) * Number(a.prix_unitaire) * (1 + (Number(a.tva) || 0) / 100)), 0)
                        : 0;

                    chartData.push({ label, mois: `${label} ${year}`, commandes: cmdVal, factures: facVal, total: cmdVal + facVal, achats: achatVal });
                }
                setMonthlySales(chartData);

                // Sales by PDV: aggregate by point_de_vente_id then map to PDV names (so all PDVs appear)
                const byName: Record<string, number> = {};
                const addPdvByName = (doc: any, montant: number) => {
                    const name = doc.point_de_vente_nom || "Principal";
                    byName[name] = (byName[name] || 0) + montant;
                };
                (Array.isArray(factures) ? factures : []).forEach((doc: any) =>
                    addPdvByName(doc, Number(doc.montant_ttc || 0))
                );
                (Array.isArray(commandes) ? commandes : []).forEach((doc: any) => {
                    if (commandeIdsFacturees.has(Number(doc.id))) return;
                    addPdvByName(doc, Number(doc.montant_ttc || 0));
                });
                setPdvSales(Object.entries(byName).map(([name, value]) => ({ name, value })));

                // Top produits vendus
                if (Array.isArray(topProductsApi) && topProductsApi.length > 0) {
                    setTopProducts(topProductsApi);
                } else {
                    const productSalesMap: Record<string, { name: string; quantity: number }> = {};
                    factures.forEach((f: any) => {
                        (f.items || []).forEach((it: any) => {
                            const key = String(it.produit_id || it.designation || "unknown");
                            const qte = Number(it.quantite) || 0;
                            if (!productSalesMap[key]) {
                                productSalesMap[key] = { name: it.designation || `Produit #${it.produit_id}`, quantity: 0 };
                            }
                            productSalesMap[key].quantity += qte;
                        });
                    });
                    const top = Object.values(productSalesMap)
                        .sort((a, b) => b.quantity - a.quantity)
                        .slice(0, 5);
                    setTopProducts(top);
                }


                // Synthèse règlements clients (aujourd'hui et hier pour trend)
                if (Array.isArray(reglements)) {
                    const today = new Date();
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    const isSameDay = (d: Date, ref: Date) =>
                        d.getDate() === ref.getDate() &&
                        d.getMonth() === ref.getMonth() &&
                        d.getFullYear() === ref.getFullYear();
                    const approved = reglements.filter((r: any) => r.statut === "approuve");

                    const todayApproved = approved.filter((r: any) => {
                        const dt = new Date(r.date_reglement || r.created_at);
                        return !Number.isNaN(dt.getTime()) && isSameDay(dt, today);
                    });
                    const ca = todayApproved.reduce((sum: number, r: any) => sum + Number(r.montant || 0), 0);
                    const todayCount = todayApproved.length;
                    setCaToday(ca);
                    setTransactionsToday(todayCount);
                    setAverageBasketToday(todayCount > 0 ? ca / todayCount : 0);

                    const caYesterdayVal = approved
                        .filter((r: any) => {
                            const dt = new Date(r.date_reglement || r.created_at);
                            return !Number.isNaN(dt.getTime()) && isSameDay(dt, yesterday);
                        })
                        .reduce((sum: number, r: any) => sum + Number(r.montant || 0), 0);
                    setCaYesterday(caYesterdayVal);
                } else {
                    setCaToday(0);
                    setCaYesterday(0);
                    setTransactionsToday(0);
                    setAverageBasketToday(0);
                }



                // Client types
                const typeMap: any = {};
                clients.forEach((c: any) => {
                    const type = c.type === 'revendeur' ? 'Revendeur' : 'Particulier';
                    typeMap[type] = (typeMap[type] || 0) + 1;
                });
                setClientTypes(Object.entries(typeMap).map(([name, value]: any) => ({ name, value })));

                setCounts({
                    products: Array.isArray(products) ? products.length : 0,
                    clients: Array.isArray(clients) ? clients.length : 0,
                    fournisseurs: Array.isArray(fournisseurs) ? fournisseurs.length : 0,
                    pendingDevis,
                    pendingCommandes,
                    pendingFactures,
                    pendingAvoirs,
                    totalSalesDevis,
                    totalSalesFactures,
                    totalSalesCommandes,
                    totalRegleCommandes,
                    totalAvoirs,
                    liquiditesTotales,
                    lowStockCount: lowStockProducts.length,
                    lowStockProducts,
                    impayeCount,
                });
            } catch (error) {
                console.error("Error fetching dashboard data:", error);
            }
        };

        fetchData();
    }, []);

   
    const activeAlertsCount = counts.lowStockCount + counts.impayeCount;

    const isVisible = (id: string) => {
        const userRole = (role || "").toLowerCase();
        if (!visibility[userRole]) return true;
        return visibility[userRole].includes(id);
    };

    const totalRevenue = counts.totalRegleCommandes;
   

    const formatDH = (n: number) => `${Math.round(Number(n))} DH`;
    const formatShortDH = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    const chartTooltipStyle = {
        border: "1px solid rgba(99, 102, 241, 0.12)",
        borderRadius: 14,
        boxShadow: "0 16px 40px -18px rgba(67, 56, 202, 0.25)",
        background: "var(--card)",
        backdropFilter: "blur(8px)",
    } as const;

    const pendingByType = [
        { label: "Devis", value: counts.pendingDevis },
        { label: "Commandes", value: counts.pendingCommandes },
        { label: "Factures", value: counts.pendingFactures },
        { label: "Avoirs", value: counts.pendingAvoirs },
    ].filter(item => item.value > 0);
    const overviewTrendData = monthlySales.slice(-6);
   

    const factureStatutVentesData = useMemo(
        () =>
            [
                { name: "Payée", value: salesInsights.facturePayee, fill: "#10b981" },
                { name: "Non payée", value: salesInsights.factureNonPayee, fill: BRAND_ACCENT },
                { name: "En validation", value: salesInsights.factureEnAttente, fill: "#6366f1" },
            ].filter((x) => x.value > 0),
        [salesInsights],
    );
    const totalFacturesPourStatut =
        salesInsights.facturePayee + salesInsights.factureNonPayee + salesInsights.factureEnAttente;
    const recentActivities = [
        {
            title: "Encaissements du jour",
            detail: `${transactionsToday} transaction(s)`,
            value: formatDH(caToday),
            tone: "text-emerald-600",
            dot: "bg-emerald-500",
        },
        {
            title: "Alertes stock",
            detail: `${counts.lowStockCount} produit(s) à surveiller`,
            value: counts.lowStockCount > 0 ? "Prioritaire" : "Stable",
            tone: counts.lowStockCount > 0 ? "text-amber-600" : "text-slate-600",
            dot: counts.lowStockCount > 0 ? "bg-amber-500" : "bg-slate-400",
        },
        {
            title: "Pipeline commercial",
            detail: `${pendingByType.reduce((sum, item) => sum + item.value, 0)} dossier(s) en attente`,
            value: pendingByType.length > 0 ? "À traiter" : "À jour",
            tone: pendingByType.length > 0 ? "text-indigo-600" : "text-emerald-600",
            dot: pendingByType.length > 0 ? "bg-indigo-500" : "bg-emerald-500",
        },
    ];


    const handleDownloadReport = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFillColor(67, 56, 202); // indigo-600
        doc.rect(0, 0, pageWidth, 40, "F");
        
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text("RAPPORT D'ACTIVITÉ", 14, 25);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Généré le : ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`, 14, 33);

        // Section 1: Métriques Clés
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("I. RÉSUMÉ DE L'ACTIVITÉ", 14, 55);

        autoTable(doc, {
            startY: 60,
            head: [["Métrique", "Valeur"]],
            body: [
                ["Chiffre d'Affaires (Réglé)", formatDH(counts.totalRegleCommandes)],
                ["Chiffre d'Affaires Total (Factures)", formatDH(counts.totalSalesFactures)],
                ["Chiffre d'Affaires Total (Commandes)", formatDH(counts.totalSalesCommandes)],
                ["Total Avoirs", formatDH(counts.totalAvoirs)],
                ["CA Aujourd'hui", formatDH(caToday)],
                ["Total Clients", counts.clients.toString()],
                ["Total Produits", counts.products.toString()],
                ["Produits en Alerte Stock", counts.lowStockCount.toString()],
            ],
            theme: "striped",
            headStyles: { fillColor: [67, 56, 202] },
        });

        // Section 2: Top Produits
        const finalY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("II. TOP 5 PRODUITS VENDUS", 14, finalY);

        autoTable(doc, {
            startY: finalY + 5,
            head: [["Produit", "Quantité Vendue"]],
            body: topProducts.map(p => [p.name, p.quantity.toString()]),
            theme: "grid",
            headStyles: { fillColor: [16, 185, 129] }, // emerald-500
        });

        // Section 3: Ventes par PDV
        const finalY2 = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("III. VENTES PAR POINT DE VENTE", 14, finalY2);

        autoTable(doc, {
            startY: finalY2 + 5,
            head: [["Point de Vente", "Chiffre d'Affaires"]],
            body: pdvSales.map(p => [p.name, formatDH(p.value)]),
            theme: "grid",
            headStyles: { fillColor: [245, 158, 11] }, // amber-500
        });

        doc.save(`rapport_dashboard_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const sidebarNavItems = [
        { title: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
        { title: "Point de Vente", path: "/dashboard/pdv", icon: Store },
        { title: "Liste Produits", path: "/dashboard/products", icon: ShoppingBag },
        { title: "Inventaire", path: "/dashboard/inventaire", icon: ListOrdered },
        { title: "Mouvements Stock", path: "/dashboard/mouvements", icon: RotateCcw },
        { title: "Catégories", path: "/dashboard/categories", icon: ListOrdered },
        { title: "Liste Clients", path: "/dashboard/clients", icon: Users },
        { title: "Situation Client", path: "/dashboard/clients/situation", icon: ShoppingBag },
        { title: "Liste Fournisseurs", path: "/dashboard/fournisseurs", icon: Truck },
        { title: "Situation Fournisseurs", path: "/dashboard/fournisseurs/situation", icon: FileText },
        { title: "Achats", path: "/dashboard/achats", icon: CircleDollarSign },
        { title: "Devis", path: "/dashboard/devis", icon: FileText },
        { title: "Commandes", path: "/dashboard/commandes", icon: FileText },
        { title: "Factures", path: "/dashboard/factures", icon: FileText },
        { title: "Avoirs", path: "/dashboard/avoirs", icon: RotateCcw },
        { title: "Remboursement", path: "/dashboard/remboursements", icon: Banknote },
        { title: "Promotions", path: "/dashboard/promotions", icon: Megaphone },
        { title: "Posts", path: "/dashboard/autoposts", icon: Send },
        { title: "Règlements Clients", path: "/dashboard/reglements", icon: FileText },
        { title: "Règlements Fournisseurs", path: "/dashboard/fournisseurs/reglements", icon: Truck },
        { title: "Bilan Financier", path: "/dashboard/bilan", icon: FileText },
        { title: "Banque", path: "/dashboard/banque", icon: FileText },
        { title: "Caisse", path: "/dashboard/caisse", icon: FileText },
        { title: "Employés", path: "/dashboard/employes", icon: FileText },
        { title: "Congés", path: "/dashboard/conges", icon: FileText },
        { title: "Salaires", path: "/dashboard/salaires", icon: FileText },
        { title: "Paie", path: "/dashboard/paiement", icon: FileText },
        { title: "Support", path: "/dashboard/tickets", icon: Ticket },
        { title: "Journal de connexion", path: "/dashboard/login-journal", icon: FileText },
        { title: "Utilisateurs", path: "/dashboard/users", icon: Users },
        { title: "Permissions", path: "/dashboard/settings/permissions", icon: Shield },
    ];

    const searchResults = sidebarNavItems
        .filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 5);

    const quickActions = [
        { title: "Nouveau Devis", href: "/dashboard/devis", state: { openCreateForm: true }, icon: FileText, bg: "bg-indigo-500/10", color: "text-indigo-600" },
        { title: "Nouvelle Commande", href: "/dashboard/commandes", state: { openCreateForm: true }, icon: Receipt, bg: "bg-emerald-500/10", color: "text-emerald-600" },
        { title: "Nouvelle Facture", href: "/dashboard/factures", state: { openCreateForm: true }, icon: FileText, bg: "bg-blue-500/10", color: "text-blue-600" },
        { title: "Gestion Stock", href: "/dashboard/inventaire", icon: Package, bg: "bg-amber-500/10", color: "text-amber-600" },
    ].filter(() => {
        const userRole = (role || "").toLowerCase();
        if (!visibility[userRole]) return true;
        return visibility[userRole].includes('quick_actions');
    });

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                delayChildren: 0.05,
                staggerChildren: 0.06,
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 16, scale: 0.985 },
        visible: { opacity: 1, y: 0, scale: 1 }
    };

    return (
        <motion.div 
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="space-y-10 pb-16 px-4 sm:px-8 lg:px-12 min-h-screen bg-gradient-to-b from-slate-100/90 via-[#f7f7f8] to-indigo-50/40 dark:from-[#050505] dark:via-[#080808] dark:to-[#0c1018]"
        >
            {/* Search Overlay */}
            <AnimatePresence>
                {isSearchOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-[#050505]/80 backdrop-blur-xl flex items-center justify-center p-4"
                        onClick={() => setIsSearchOpen(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="w-full max-w-2xl bg-[#1a1a1a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-white/5 flex items-center gap-4">
                                <Search className="h-6 w-6 text-white/30" />
                                <input 
                                    autoFocus
                                    placeholder="Rechercher une section, un produit..."
                                    className="bg-transparent border-none outline-none text-xl font-bold text-white w-full placeholder:text-white/20"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-white/10 bg-white/5 px-2 font-mono text-[10px] font-medium text-white/40">
                                    ESC
                                </kbd>
                            </div>
                            <div className="p-4 max-h-[400px] overflow-y-auto">
                                <div className="space-y-2">
                                    {searchResults.length > 0 ? (
                                        searchResults.map((result, i) => (
                                            <Link 
                                                key={i}
                                                to={result.path}
                                                className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all group"
                                                onClick={() => setIsSearchOpen(false)}
                                            >
                                                <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-indigo-400 group-hover:bg-indigo-500/10">
                                                    <result.icon className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-bold text-white">{result.title}</div>
                                                    <div className="text-xs text-white/30">Naviguer vers {result.title}</div>
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-white/10 group-hover:text-white/40" />
                                            </Link>
                                        ))
                                    ) : (
                                        <div className="p-8 text-center text-white/20 font-bold">
                                            Aucun résultat pour &quot;{searchQuery}&quot;
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Top Navigation / Breadcrumb Placeholder (Optional) */}
            <div className="flex items-center justify-between pt-8 max-w-7xl mx-auto relative z-[50]">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-300/40 dark:shadow-indigo-900/50 ring-2 ring-white/20 dark:ring-white/10">
                        <Store className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest bg-gradient-to-r from-slate-600 to-indigo-600 dark:from-white/70 dark:to-indigo-300 bg-clip-text text-transparent">
                        Tableau de Bord
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsSearchOpen(true)}
                        className="h-10 w-10 rounded-full border border-border bg-white/50 dark:bg-white/5 backdrop-blur-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                    >
                        <Search className="h-4 w-4" />
                    </button>
                    
                    <div className="relative">
                        <button 
                            onClick={() => setIsNotifOpen(!isNotifOpen)}
                            className="h-10 w-10 rounded-full border border-border bg-white/50 dark:bg-white/5 backdrop-blur-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-all relative cursor-pointer"
                        >
                            <Bell className="h-4 w-4" />
                            {activeAlertsCount > 0 && (
                                <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-rose-500 border-2 border-white dark:border-black animate-pulse" />
                            )}
                        </button>
                        
                        <AnimatePresence>
                            {isNotifOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)} />
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                        className="absolute top-12 right-0 w-80 bg-white dark:bg-[#1a1a1a] border border-border dark:border-white/10 rounded-[2rem] shadow-2xl z-50 overflow-hidden"
                                    >
                                        <div className="p-6 border-b border-border dark:border-white/5">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-black text-sm uppercase tracking-widest text-indigo-500">Alertes</h3>
                                                <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full font-bold">
                                                    {activeAlertsCount} Actives
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-2 max-h-[300px] overflow-y-auto">
                                            {activeAlertsCount > 0 ? (
                                                <>
                                                    {counts.impayeCount > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsNotifOpen(false);
                                                                navigate("/dashboard/reglements", {
                                                                    state: { filterStatut: "impaye" },
                                                                });
                                                            }}
                                                            className="w-full text-left flex items-center gap-3 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
                                                        >
                                                            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                                                                <AlertTriangle className="h-5 w-5" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-bold truncate">Règlements impayés</div>
                                                                <div className="text-[10px] text-rose-500/70 font-bold">
                                                                    {counts.impayeCount} règlement(s) marqué(s) impayé(s)
                                                                </div>
                                                            </div>
                                                        </button>
                                                    )}
                                                    {counts.lowStockProducts.map((p, i) => (
                                                        <div key={i} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                                                            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                                                                <Package className="h-5 w-5" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-bold truncate">{p.nom}</div>
                                                                <div className="text-[10px] text-rose-500/70 font-bold">Stock : {p.stock} (Alerte: {p.stock_alert})</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </>
                                            ) : (
                                                <div className="p-8 text-center text-muted-foreground text-xs font-medium">
                                                    Aucune alerte en cours.
                                                </div>
                                            )}
                                        </div>
                                        <Link 
                                            to="/dashboard/alerts"
                                            className="block p-4 bg-muted/50 dark:bg-white/5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-indigo-500 transition-colors"
                                            onClick={() => setIsNotifOpen(false)}
                                        >
                                            Voir tout
                                        </Link>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                    <div className="h-10 px-4 rounded-full border border-border bg-white/50 dark:bg-white/5 backdrop-blur-md flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-indigo-500 to-emerald-500" />
                        <span className="text-xs font-bold">{(gestionnaireName || userName).split(" ")[0]}</span>
                    </div>
                </div>
            </div>

            {/* Immersive Hero Section */}
            <motion.div 
                variants={itemVariants} 
                className="max-w-7xl mx-auto relative overflow-hidden rounded-[3rem] bg-[#1a1a1a] dark:bg-[#0a0a0a] shadow-2xl border border-white/5 group"
            >
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-600/20 to-transparent pointer-events-none" />
                <div className="absolute -top-24 -right-24 h-96 w-96 bg-indigo-500/10 blur-[100px] rounded-full" />
                <div className="absolute -bottom-24 -left-24 h-96 w-96 bg-emerald-500/10 blur-[100px] rounded-full" />
                
                <div className="relative z-10 p-8 sm:p-12 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
                    <div className="space-y-6 max-w-3xl">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em]">
                                <Sparkles className="h-3.5 w-3.5" />
                                Aperçu de l&apos;activité • {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </div>
                            <div className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500/25 via-yellow-400/15 to-amber-300/10 backdrop-blur-xl border border-amber-200/25 text-amber-100 text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_10px_28px_-18px_rgba(251,191,36,0.9)] transition-all duration-300 hover:from-amber-400/35 hover:via-yellow-300/20 hover:to-amber-200/15 hover:border-amber-100/45 hover:shadow-[0_14px_34px_-16px_rgba(251,191,36,1)] hover:-translate-y-0.5 lg:absolute lg:top-8 lg:right-8 xl:right-12">
                                <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.95)] transition-transform duration-300 group-hover:scale-110" />
                                Prix du gramme du jour •{" "}
                                {goldPriceUsd != null
                                    ? `${(((goldPriceUsd * USD_TO_MAD) / 31.1035) / 1.35).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} MAD/g`
                                    : "cours de l&apos;or × 9.37 / 31.1035 / 1.35"}
                            </div>
                        </div>
                        
                        <div className="space-y-3">
                            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1]">
                                {greeting}, <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-emerald-300">
                                    {userName}
                                </span>
                            </h1>
                            <p className="text-lg text-white/50 font-medium max-w-xl leading-relaxed">
                                Votre bijouterie se porte bien. Voici une analyse détaillée de vos performances aujourd&apos;hui.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-500/20 via-yellow-400/10 to-transparent px-4 py-3 backdrop-blur-xl shadow-[0_10px_30px_-18px_rgba(251,191,36,0.65)]">
                                <div className="h-10 w-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center border border-amber-300/25">
                                    <CircleDollarSign className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/80">Cours de l&apos;or · XAU/USD</p>
                                    <p className="text-lg font-black text-amber-100 tabular-nums">
                                        {goldLoading
                                            ? "Chargement..."
                                            : goldPriceUsd != null
                                                ? `${goldPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} $/oz`
                                                : "Indispo"}
                                    </p>
                                    {goldPriceUsd != null && !goldLoading && (
                                        <p className="text-sm font-bold text-amber-50/95 tabular-nums mt-0.5">
                                            ≈{" "}
                                            {(goldPriceUsd * USD_TO_MAD).toLocaleString("fr-FR", {
                                                maximumFractionDigits: 0,
                                            })}{" "}
                                            MAD/oz{" "}
                                            <span className="text-[10px] font-semibold text-amber-100/60">(troy)</span>
                                        </p>
                                    )}
                                    <p className="text-[10px] font-bold text-amber-100/70">{goldUpdatedAt || "Source: gold-api.com"}</p>
                                </div>
                            </div>

                            <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200/15 bg-gradient-to-r from-slate-200/15 via-white/10 to-transparent px-4 py-3 backdrop-blur-xl shadow-[0_10px_30px_-18px_rgba(148,163,184,0.5)]">
                                <div className="h-10 w-10 rounded-xl bg-slate-200/15 text-slate-100 flex items-center justify-center border border-white/10">
                                    <Banknote className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-100/80">Cours de l&apos;argent · XAG/USD</p>
                                    <p className="text-lg font-black text-slate-50 tabular-nums">
                                        {silverLoading
                                            ? "Chargement..."
                                            : silverPriceUsd != null
                                                ? `${silverPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} $/oz`
                                                : "Indispo"}
                                    </p>
                                    {silverPriceUsd != null && !silverLoading && (
                                        <p className="text-sm font-bold text-slate-100 tabular-nums mt-0.5">
                                            ≈{" "}
                                            {(silverPriceUsd * USD_TO_MAD).toLocaleString("fr-FR", {
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            MAD/oz{" "}
                                            <span className="text-[10px] font-semibold text-slate-300/80">(troy)</span>
                                        </p>
                                    )}
                                    <p className="text-[10px] font-bold text-slate-100/70">{silverUpdatedAt || "Source: gold-api.com"}</p>
                                </div>
                            </div>
                        </div>
                        <p className="text-[10px] font-medium text-white/45">
                            Conversion MAD : 1 USD = {USD_TO_MAD.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
                        </p>

                        <div className="flex flex-wrap gap-4">
                            <button 
                                onClick={handleDownloadReport}
                                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm transition-all border border-white/10 backdrop-blur-md cursor-pointer"
                            >
                                Télécharger le rapport
                                <FileText className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Quick Snapshot Card */}
                    <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500/20 blur-[40px] rounded-full" />
                        <Card className="relative z-10 w-full lg:w-[340px] border-white/10 bg-white/5 backdrop-blur-2xl rounded-[2rem] shadow-2xl overflow-hidden group/card">
                            <div className="p-8 space-y-6">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Revenus Aujourd&apos;hui</span>
                                    <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                        <TrendingUp className="h-5 w-5" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <AnimatedCounter
                                        value={caToday}
                                        format={(n) => formatDH(n)}
                                        className="text-4xl font-black text-white tabular-nums tracking-tighter"
                                    />
                                    {caYesterday > 0 && (
                                        <div className={cn(
                                            "flex items-center gap-2 text-xs font-bold",
                                            caToday >= caYesterday ? "text-emerald-400" : "text-rose-400"
                                        )}>
                                        <div className={cn(
                                                "px-2 py-0.5 rounded-lg flex items-center gap-1",
                                                caToday >= caYesterday ? "bg-emerald-500/10" : "bg-rose-500/10"
                                            )}>
                                                {caToday >= caYesterday ? "+" : ""}{caYesterday > 0 ? (((caToday - caYesterday) / caYesterday) * 100).toFixed(0) : "100"}%
                                            </div>
                                            <span className="text-white/30">vs hier ({formatShortDH(caYesterday)})</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Transactions</span>
                                        <AnimatedCounter
                                            value={transactionsToday}
                                            format={(n) => `${Math.round(n)}`}
                                            className="text-lg font-bold text-white"
                                        />
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Panier Moyen</span>
                                        <AnimatedCounter
                                            value={averageBasketToday}
                                            format={(n) => formatShortDH(n)}
                                            className="text-lg font-bold text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Decorative sparkline-like background */}
                            <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 pointer-events-none">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={monthlySales.slice(-5)}>
                                        <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} fill="url(#heroGradient)" />
                                        <defs>
                                            <linearGradient id="heroGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4}/>
                                                <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </div>
                </div>
            </motion.div>

            {/* Main Content Grid */}
            <div className="max-w-7xl mx-auto space-y-12">
                {/* SECTION: Strategic Metrics (Vue d'ensemble) */}
                <div className={cn(dashSectionShell, "p-8 sm:p-12 relative overflow-hidden")}>
                    {/* Immersive background accents */}
                    <div className="pointer-events-none absolute -top-24 -right-20 h-96 w-96 rounded-full bg-indigo-500/10 dark:bg-indigo-600/5 blur-[120px]" />
                    <div className="pointer-events-none absolute -bottom-48 -left-24 h-[500px] w-[500px] rounded-full bg-emerald-400/10 dark:bg-emerald-600/5 blur-[140px]" />
                    
                    <div className="relative z-10 space-y-10">
                        {/* Section Header */}
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b border-slate-200/50 dark:border-white/5">
                            <div className="space-y-4">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-200/30 dark:border-white/10 text-indigo-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em]">
                                    <Activity className="h-3.5 w-3.5" />
                                    Indicateurs Stratégiques
                                </div>
                                <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                                    Vue d'ensemble <span className="text-indigo-500">Flux & Volume</span>
                                </h2>
                                <p className="text-base text-muted-foreground font-medium max-w-2xl">
                                    Analyse consolidée de votre trésorerie, mix client et pipeline commercial.
                                </p>
                            </div>
                        </div>

                        {/* Critical Metric Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            {isVisible('stats_ca_today') && (
                                <motion.div variants={itemVariants} whileHover={{ y: -6 }} className="h-full">
                                    <Card className={cn(dashGlassCard, "h-full flex flex-col group border-emerald-100/50 dark:border-emerald-500/10")}>
                                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                                        <CardContent className="p-8 flex flex-col h-full gap-6">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400/80">CA Journalier</p>
                                                    <h3 className="text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">
                                                        {formatDH(caToday)}
                                                    </h3>
                                                </div>
                                                <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                                    <Wallet className="h-7 w-7" />
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1",
                                                    caToday >= caYesterday ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                                )}>
                                                    {caToday >= caYesterday ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                                    {Math.abs(Math.round(((caToday - caYesterday) / Math.max(caYesterday, 1)) * 100))}%
                                                </div>
                                                <span className="text-xs font-bold text-muted-foreground">vs hier</span>
                                            </div>

                                            <div className="mt-auto h-20 pt-4">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <ReBarChart data={[{ label: "Hier", value: caYesterday }, { label: "Auj.", value: caToday }]}>
                                                        <Tooltip
                                                            cursor={{ fill: "transparent" }}
                                                            content={({ active, payload }) => {
                                                                if (active && payload && payload.length) {
                                                                    return (
                                                                        <div className="bg-white dark:bg-slate-900 p-2 border border-border rounded-lg shadow-xl text-[10px] font-bold">
                                                                            {formatDH(payload[0].value as number)}
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            }}
                                                        />
                                                        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#10b981" animationDuration={1000} />
                                                    </ReBarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )}

                            {/* Liquidités Card */}
                            <motion.div variants={itemVariants} whileHover={{ y: -6 }} className="h-full">
                                <Card className={cn(dashGlassCard, "h-full flex flex-col group border-indigo-100/50 dark:border-indigo-500/10")}>
                                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 to-violet-600" />
                                    <CardContent className="p-8 flex flex-col h-full gap-6">
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400/80">Disponibilités</p>
                                                <h3 className="text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">
                                                    {formatShortDH(counts.liquiditesTotales)}
                                                </h3>
                                            </div>
                                            <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                                <Banknote className="h-7 w-7" />
                                            </div>
                                        </div>
                                        
                                        <div className="text-sm font-bold text-indigo-600/80 bg-indigo-500/5 px-3 py-1.5 rounded-xl self-start">
                                            {formatDH(counts.liquiditesTotales)} total
                                        </div>

                                        <div className="mt-auto h-20 pt-4">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={monthlySales.slice(-4)}>
                                                    <defs>
                                                        <linearGradient id="liquidityFill" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={3} fill="url(#liquidityFill)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>

                            {/* Client Segment Card */}
                            {isVisible('chart_client_types') && (
                                <motion.div variants={itemVariants} whileHover={{ y: -6 }} className="h-full">
                                    <Card className={cn(dashGlassCard, "h-full flex flex-col group border-violet-100/50 dark:border-violet-500/10")}>
                                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-600" />
                                        <CardContent className="p-8 flex flex-col h-full gap-6">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400/80">Mix Clients</p>
                                                    <h3 className="text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">
                                                        {clientTypes.reduce((sum, c) => sum + (c.value || 0), 0)}
                                                    </h3>
                                                </div>
                                                <div className="h-14 w-14 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                                    <Users className="h-7 w-7" />
                                                </div>
                                            </div>
                                            
                                            <div className="flex-1 flex flex-col justify-center">
                                                <div className="flex items-center gap-4">
                                                    {clientTypes.map((c, idx) => (
                                                        <div key={c.name} className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{c.name}</span>
                                                            </div>
                                                            <span className="text-xs font-black">{c.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex">
                                                {clientTypes.map((c, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        className="h-full transition-all duration-1000"
                                                        style={{ 
                                                            width: `${(c.value / Math.max(1, clientTypes.reduce((s, x) => s + x.value, 0))) * 100}%`,
                                                            backgroundColor: COLORS[idx % COLORS.length]
                                                        }} 
                                                    />
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )}

                            {/* Pipeline Card */}
                            {isVisible('stats_pending_commandes') && (
                                <motion.div variants={itemVariants} whileHover={{ y: -6 }} className="h-full">
                                    <Card className={cn(dashGlassCard, "h-full flex flex-col group border-amber-100/50 dark:border-amber-500/10")}>
                                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 to-orange-500" />
                                        <CardContent className="p-8 flex flex-col h-full gap-6">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400/80">Flux Approbation</p>
                                                    <h3 className="text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">
                                                        {pendingByType.reduce((s, i) => s + i.value, 0)}
                                                    </h3>
                                                </div>
                                                <div className="h-14 w-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                                    <ListOrdered className="h-7 w-7" />
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-y-3">
                                                {pendingByType.slice(0, 4).map((item) => (
                                                    <div key={item.label} className="flex flex-col">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</span>
                                                        <span className="text-sm font-black text-amber-600">{item.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>

                {/* SECTION: Sales & Invoicing Intelligence */}
                {isVisible("sales_insights") && (
                    <div className={cn(dashSectionShell, "p-8 sm:p-12 space-y-12 overflow-hidden")}>
                        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                            <div className="space-y-4">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-200/30 dark:border-white/10 text-emerald-800 dark:text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em]">
                                    <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                                    Analyse Commerciale
                                </div>
                                <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                                    Performances <span className="text-emerald-500">& Invoicing</span>
                                </h2>
                                <p className="text-base text-muted-foreground font-medium max-w-2xl">
                                    Analyse approfondie des flux de revenus et de l'état de recouvrement des 30 derniers jours.
                                </p>
                            </div>
                            
                            {/* Comparison Mini-Stats */}
                            <div className="grid grid-cols-2 gap-4 lg:min-w-[400px]">
                                <div className="p-5 rounded-3xl bg-white/40 dark:bg-white/5 border border-white/60 dark:border-white/10 backdrop-blur-md">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Mois en cours</p>
                                    <p className="text-xl font-black text-emerald-600 tabular-nums">{formatShortDH(salesInsights.caMonthTotal)}</p>
                                    <div className="mt-2 h-1 w-full bg-emerald-500/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${salesInsights.partFacturesPct}%` }} />
                                    </div>
                                </div>
                                <div className="p-5 rounded-3xl bg-white/40 dark:bg-white/5 border border-white/60 dark:border-white/10 backdrop-blur-md">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Panier Moyen</p>
                                    <p className="text-xl font-black text-indigo-600 tabular-nums">{formatShortDH(salesInsights.avgFactureTtc)}</p>
                                    <p className="text-[10px] font-bold text-muted-foreground mt-2">Basé sur {salesInsights.invoicesThisMonthCount} factures</p>
                                </div>
                            </div>
                        </div>

                        <div className="relative z-10 grid grid-cols-1 xl:grid-cols-5 gap-8">
                            {/* Main Sales Chart */}
                            <Card className={cn(dashGlassCard, "xl:col-span-3 border-none shadow-xl overflow-hidden group")}>
                                <CardContent className="p-8 sm:p-10 space-y-8 h-full flex flex-col">
                                    <div className="flex flex-wrap items-center justify-between gap-6">
                                        <div className="space-y-1">
                                            <h3 className="text-lg font-black text-slate-900 dark:text-white">Flux Commandes vs Factures</h3>
                                            <p className="text-xs font-bold text-muted-foreground">Comparaison temporelle des engagements et des encaissements (TTC)</p>
                                        </div>
                                        <div className="flex items-center gap-4 bg-slate-50 dark:bg-black/20 p-2 rounded-2xl">
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 shadow-sm">
                                                <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Factures</span>
                                            </div>
                                            <div className="flex items-center gap-2 px-3 py-1.5">
                                                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Commandes</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1 min-h-[350px] w-full mt-4">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ReBarChart data={overviewTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.06} />
                                                <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} dy={10} />
                                                <YAxis tick={{ fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatShortDH(v)} />
                                                <Tooltip
                                                    cursor={{ fill: "rgba(99,102,241,0.04)" }}
                                                    contentStyle={chartTooltipStyle}
                                                    formatter={(v, n) => [formatDH(Number(v)), n === "factures" ? "Facturé" : "Commandé"]}
                                                />
                                                <Bar dataKey="factures" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1000} />
                                                <Bar dataKey="commandes" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1000} />
                                            </ReBarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Invoicing Status Chart */}
                            <Card className={cn(dashGlassCard, "xl:col-span-2 border-none shadow-xl flex flex-col overflow-hidden")}>
                                <CardContent className="p-8 sm:p-10 flex flex-col h-full space-y-10">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white">Répartition Administrative</h3>
                                        <p className="text-xs font-bold text-muted-foreground">Volume par statut de facturation ({totalFacturesPourStatut} total)</p>
                                    </div>

                                    <div className="flex-1 relative flex items-center justify-center min-h-[250px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={factureStatutVentesData}
                                                    dataKey="value"
                                                    innerRadius={80}
                                                    outerRadius={110}
                                                    paddingAngle={6}
                                                    stroke="none"
                                                    animationDuration={1500}
                                                >
                                                    {factureStatutVentesData.map((entry, idx) => (
                                                        <Cell key={idx} fill={entry.fill} />
                                                    ))}
                                                </Pie>
                                                <Tooltip contentStyle={chartTooltipStyle} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Total</span>
                                            <span className="text-4xl font-black text-slate-900 dark:text-white">{totalFacturesPourStatut}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-4 pt-6 border-t border-slate-100 dark:border-white/5">
                                        {factureStatutVentesData.map((s) => (
                                            <div key={s.name} className="flex items-center gap-3">
                                                <div className="h-3 w-3 rounded-full shadow-sm" style={{ backgroundColor: s.fill }} />
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black uppercase text-muted-foreground">{s.name}</span>
                                                    <span className="text-sm font-black">{s.value} <span className="text-[10px] text-muted-foreground">({totalFacturesPourStatut > 0 ? Math.round(s.value/totalFacturesPourStatut*100) : 0}%)</span></span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}


                {/* SECTION: Operational Workspace — Assets & Intelligence */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* MAIN WORKSPACE (8 Columns) */}
                    <div className="lg:col-span-8 space-y-8">
                        
                        {/* Primary Insights Chart — Full Width of Workspace */}
                        {monthlySales.length > 0 && isVisible('chart_monthly_sales') && (
                            <motion.div variants={itemVariants}>
                                <Card className={cn(dashGlassCard, "p-1 sm:p-2 border-none shadow-2xl overflow-hidden rounded-[2.5rem]")}>
                                    <div className="absolute top-0 left-0 right-0 z-10 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 opacity-80" />
                                    <CardContent className="p-8 sm:p-12 space-y-10">
                                        <div className="flex flex-wrap items-center justify-between gap-8">
                                            <div className="space-y-2">
                                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-200/20 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest">
                                                    Analyse de Performance
                                                </div>
                                                <h3 className="text-3xl font-black tracking-tight">Capitaux <span className="text-indigo-500">& Flux</span></h3>
                                                <p className="text-sm font-medium text-muted-foreground">Comparaison temporelle des revenus encaissés et des investissements (achats).</p>
                                            </div>
                                            
                                            <div className="flex items-center gap-6 p-3 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.5)]" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Revenus</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Dépenses</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="h-[400px] w-full mt-4">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={monthlySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="mainRevGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                        </linearGradient>
                                                        <linearGradient id="mainExpGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.12}/>
                                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.06} />
                                                    <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} dy={12} />
                                                    <YAxis tick={{ fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatShortDH(v)} />
                                                    <Tooltip contentStyle={chartTooltipStyle} />
                                                    <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={5} fill="url(#mainRevGrad)" animationDuration={1800} />
                                                    <Area type="monotone" dataKey="achats" stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 4" fill="url(#mainExpGrad)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {/* Inventory & Distribution Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Inventory Intelligence */}
                            {(isVisible('table_top_products') || isVisible('table_least_products')) && (
                                <Card className={cn(dashGlassCard, "p-8 space-y-8 rounded-[2rem] border-none shadow-xl")}>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <h4 className="text-lg font-black tracking-tight capitalize">Intensité Catalogue</h4>
                                            <p className="text-xs font-bold text-muted-foreground">Volumes de vente par référence</p>
                                        </div>
                                        <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                            <Package className="h-5 w-5" />
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {/* Simplified Bar Chart or List for Space Optimization */}
                                        <div className="grid grid-cols-1 gap-4">
                                            {topProducts.slice(0, 3).map((p, i) => (
                                                <div key={i} className="flex flex-col gap-2">
                                                    <div className="flex justify-between items-end">
                                                        <span className="text-[11px] font-black uppercase truncate max-w-[180px]">{p.name}</span>
                                                        <span className="text-xs font-black text-emerald-600 tabular-nums">{p.quantity} <span className="text-[10px] opacity-60">U.</span></span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                        <motion.div 
                                                            initial={{ width: 0 }}
                                                            whileInView={{ width: `${(p.quantity / (topProducts[0]?.quantity || 1)) * 100}%` }}
                                                            transition={{ duration: 1, delay: i * 0.1 }}
                                                            className="h-full bg-emerald-500" 
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <Link to="/dashboard/products" className="block text-center py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                                            Analyser le catalogue complet
                                        </Link>
                                    </div>
                                </Card>
                            )}

                            {/* Geographic/POS Distribution */}
                            {isVisible('chart_pdv_sales') && (
                                <Card className={cn(dashGlassCard, "p-8 flex flex-col justify-between rounded-[2rem] border-none shadow-xl")}>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <h4 className="text-lg font-black tracking-tight capitalize">Points de Vente</h4>
                                            <p className="text-xs font-bold text-muted-foreground">Répartition de la performance globale</p>
                                        </div>
                                        <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                                            <Store className="h-5 w-5" />
                                        </div>
                                    </div>

                                    <div className="h-48 relative flex items-center justify-center">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={pdvSales} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value" stroke="none">
                                                    {pdvSales.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip contentStyle={chartTooltipStyle} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute flex flex-col items-center pointer-events-none">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">TOTAL</span>
                                            <span className="text-lg font-black tabular-nums">{formatShortDH(totalRevenue)}</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-4 border-t border-slate-100 dark:border-white/5">
                                        {pdvSales.map((s, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                                <span className="text-[10px] font-bold text-muted-foreground">{s.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            )}
                        </div>

                        {/* Recent Activity Stream — Expanded */}
                        <motion.div variants={itemVariants}>
                            <Card className={cn(dashGlassCard, "p-1 rounded-[2.5rem] border-none shadow-xl overflow-hidden")}>
                                <CardContent className="p-8 sm:p-10 space-y-8">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-200/20 text-violet-700 dark:text-violet-300 text-[10px] font-black uppercase tracking-widest">
                                                Live Activity
                                            </div>
                                            <h3 className="text-xl font-black text-slate-800 dark:text-white">Derniers Mouvements Système</h3>
                                        </div>
                                        <Link to="/dashboard/mouvements" className="h-10 w-10 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center hover:scale-110 transition-transform">
                                            <ArrowRight className="h-5 w-5" />
                                        </Link>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {recentActivities.map((activity, idx) => (
                                            <div key={idx} className="flex items-start gap-4 p-5 rounded-3xl bg-white/50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 shadow-sm group hover:border-indigo-400/30 transition-all duration-300">
                                                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform", activity.dot.replace('bg-', 'bg-opacity-10 dark:bg-opacity-20 text-'))}>
                                                    <Clock className="h-6 w-6" />
                                                </div>
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-black truncate text-slate-900 dark:text-white">{activity.title}</span>
                                                        <span className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border", activity.tone.replace('text-', 'border-').replace('text-', 'text-'))}>{activity.value}</span>
                                                    </div>
                                                    <p className="text-[11px] font-bold text-muted-foreground leading-tight">{activity.detail}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                    {/* SIDEBAR OPS (4 Columns) */}
                    <div className="lg:col-span-4 space-y-8">
                        
                        {/* Quick Actions — Mission Hub Style */}
                        <Card className={cn(dashGlassCard, "p-8 space-y-8 rounded-[2.5rem] border-none shadow-xl bg-gradient-to-br from-white/60 to-slate-50/40 dark:from-[#111] dark:to-[#0a0a0a]")}>
                            <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                <Zap className="h-4 w-4 text-amber-500" />
                                Raccourcis Opérationnels
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                {quickActions.map((action, i) => (
                                    <Link
                                        key={i}
                                        to={action.href}
                                        state={action.state}
                                        className="flex flex-col gap-4 p-5 rounded-[1.75rem] border border-slate-200/60 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] hover:bg-slate-900 dark:hover:bg-white hover:border-transparent hover:text-white dark:hover:text-black group transition-all duration-300 shadow-sm"
                                    >
                                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center group-hover:bg-white/20 dark:group-hover:bg-black/10 transition-colors", action.bg, action.color)}>
                                            <action.icon className="h-5 w-5" />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-tight leading-tight">{action.title}</span>
                                    </Link>
                                ))}
                            </div>
                        </Card>

                        {/* Inventory & Cash Threats */}
                        {(counts.lowStockCount > 0 || counts.impayeCount > 0) && (
                            <div className="space-y-6">
                                {counts.impayeCount > 0 && (
                                    <Card className="p-8 border-none bg-indigo-900 text-white rounded-[2rem] shadow-xl shadow-indigo-900/20 relative overflow-hidden">
                                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 blur-3xl rounded-full -translate-x-12 translate-y-12" />
                                        <div className="relative z-10 space-y-6">
                                            <div className="flex items-center justify-between">
                                                <ShieldAlert className="h-8 w-8 text-white/30" />
                                                <span className="text-[10px] font-black tracking-widest uppercase opacity-70">Trésorerie</span>
                                            </div>
                                            <div className="space-y-1">
                                                <h5 className="text-2xl font-black">{counts.impayeCount} Impayés</h5>
                                                <p className="text-sm font-bold opacity-80">Dossiers de recouvrement en attente.</p>
                                            </div>
                                            <Link to="/dashboard/reglements" className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-indigo-600 text-white font-black text-xs hover:bg-indigo-700 transition-colors border border-indigo-400/20">
                                                Gérer les Paiements
                                            </Link>
                                        </div>
                                    </Card>
                                )}
                            </div>
                        )}

                        {/* Infrastructure & Intelligence Status */}
                        <Card className={cn(dashGlassCard, "p-8 rounded-[2.5rem] border-none shadow-xl bg-slate-100/50 dark:bg-black/20")}>
                            <div className="space-y-6">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">État Intelligence Système</p>
                                <div className="space-y-4">
                                    {[
                                        { label: "Canal Temps Réel", status: "Opérationnel", color: "bg-emerald-400" },
                                        { label: "Synchronisation Cloud", status: "Active", color: "bg-indigo-500" },
                                        { label: "Moteur de Calcul", status: "Nominal", color: "bg-emerald-400" },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200/50 dark:border-white/5 shadow-sm">
                                            <span className="text-[10px] font-bold opacity-70">{item.label}</span>
                                            <div className="flex items-center gap-2">
                                                <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", item.color)} />
                                                <span className="text-[9px] font-black uppercase tracking-tighter opacity-80">{item.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

