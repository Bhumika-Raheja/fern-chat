import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useConversationStore } from "../store/conversationStore";
import { useMessageStore } from "../store/messageStore";
import { usePresenceStore } from "../store/presenceStore";
import { useTypingStore } from "../store/typingStore";
import { connectSocket, disconnectSocket } from "../socket/socket";
import Sidebar from "../components/Sidebar";
import ChatArea from "../components/ChatArea";
import ConnectionBanner from "../components/ConnectionBanner";

// Runs every time the socket connects (the first time and after each reconnect)
function onSocketConnect() {
    useConversationStore.getState().fetchConversations();
    useMessageStore.getState().syncAfterReconnect();
}

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

                // remove old listeners first, so none is ever registered twice
                socket.off("message:new");
                socket.off("presence:list");
                socket.off("presence:update");
                socket.off("typing");
                socket.off("connect", onSocketConnect);

                socket.on("message:new", (m) => {
                    useMessageStore.getState().receiveMessage(m);
                    // The sender has stopped typing once their message arrives
                    const senderId = m.senderId?._id;
                    if (senderId) useTypingStore.getState().clearTyping(m.conversationId, senderId);
                });
                socket.on("presence:list", (ids) => usePresenceStore.getState().setList(ids));
                socket.on("presence:update", (p) =>
                    usePresenceStore.getState().setOne(p.userId, p.online)
                );
                socket.on("typing", (t) =>
                    useTypingStore.getState().setTyping(t.conversationId, t.userId, t.name)
                );
                socket.on("connect", onSocketConnect);
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
            <main className="flex min-w-0 flex-1 flex-col bg-cream">
                <ConnectionBanner />
                <div className="flex min-h-0 flex-1">
                    {active ? (
                        <ChatArea key={active._id} conversation={active} />
                    ) : (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-muted">Select a conversation</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}