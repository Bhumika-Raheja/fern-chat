import { create } from "zustand";

export const usePresenceStore = create((set) => ({
    online: {}, // { userId: true }

    setList: (ids = []) => {
        if (!Array.isArray(ids)) return set({ online: {} });
        set({ online: Object.fromEntries(ids.map((id) => [String(id), true])) });
    },

    mergeSnapshot: (memberIds = [], onlineIds = []) => set((s) => {
        const next = { ...s.online };
        if (Array.isArray(memberIds)) memberIds.forEach((id) => delete next[String(id)]);
        if (Array.isArray(onlineIds)) onlineIds.forEach((id) => { next[String(id)] = true; });
        return { online: next };
    }),

    setOne: (id, isOnline) =>
        set((s) => {
            if (!id) return s;
            const key = String(id);
            const active = Boolean(isOnline);
            if (Boolean(s.online[key]) === active) return s;
            const next = { ...s.online };
            if (active) next[key] = true;
            else delete next[key];
            return { online: next };
        }),
}));