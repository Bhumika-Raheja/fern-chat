import { create } from "zustand";
import { api } from "../api/client";

export const useConversationStore = create((set) => ({
    conversations: [],
    activeId: null,
    loading: false,
    error: "",

    fetchConversations: async () => {
        set({ loading: true, error: "" });
        try {
            const res = await api.get("/api/conversations");
            set({ conversations: res.data.conversations, loading: false });
        } catch (err) {
            set({
                error: err.response?.data?.message || "Could not load conversations",
                loading: false,
            });
        }
    },

    setActive: (id) => set({ activeId: id }),
}));