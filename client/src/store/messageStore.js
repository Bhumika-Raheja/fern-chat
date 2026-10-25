import { create } from "zustand";
import { api } from "../api/client";
import { getSocket } from "../socket/socket";

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

    // A message arrived from the server (from me or from someone else)
    receiveMessage: (message) => {
        patch(set, message.conversationId, (c) => {
            // Already have this exact message? Ignore it.
            if (c.messages.some((m) => m._id === message._id)) return c;

            // Is it my own pending message coming back? Replace it.
            const index = c.messages.findIndex(
                (m) => m.clientId && m.clientId === message.clientId
            );
            const final = { ...message, status: "sent" };
            if (index >= 0) {
                const copy = [...c.messages];
                copy[index] = final;
                return { ...c, messages: copy };
            }

            return { ...c, messages: [...c.messages, final] };
        });
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

        const markFailed = () =>
            patch(set, conversationId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                    m.clientId === clientId && m.status === "pending" ? { ...m, status: "failed" } : m
                ),
            }));

        // 2. Send through the socket and wait for the server's answer
        const socket = getSocket();
        if (!socket || !socket.connected) {
            markFailed();
            return;
        }

        socket.timeout(8000).emit(
            "message:send",
            { conversationId, body, clientId },
            (err, res) => {
                if (err || !res?.ok) {
                    markFailed();
                    return;
                }
                get().receiveMessage(res.message);
            }
        );
    },
}));