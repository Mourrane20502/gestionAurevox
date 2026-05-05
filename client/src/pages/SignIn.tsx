import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Eye, EyeOff, Mail, Lock, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import { Label } from "@/components/common/ui/label";
import signinPhoto from "@/assets/signinphoto.jpg";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const schema = z.object({
    email: z.string().email({ message: "Adresse email invalide" }),
    password: z.string().min(6, { message: "Minimum 6 caractères requis" }),
});

type FormValues = z.infer<typeof schema>;

export default function SignIn() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [captchaCode, setCaptchaCode] = useState<string | null>(null);
    const [captchaInput, setCaptchaInput] = useState("");
    const [isRefreshingCaptcha, setIsRefreshingCaptcha] = useState(false);
    const [twoFaRequired, setTwoFaRequired] = useState(false);
    const [twoFaCode, setTwoFaCode] = useState("");
    const [twoFaTempToken, setTwoFaTempToken] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    });

    const fetchCaptcha = async () => {
        setIsRefreshingCaptcha(true);
        try {
            const response = await fetch(`/api/auth/captcha?t=${Date.now()}`, {
                cache: "no-store",
            });
            const data = await response.json();
            setCaptchaToken(data.captchaToken);
            setCaptchaCode(data.captchaCode);
            setCaptchaInput("");
        } catch (err) {
            console.error("Failed to fetch captcha", err);
        } finally {
            setIsRefreshingCaptcha(false);
        }
    };

    useEffect(() => {
        fetchCaptcha();
    }, []);

    const onSubmit = async (data: FormValues) => {
        setIsLoading(true);
        setError(null);

        try {
            if (twoFaRequired) {
                if (!twoFaTempToken || !twoFaCode.trim()) {
                    throw new Error("Veuillez saisir le code de votre application d'authentification.");
                }
                const response = await fetch("/api/auth/login/2fa", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tempToken: twoFaTempToken, code: twoFaCode }),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.message || "Code 2FA invalide");
                }
                localStorage.setItem("token", result.token);
                localStorage.setItem("role", result.role);
                navigate("/dashboard");
                return;
            }

            const normalizedCaptcha = captchaInput.replace(/\D/g, "").trim();
            if (!captchaToken || normalizedCaptcha.length !== 6) {
                throw new Error("Veuillez saisir le CAPTCHA à 6 chiffres.");
            }
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...data, captchaToken, captchaInput: normalizedCaptcha }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Erreur de connexion");
            }

            if (result.requiresTwoFactor) {
                setTwoFaRequired(true);
                setTwoFaTempToken(result.tempToken || null);
                setTwoFaCode("");
                return;
            }

            localStorage.setItem("token", result.token);
            localStorage.setItem("role", result.role);
            navigate("/dashboard");
        } catch (err: any) {
            setError(err.message);
            if (!twoFaRequired) fetchCaptcha();
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 via-indigo-50/30 to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 flex items-center justify-center px-4 py-4 overflow-hidden">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 flex w-full max-w-6xl rounded-3xl overflow-hidden shadow-[0_25px_70px_rgba(15,23,42,0.16)] dark:shadow-[0_30px_80px_rgba(2,6,23,0.65)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800"
            >
                <div className="w-full md:w-[48%] flex flex-col justify-center px-6 py-8 md:px-10 md:py-10 lg:px-12">

                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="text-left mb-5"
                    >
                        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1">
                            <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                            <span className="text-[10px] font-black  tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Gestion ERP</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl mt-4 font-black text-slate-900 dark:text-white mb-3 tracking-tight leading-tight">
                        L'excellence digitale qui fait la diffèrence
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-3 font-medium max-w-md leading-relaxed">
                            Pilotez ventes, stock, finance et ressources humaines depuis une interface unique, rapide et securisee.
                        </p>
                  
                    </motion.div>

                    <motion.form
                        onSubmit={handleSubmit(onSubmit)}
                        className="space-y-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 p-4 md:p-5"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    >
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="vous@entreprise.com"
                                    autoComplete="email"
                                    disabled={isLoading || twoFaRequired}
                                    {...register("email")}
                                    className={cn(
                                        "h-11 pl-10 rounded-xl border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all",
                                        errors.email && "border-red-500 focus:ring-red-500/20"
                                    )}
                                />
                            </div>
                            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">Mot de passe</Label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    disabled={isLoading || twoFaRequired}
                                    placeholder="••••••••"
                                    {...register("password")}
                                    className={cn(
                                        "h-11 pl-10 pr-10 rounded-xl border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all",
                                        errors.password && "border-red-500 focus:ring-red-500/20"
                                    )}
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
                        </div>

                        {!twoFaRequired && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="relative group pt-2"
                        >
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-[2.2rem] blur opacity-0 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>

                            <div className="relative flex flex-col gap-4 p-4 rounded-[1.5rem] bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-sm transition-all group-hover:border-indigo-500/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="bg-indigo-500/10 p-1.5 rounded-lg">
                                            <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Sécurité</span>
                                    </div>
                                    <motion.button
                                        type="button"
                                        onClick={fetchCaptcha}
                                        whileHover={{ rotate: 180 }}
                                        whileTap={{ scale: 0.9 }}
                                        disabled={isRefreshingCaptcha}
                                        className="text-slate-400 hover:text-indigo-500 transition-colors p-1.5 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                                    >
                                        <RefreshCw className={cn("h-4 w-4", isRefreshingCaptcha && "animate-spin")} />
                                    </motion.button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                                    <div className="relative h-14 w-full bg-slate-950 dark:bg-black rounded-2xl border border-slate-800 flex items-center justify-center shadow-2xl overflow-hidden group/box">
                                        {/* Dynamic Background Noise */}
                                        <div className="absolute inset-0 opacity-20 pointer-events-none"
                                            style={{ backgroundImage: 'linear-gradient(45deg, #4f46e5 1px, transparent 1px), linear-gradient(-45deg, #4f46e5 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
                                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />

                                        <AnimatePresence mode="wait">
                                            <motion.span
                                                key={captchaCode}
                                                initial={{ y: 20, opacity: 0, skewX: 20 }}
                                                animate={{ y: 0, opacity: 1, skewX: 0 }}
                                                exit={{ y: -20, opacity: 0, skewX: -20 }}
                                                className="text-2xl font-black tracking-[0.4em] text-white select-none relative z-10 font-mono"
                                            >
                                                {captchaCode || "••••••"}
                                            </motion.span>
                                        </AnimatePresence>

                                        {/* Security Scanline */}
                                        <motion.div
                                            animate={{ top: ['-100%', '200%'] }}
                                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                            className="absolute left-0 right-0 h-px bg-indigo-500/30 blur-[2px] z-20 pointer-events-none"
                                        />
                                    </div>

                                    <div className="relative">
                                        <Input
                                            type="text"
                                            placeholder="Saisir le code"
                                            value={captchaInput}
                                            onChange={(e) => setCaptchaInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                            className="w-full h-14 text-center text-xl font-bold tracking-[0.2em] rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:tracking-normal placeholder:text-sm placeholder:font-medium shadow-inner"
                                            maxLength={6}
                                        />
                                        {captchaInput.length === 6 && (
                                            <motion.div
                                                initial={{ scale: 0, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                className="absolute right-3 top-1/2 -translate-y-1/2"
                                            >
                                                <div className="bg-emerald-500/10 p-1 rounded-full">
                                                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                        )}

                        {twoFaRequired && (
                            <div className="space-y-2">
                                <Label htmlFor="totp" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Code 2FA (application d&apos;authentification)
                                </Label>
                                <Input
                                    id="totp"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="123456"
                                    value={twoFaCode}
                                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    className="h-11 text-center text-lg tracking-[0.3em] rounded-xl border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                />
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Ouvrez votre application Authenticator et saisissez le code à 6 chiffres.
                                </p>
                            </div>
                        )}

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="p-4 rounded-[1.5rem] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center gap-3 text-rose-600 dark:text-rose-400 text-[13px] font-bold"
                            >
                                <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                                {error}
                            </motion.div>
                        )}

                        <motion.div whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }}>
                            <Button
                                type="submit"
                                disabled={
                                    isLoading ||
                                    (twoFaRequired
                                        ? twoFaCode.trim().length < 6
                                        : (!captchaToken || captchaInput.replace(/\D/g, "").length < 6))
                                }
                                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-xl shadow-indigo-600/20 dark:shadow-none transition-all disabled:opacity-50 disabled:grayscale"
                            >
                                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : twoFaRequired ? "Vérifier le code 2FA" : "Se connecter"}
                            </Button>
                        </motion.div>
                    </motion.form>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.7 }}
                        className="mt-6"
                    >
                        <p className="text-[11px] text-slate-400 font-medium">© {new Date().getFullYear()} Gestion ERP — Plateforme ERP/CRM Entreprise</p>
                    </motion.div>
                </div>

                {/* Right: Photo */}
                <div className="hidden md:flex md:w-[54%] relative min-h-[560px] overflow-hidden bg-slate-950">
                    <motion.img
                        initial={{ scale: 1.16, opacity: 0 }}
                        animate={{ scale: 1.04, opacity: 1 }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        src={signinPhoto}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover object-center"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-900/35 to-slate-900/10" />
                    <div className="absolute inset-0 bg-gradient-to-l from-indigo-900/40 via-indigo-500/10 to-transparent" />
                    <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
                    <div className="absolute -bottom-24 left-8 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />

                 
                </div>
            </motion.div>
        </div>
    );
}
