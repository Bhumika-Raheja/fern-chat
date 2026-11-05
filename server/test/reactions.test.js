import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Message from "../src/models/Message.js";
import Conversation from "../src/models/Conversation.js";
import { setMessageReaction, getReactionSnapshots, reactionData } from "../src/services/reactionService.js";
import { registerReactionHandlers } from "../src/sockets/handlers/reaction.js";
import { deleteMessage, editMessage } from "../src/services/messageService.js";

const userId = "507f1f77bcf86cd799439011";
const otherId = "507f1f77bcf86cd799439012";
const conversationId = "507f1f77bcf86cd799439013";
const messageId = "507f1f77bcf86cd799439014";
const emoji = "\u{1F44D}";
const input = { conversationId, messageId, userId, emoji, active: true };
afterEach(() => mock.restoreAll());

function fixture({ member = true, deleted = false } = {}) {
  const raw = { _id: messageId, conversationId, senderId: userId, body: "hello",
    reactions: [], reactionVersion: 0, createdAt: new Date(), deletedAt: deleted ? new Date() : null };
  mock.method(Conversation, "findOne", async (filter) => {
    assert.equal(String(filter._id), conversationId);
    assert.ok(filter.memberIds);
    return member ? { _id: conversationId } : null;
  });
  mock.method(Message, "findOneAndUpdate", async (filter, update, options) => {
    if (update.$addToSet || update.$pull) assert.equal(String(filter.conversationId), conversationId);
    assert.equal(filter.deletedAt, null);
    assert.equal(options.runValidators, true);
    if (String(filter._id) !== messageId || raw.deletedAt) return null;
    const same = (a, b) => a.emoji === b.emoji && String(a.userId) === String(b.userId);
    if (update.$addToSet && !raw.reactions.some((r) => same(r, update.$addToSet.reactions))) {
      raw.reactions.push(update.$addToSet.reactions);
    }
    if (update.$pull) raw.reactions = raw.reactions.filter((r) => !same(r, update.$pull.reactions));
    if (update.$set) Object.assign(raw, update.$set);
    raw.reactionVersion += update.$inc?.reactionVersion || 0;
    return { ...raw, reactions: [...raw.reactions], populate: async function(field, projection) {
      assert.equal(field, "reactions.userId");
      assert.equal(projection, "name avatarUrl");
      return this;
    } };
  });
  return raw;
}

test("reaction schema has stable user/emoji pairs and defaults for legacy messages", async () => {
  const message = new Message({ conversationId, senderId: userId });
  assert.deepEqual(message.reactions.toObject(), []);
  assert.equal(message.reactionVersion, 0);
  message.reactions.push({ emoji, userId });
  assert.equal(message.reactions[0]._id, undefined);
  await message.validate();
  message.reactions[0].emoji = "arbitrary";
  await assert.rejects(message.validate(), /not a valid enum/);
});

test("invalid IDs, unsupported emoji and non-boolean actions fail before database access", async () => {
  mock.method(Conversation, "findOne", () => { throw new Error("Unexpected query"); });
  for (const change of [{ conversationId: "bad" }, { messageId: "bad" }, { emoji: "x" },
    { emoji: { value: emoji } }, { active: undefined }, { active: "true" }]) {
    await assert.rejects(setMessageReaction({ ...input, ...change }), { status: 400 });
  }
});

test("outsiders and removed members cannot add or remove reactions", async () => {
  fixture({ member: false });
  for (const active of [true, false]) {
    await assert.rejects(setMessageReaction({ ...input, active }), { status: 404 });
  }
  assert.equal(Message.findOneAndUpdate.mock.calls.length, 0);
});

test("deleted or mismatched messages cannot receive reactions", async () => {
  fixture({ deleted: true });
  await assert.rejects(setMessageReaction(input), { status: 404 });
  await assert.rejects(setMessageReaction({ ...input, messageId: otherId }), { status: 404 });
});

