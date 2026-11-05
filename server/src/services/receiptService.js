import mongoose from "mongoose";
import ReadState from "../models/ReadState.js";
import Message from "../models/Message.js";
import { getMemberConversation } from "./messageService.js";
import { withConversationLock } from "./conversationLock.js";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export function receiptData(state, user) {
  const userId = String(user?._id || state.userId?._id || state.userId);
  return {
    conversationId: String(state.conversationId),
    userId,
    ...(user ? { user: { _id: userId, name: user.name, avatarUrl: user.avatarUrl || "" } } : {}),
    lastDeliveredMessageId: state.lastDeliveredMessageId ? String(state.lastDeliveredMessageId) : null,
    // Unread baselines created when joining a group are not proof of viewing.
    lastReadMessageId: state.lastReadReceiptMessageId ? String(state.lastReadReceiptMessageId) : null,
  };
}

export async function acknowledgeReceipt({ conversationId, messageId, user, kind }) {
  if (!["delivered", "read"].includes(kind)) fail(400, "Invalid receipt type");
  if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(messageId)) {
    fail(400, "A valid conversation ID and message ID are required");
  }
  return withConversationLock(String(conversationId), async () => {
    const conversation = await getMemberConversation(conversationId, user._id);
    if (!conversation) fail(404, "Conversation not found");
    const message = await Message.findOne({ _id: messageId, conversationId: conversation._id });
    if (!message) fail(404, "Message not found");

    const filter = { conversationId: conversation._id, userId: user._id };
    const previous = await ReadState.findOne(filter);
    const pointer = String(message._id);
    const ahead = (value) => !value || pointer > String(value);
    const changed = !previous || ahead(previous.lastDeliveredMessageId) ||
      (kind === "read" && ahead(previous.lastReadReceiptMessageId));
    let state = previous;
    if (changed) {
      const update = { $max: {
        lastDeliveredMessageId: message._id,
        ...(kind === "read" ? {
          lastReadReceiptMessageId: message._id,
          lastReadMessageId: message._id,
        } : {}),
      } };
      try {
        state = await ReadState.findOneAndUpdate(filter, update, { upsert: true, returnDocument: "after", runValidators: true });
      } catch (err) {
        if (err.code !== 11000) throw err;
        // Another process created this member's pointer concurrently.
        state = await ReadState.findOneAndUpdate(filter, update, { returnDocument: "after", runValidators: true });
      }
    }
    const receipt = receiptData(state, user);
    if (kind === "read") {
      receipt.unreadCount = await Message.countDocuments({
        conversationId: conversation._id,
        senderId: { $ne: user._id },
        _id: { $gt: state.lastReadMessageId },
      });
    }
    return { receipt, changed };
  });
}

export async function getReceiptSnapshot(conversationId, userId) {
  return withConversationLock(String(conversationId), async () => {
    const conversation = await getMemberConversation(conversationId, userId);
    if (!conversation) fail(404, "Conversation not found");
    const states = await ReadState.find({ conversationId: conversation._id })
      .populate("userId", "name avatarUrl");
    return states.filter((state) => state.userId)
      .map((state) => receiptData(state, state.userId));
  });
}

export function broadcastReceipt(io, kind, receipt) {
  io?.to("conversation:" + receipt.conversationId).emit("receipt:" + kind, receipt);
}
