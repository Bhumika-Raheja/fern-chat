import { getMemberConversation } from "../../services/messageService.js";

export function registerTypingHandlers(io, socket) {
    socket.on("typing", async (payload) => {
        try {
            const conversationId = payload?.conversationId;
            const conversation = await getMemberConversation(conversationId, socket.user._id);
            if (!conversation) return;

            // Everyone in the room except me
            socket.to(`conversation:${conversation._id}`).emit("typing", {
                conversationId: String(conversation._id),
                userId: String(socket.user._id),
                name: socket.user.name,
            });
        } catch (err) {
            console.error(err);
        }
    });
}