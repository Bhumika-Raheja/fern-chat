import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { env } from "../config/env.js";
import { registerMessageHandlers } from "./handlers/message.js";

export function initSockets(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    });

    // The gatekeeper: runs before any connection is accepted
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error("Not logged in"));

            const payload = jwt.verify(token, env.JWT_SECRET);
            const user = await User.findById(payload.id);
            if (!user) return next(new Error("User no longer exists"));

            socket.user = user;
            next();
        } catch {
            next(new Error("Invalid or expired token"));
        }
    });

    io.on("connection", async (socket) => {
        const userId = String(socket.user._id);

        // Register listeners first, so no early event is missed
        registerMessageHandlers(io, socket);

        socket.on("disconnect", (reason) => {
            console.log(`Socket disconnected: ${socket.user.name} (${reason})`);
        });

        // A personal room, plus one room per conversation I belong to
        socket.join(`user:${userId}`);
        const conversations = await Conversation.find({ memberIds: userId }).select("_id");
        conversations.forEach((c) => socket.join(`conversation:${c._id}`));

        console.log(`Socket connected: ${socket.user.name} (${conversations.length} rooms)`);
    });

    return io;
}