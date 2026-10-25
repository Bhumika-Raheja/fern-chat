import { create } from "zustand";
import { api } from "../api/client";

const empty = { messages: [], nextCursor: null, loading: false, loaded: false, error: "" };

// Small helper: change the data of one conversation
function patch(set, id, change) {
    set((s) => ({
        byConversation: {
            ...s.byConversation,
            [id]: change(s.byConversation[id] || empty),
        },
    }));
}

export const useMessageStore = create((set, get) => ({
    byConversation: {},

    fetchMessages: async (conversationId) => {
        const current = get().byConversation[conversationId];
        if (current?.loaded || current?.loading) return;

        patch(set, conversationId, (c) => ({ ...c, loading: true, error: "" }));
        try {
            const res = await api.get(`/api/conversations/${conversationId}/messages`);
            // The API sends newest first, the screen needs oldest first
            const messages = res.data.messages.reverse().map((m) => ({ ...m, status: "sent" }));
            patch(set, conversationId, () => ({
                messages,
                nextCursor: res.data.nextCursor,
                loading: false,
                loaded: true,
                error: "",
            }));
        } catch (err) {
            patch(set, conversationId, (c) => ({
                ...c,
                loading: false,
                error: err.response?.data?.message || "Could not load messages",
            }));
        }
    },

    sendMessage: async (conversationId, body, user) => {
        const clientId = crypto.randomUUID();

        // 1. Show the message immediately as "pending"
        const pending = {
            _id: clientId,
            clientId,
            body,
            createdAt: new Date().toISOString(),
            senderId: { _id: user.id, name: user.name },
            status: "pending",
        };
        patch(set, conversationId, (c) => ({ ...c, messages: [...c.messages, pending] }));

        // 2. Save it on the server, then mark it "sent" (or "failed")
        try {
            const res = await api.post(`/api/conversations/${conversationId}/messages`, {
                body,
                clientId,
            });
            patch(set, conversationId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                    m.clientId === clientId
                        ? { ...res.data.message, senderId: m.senderId, status: "sent" }
                        : m
                ),
            }));
        } catch {
            patch(set, conversationId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                    m.clientId === clientId ? { ...m, status: "failed" } : m
                ),
            }));
        }
    },
}));