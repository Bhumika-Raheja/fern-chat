import { create } from "zustand";
import { api } from "../api/client";

export const useConversationStore = create((set, get) => ({
    conversations: [],
    activeId: null,
    loading: false,
    error: "",

    fetchConversations: async () => {
        set({ loading: true, error: "" });
        try {
            const res = await api.get("/api/conversations");
            const activeId = get().activeId;

            // The conversation I'm looking at is never "unread"
            const conversations = res.data.conversations.map((c) =>
                c._id === activeId ? { ...c, unreadCount: 0 } : c
            );
            set({ conversations, loading: false });

            if (activeId) get().markRead(activeId);
        } catch (err) {
            set({
                error: err.response?.data?.message || "Could not load conversations",
                loading: false,
            });
        }
    },

    // Open a conversation: clear its badge and tell the server
    setActive: (id) => {
        set((s) => ({
            activeId: id,
            conversations: s.conversations.map((c) =>
                c._id === id ? { ...c, unreadCount: 0 } : c
            ),
        }));
        get().markRead(id);
    },

    markRead: (id) => {
        api.post(`/api/conversations/${id}/read`).catch(() => { });
    },

    // A message arrived in a conversation I'm not looking at
    bumpUnread: (id) =>
        set((s) => ({
            conversations: s.conversations.map((c) =>
                c._id === id ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
            ),
        })),
}));