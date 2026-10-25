import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";

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
        const conversations = await Conversation.find({ memberIds: req.user._id })
            .sort({ lastMessageAt: -1 })
            .populate("memberIds", "name avatarUrl");

        res.json({ conversations });
    } catch (err) {
        next(err);
    }
}