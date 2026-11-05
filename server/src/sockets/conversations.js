import { onlineAmong } from "./presence.js";

// Personal rooms include every connected tab/device belonging to each member.
export async function connectConversationMembers(io, conversation, announce = true) {
  if (!io) return;
  const memberIds = conversation.memberIds.map((member) => String(member._id || member));
  const personalRooms = memberIds.map((id) => "user:" + id);
  const room = "conversation:" + conversation._id;

  await io.in(personalRooms).socketsJoin(room);
  if (announce) io.to(personalRooms).emit("conversation:created", conversation);
  io.to(room).emit("presence:snapshot", { memberIds, onlineIds: onlineAmong(memberIds) });
}

export async function publishMembershipChange(io, conversation, {
  addedMemberIds = [], removedMemberIds = [], reason = "removed",
} = {}) {
  if (!io) return;
  const room = "conversation:" + conversation._id;
  const members = conversation.memberIds.map((member) => String(member._id || member));

  // Evict every tab/device before publishing any more conversation content.
  if (removedMemberIds.length) {
    const removedRooms = removedMemberIds.map((id) => "user:" + id);
    await io.in(removedRooms).socketsLeave(room);
    io.to(removedRooms).emit("conversation:removed", {
      conversationId: String(conversation._id), version: conversation.__v, reason,
    });
  }
  if (addedMemberIds.length) {
    const addedRooms = addedMemberIds.map((id) => "user:" + id);
    await io.in(addedRooms).socketsJoin(room);
    io.to(addedRooms).emit("conversation:created", conversation);
  }
  const existing = members.filter((id) => !addedMemberIds.includes(id));
  if (existing.length) {
    io.to(existing.map((id) => "user:" + id)).emit("conversation:updated", conversation);
  }
  io.to(room).emit("presence:snapshot", { memberIds: members, onlineIds: onlineAmong(members) });
}
