import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

// Returns the conversation only if this user is a member, otherwise null
export async function getMemberConversation(conversationId, userId) {
    if (!mongoose.isValidObjectId(conversationId)) return null;
    return Conversation.findOne({ _id: conversationId, memberIds: userId });
}

export async function createMessage({ conversationId, senderId, body, clientId }) {
    // Already saved this one? Return it instead of saving again
    if (clientId) {
        const existing = await Message.findOne({ conversationId, senderId, clientId });
        if (existing) return { message: existing, duplicate: true };
    }

    try {
        const message = await Message.create({ conversationId, senderId, body, clientId });
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

export async function listMessages({ conversationId, before, limit }) {
    const query = { conversationId };
    if (before && mongoose.isValidObjectId(before)) {
        query._id = { $lt: before };
    }

    // Ask for one extra, just to learn whether older messages exist
    const found = await Message.find(query)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .populate("senderId", "name avatarUrl");

    const hasMore = found.length > limit;
    const messages = hasMore ? found.slice(0, limit) : found;
    const nextCursor = hasMore ? messages[messages.length - 1]._id : null;

    return { messages, nextCursor };
}