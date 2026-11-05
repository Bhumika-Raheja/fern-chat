import mongoose from "mongoose";
import Message from "../models/Message.js";
import { getMemberConversation } from "./messageService.js";
import { withConversationLock } from "./conversationLock.js";
import { isReactionEmoji } from "../../../shared/reactions.mjs";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export function reactionData(message) {
  return {
    conversationId: String(message.conversationId),
    messageId: String(message._id),
    reactions: message.deletedAt ? [] : (message.reactions || []),
    reactionVersion: message.reactionVersion || 0,
    deletedAt: message.deletedAt || null,
  };
}

export async function setMessageReaction({ conversationId, messageId, userId, emoji, active }) {
  if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(messageId)) {
    fail(400, "A valid conversation ID and message ID are required");
  }
  if (!isReactionEmoji(emoji)) fail(400, "Choose an emoji from the reaction picker");
  if (typeof active !== "boolean") fail(400, "Specify whether to add or remove the reaction");

  return withConversationLock(String(conversationId), async () => {
    const conversation = await getMemberConversation(conversationId, userId);
    if (!conversation) fail(404, "Conversation not found");
    const pair = { emoji, userId };
    const updated = await Message.findOneAndUpdate(
      { _id: messageId, conversationId: conversation._id, deletedAt: null },
      {
        ...(active ? { $addToSet: { reactions: pair } } : { $pull: { reactions: pair } }),
        $inc: { reactionVersion: 1 },
      },
      { returnDocument: "after", runValidators: true }
    );
    if (!updated) fail(404, "Message not found or already deleted");
    await updated.populate("reactions.userId", "name avatarUrl");
    return reactionData(updated);
  });
}

export async function getReactionSnapshots(conversationId, userId, ids) {
  if (typeof ids !== "string") fail(400, "Message IDs are required");
  const messageIds = [...new Set(ids.split(","))];
  if (messageIds.length === 0 || messageIds.length > 100 ||
      messageIds.some((id) => !mongoose.isValidObjectId(id))) {
    fail(400, "Choose between 1 and 100 valid message IDs");
  }
  return withConversationLock(String(conversationId), async () => {
    const conversation = await getMemberConversation(conversationId, userId);
    if (!conversation) fail(404, "Conversation not found");
    const messages = await Message.find({ conversationId: conversation._id, _id: { $in: messageIds } })
      .select("_id conversationId reactions reactionVersion deletedAt")
      .populate("reactions.userId", "name avatarUrl");
    return messages.map(reactionData);
  });
}
