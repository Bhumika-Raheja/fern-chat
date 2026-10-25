import { getMemberConversation, createMessage } from "../../services/messageService.js";

export function registerMessageHandlers(io, socket) {
    socket.on("message:send", async (payload, ack) => {
        const reply = typeof ack === "function" ? ack : () => { };
        try {
            const { conversationId, body, clientId } = payload || {};
            const text = typeof body === "string" ? body.trim() : "";

            if (!text) return reply({ ok: false, error: "Message can't be empty" });
            if (text.length > 4000) return reply({ ok: false, error: "Message is too long" });

            const conversation = await getMemberConversation(conversationId, socket.user._id);
            if (!conversation) return reply({ ok: false, error: "Conversation not found" });

            const { message, duplicate } = await createMessage({
                conversationId: conversation._id,
                senderId: socket.user._id,
                body: text,
                clientId,
            });

            await message.populate("senderId", "name avatarUrl");
            const data = JSON.parse(JSON.stringify(message));

            // Only announce a message the first time it is saved
            if (!duplicate) {
                io.to(`conversation:${conversation._id}`).emit("message:new", data);
            }
            reply({ ok: true, message: data });
        } catch (err) {
            console.error(err);
            reply({ ok: false, error: "Could not send message" });
        }
    });
}