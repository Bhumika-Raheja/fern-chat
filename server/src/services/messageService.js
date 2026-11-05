import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { DELETE_WINDOW_MS, DELETE_WINDOW_ERROR, isWithinDeleteWindow } from "../../../shared/messagePolicy.mjs";

// Returns the conversation only if this user is a member, otherwise null
export async function getMemberConversation(conversationId, userId) {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  return Conversation.findOne({ _id: conversationId, memberIds: userId });
}

// Checks the attachments sent by a client. Returns a clean list, or null if invalid.
export function cleanAttachments(input) {
  if (!input) return [];
  if (!Array.isArray(input) || input.length > 4) return null;

  const out = [];
  for (const a of input) {
    if (!a || typeof a.url !== "string") return null;
    // Only files that were uploaded to our Cloudinary are allowed
    if (!a.url.startsWith("https://res.cloudinary.com/")) return null;

    out.push({
      url: a.url,
      name: String(a.name || "file").slice(0, 200),
      size: Number(a.size) || 0,
      mimeType: String(a.mimeType || "").slice(0, 100),
      kind: a.kind === "image" ? "image" : "file",
      width: Number(a.width) || undefined,
      height: Number(a.height) || undefined,
    });
  }
  return out;
}

export async function createMessage({
  conversationId,
  senderId,
  body,
  clientId,
  attachments = [],
}) {
  // Already saved this one? Return it instead of saving again
  if (clientId) {
    const existing = await Message.findOne({ conversationId, senderId, clientId });
    if (existing) return { message: existing, duplicate: true };
  }

  try {
    const message = await Message.create({
      conversationId,
      senderId,
      body,
      clientId,
      attachments,
    });
    await Conversation.updateOne(
      { _id: conversationId },
      { lastMessageAt: message.createdAt }
    );
    return { message, duplicate: false };
  } catch (err) {
    // Two identical sends at the same moment: the database blocks the second
    if (err.code === 11000) {
      const existing = await Message.findOne({ conversationId, senderId, clientId });
      return { message: existing, duplicate: true };
    }
    throw err;
  }
}

// Finds a message that this user is allowed to change:
// they must be its sender AND still a member of its conversation.
async function findOwnMessage(messageId, userId) {
  if (!mongoose.isValidObjectId(messageId)) return { error: "Message not found" };

  const message = await Message.findById(messageId);
  if (!message) return { error: "Message not found" };

  const conversation = await getMemberConversation(message.conversationId, userId);
  if (!conversation) return { error: "Message not found" };

  if (String(message.senderId) !== String(userId)) {
    return { error: "You can only change your own messages" };
  }
  return { message };
}

export async function editMessage({ messageId, userId, body }) {
  const found = await findOwnMessage(messageId, userId);
  if (found.error) return found;
  const { message } = found;

  if (message.deletedAt) return { error: "This message was deleted" };

  if (typeof body !== "string") return { error: "Message text must be a string" };
  const text = body.trim();
  if (!text && message.attachments.length === 0) return { error: "Message can't be empty" };
  if (text.length > 4000) return { error: "Message is too long" };

  if (text === message.body) return { message };

  // Check deletedAt in the write too: a delete may happen after the read above.
  const updated = await Message.findOneAndUpdate(
    { _id: message._id, senderId: userId, deletedAt: null },
    { $set: { body: text, editedAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!updated) return { error: "This message was deleted" };
  return { message: updated };
}

export async function deleteMessage({ messageId, userId }) {
  const found = await findOwnMessage(messageId, userId);
  if (found.error) return found;
  const { message } = found;

  if (message.deletedAt) return { message };
  if (!isWithinDeleteWindow(message.createdAt)) return { error: DELETE_WINDOW_ERROR };

  const deleted = await Message.findOneAndUpdate(
    {
      _id: message._id, senderId: userId, deletedAt: null,
      // Recheck against database time so a delayed write cannot outlive the window.
      $expr: { $and: [
        { $gt: ["$createdAt", { $subtract: ["$$NOW", DELETE_WINDOW_MS] }] },
        { $lte: ["$createdAt", "$$NOW"] },
      ] },
    },
    { $set: { body: "", attachments: [], reactions: [], deletedAt: new Date() }, $inc: { reactionVersion: 1 } },
    { new: true, runValidators: true }
  );
  // Another tab may already have deleted it. Return the saved tombstone.
  if (deleted) return { message: deleted };
  const current = await Message.findById(message._id);
  if (!current) return { error: "Message not found" };
  if (current.deletedAt) return { message: current };
  return { error: DELETE_WINDOW_ERROR };
}

export async function listMessages({ conversationId, before, after, limit }) {
  // Catching up: messages newer than "after", oldest first
  if (after && mongoose.isValidObjectId(after)) {
    const found = await Message.find({ conversationId, _id: { $gt: after } })
      .sort({ _id: 1 })
      .limit(limit + 1)
      .populate("senderId", "name avatarUrl")
    .populate("reactions.userId", "name avatarUrl");

    const hasMoreNewer = found.length > limit;
    const messages = hasMoreNewer ? found.slice(0, limit) : found;
    return { messages, nextCursor: null, hasMoreNewer };
  }

  // Scrolling up: messages older than "before", newest first
  const query = { conversationId };
  if (before && mongoose.isValidObjectId(before)) {
    query._id = { $lt: before };
  }

  // Ask for one extra, just to learn whether older messages exist
  const found = await Message.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("senderId", "name avatarUrl")
      .populate("reactions.userId", "name avatarUrl");

  const hasMore = found.length > limit;
  const messages = hasMore ? found.slice(0, limit) : found;
  const nextCursor = hasMore ? messages[messages.length - 1]._id : null;

  return { messages, nextCursor };
}