import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import ReadState from "../models/ReadState.js";
import { getMemberConversation } from "../services/messageService.js";

export async function createConversation(req, res, next) {
    try {
        const { type, name, description, memberIds } = req.body || {};
        const me = req.user._id;

        if (!["dm", "group", "channel"].includes(type)) {
            return res.status(400).json({ message: "Type must be dm, group or channel" });
        }

        // Clean the member list: valid ids only, no duplicates, no myself
        const others = [...new Set((memberIds || []).map(String))].filter(
            (id) => mongoose.isValidObjectId(id) && id !== String(me)
        );

        // Direct message: exactly one other person
        if (type === "dm") {
            if (others.length !== 1) {
                return res.status(400).json({ message: "A direct message needs exactly one other person" });
            }
            const existing = await Conversation.findOne({
                type: "dm",
                memberIds: { $all: [me, others[0]], $size: 2 },
            });
            if (existing) {
                return res.json({ conversation: existing });
            }
            const dm = await Conversation.create({
                type: "dm",
                memberIds: [me, others[0]],
                createdBy: me,
            });
            return res.status(201).json({ conversation: dm });
        }

        // Channel or group: needs a name
        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Name is required" });
        }
        const cleanName =
            type === "channel" ? name.trim().toLowerCase().replace(/\s+/g, "-") : name.trim();

        const conversation = await Conversation.create({
            type,
            name: cleanName,
            description,
            memberIds: [me, ...others],
            adminIds: [me],
            createdBy: me,
        });

        res.status(201).json({ conversation });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: "A channel with this name already exists" });
        }
        next(err);
    }
}

export async function listConversations(req, res, next) {
    try {
        const me = req.user._id;

        const conversations = await Conversation.find({ memberIds: me })
            .sort({ lastMessageAt: -1 })
            .populate("memberIds", "name avatarUrl");

        // My "read up to here" pointers
        const ids = conversations.map((c) => c._id);
        const states = await ReadState.find({ userId: me, conversationId: { $in: ids } });
        const pointers = new Map(states.map((s) => [String(s.conversationId), s.lastReadMessageId]));

        const result = await Promise.all(
            conversations.map(async (c) => {
                const key = String(c._id);
                let last = pointers.get(key);

                // First time I see this conversation: everything that exists now counts as read
                if (!pointers.has(key)) {
                    const newest = await Message.findOne({ conversationId: c._id })
                        .sort({ _id: -1 })
                        .select("_id");
                    last = newest ? newest._id : null;
                    try {
                        await ReadState.updateOne(
                            { conversationId: c._id, userId: me },
                            { $setOnInsert: { lastReadMessageId: last } },
                            { upsert: true }
                        );
                    } catch {
                        // two requests at once: the other one created it, that's fine
                    }
                }

                // Unread = messages from other people, newer than my pointer
                const filter = { conversationId: c._id, senderId: { $ne: me } };
                if (last) filter._id = { $gt: last };
                const unreadCount = await Message.countDocuments(filter);

                return { ...c.toObject(), unreadCount };
            })
        );

        res.json({ conversations: result });
    } catch (err) {
        next(err);
    }
}

// "I have read everything in this conversation up to now"
export async function markRead(req, res, next) {
    try {
        const conversation = await getMemberConversation(req.params.id, req.user._id);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        const newest = await Message.findOne({ conversationId: conversation._id })
            .sort({ _id: -1 })
            .select("_id");

        if (newest) {
            // $max means the pointer can only move forward, never back
            await ReadState.updateOne(
                { conversationId: conversation._id, userId: req.user._id },
                { $max: { lastReadMessageId: newest._id } },
                { upsert: true }
            );
        }

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}