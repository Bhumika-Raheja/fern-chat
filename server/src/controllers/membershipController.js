import { changeMembership } from "../services/membershipService.js";
import { withConversationLock } from "../services/conversationLock.js";
import { publishMembershipChange } from "../sockets/conversations.js";
import Message from "../models/Message.js";
import ReadState from "../models/ReadState.js";

function handler(action) {
  return async (req, res, next) => {
    try {
      await withConversationLock(String(req.params.id), async () => {
        const result = await changeMembership({
          conversationId: req.params.id,
          actorId: req.user._id,
          action,
          memberIds: req.body?.memberIds,
          targetId: req.params.userId,
          role: req.body?.role,
        });
        if (result.addedMemberIds.length) {
          const newest = await Message.findOne({ conversationId: result.conversation._id })
            .sort({ _id: -1 }).select("_id");
          await ReadState.bulkWrite(result.addedMemberIds.map((userId) => ({
            updateOne: {
              filter: { conversationId: result.conversation._id, userId },
              update: { $set: { lastReadMessageId: newest?._id || null } },
              upsert: true,
            },
          })));
        }
        await result.conversation.populate("memberIds", "name avatarUrl");
        const data = result.conversation.toObject();
        if (result.changed) {
          await publishMembershipChange(req.app.get("io"), data, {
            addedMemberIds: result.addedMemberIds,
            removedMemberIds: result.removedMemberIds,
            reason: action === "leave" ? "left" : "removed",
          });
        }
        const removed = result.removedMemberIds.includes(String(req.user._id));
        res.json(removed
          ? { removed: true, conversationId: String(data._id), version: data.__v }
          : { conversation: data });
      });
    } catch (err) {
      next(err);
    }
  };
}

export const addMembers = handler("add");
export const removeMember = handler("remove");
export const changeMemberRole = handler("role");
export const leaveConversation = handler("leave");
