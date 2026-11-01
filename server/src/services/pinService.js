import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { withConversationLock } from "./conversationLock.js";

export const MAX_PINNED_MESSAGES = 20;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function requirePinPermission(conversation, userId) {
  if (conversation.type === "dm") return;
  const isAdmin = (conversation.adminIds || []).map(String).includes(String(userId));
  if (!isAdmin) {
    fail(403, "Only admins can pin or unpin messages");
  }
}

export async function listPinnedMessages({ conversationId, userId }) {
  if (!mongoose.isValidObjectId(conversationId)) {
    fail(400, "Invalid conversation ID");
  }
  const conversation = await Conversation.findOne({ _id: conversationId, memberIds: userId });
  if (!conversation) {
    fail(404, "Conversation not found");
  }

  const pinnedIds = (conversation.pinnedMessageIds || []).map(String);
  if (pinnedIds.length === 0) return [];

  const found = await Message.find({
    _id: { $in: pinnedIds },
    conversationId: conversation._id,
    deletedAt: null,
  }).populate("senderId", "name avatarUrl");

  const byId = new Map(found.map((msg) => [String(msg._id), msg]));
  return [...pinnedIds].reverse().map((id) => byId.get(id)).filter(Boolean);
}

export async function pinMessage({ conversationId, messageId, userId }) {
  if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(messageId)) {
    fail(400, "A valid conversation ID and message ID are required");
  }

  return withConversationLock(String(conversationId), async () => {
    const conversation = await Conversation.findOne({ _id: conversationId, memberIds: userId });
    if (!conversation) {
      fail(404, "Conversation not found");
    }
    requirePinPermission(conversation, userId);

    const message = await Message.findOne({
      _id: messageId,
      conversationId: conversation._id,
      deletedAt: null,
    }).populate("senderId", "name avatarUrl");
    if (!message) {
      fail(404, "Message not found");
    }

    const currentPins = (conversation.pinnedMessageIds || []).map(String);
    if (currentPins.includes(String(message._id))) {
      return { changed: false, message, pinnedMessageIds: currentPins };
    }
    if (currentPins.length >= MAX_PINNED_MESSAGES) {
      fail(400, `A conversation can have at most ${MAX_PINNED_MESSAGES} pinned messages`);
    }

    const updated = await Conversation.findOneAndUpdate(
      { _id: conversation._id, memberIds: userId },
      { $addToSet: { pinnedMessageIds: message._id }, $inc: { __v: 1 } },
      { returnDocument: "after", runValidators: true }
    );
    if (!updated) {
      fail(404, "Conversation not found");
    }

    return {
      changed: true,
      message,
      pinnedMessageIds: (updated.pinnedMessageIds || []).map(String),
    };
  });
}

export async function unpinMessage({ conversationId, messageId, userId }) {
  if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(messageId)) {
    fail(400, "A valid conversation ID and message ID are required");
  }

  return withConversationLock(String(conversationId), async () => {
    const conversation = await Conversation.findOne({ _id: conversationId, memberIds: userId });
    if (!conversation) {
      fail(404, "Conversation not found");
    }
    requirePinPermission(conversation, userId);

    const normalizedId = new mongoose.Types.ObjectId(messageId).toHexString();
    const currentPins = (conversation.pinnedMessageIds || []).map(String);
    if (!currentPins.includes(normalizedId)) {
      return { changed: false, messageId: normalizedId, pinnedMessageIds: currentPins };
    }

    const updated = await Conversation.findOneAndUpdate(
      { _id: conversation._id, memberIds: userId },
      { $pull: { pinnedMessageIds: messageId }, $inc: { __v: 1 } },
      { returnDocument: "after", runValidators: true }
    );
    if (!updated) {
      fail(404, "Conversation not found");
    }

    return {
      changed: true,
      messageId: normalizedId,
      pinnedMessageIds: (updated.pinnedMessageIds || []).map(String),
    };
  });
}
