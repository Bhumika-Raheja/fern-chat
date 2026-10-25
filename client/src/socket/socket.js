import { io } from "socket.io-client";

let socket = null;

export function connectSocket(token) {
    if (socket) return socket; // only ever one connection

    socket = io(import.meta.env.VITE_API_URL, { auth: { token } });

    socket.on("connect", () => console.log("Socket connected", socket.id));
    socket.on("disconnect", (reason) => console.log("Socket disconnected:", reason));
    socket.on("connect_error", (err) => console.log("Socket error:", err.message));

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
}