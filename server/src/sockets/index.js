import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { env } from "../config/env.js";
import { withConversationLock } from "../services/conversationLock.js";
import { registerMessageHandlers } from "./handlers/message.js";
import { registerTypingHandlers } from "./handlers/typing.js";
import { registerReceiptHandlers } from "./handlers/receipt.js";
import { registerReactionHandlers } from "./handlers/reaction.js";
import { userConnected, userDisconnected, onlineAmong } from "./presence.js";

export function initSockets(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: env.CLIENT_ORIGIN, credentials: true },
        pingInterval: 10000,
        pingTimeout: 5000,
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
        let rooms = []; // filled in below, used when this socket disconnects

        // Register listeners first, so no early event is missed
        registerMessageHandlers(io, socket);
        registerTypingHandlers(io, socket);
        registerReceiptHandlers(io, socket);
        registerReactionHandlers(io, socket);

        const becameOnline = userConnected(userId);

        // Capture the actual rooms, including conversations created since connect.
        socket.on("disconnecting", () => {
            rooms = [...socket.rooms].filter((room) => room.startsWith("conversation:"));
        });

        socket.on("disconnect", (reason) => {
            console.log(`Socket disconnected: ${socket.user.name} (${reason})`);
            userDisconnected(userId, () => {
                console.log(`[presence] ${socket.user.name} is now offline`);
                User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => { });
                if (rooms.length) io.to(rooms).emit("presence:update", { userId, online: false });
            });
        });

        // A personal room, plus one room per conversation I belong to
        socket.join(`user:${userId}`);
        const candidates = await Conversation.find({ memberIds: userId }).select("_id");
        const conversations = [];
        // Recheck under the membership lock so a delayed connect cannot rejoin
        // a room after an admin has removed this user.
        try {
            for (const candidate of candidates) {
                await withConversationLock(String(candidate._id), async () => {
                    if (!socket.connected) return;
                    const current = await Conversation.findOne({ _id: candidate._id, memberIds: userId });
                    if (!current) return;
                    await socket.join("conversation:" + current._id);
                    conversations.push(current);
                });
            }
        } catch (err) {
            console.error("Could not join conversations:", err.message);
            socket.disconnect(true);
            return;
        }
        if (!socket.connected) return;
        rooms = [...socket.rooms].filter((room) => room.startsWith("conversation:"));

        // Tell this socket who is online among the people it shares conversations with
        const contactIds = new Set();
        conversations.forEach((c) => c.memberIds.forEach((m) => contactIds.add(String(m))));
        socket.emit("presence:list", onlineAmong([...contactIds]));

        // Tell everyone else that I just came online
        if (becameOnline && rooms.length) {
            io.to(rooms).emit("presence:update", { userId, online: true });
        }

        console.log(`Socket connected: ${socket.user.name} (${conversations.length} rooms)`);
    });

    return io;
}