import { create } from "zustand";

const timers = {};

export const useTypingStore = create((set) => ({
    typing: {}, // { conversationId: { userId: name } }

    setTyping: (conversationId, userId, name) => {
        if (!conversationId || !userId) return;
        const convKey = String(conversationId);
        const userKey = String(userId);
        set((s) => ({
            typing: {
                ...s.typing,
                [convKey]: { ...(s.typing[convKey] || {}), [userKey]: name },
            },
        }));

        // Hide it after 3 seconds unless a new signal arrives
        const key = `${convKey}:${userKey}`;
        clearTimeout(timers[key]);
        timers[key] = setTimeout(() => useTypingStore.getState().clearTyping(convKey, userKey), 3000);
    },

    forgetConversation: (conversationId) => {
        const prefix = String(conversationId) + ":";
        Object.keys(timers).filter((key) => key.startsWith(prefix)).forEach((key) => {
            clearTimeout(timers[key]);
            delete timers[key];
        });
        set((s) => {
            if (!s.typing[conversationId]) return s;
            const typing = { ...s.typing };
            delete typing[conversationId];
            return { typing };
        });
    },

    clearTyping: (conversationId, userId) => {
        if (!conversationId || !userId) return;
        const convKey = String(conversationId);
        const userKey = String(userId);
        const key = `${convKey}:${userKey}`;
        clearTimeout(timers[key]);
        delete timers[key];
        set((s) => {
            const existing = s.typing[convKey];
            if (!existing || !(userKey in existing)) return s;
            const room = { ...existing };
            delete room[userKey];
            const typing = { ...s.typing };
            if (Object.keys(room).length === 0) delete typing[convKey];
            else typing[convKey] = room;
            return { typing };
        });
    },
}));