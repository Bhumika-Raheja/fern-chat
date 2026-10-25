import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useConversationStore } from "../store/conversationStore";
import Sidebar from "../components/Sidebar";

export default function Chat() {
    const navigate = useNavigate();
    const { token, setSession, logout } = useAuthStore();
    const { conversations, activeId, fetchConversations } = useConversationStore();

    useEffect(() => {
        if (!token) {
            navigate("/login");
            return;
        }
        api
            .get("/api/auth/me")
            .then((res) => {
                setSession(token, res.data.user);
                fetchConversations();
            })
            .catch(() => {
                logout();
                navigate("/login");
            });
    }, []);

    function handleLogout() {
        logout();
        navigate("/login");
    }

    const active = conversations.find((c) => c._id === activeId);

    return (
        <div className="flex h-screen">
            <Sidebar onLogout={handleLogout} />
            <main className="flex flex-1 items-center justify-center bg-cream">
                {active ? (
                    <div className="text-center">
                        <h1 className="text-2xl font-semibold">
                            {active.type === "channel" ? `# ${active.name}` : active.name || "Direct message"}
                        </h1>
                        <p className="text-muted">{active.memberIds.length} members. Messages coming next.</p>
                    </div>
                ) : (
                    <p className="text-muted">Select a conversation</p>
                )}
            </main>
        </div>
    );
}