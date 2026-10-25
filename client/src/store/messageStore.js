import { create } from "zustand";
import { api } from "../api/client";
import { getSocket } from "../socket/socket";

const empty = {
    messages: [],
    nextCursor: null,
    loading: false,
    loadingOlder: false,
    loaded: false,
    error: "",
};

// Small helper: change the data of one conversation
function patch(set, id, change) {
    set((s) => ({
        byConversation: {
            ...s.byConversation,
            [id]: change(s.byConversation[id] || empty),
        },
    }));
}

// Change the status of one message that is not saved yet
function setStatus(set, conversationId, clientId, status) {
    patch(set, conversationId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
            m.clientId === clientId && m.status !== "sent" ? { ...m, status } : m
        ),
    }));
}

// Send one message through the socket. If we are offline, it simply stays
// "pending" and is sent again when the connection comes back.
function deliver(get, set, conversationId, message) {
    const socket = getSocket();
    if (!socket || !socket.connected) return;

    socket.timeout(8000).emit(
        "message:send",
        { conversationId, body: message.body, clientId: message.clientId },
        (err, res) => {
            if (err || !res?.ok) {
                setStatus(set, conversationId, message.clientId, "failed");
                return;
            }
            get().receiveMessage(res.message);
        }
    );
}

// The _id of the newest message that is saved on the server
function lastSavedId(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].status === "sent") return messages[i]._id;
    }
    return null;
}

// Fetch whatever this conversation missed while we were offline
async function syncOne(get, conversationId) {
    const c = get().byConversation[conversationId];
    if (!c || !c.loaded) return; // never opened: it will load fresh when opened

    try {
        let after = lastSavedId(c.messages);
        for (let round = 0; round < 10; round++) {
            const params = after ? { after, limit: 100 } : { limit: 30 };
            const res = await api.get(`/api/conversations/${conversationId}/messages`, { params });

            // "after" answers oldest first, the normal list answers newest first
            const list = after ? res.data.messages : [...res.data.messages].reverse();
            list.forEach((m) => get().receiveMessage(m));

            if (!after || !res.data.hasMoreNewer || list.length === 0) break;
            after = list[list.length - 1]._id;
        }
    } catch {
        // ignore: the next reconnect will try again
    }
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
                ...empty,
                messages,
                nextCursor: res.data.nextCursor,
                loaded: true,
            }));
        } catch (err) {
            patch(set, conversationId, (c) => ({
                ...c,
                loading: false,
                error: err.response?.data?.message || "Could not load messages",
            }));
        }
    },

    // Load the next 30 older messages and put them above the current ones
    loadOlder: async (conversationId) => {
        const current = get().byConversation[conversationId];
        if (!current || !current.nextCursor || current.loadingOlder) return;

        patch(set, conversationId, (c) => ({ ...c, loadingOlder: true }));
        try {
            const res = await api.get(`/api/conversations/${conversationId}/messages`, {
                params: { before: current.nextCursor },
            });
            const older = res.data.messages.reverse().map((m) => ({ ...m, status: "sent" }));
            patch(set, conversationId, (c) => {
                const have = new Set(c.messages.map((m) => m._id));
                return {
                    ...c,
                    messages: [...older.filter((m) => !have.has(m._id)), ...c.messages],
                    nextCursor: res.data.nextCursor,
                    loadingOlder: false,
                };
            });
        } catch {
            patch(set, conversationId, (c) => ({ ...c, loadingOlder: false }));
        }
    },

    // A message arrived from the server (from me or from someone else)
    receiveMessage: (message) => {
        patch(set, message.conversationId, (c) => {
            // Already have this exact message? Ignore it.
            if (c.messages.some((m) => m._id === message._id)) return c;

            // Is it my own unsent message coming back? Replace it.
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

    sendMessage: (conversationId, body, user) => {
        const clientId = crypto.randomUUID();

        // Show the message immediately as "pending"
        const pending = {
            _id: clientId,
            clientId,
            conversationId,
            body,
            createdAt: new Date().toISOString(),
            senderId: { _id: user.id, name: user.name },
            status: "pending",
        };
        patch(set, conversationId, (c) => ({ ...c, messages: [...c.messages, pending] }));

        deliver(get, set, conversationId, pending);
    },

    // The "Retry" button on a failed message
    retryMessage: (conversationId, clientId) => {
        const c = get().byConversation[conversationId];
        const message = c?.messages.find((m) => m.clientId === clientId && m.status === "failed");
        if (!message) return;

        setStatus(set, conversationId, clientId, "pending");
        deliver(get, set, conversationId, message);
    },

    // Send again everything that never got confirmed
    resendUnsent: () => {
        const all = get().byConversation;
        Object.entries(all).forEach(([conversationId, c]) => {
            const unsent = c.messages.filter((m) => m.status === "pending" || m.status === "failed");
            unsent.forEach((m) => {
                setStatus(set, conversationId, m.clientId, "pending");
                deliver(get, set, conversationId, m);
            });
        });
    },

    // Called every time the socket connects
    syncAfterReconnect: async () => {
        const ids = Object.keys(get().byConversation);
        await Promise.all(ids.map((id) => syncOne(get, id)));
        get().resendUnsent();
    },
}));