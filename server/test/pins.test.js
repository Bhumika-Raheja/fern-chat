import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Conversation from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import {
  MAX_PINNED_MESSAGES,
  listPinnedMessages,
  pinMessage,
  unpinMessage,
} from "../src/services/pinService.js";
import {
  pinConversationMessage,
  unpinConversationMessage,
} from "../src/controllers/pinController.js";

const adminId = "507f1f77bcf86cd799439011";
const memberId = "507f1f77bcf86cd799439012";
const conversationId = "507f1f77bcf86cd799439013";
const messageId = "607f1f77bcf86cd799439014";
const olderMessageId = "607f1f77bcf86cd799439015";

afterEach(() => mock.restoreAll());

function makeHarness(params = { id: conversationId, messageId }) {
  const events = [];
  const io = {
    to: (room) => ({ emit: (event, data) => events.push({ room, event, data }) }),
  };
  const req = { user: { _id: adminId }, params, app: { get: () => io } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const next = (err) => { throw err; };
  return { req, res, next, events };
}

test("pin operations reject invalid IDs before database access", async () => {
  mock.method(Conversation, "findOne", () => { throw new Error("Unexpected query"); });
  await assert.rejects(listPinnedMessages({ conversationId: "bad", userId: adminId }), { status: 400 });
  await assert.rejects(pinMessage({ conversationId: "bad", messageId, userId: adminId }), { status: 400 });
  await assert.rejects(pinMessage({ conversationId, messageId: "bad", userId: adminId }), { status: 400 });
  await assert.rejects(unpinMessage({ conversationId, messageId: "bad", userId: adminId }), { status: 400 });
});

test("non-members cannot view, pin, or unpin messages", async () => {
  mock.method(Conversation, "findOne", async () => null);
  await assert.rejects(listPinnedMessages({ conversationId, userId: memberId }), { status: 404 });
  await assert.rejects(pinMessage({ conversationId, messageId, userId: memberId }), { status: 404 });
  await assert.rejects(unpinMessage({ conversationId, messageId, userId: memberId }), { status: 404 });
});

test("non-admins cannot pin or unpin in groups or channels, while DM members can", async () => {
  mock.method(Conversation, "findOne", async () => ({
    _id: conversationId,
    type: "group",
    memberIds: [adminId, memberId],
    adminIds: [adminId],
    pinnedMessageIds: [],
  }));
  await assert.rejects(pinMessage({ conversationId, messageId, userId: memberId }), { status: 403 });
  await assert.rejects(unpinMessage({ conversationId, messageId, userId: memberId }), { status: 403 });

  mock.method(Conversation, "findOne", async () => ({
    _id: conversationId,
    type: "dm",
    memberIds: [adminId, memberId],
    adminIds: [],
    pinnedMessageIds: [],
  }));
  mock.method(Message, "findOne", () => ({
    populate: async () => ({ _id: messageId, conversationId, body: "important" }),
  }));
  mock.method(Conversation, "findOneAndUpdate", async () => ({
    _id: conversationId,
    pinnedMessageIds: [messageId],
  }));

  const dmResult = await pinMessage({ conversationId, messageId, userId: memberId });
  assert.equal(dmResult.changed, true);
  assert.deepEqual(dmResult.pinnedMessageIds, [messageId]);
});

test("pinMessage enforces max cap, skips duplicate pins, and rejects missing/deleted messages", async () => {
  mock.method(Conversation, "findOne", async () => ({
    _id: conversationId,
    type: "channel",
    memberIds: [adminId],
    adminIds: [adminId],
    pinnedMessageIds: [],
  }));
  mock.method(Message, "findOne", () => ({ populate: async () => null }));
  await assert.rejects(pinMessage({ conversationId, messageId, userId: adminId }), { status: 404 });

  const fullPins = Array.from({ length: MAX_PINNED_MESSAGES }, (_, i) =>
    (i + 100).toString(16).padStart(24, "0")
  );
  mock.method(Conversation, "findOne", async () => ({
    _id: conversationId,
    type: "channel",
    memberIds: [adminId],
    adminIds: [adminId],
    pinnedMessageIds: fullPins,
  }));
  mock.method(Message, "findOne", () => ({
    populate: async () => ({ _id: messageId, conversationId, body: "overflow" }),
  }));
  await assert.rejects(pinMessage({ conversationId, messageId, userId: adminId }), { status: 400 });

  mock.method(Message, "findOne", () => ({
    populate: async () => ({ _id: fullPins[0], conversationId, body: "already pinned" }),
  }));
  mock.method(Conversation, "findOneAndUpdate", () => { throw new Error("Unexpected write"); });
  const dup = await pinMessage({ conversationId, messageId: fullPins[0], userId: adminId });
  assert.equal(dup.changed, false);
  assert.equal(dup.pinnedMessageIds.length, MAX_PINNED_MESSAGES);
});

test("listPinnedMessages returns non-deleted messages newest-pinned first", async () => {
  mock.method(Conversation, "findOne", async () => ({
    _id: conversationId,
    pinnedMessageIds: [olderMessageId, messageId],
  }));
  mock.method(Message, "find", (filter) => {
    assert.deepEqual(filter._id.$in, [olderMessageId, messageId]);
    assert.equal(filter.deletedAt, null);
    return {
      populate: async () => [
        { _id: olderMessageId, body: "first pinned" },
        { _id: messageId, body: "second pinned" },
      ],
    };
  });

  const pins = await listPinnedMessages({ conversationId, userId: adminId });
  assert.deepEqual(pins.map((m) => String(m._id)), [messageId, olderMessageId]);
});

test("pin and unpin controllers broadcast room events only when state changes", async () => {
  mock.method(Conversation, "findOne", async () => ({
    _id: conversationId,
    type: "group",
    memberIds: [adminId],
    adminIds: [adminId],
    pinnedMessageIds: [],
  }));
  mock.method(Message, "findOne", () => ({
    populate: async () => ({ _id: messageId, conversationId, body: "pin me" }),
  }));
  mock.method(Conversation, "findOneAndUpdate", async () => ({
    _id: conversationId,
    pinnedMessageIds: [messageId],
  }));

  const pinH = makeHarness();
  await pinConversationMessage(pinH.req, pinH.res, pinH.next);
  assert.equal(pinH.events.length, 1);
  assert.equal(pinH.events[0].room, "conversation:" + conversationId);
  assert.equal(pinH.events[0].event, "message:pinned");
  assert.deepEqual(pinH.res.body.pinnedMessageIds, [messageId]);

  mock.method(Conversation, "findOne", async () => ({
    _id: conversationId,
    type: "group",
    memberIds: [adminId],
    adminIds: [adminId],
    pinnedMessageIds: [messageId],
  }));
  mock.method(Conversation, "findOneAndUpdate", async () => ({
    _id: conversationId,
    pinnedMessageIds: [],
  }));

  const unpinH = makeHarness();
  await unpinConversationMessage(unpinH.req, unpinH.res, unpinH.next);
  assert.equal(unpinH.events.length, 1);
  assert.equal(unpinH.events[0].event, "message:unpinned");
  assert.deepEqual(unpinH.res.body, { messageId, pinnedMessageIds: [] });
});
