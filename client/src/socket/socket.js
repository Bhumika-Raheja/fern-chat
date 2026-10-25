import { io } from "socket.io-client";
import { useConnectionStore } from "../store/connectionStore";

let socket = null;

export function connectSocket(token) {
    if (socket) return socket; // only ever one connection

    const setStatus = useConnectionStore.getState().setStatus;
    socket = io(import.meta.env.VITE_API_URL, { auth: { token } });

    socket.on("connect", () => {
        console.log("Socket connected", socket.id);
        setStatus("connected");
    });

    socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
        if (reason === "io client disconnect") return; // I logged out on purpose
        setStatus("reconnecting");
        // If the server closed the line itself, the browser does not retry by default
        if (reason === "io server disconnect") socket.connect();
    });

    socket.on("connect_error", (err) => {
        console.log("Socket error:", err.message);
        setStatus("reconnecting");
    });

    return socket;
}

export function getSocket() {
    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    useConnectionStore.getState().setStatus("connecting");
}