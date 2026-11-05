import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Message from "../src/models/Message.js";
import Conversation from "../src/models/Conversation.js";
import { editMessage, deleteMessage } from "../src/services/messageService.js";
import { registerMessageHandlers } from "../src/sockets/handlers/message.js";

const userId = "507f1f77bcf86cd799439011";
const otherId = "507f1f77bcf86cd799439012";
const conversationId = "507f1f77bcf86cd799439013";
const messageId = "507f1f77bcf86cd799439014";

afterEach(() => mock.restoreAll());

function fixture(overrides = {}, member = true) {
  const message = {
    _id: messageId, conversationId, senderId: userId,
    body: "hello", attachments: [], editedAt: null, deletedAt: null, createdAt: new Date(),
    ...overrides,
  };
  mock.method(Message, "findById", async () => ({ ...message }));
  mock.method(Conversation, "findOne", async () => member ? { _id: conversationId } : null);
  // Unexpected writes fail immediately instead of opening a database connection.
  mock.method(Message, "findOneAndUpdate", async () => {
    throw new Error("Unexpected write");
  });
  return message;
}

function savedUpdate(message, fields) {
  const updated = { ...message, ...fields };
  updated.populate = async () => updated;
  return updated;
}

function socketHarness() {
  const handlers = {};
  const events = [];
  const socket = { user: { _id: userId }, on: (name, handler) => { handlers[name] = handler; } };
  const io = { to: (room) => ({ emit: (event, message) => events.push({ room, event, message }) }) };
  registerMessageHandlers(io, socket);
  return { handlers, events };
}

test("invalid message IDs are rejected without querying MongoDB", async () => {
  mock.method(Message, "findById", () => { throw new Error("Unexpected query"); });
  for (const operation of [editMessage, deleteMessage]) {
    assert.deepEqual(await operation({ messageId: "invalid", userId, body: "new" }),
      { error: "Message not found" });
  }
});

test("missing messages cannot be edited or deleted", async () => {
  fixture();
  mock.method(Message, "findById", async () => null);
  for (const operation of [editMessage, deleteMessage]) {
    assert.deepEqual(await operation({ messageId, userId, body: "new" }),
      { error: "Message not found" });
  }
});

test("other members cannot edit or delete the sender's message", async () => {
  fixture({ senderId: otherId });
  for (const operation of [editMessage, deleteMessage]) {
    assert.match((await operation({ messageId, userId, body: "new" })).error, /own messages/);
  }
});

test("a sender who left the conversation cannot edit or delete", async () => {
  fixture({}, false);
  for (const operation of [editMessage, deleteMessage]) {
    assert.deepEqual(await operation({ messageId, userId, body: "new" }),
      { error: "Message not found" });
  }
});

test("edits reject blank text, oversized text, and invalid body types", async () => {
  fixture();
  for (const body of ["   ", "x".repeat(4001), undefined, 42, {}]) {
    const result = await editMessage({ messageId, userId, body });
    assert.ok(result.error);
  }
});

test("editing a deleted message is rejected", async () => {
  fixture({ body: "", deletedAt: new Date() });
  assert.deepEqual(await editMessage({ messageId, userId, body: "restore" }),
    { error: "This message was deleted" });
});

test("unchanged edits do not change the edit timestamp", async () => {
  const message = fixture();
  assert.deepEqual(await editMessage({ messageId, userId, body: " hello " }), { message });
});

test("an attachment message may have its caption removed without removing the attachment", async () => {
  const attachments = [{ url: "https://res.cloudinary.com/demo/image/upload/test.png" }];
  const message = fixture({ attachments });
  mock.method(Message, "findOneAndUpdate", async (filter, update, options) => {
    assert.equal(filter.deletedAt, null);
    assert.equal(filter.senderId, userId);
    assert.equal(update.$set.body, "");
    assert.ok(update.$set.editedAt instanceof Date);
    assert.equal(options.runValidators, true);
    return savedUpdate(message, update.$set);
  });
  const result = await editMessage({ messageId, userId, body: "" });
  assert.deepEqual(result.message.attachments, attachments);
  assert.equal(result.message.body, "");
});

test("a deletion between reading and saving blocks an edit", async () => {
  fixture();
  mock.method(Message, "findOneAndUpdate", async () => null);
  assert.deepEqual(await editMessage({ messageId, userId, body: "new" }),
    { error: "This message was deleted" });
});

test("delete clears text and attachments while keeping the original message ID", async () => {
  const message = fixture({ attachments: [{ url: "image.png" }] });
  mock.method(Message, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.deletedAt, null);
    assert.equal(filter.senderId, userId);
    assert.equal(update.$set.body, "");
    assert.deepEqual(update.$set.attachments, []);
    assert.ok(update.$set.deletedAt instanceof Date);
    return savedUpdate(message, update.$set);
  });
  const result = await deleteMessage({ messageId, userId });
  assert.equal(result.message._id, messageId);
  assert.equal(result.message.body, "");
  assert.deepEqual(result.message.attachments, []);
});

test("deleting an already deleted message is idempotent", async () => {
  const message = fixture({ body: "", attachments: [], deletedAt: new Date() });
  assert.deepEqual(await deleteMessage({ messageId, userId }), { message });
});

