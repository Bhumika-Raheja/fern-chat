import {
  listPinnedMessages,
  pinMessage,
  unpinMessage,
} from "../services/pinService.js";

export async function getPins(req, res, next) {
  try {
    const messages = await listPinnedMessages({
      conversationId: req.params.id,
      userId: req.user._id,
    });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

export async function pinConversationMessage(req, res, next) {
  try {
    const result = await pinMessage({
      conversationId: req.params.id,
      messageId: req.params.messageId,
      userId: req.user._id,
    });
    if (result.changed) {
      req.app.get("io")?.to("conversation:" + req.params.id).emit("message:pinned", {
        conversationId: String(req.params.id),
        message: result.message,
        pinnedMessageIds: result.pinnedMessageIds,
      });
    }
    res.json({ message: result.message, pinnedMessageIds: result.pinnedMessageIds });
  } catch (err) {
    next(err);
  }
}

export async function unpinConversationMessage(req, res, next) {
  try {
    const result = await unpinMessage({
      conversationId: req.params.id,
      messageId: req.params.messageId,
      userId: req.user._id,
    });
    if (result.changed) {
      req.app.get("io")?.to("conversation:" + req.params.id).emit("message:unpinned", {
        conversationId: String(req.params.id),
        messageId: result.messageId,
        pinnedMessageIds: result.pinnedMessageIds,
      });
    }
    res.json({ messageId: result.messageId, pinnedMessageIds: result.pinnedMessageIds });
  } catch (err) {
    next(err);
  }
}
