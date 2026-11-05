import { setMessageReaction } from "../../services/reactionService.js";

export function registerReactionHandlers(io, socket) {
  socket.on("message:react", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    try {
      const reaction = await setMessageReaction({
        conversationId: payload?.conversationId,
        messageId: payload?.messageId,
        userId: socket.user._id,
        emoji: payload?.emoji,
        active: payload?.active,
      });
      io.to("conversation:" + reaction.conversationId).emit("message:reactions", reaction);
      reply({ ok: true, reaction });
    } catch (err) {
      if (!err.status) console.error("Could not update reaction:", err.message);
      reply({ ok: false, status: err.status || 500,
        error: err.status ? err.message : "Could not update reaction" });
    }
  });
}
