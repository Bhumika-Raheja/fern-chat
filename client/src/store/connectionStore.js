import { create } from "zustand";

let timer;

// status: connecting | connected | reconnecting | restored
export const useConnectionStore = create((set, get) => ({
    status: "connecting",

    setStatus: (next) => {
        const prev = get().status;
        clearTimeout(timer);

        // Just came back after being down: show "Back online" for 3 seconds
        if (next === "connected" && prev === "reconnecting") {
            set({ status: "restored" });
            timer = setTimeout(() => set({ status: "connected" }), 3000);
            return;
        }
        set({ status: next });
    },
}));