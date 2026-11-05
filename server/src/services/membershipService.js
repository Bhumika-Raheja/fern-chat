import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function id(value) {
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) {
    fail(400, "Invalid user ID");
  }
  return new mongoose.Types.ObjectId(value).toHexString();
}

export async function changeMembership({ conversationId, actorId, action, memberIds, targetId, role }) {
  if (!mongoose.isValidObjectId(conversationId)) fail(400, "Invalid conversation ID");
  const actor = String(actorId);
  const additions = action === "add" ? (() => {
    if (!Array.isArray(memberIds) || memberIds.length === 0 || memberIds.length > 99) {
      fail(400, "Choose between 1 and 99 members");
    }
    return [...new Set(memberIds.map(id))];
  })() : [];
  const target = action === "leave" ? actor : action === "add" ? null : id(targetId);
  if (action === "role" && !["admin", "member"].includes(role)) {
    fail(400, "Role must be admin or member");
  }
  if (!["add", "remove", "role", "leave"].includes(action)) fail(400, "Invalid membership action");

  for (let attempt = 0; attempt < 4; attempt++) {
    const conversation = await Conversation.findOne({ _id: conversationId, memberIds: actor });
    if (!conversation) fail(404, "Conversation not found");
    if (!["group", "channel"].includes(conversation.type)) {
      fail(400, "Member management is only available for groups and channels");
    }
    const members = conversation.memberIds.map(String);
    const admins = conversation.adminIds.map(String);
    if (action !== "leave" && !admins.includes(actor)) {
      fail(403, "Only admins can manage members and roles");
    }

    let nextMembers = [...members];
    let nextAdmins = [...admins];
    if (action === "add") {
      const newIds = additions.filter((value) => !members.includes(value));
      if (members.length + newIds.length > 100) fail(400, "A conversation can have at most 100 members");
      if (newIds.length && await User.countDocuments({ _id: { $in: newIds } }) !== newIds.length) {
        fail(400, "One or more selected users no longer exist");
      }
      nextMembers.push(...newIds);
    } else {
      if (!members.includes(target)) fail(404, "Member not found");
      if (action === "role" && role === "admin") {
        if (!nextAdmins.includes(target)) nextAdmins.push(target);
      } else {
        if (admins.includes(target) && admins.length === 1) {
          fail(409, "Promote another member before removing or demoting the last admin");
        }
        nextAdmins = admins.filter((value) => value !== target);
        if (action !== "role") nextMembers = members.filter((value) => value !== target);
      }
    }

    const addedMemberIds = nextMembers.filter((value) => !members.includes(value));
    const removedMemberIds = members.filter((value) => !nextMembers.includes(value));
    if (nextMembers.join() === members.join() && nextAdmins.join() === admins.join()) {
      return { conversation, addedMemberIds, removedMemberIds, changed: false };
    }

    // A concurrent demotion/removal invalidates this write and forces a fresh check.
    const updated = await Conversation.findOneAndUpdate(
      {
        _id: conversation._id,
        memberIds: actor,
        ...(action !== "leave" ? { adminIds: actor } : {}),
        __v: conversation.__v === undefined ? { $exists: false } : conversation.__v,
      },
      { $set: { memberIds: nextMembers, adminIds: nextAdmins }, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    );
    if (updated) return { conversation: updated, addedMemberIds, removedMemberIds, changed: true };
  }
  fail(409, "Members changed at the same time. Please try again.");
}
