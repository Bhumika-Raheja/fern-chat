import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import ReadState from "../models/ReadState.js";
import { joinChannel } from "../services/membershipService.js";
import { withConversationLock } from "../services/conversationLock.js";
import { listMessages } from "../services/messageService.js";
import { publishMembershipChange } from "../sockets/conversations.js";

// Every channel is public: anyone logged in can find it in the browser.
export async function browseChannels(req, res, next) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length > 40) {
      return res.status(400).json({ message: "Search must be 40 characters or fewer" });
    }

    const match = { type: "channel" };
    if (q) match.name = new RegExp(q.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"), "i");

    // Only public facts are returned: never the list of member IDs.
    const channels = await Conversation.aggregate([
      { $match: match },
      {
        $project: {
          name: 1,
          description: 1,
          createdAt: 1,
          memberCount: { $size: { $ifNull: ["$memberIds", []] } },
          joined: { $in: [req.user._id, { $ifNull: ["$memberIds", []] }] },
        },
      },
      { $sort: { memberCount: -1, name: 1 } },
      { $limit: 50 },
    ]);

    res.json({ channels });
  } catch (err) {
    next(err);
  }
}

// Read-only history of a public channel, for people who have not joined yet.
export async function previewMessages(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: "Channel not found" });
    }
    const channel = await Conversation.findOne({ _id: id, type: "channel" }).select("_id");
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);
    const { messages, nextCursor, hasMoreNewer } = await listMessages({
      conversationId: channel._id,
      before: req.query.before,
      after: req.query.after,
      limit,
    });
    res.json({ messages, nextCursor, hasMoreNewer: !!hasMoreNewer });
  } catch (err) {
    next(err);
  }
}

export async function joinChannelHandler(req, res, next) {
  try {
    await withConversationLock(String(req.params.id), async () => {
      const result = await joinChannel({
        conversationId: req.params.id,
        userId: req.user._id,
      });

      if (result.changed) {
        // Messages that already exist count as read for the new member.
        const newest = await Message.findOne({ conversationId: result.conversation._id })
          .sort({ _id: -1 })
          .select("_id");
        await ReadState.updateOne(
          { conversationId: result.conversation._id, userId: req.user._id },
          { $set: { lastReadMessageId: newest?._id || null } },
          { upsert: true }
        );
      }

      await result.conversation.populate("memberIds", "name avatarUrl");
      const data = result.conversation.toObject();
      if (result.changed) {
        await publishMembershipChange(req.app.get("io"), data, {
          addedMemberIds: result.addedMemberIds,
        });
      }
      res.status(result.changed ? 201 : 200).json({ conversation: data });
    });
  } catch (err) {
    next(err);
  }
}