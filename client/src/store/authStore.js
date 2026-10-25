import { create } from "zustand";
import { api } from "../api/client";

const savedToken = localStorage.getItem("fern_token");
if (savedToken) {
    api.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
}

export const useAuthStore = create((set) => ({
    token: savedToken || null,
    user: null,

    setSession: (token, user) => {
        localStorage.setItem("fern_token", token);
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        set({ token, user });
    },

    logout: () => {
        localStorage.removeItem("fern_token");
        delete api.defaults.headers.common.Authorization;
        set({ token: null, user: null });
    },
}));