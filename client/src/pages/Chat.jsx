import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

export default function Chat() {
    const navigate = useNavigate();
    const { user, setSession, token, logout } = useAuthStore();

    useEffect(() => {
        if (!token) {
            navigate("/login");
            return;
        }
        api
            .get("/api/auth/me")
            .then((res) => setSession(token, res.data.user))
            .catch(() => {
                logout();
                navigate("/login");
            });
    }, []);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3">
            <h1 className="text-2xl font-semibold text-primary">Chat (coming soon)</h1>
            <p>{user ? `Logged in as ${user.name} (${user.email})` : "Loading..."}</p>
            <button
                onClick={() => {
                    logout();
                    navigate("/login");
                }}
                className="rounded-lg border border-line px-4 py-2"
            >
                Log out
            </button>
        </div>
    );
}