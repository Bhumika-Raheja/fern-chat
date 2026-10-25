import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useConversationStore } from "../store/conversationStore";
import { connectSocket, disconnectSocket } from "../socket/socket";
import Sidebar from "../components/Sidebar";
import ChatArea from "../components/ChatArea";
import { useMessageStore } from "../store/messageStore";

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
                const socket = connectSocket(token);
                socket.off("message:new"); // avoids double listeners
                socket.on("message:new", (m) => useMessageStore.getState().receiveMessage(m));
            })
            .catch(() => {
                logout();
                navigate("/login");
            });
    }, []);

    function handleLogout() {
        disconnectSocket();
        logout();
        navigate("/login");
    }

    const active = conversations.find((c) => c._id === activeId);

    return (
        <div className="flex h-screen">
            <Sidebar onLogout={handleLogout} />
            <main className="flex flex-1 bg-cream">
                {active ? (
                    <ChatArea key={active._id} conversation={active} />
                ) : (
                    <div className="flex flex-1 items-center justify-center">
                        <p className="text-muted">Select a conversation</p>
                    </div>
                )}
            </main>
        </div>
    );
}