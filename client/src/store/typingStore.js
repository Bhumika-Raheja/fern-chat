import { create } from "zustand";

const timers = {};

export const useTypingStore = create((set) => ({
    typing: {}, // { conversationId: { userId: name } }

    setTyping: (conversationId, userId, name) => {
        set((s) => ({
            typing: {
                ...s.typing,
                [conversationId]: { ...(s.typing[conversationId] || {}), [userId]: name },
            },
        }));

        // Hide it after 3 seconds unless a new signal arrives
        const key = `${conversationId}:${userId}`;
        clearTimeout(timers[key]);
        timers[key] = setTimeout(() => useTypingStore.getState().clearTyping(conversationId, userId), 3000);
    },

    clearTyping: (conversationId, userId) => {
        clearTimeout(timers[`${conversationId}:${userId}`]);
        set((s) => {
            const room = { ...(s.typing[conversationId] || {}) };
            delete room[userId];
            return { typing: { ...s.typing, [conversationId]: room } };
        });
    },
}));