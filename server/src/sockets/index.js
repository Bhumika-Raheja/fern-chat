import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { env } from "../config/env.js";
import { registerMessageHandlers } from "./handlers/message.js";
import { userConnected, userDisconnected, onlineAmong } from "./presence.js";

export function initSockets(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: env.CLIENT_ORIGIN, credentials: true },
        pingInterval: 10000, // check every 10 seconds (default 25)
        pingTimeout: 5000, // give up after 5 more seconds (default 20)
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

        const becameOnline = userConnected(userId);

        socket.on("disconnect", (reason) => {
            console.log(`Socket disconnected: ${socket.user.name} (${reason})`);
            userDisconnected(userId, () => {
                User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => { });
                if (rooms.length) io.to(rooms).emit("presence:update", { userId, online: false });
            });
        });

        // A personal room, plus one room per conversation I belong to
        socket.join(`user:${userId}`);
        const conversations = await Conversation.find({ memberIds: userId }).select("_id memberIds");
        rooms = conversations.map((c) => `conversation:${c._id}`);
        rooms.forEach((r) => socket.join(r));

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