test("concurrent deletes return the persisted tombstone", async () => {
  const message = fixture();
  const tombstone = { ...message, body: "", deletedAt: new Date() };
  let reads = 0;
  mock.method(Message, "findById", async () => ++reads === 1 ? message : tombstone);
  mock.method(Message, "findOneAndUpdate", async () => null);
  assert.deepEqual(await deleteMessage({ messageId, userId }), { message: tombstone });
});

test("socket edit broadcasts one update to the conversation and acknowledges saved text", async () => {
  const message = fixture();
  mock.method(Message, "findOneAndUpdate", async (_filter, update) => savedUpdate(message, update.$set));
  const { handlers, events } = socketHarness();
  let response;
  await handlers["message:edit"]({ messageId, body: " hello again " }, (res) => { response = res; });
  assert.equal(response.ok, true);
  assert.equal(response.message.body, "hello again");
  assert.equal(events.length, 1);
  assert.equal(events[0].room, "conversation:" + conversationId);
  assert.equal(events[0].event, "message:updated");
  assert.deepEqual(events[0].message, response.message);
});

test("socket delete broadcasts and acknowledges the tombstone", async () => {
  const message = fixture();
  mock.method(Message, "findOneAndUpdate", async (_filter, update) => savedUpdate(message, update.$set));
  const { handlers, events } = socketHarness();
  let response;
  await handlers["message:delete"]({ messageId }, (res) => { response = res; });
  assert.equal(response.ok, true);
  assert.equal(response.message.body, "");
  assert.ok(response.message.deletedAt);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "message:updated");
  assert.deepEqual(events[0].message, response.message);
});

test("rejected socket mutations acknowledge errors without broadcasting", async () => {
  fixture({ senderId: otherId });
  const { handlers, events } = socketHarness();
  for (const event of ["message:edit", "message:delete"]) {
    let response;
    await handlers[event]({ messageId, body: "new" }, (res) => { response = res; });
    assert.equal(response.ok, false);
    assert.match(response.error, /own messages/);
  }
  assert.deepEqual(events, []);
});

test("malformed socket events without acknowledgements do not throw or broadcast", async () => {
  const { handlers, events } = socketHarness();
  await handlers["message:edit"]();
  await handlers["message:delete"]();
  assert.deepEqual(events, []);
});

test("delete accepts a message just before five minutes and rechecks age in the write", async () => {
  const now = Date.parse("2026-11-05T10:00:00Z");
  mock.method(Date, "now", () => now);
  const message = fixture({ createdAt: new Date(now - 5 * 60 * 1000 + 1) });
  mock.method(Message, "findOneAndUpdate", async (filter, update) => {
    assert.deepEqual(filter.$expr, { $and: [
      { $gt: ["$createdAt", { $subtract: ["$$NOW", 300000] }] },
      { $lte: ["$createdAt", "$$NOW"] },
    ] });
    return savedUpdate(message, update.$set);
  });
  assert.ok((await deleteMessage({ messageId, userId })).message.deletedAt);
});

test("delete rejects messages at or beyond five minutes, even after a recent edit", async () => {
  const now = Date.parse("2026-11-05T10:00:00Z");
  mock.method(Date, "now", () => now);
  for (const age of [300000, 300001, 3600000]) {
    fixture({ createdAt: new Date(now - age), editedAt: new Date(now), updatedAt: new Date(now) });
    assert.match((await deleteMessage({ messageId, userId })).error, /5 minutes/);
  }
});

test("missing, invalid or future timestamps cannot bypass the delete window", async () => {
  const now = Date.now();
  mock.method(Date, "now", () => now);
  for (const createdAt of [undefined, null, "invalid", new Date(now + 1000)]) {
    fixture({ createdAt });
    assert.match((await deleteMessage({ messageId, userId })).error, /5 minutes/);
  }
});

test("expiry during the database write returns an error instead of an undeleted message", async () => {
  fixture();
  mock.method(Message, "findOneAndUpdate", async () => null);
  assert.match((await deleteMessage({ messageId, userId })).error, /5 minutes/);
});

test("retrying an old deleted message still returns its saved tombstone", async () => {
  const message = fixture({ createdAt: new Date(Date.now() - 3600000), deletedAt: new Date(), body: "" });
  assert.deepEqual(await deleteMessage({ messageId, userId }), { message });
});

test("editing remains available after the deletion window", async () => {
  const message = fixture({ createdAt: new Date(Date.now() - 3600000) });
  mock.method(Message, "findOneAndUpdate", async (_filter, update) => savedUpdate(message, update.$set));
  assert.equal((await editMessage({ messageId, userId, body: "edited later" })).message.body, "edited later");
});

test("expired socket deletion reports the limit and never broadcasts a deletion", async () => {
  fixture({ createdAt: new Date(Date.now() - 300000) });
  const { handlers, events } = socketHarness();
  let response;
  await handlers["message:delete"]({ messageId }, (res) => { response = res; });
  assert.equal(response.ok, false);
  assert.match(response.error, /5 minutes/);
  assert.deepEqual(events, []);
});
