import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import { connectConversationMembers } from "../sockets/conversations.js";
import Message from "../models/Message.js";
import ReadState from "../models/ReadState.js";

export async function createConversation(req, res, next) {
    const { type, name, description, memberIds } = req.body || {};
    const me = req.user._id;
    let dmPair;

    async function respond(conversation, created) {
        await conversation.populate("memberIds", "name avatarUrl");
        if (created) {
            // New members start with an empty read pointer, even while offline.
            await ReadState.bulkWrite(conversation.memberIds.map((member) => ({
                updateOne: {
                    filter: { conversationId: conversation._id, userId: member._id },
                    update: { $setOnInsert: { lastReadMessageId: null } },
                    upsert: true,
                },
            })));
        }
        const data = conversation.toObject();
        await connectConversationMembers(req.app.get("io"), data, created);
        return res.status(created ? 201 : 200).json({ conversation: data });
    }

    try {
        if (!["dm", "group", "channel"].includes(type)) {
            return res.status(400).json({ message: "Type must be dm, group or channel" });
        }
        if (!Array.isArray(memberIds) || memberIds.length > 99 ||
            memberIds.some((id) => typeof id !== "string" || !mongoose.isValidObjectId(id))) {
            return res.status(400).json({ message: "Choose up to 99 valid members" });
        }
        const others = [...new Set(memberIds.map((id) => new mongoose.Types.ObjectId(id).toHexString()))]
            .filter((id) => id !== String(me));
        if (type === "dm") dmPair = [me, others[0]];
        if (type === "dm" && others.length !== 1) {
            return res.status(400).json({ message: "A direct message needs exactly one other person" });
        }
        if (type !== "dm" && others.length === 0) {
            return res.status(400).json({ message: "Choose at least one other member" });
        }

        let cleanName = "";
        if (type !== "dm") {
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({ message: "Name is required" });
            }
            cleanName = type === "channel"
                ? name.trim().toLowerCase().replace(/\s+/g, "-")
                : name.trim();
            if (cleanName.length > 40) {
                return res.status(400).json({ message: "Name must be 40 characters or fewer" });
            }
        }
        if (description !== undefined &&
            (typeof description !== "string" || description.trim().length > 200)) {
            return res.status(400).json({ message: "Description must be 200 characters or fewer" });
        }

        const memberCount = await User.countDocuments({ _id: { $in: others } });
        if (memberCount !== others.length) {
            return res.status(400).json({ message: "One or more selected users no longer exist" });
        }

        if (type === "dm") {
            const existing = await Conversation.findOne({
                type: "dm",
                memberIds: { $all: dmPair, $size: 2 },
            });
            if (existing) return await respond(existing, false);
        }

        const conversation = await Conversation.create({
            type,
            name: cleanName,
            description: typeof description === "string" ? description.trim() : "",
            memberIds: [me, ...others],
            adminIds: type === "dm" ? [] : [me],
            createdBy: me,
            ...(type === "dm" ? { dmKey: [String(me), others[0]].sort().join(":") } : {}),
        });
        return await respond(conversation, true);
    } catch (err) {
        if (err.code === 11000 && type === "dm") {
            // The other participant may have started the same DM concurrently.
            try {
                const existing = await Conversation.findOne({
                    type: "dm",
                    memberIds: { $all: dmPair, $size: 2 },
                });
                if (existing) return await respond(existing, false);
            } catch (lookupError) {
                return next(lookupError);
            }
        }
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
