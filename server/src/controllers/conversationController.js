import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import { connectConversationMembers } from "../sockets/conversations.js";
import { withConversationLock } from "../services/conversationLock.js";
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
        const requested = memberIds === undefined && type === "channel" ? [] : memberIds;
        if (!Array.isArray(requested) || requested.length > 99 || requested.some((id) => typeof id !== "string" || !mongoose.isValidObjectId(id))) {
            return res.status(400).json({ message: "Choose up to 99 valid members" });
        }
        const others = [...new Set(requested.map((id) => new mongoose.Types.ObjectId(id).toHexString()))]
            .filter((id) => id !== String(me));
        if (type === "dm") dmPair = [me, others[0]];
        if (type === "dm" && others.length !== 1) {
            return res.status(400).json({ message: "A direct message needs exactly one other person" });
        }
        if (type === "group" && others.length === 0) {
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

export async function getConversation(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid conversation ID" });
        }

        const conversation = await Conversation.findOne({ _id: id, memberIds: req.user._id })
            .populate("memberIds", "name avatarUrl");
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        res.json({ conversation: conversation.toObject() });
    } catch (err) {
        next(err);
    }
}

export async function updateConversation(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid conversation ID" });
        }

        const { name, description } = req.body || {};
        if (name === undefined && description === undefined) {
            return res.status(400).json({ message: "Provide a name or description to update" });
        }
        if (name !== undefined && (typeof name !== "string" || !name.trim())) {
            return res.status(400).json({ message: "Name is required" });
        }
        if (description !== undefined &&
            (typeof description !== "string" || description.trim().length > 200)) {
            return res.status(400).json({ message: "Description must be 200 characters or fewer" });
        }

        await withConversationLock(String(id), async () => {
            const conversation = await Conversation.findOne({ _id: id, memberIds: req.user._id });
            if (!conversation) {
                return res.status(404).json({ message: "Conversation not found" });
            }
            if (conversation.type === "dm") {
                return res.status(400).json({ message: "Direct messages do not have editable settings" });
            }
            if (!conversation.adminIds.map(String).includes(String(req.user._id))) {
                return res.status(403).json({ message: "Only admins can update conversation settings" });
            }

            const updates = {};
            if (name !== undefined) {
                const cleanName = conversation.type === "channel"
                    ? name.trim().toLowerCase().replace(/\s+/g, "-")
                    : name.trim();
                if (!cleanName || cleanName.length > 40) {
                    return res.status(400).json({ message: "Name must be 40 characters or fewer" });
                }
                if (cleanName !== conversation.name) updates.name = cleanName;
            }
            if (description !== undefined) {
                const cleanDescription = description.trim();
                if (cleanDescription !== conversation.description) {
                    updates.description = cleanDescription;
                }
            }

            if (Object.keys(updates).length === 0) {
                await conversation.populate("memberIds", "name avatarUrl");
                return res.json({ conversation: conversation.toObject() });
            }

            const updated = await Conversation.findOneAndUpdate(
                {
                    _id: conversation._id,
                    memberIds: req.user._id,
                    adminIds: req.user._id,
                    __v: conversation.__v === undefined ? { $exists: false } : conversation.__v,
                },
                { $set: updates, $inc: { __v: 1 } },
                { returnDocument: "after", runValidators: true }
            );
            if (!updated) {
                return res.status(409).json({ message: "Conversation settings changed at the same time. Please try again." });
            }

            await updated.populate("memberIds", "name avatarUrl");
            const data = updated.toObject();
            const io = req.app.get("io");
            if (io) {
                const memberRooms = data.memberIds.map((member) => "user:" + String(member._id || member));
                if (memberRooms.length) io.to(memberRooms).emit("conversation:updated", data);
            }
            return res.json({ conversation: data });
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: "A channel with this name already exists" });
        }
        next(err);
    }
}
