import mongoose from "mongoose";
import {
  getMemberConversation,
  createMessage,
  listMessages,
  searchConversationMessages,
  cleanAttachments,
} from "../services/messageService.js";

export async function sendMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { body, clientId } = req.body || {};

    const conversation = await getMemberConversation(id, req.user._id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const text = typeof body === "string" ? body.trim() : "";
    const attachments = cleanAttachments(req.body?.attachments);

    if (attachments === null) {
      return res.status(400).json({ message: "Invalid attachment" });
    }
    if (!text && attachments.length === 0) {
      return res.status(400).json({ message: "Message can't be empty" });
    }
    if (text.length > 4000) {
      return res.status(400).json({ message: "Message is too long" });
    }

    const { message, duplicate } = await createMessage({
      conversationId: conversation._id,
      senderId: req.user._id,
      body: text,
      clientId,
      attachments,
    });

    res.status(duplicate ? 200 : 201).json({ message });
  } catch (err) {
    next(err);
  }
}

export async function getMessages(req, res, next) {
  try {
    const { id } = req.params;

    const conversation = await getMemberConversation(id, req.user._id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);
    const { messages, nextCursor, hasMoreNewer } = await listMessages({
      conversationId: conversation._id,
      before: req.query.before,
      after: req.query.after,
      limit,
    });

    res.json({ messages, nextCursor, hasMoreNewer: !!hasMoreNewer });
  } catch (err) {
    next(err);
  }
}

export async function searchMessages(req, res, next) {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }
    if (query.length > 100) {
      return res.status(400).json({ message: "Search query must be 100 characters or fewer" });
    }

    const before = req.query.before;
    if (before !== undefined && before !== "" && !mongoose.isValidObjectId(before)) {
      return res.status(400).json({ message: "Invalid cursor" });
    }

    const conversation = await getMemberConversation(req.params.id, req.user._id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const { messages, nextCursor } = await searchConversationMessages({
      conversationId: conversation._id,
      query,
      before,
      limit,
    });

    res.json({ messages, nextCursor });
  } catch (err) {
    next(err);
  }
}