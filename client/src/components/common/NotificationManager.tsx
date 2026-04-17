import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Bell, FileText, ShoppingCart, Receipt, X } from 'lucide-react';

const resolveSocketUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
    const fallbackUrl =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:4000";
    const rawUrl = envUrl || fallbackUrl;

    if (typeof window !== "undefined" && window.location.protocol === "https:" && rawUrl.startsWith("http://")) {
        return rawUrl.replace(/^http:\/\//i, "https://");
    }
    return rawUrl;
};

const SOCKET_URL = resolveSocketUrl();

interface NotificationData {
    id: string;
    type: string;
    numero: string;
    user: string;
    date: string;
}

export default function NotificationManager() {
    const [notifications, setNotifications] = useState<NotificationData[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const socket = io(SOCKET_URL, {
            withCredentials: true,
        });

        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audioRef.current = audio;

        socket.on('notification', (data: any) => {
            if (audioRef.current) {
                audioRef.current.play().catch(err => console.error("Audio playback failed:", err));
            }

            const newNotif = {
                id: Math.random().toString(36).substr(2, 9),
                ...data
            };

            setNotifications(prev => [newNotif, ...prev]);

            // Auto-remove after 6 seconds
            setTimeout(() => {
                removeNotification(newNotif.id);
            }, 6000);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-80 pointer-events-none">
            {notifications.map((notif) => (
                <div 
                    key={notif.id}
                    className="pointer-events-auto animate-in fade-in slide-in-from-right-10 duration-500"
                >
                    <NotificationItem notif={notif} onRemove={() => removeNotification(notif.id)} />
                </div>
            ))}
        </div>
    );
}

function NotificationItem({ notif, onRemove }: { notif: NotificationData; onRemove: () => void }) {
    let icon = <Bell className="h-5 w-5 text-blue-500" />;
    let title = "Notification";
    let color = "bg-blue-50 border-blue-200";

    if (notif.type === 'devis') {
        icon = <FileText className="h-5 w-5 text-amber-500" />;
        title = "Nouveau Devis";
        color = "bg-amber-50 border-amber-200";
    } else if (notif.type === 'commande') {
        icon = <ShoppingCart className="h-5 w-5 text-emerald-500" />;
        title = "Nouvelle Commande";
        color = "bg-emerald-50 border-emerald-200";
    } else if (notif.type === 'facture') {
        icon = <Receipt className="h-5 w-5 text-indigo-500" />;
        title = "Nouvelle Facture";
        color = "bg-indigo-50 border-indigo-200";
    } else if (notif.type === 'avoir') {
        icon = <Bell className="h-5 w-5 text-rose-500" />;
        title = "Nouvel Avoir";
        color = "bg-rose-50 border-rose-200";
    }

    return (
        <div className={`${color} border p-4 rounded-2xl shadow-2xl flex items-start gap-3 backdrop-blur-md relative group`}>
            <div className="p-2 bg-white rounded-xl shadow-md flex-shrink-0">
                {icon}
            </div>
            <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center justify-between mb-0.5">
                    <h4 className="text-[13px] font-bold text-foreground truncate">{title}</h4>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">{notif.numero}</span> créé par <span className="font-bold text-primary">{notif.user}</span>
                </p>
            </div>
            <button 
                onClick={onRemove}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}
