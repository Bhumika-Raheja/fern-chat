import {
    getMemberConversation,
    createMessage,
    listMessages,
} from "../services/messageService.js";

export async function sendMessage(req, res, next) {
    try {
        const { id } = req.params;
        const { body, clientId } = req.body || {};

        const conversation = await getMemberConversation(id, req.user._id);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        if (!body || !body.trim()) {
            return res.status(400).json({ message: "Message can't be empty" });
        }
        if (body.length > 4000) {
            return res.status(400).json({ message: "Message is too long" });
        }

        const { message, duplicate } = await createMessage({
            conversationId: conversation._id,
            senderId: req.user._id,
            body,
            clientId,
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