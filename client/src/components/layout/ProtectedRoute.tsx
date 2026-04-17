import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute() {
    const [isValid, setIsValid] = useState<boolean | null>(null);

    useEffect(() => {
        const verifyToken = async () => {
            const token = localStorage.getItem("token") || sessionStorage.getItem("token");

            if (!token) {
                setIsValid(false);
                return;
            }

            try {
                const response = await fetch("/api/auth/verify", {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    localStorage.setItem("permissions", JSON.stringify(data.permissions || []));
                    setIsValid(true);
                } else {
                    localStorage.removeItem("token");
                    localStorage.removeItem("role");
                    localStorage.removeItem("permissions");
                    setIsValid(false);
                }
            } catch (error) {
                localStorage.removeItem("token");
                localStorage.removeItem("role");
                localStorage.removeItem("permissions");
                setIsValid(false);
            }
        };

        verifyToken();
    }, []);

    if (isValid === null) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return isValid ? <Outlet /> : <Navigate to="/signin" replace />;
}
