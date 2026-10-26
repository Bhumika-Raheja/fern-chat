import { create } from "zustand";

export const usePresenceStore = create((set) => ({
    online: {}, // { userId: true }

    setList: (ids) => set({ online: Object.fromEntries(ids.map((id) => [id, true])) }),

    setOne: (id, isOnline) =>
        set((s) => {
            const next = { ...s.online };
            if (isOnline) next[id] = true;
            else delete next[id];
            return { online: next };
        }),
}));