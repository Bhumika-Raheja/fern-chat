import {
  getMemberConversation,
  createMessage,
  cleanAttachments,
  editMessage,
  deleteMessage,
} from "../../services/messageService.js";

// Turn a saved message into plain data, with the sender's name filled in
async function toData(message) {
  await message.populate("senderId", "name avatarUrl");
  await message.populate("reactions.userId", "name avatarUrl");
  return JSON.parse(JSON.stringify(message));
}

export function registerMessageHandlers(io, socket) {
  socket.on("message:send", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    try {
      const { conversationId, body, clientId } = payload || {};
      const text = typeof body === "string" ? body.trim() : "";
      const attachments = cleanAttachments(payload?.attachments);

      if (attachments === null) return reply({ ok: false, error: "Invalid attachment" });
      if (!text && attachments.length === 0) {
        return reply({ ok: false, error: "Message can't be empty" });
      }
      if (text.length > 4000) return reply({ ok: false, error: "Message is too long" });

      const conversation = await getMemberConversation(conversationId, socket.user._id);
      if (!conversation) return reply({ ok: false, error: "Conversation not found" });

      const { message, duplicate } = await createMessage({
        conversationId: conversation._id,
        senderId: socket.user._id,
        body: text,
        clientId,
        attachments,
      });

      const data = await toData(message);

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

  socket.on("message:edit", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    try {
      const result = await editMessage({
        messageId: payload?.messageId,
        userId: socket.user._id,
        body: payload?.body,
      });
      if (result.error) return reply({ ok: false, error: result.error });

      const data = await toData(result.message);
      io.to(`conversation:${data.conversationId}`).emit("message:updated", data);
      reply({ ok: true, message: data });
    } catch (err) {
      console.error(err);
      reply({ ok: false, error: "Could not edit message" });
    }
  });

  socket.on("message:delete", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    try {
      const result = await deleteMessage({
        messageId: payload?.messageId,
        userId: socket.user._id,
      });
      if (result.error) return reply({ ok: false, error: result.error });

      const data = await toData(result.message);
      io.to(`conversation:${data.conversationId}`).emit("message:updated", data);
      reply({ ok: true, message: data });
    } catch (err) {
      console.error(err);
      reply({ ok: false, error: "Could not delete message" });
    }
  });
}