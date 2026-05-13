import { useState, useEffect, useCallback } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Toaster } from "@/components/common/ui/sonner";
import Sidebar from "./Sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/common/ui/sheet";
import {
    Menu,
    Moon,
    Sun,
    Sparkles,
    LogOut,
    Settings,
    ChevronDown,
    X,
    Send,
    MessageSquare,
    Ticket,
    Users,
    Maximize,
    Minimize,
    ZoomIn,
    ZoomOut,
    RotateCcw
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { toast as sonnerToast } from "sonner";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { useTheme } from "@/components/common/theme-provider";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { theme, setTheme } = useTheme();
    const [hasSupportTickets, setHasSupportTickets] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    useEffect(() => {
        // Apply zoom to body
        (document.body.style as any).zoom = zoomLevel;
    }, [zoomLevel]);

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 1.5));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.7));
    const handleZoomReset = () => setZoomLevel(1);

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                sonnerToast.error(`Erreur plein écran: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    const [aiResponse, setAiResponse] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [isAiInputVisible, setIsAiInputVisible] = useState(false);

    useEffect(() => {
        const checkTokenExpiry = () => {
            try {
                const token = localStorage.getItem("token") || sessionStorage.getItem("token");
                if (!token) return;
                const payload = token.split(".")[1];
                if (!payload) return;
                const decoded = JSON.parse(atob(payload));
                const exp = decoded.exp * 1000;
                if (Date.now() >= exp) {
                    handleLogout();
                }
            } catch (error) {
                // Silently handle decoding errors
            }
        };

        const interval = setInterval(checkTokenExpiry, 10000); // Check every 10 seconds
        checkTokenExpiry(); // Initial check
        return () => clearInterval(interval);
    }, []);

    const getUserName = () => {
        try {
            const token = localStorage.getItem("token") || sessionStorage.getItem("token");
            if (!token) return "";

            const payload = token.split(".")[1];
            if (!payload) return "";

            const decoded = JSON.parse(atob(payload));
            if (decoded.nom && decoded.prenom) {
                return `${decoded.prenom} ${decoded.nom}`;
            }
            return "";
        } catch (error) {
            console.error("Error decoding token:", error);
            return "";
        }
    };

    const userName = getUserName();

    const handleToggleSidebar = () => {
        setIsCollapsed(!isCollapsed);
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        sessionStorage.removeItem("token");
        navigate("/signin");
    };

    const refreshTicketIndicator = useCallback(() => {
        const token = localStorage.getItem("token") || sessionStorage.getItem("token");
        if (!token) return;

        fetch("/api/tickets", { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (Array.isArray(data)) {
                    const hasUnfinished = data.some(
                        (t: { statut?: string }) =>
                            t.statut === "ouvert" || t.statut === "en_cours"
                    );
                    setHasSupportTickets(hasUnfinished);
                } else {
                    setHasSupportTickets(false);
                }
            })
            .catch(() => setHasSupportTickets(false));
    }, []);

    useEffect(() => {
        refreshTicketIndicator();
        window.addEventListener("focus", refreshTicketIndicator);
        return () => window.removeEventListener("focus", refreshTicketIndicator);
    }, [refreshTicketIndicator, location.pathname]);

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <div className="hidden md:flex h-full">
                <Sidebar onToggle={handleToggleSidebar} />
            </div>

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-6 pb-2 bg-transparent pointer-events-none">
                    <motion.div 
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="max-w-7xl mx-auto h-16 sm:h-20 bg-background/60 dark:bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 dark:border-white/5 rounded-[1.5rem] sm:rounded-full px-4 sm:px-8 flex items-center justify-between shadow-2xl shadow-black/5 pointer-events-auto relative group"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-emerald-500/5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                        <div className="flex items-center gap-4 relative z-10">
                            <div className="md:hidden">
                                <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                                    <SheetTrigger asChild>
                                        <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10 active:scale-95 transition-all">
                                            <Menu className="h-5 w-5" />
                                        </Button>
                                    </SheetTrigger>
                                    <SheetContent side="left" className="p-0 w-72 border-none">
                                        <Sidebar onNavigate={() => setIsMobileOpen(false)} />
                                    </SheetContent>
                                </Sheet>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 md:flex hidden animate-in zoom-in duration-500">
                                    <Sparkles className="h-5 w-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-black tracking-tighter text-foreground uppercase leading-none">
                                        Gestion ERP
                                    </span>
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">
                                       Gestion ERP
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-6 relative z-10">
                            <div className="hidden lg:flex flex-col items-end mr-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 mb-0.5">
                                    Session active
                                </span>
                                <span className="text-sm font-bold text-foreground">
                                    Bonjour, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-indigo-400 dark:from-indigo-400 dark:to-indigo-200">{userName || "Admin"}</span>
                                </span>
                            </div>

                            <div className="h-8 w-[1px] bg-white/10 dark:bg-white/5 hidden sm:block" />

                            <div className="flex items-center gap-1.5 sm:gap-3">
                                <div className="flex items-center p-1 rounded-full bg-black/5 dark:bg-white/5 border border-white/10 relative overflow-hidden">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-7 w-7 sm:h-8 sm:w-8 rounded-full transition-all duration-300 relative z-10",
                                            theme === "light" 
                                                ? "bg-white text-amber-500 shadow-md" 
                                                : "text-muted-foreground hover:text-amber-400"
                                        )}
                                        onClick={() => setTheme("light")}
                                    >
                                        <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-7 w-7 sm:h-8 sm:w-8 rounded-full transition-all duration-300 relative z-10",
                                            theme === "dark" 
                                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                                                : "text-muted-foreground hover:text-indigo-400"
                                        )}
                                        onClick={() => setTheme("dark")}
                                    >
                                        <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    </Button>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-black/5 dark:bg-white/5 border border-white/10 text-muted-foreground hover:text-indigo-500 hover:bg-indigo-500/10 transition-all duration-300 group/fs"
                                    onClick={toggleFullScreen}
                                    title={isFullscreen ? "Quitter le plein écran" : "Passer en plein écran"}
                                >
                                    {isFullscreen ? (
                                        <Minimize className="h-4 w-4 sm:h-5 sm:w-5 group-hover/fs:scale-110 transition-transform" />
                                    ) : (
                                        <Maximize className="h-4 w-4 sm:h-5 sm:w-5 group-hover/fs:scale-110 transition-transform" />
                                    )}
                                </Button>

                                <div className="hidden xl:flex items-center gap-1 p-1 rounded-full bg-black/5 dark:bg-white/5 border border-white/10 ml-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-full hover:bg-white dark:hover:bg-indigo-600 transition-all text-muted-foreground hover:text-indigo-600 dark:hover:text-white"
                                        onClick={handleZoomOut}
                                        title="Zoom arrière"
                                    >
                                        <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-full hover:bg-white dark:hover:bg-indigo-600 transition-all text-muted-foreground hover:text-indigo-600 dark:hover:text-white"
                                        onClick={handleZoomReset}
                                        title="Réinitialiser"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-full hover:bg-white dark:hover:bg-indigo-600 transition-all text-muted-foreground hover:text-indigo-600 dark:hover:text-white"
                                        onClick={handleZoomIn}
                                        title="Zoom avant"
                                    >
                                        <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    </Button>
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="flex items-center gap-2 pl-1 pr-1 sm:pr-2 py-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all outline-none group/user">
                                            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-600/10 group-hover/user:scale-110 transition-transform duration-300">
                                                {userName?.charAt(0).toUpperCase() || "A"}
                                            </div>
                                            <ChevronDown className="h-4 w-4 text-muted-foreground/50 group-hover/user:text-foreground transition-all group-data-[state=open]:rotate-180 hidden sm:block" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64 mt-4 rounded-[2rem] border-white/10 bg-background/80 backdrop-blur-2xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-200">
                                        <DropdownMenuLabel className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                                    <Users className="h-5 w-5" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <p className="text-sm font-black text-foreground truncate">{userName || "Administrateur"}</p>
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Compte Professionnel</p>
                                                </div>
                                            </div>
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator className="bg-white/5" />
                                        <div className="p-1 space-y-1">
                                            <DropdownMenuItem
                                                onClick={() => navigate("/dashboard/settings")}
                                                className="flex items-center gap-3 p-3 cursor-pointer rounded-2xl transition-all focus:bg-indigo-500 focus:text-white group"
                                            >
                                                <Settings className="h-4 w-4 opacity-50 group-focus:opacity-100" />
                                                <span className="font-bold">Paramètres Système</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="flex items-center gap-3 p-3 cursor-pointer rounded-2xl transition-all focus:bg-rose-500 focus:text-white group text-rose-500"
                                                onClick={handleLogout}
                                            >
                                                <LogOut className="h-4 w-4 opacity-50 group-focus:opacity-100" />
                                                <span className="font-bold">Déconnexion</span>
                                            </DropdownMenuItem>
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </motion.div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
                    <Outlet />
                </div>

                <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-4 pointer-events-none">
                    <Link
                        to="/dashboard/tickets"
                        className="pointer-events-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 border border-white/20 hover:bg-indigo-500 transition-all duration-300 group"
                        title="Support & Tickets"
                    >
                        <div className="relative flex h-6 w-6 items-center justify-center">
                            <Ticket className="h-5 w-5" />
                            {hasSupportTickets && (
                                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-rose-500 animate-pulse" />
                            )}
                        </div>
                    </Link>

                    {aiResponse && (
                        <div className="pointer-events-auto w-80 sm:w-[500px] mb-4 bg-background/80 backdrop-blur-3xl border border-white/20 dark:border-white/5 shadow-2xl rounded-[2.5rem] p-6 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                         <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-lg">
                                        <Sparkles className="h-5 w-5 text-white animate-pulse" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500/80">Intelligence Artificielle</span>
                                        <span className="text-sm font-bold text-foreground">Analyse en temps réel</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-full hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive transition-all"
                                        onClick={() => setAiResponse(null)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="bg-muted/40 backdrop-blur-sm p-6 rounded-[2rem] border border-white/5 max-h-[45vh] overflow-y-auto custom-scrollbar-thin">
                                <p className="text-sm leading-relaxed text-foreground font-medium whitespace-pre-wrap">{aiResponse}</p>
                            </div>
                        </div>
                    )}

                    <div className={cn(
                        "pointer-events-auto flex items-center bg-background/80 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-full transition-all duration-500 ring-1 ring-white/10 overflow-hidden",
                        isAiInputVisible ? "w-72 lg:w-[500px] p-2 pl-6" : "w-12 h-12 p-0 justify-center hover:bg-muted cursor-pointer"
                    )}>
                        {!isAiInputVisible ? (
                            <button
                                onClick={() => setIsAiInputVisible(true)}
                                className="w-full h-full flex items-center justify-center text-indigo-500"
                            >
                                <Sparkles className="h-5 w-5" />
                            </button>
                        ) : (
                            <div className="flex items-center w-full gap-4">
                                <MessageSquare className="h-4 w-4 text-indigo-500" />
                                <form
                                    className="flex items-center w-full"
                                    onSubmit={async (e) => {
                                        e.preventDefault();
                                        if (!aiPrompt.trim() || isAiLoading) return;
                                        const token = localStorage.getItem("token") || sessionStorage.getItem("token");
                                        const prompt = aiPrompt;
                                        setAiPrompt("");
                                        setIsAiLoading(true);
                                        try {
                                            const res = await fetch("/api/ai/ask", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                                body: JSON.stringify({ prompt })
                                            });
                                            const data = await res.json();
                                            if (data.success) setAiResponse(data.answer);
                                            else sonnerToast.error("Erreur IA");
                                        } catch (e) {
                                            sonnerToast.error("Erreur de connexion");
                                        } finally {
                                            setIsAiLoading(false);
                                        }
                                    }}
                                >
                                    <Input
                                        autoFocus
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        placeholder="Posez une question..."
                                        className="h-10 flex-1 border-none bg-transparent focus-visible:ring-0 text-sm font-semibold"
                                    />
                                    <div className="flex items-center gap-1">
                                        <Button
                                            type="submit"
                                            disabled={!aiPrompt.trim() || isAiLoading}
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full bg-indigo-500 text-white"
                                        >
                                            <Send className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full"
                                            onClick={() => setIsAiInputVisible(false)}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </main>
            <Toaster />
        </div>
    );
}