test("retrying explicit add/remove never duplicates or toggles another user's reaction", async () => {
  const raw = fixture();
  await Promise.all([setMessageReaction(input), setMessageReaction(input),
    setMessageReaction({ ...input, userId: otherId })]);
  assert.equal(raw.reactions.length, 2);
  assert.equal(raw.reactionVersion, 3);
  await setMessageReaction({ ...input, active: false });
  await setMessageReaction({ ...input, active: false });
  assert.deepEqual(raw.reactions, [{ emoji, userId: otherId }]);
  await setMessageReaction({ ...input, emoji: "\u{2764}\u{FE0F}" });
  assert.equal(raw.reactions.length, 2);
});

test("snapshot validates count and IDs before looking up messages", async () => {
  for (const ids of [undefined, "", "bad", Array.from({ length: 101 }, (_, i) =>
    (i + 1).toString(16).padStart(24, "0")).join(",")]) {
    await assert.rejects(getReactionSnapshots(conversationId, userId, ids), { status: 400 });
  }
});

test("snapshot checks membership, scopes message IDs, and exposes public reactor profiles", async () => {
  fixture();
  const result = { ...input, _id: messageId, reactions: [{ emoji, userId: { _id: userId, name: "Maya" } }],
    reactionVersion: 4 };
  mock.method(Message, "find", (filter) => {
    assert.equal(String(filter.conversationId), conversationId);
    assert.deepEqual(filter._id.$in, [messageId]);
    return { select(fields) {
      assert.equal(fields, "_id conversationId reactions reactionVersion deletedAt");
      return { populate: async (field, fields) => {
        assert.equal(field, "reactions.userId");
        assert.equal(fields, "name avatarUrl");
        return [result];
      } };
    } };
  });
  const snapshots = await getReactionSnapshots(conversationId, userId, messageId + "," + messageId);
  assert.equal(snapshots[0].reactions[0].userId.name, "Maya");
  assert.equal(snapshots[0].reactionVersion, 4);
  assert.equal(snapshots[0].body, undefined);
});

test("removed members cannot request reaction snapshots", async () => {
  fixture({ member: false });
  await assert.rejects(getReactionSnapshots(conversationId, userId, messageId), { status: 404 });
});

test("deleted snapshots always clear reactions", () => {
  const result = reactionData({ _id: messageId, conversationId, deletedAt: new Date(),
    reactions: [{ emoji, userId }], reactionVersion: 3 });
  assert.deepEqual(result.reactions, []);
  assert.ok(result.deletedAt);
});

test("editing keeps reactions and deleting clears them with a newer version", async () => {
  const raw = fixture();
  await setMessageReaction(input);
  mock.method(Message, "findById", async () => ({ ...raw }));
  const edited = await editMessage({ messageId, userId, body: "edited" });
  assert.equal(edited.message.reactions.length, 1);
  const deleted = await deleteMessage({ messageId, userId });
  assert.deepEqual(deleted.message.reactions, []);
  assert.equal(deleted.message.reactionVersion, 2);
});

function harness() {
  const handlers = {};
  const events = [];
  registerReactionHandlers({ to: (room) => ({ emit: (event, data) => events.push({ room, event, data }) }) },
    { user: { _id: userId }, on: (event, handler) => { handlers[event] = handler; } });
  return { react: handlers["message:react"], events };
}

test("socket uses authenticated identity and broadcasts the persisted result once", async () => {
  fixture();
  const { react, events } = harness();
  let reply;
  await react({ ...input, userId: otherId }, (res) => { reply = res; });
  assert.equal(reply.ok, true);
  assert.equal(String(reply.reaction.reactions[0].userId), userId);
  assert.deepEqual(events, [{ room: "conversation:" + conversationId,
    event: "message:reactions", data: reply.reaction }]);
});

test("denied and malformed socket reactions never broadcast", async () => {
  fixture({ member: false });
  const { react, events } = harness();
  let reply;
  await react(input, (res) => { reply = res; });
  assert.equal(reply.ok, false);
  assert.equal(reply.status, 404);
  await react();
  assert.deepEqual(events, []);
});
