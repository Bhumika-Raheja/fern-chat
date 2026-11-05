import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Conversation from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import ReadState from "../src/models/ReadState.js";
import { acknowledgeReceipt, getReceiptSnapshot, receiptData } from "../src/services/receiptService.js";
import { registerReceiptHandlers } from "../src/sockets/handlers/receipt.js";
import { markRead } from "../src/controllers/receiptController.js";

const conversationId = "507f1f77bcf86cd799439011";
const user = { _id: "507f1f77bcf86cd799439012", name: "Recipient", avatarUrl: "" };
const other = "507f1f77bcf86cd799439013";
const ids = ["607f1f77bcf86cd799439011", "607f1f77bcf86cd799439012", "607f1f77bcf86cd799439013"];
afterEach(() => mock.restoreAll());

function fixture(initial, member = true) {
  let state = initial ? { conversationId, userId: user._id, ...initial } : null;
  const writes = [];
  mock.method(Conversation, "findOne", async () => member ? { _id: conversationId } : null);
  mock.method(Message, "findOne", async (filter) =>
    String(filter.conversationId) === conversationId && ids.includes(String(filter._id))
      ? { _id: String(filter._id), conversationId, senderId: other } : null);
  mock.method(Message, "countDocuments", async (filter) => ids.filter((id) => id > String(filter._id.$gt)).length);
  mock.method(ReadState, "findOne", async () => state ? { ...state } : null);
  mock.method(ReadState, "findOneAndUpdate", async (filter, update) => {
    writes.push({ filter, update });
    state ||= { ...filter, lastReadMessageId: null };
    for (const [field, value] of Object.entries(update.$max)) {
      if (!state[field] || String(value) > String(state[field])) state[field] = value;
    }
    return { ...state };
  });
  return { state: () => state, writes };
}
const ack = (options = {}) => acknowledgeReceipt({ conversationId, messageId: ids[1], user, kind: "delivered", ...options });

test("receipt IDs and types are validated", async () => {
  for (const options of [
    { messageId: undefined }, { messageId: "invalid" },
    { conversationId: "invalid" }, { kind: "invalid" },
  ]) await assert.rejects(ack(options), { status: 400 });
});

test("non-members cannot acknowledge deliveries or reads", async () => {
  const repo = fixture(null, false);
  for (const kind of ["delivered", "read"]) await assert.rejects(ack({ kind }), { status: 404 });
  assert.equal(repo.writes.length, 0);
});

test("a receipt cannot point to a message in another conversation or an invented future ID", async () => {
  const repo = fixture();
  await assert.rejects(ack({ messageId: "707f1f77bcf86cd799439011" }), { status: 404 });
  mock.method(Message, "findOne", async () => null);
  await assert.rejects(ack(), { status: 404 });
  assert.equal(repo.writes.length, 0);
});

test("delivery advances only the delivered pointer", async () => {
  const repo = fixture();
  const result = await ack();
  assert.equal(result.changed, true);
  assert.equal(result.receipt.lastDeliveredMessageId, ids[1]);
  assert.equal(result.receipt.lastReadMessageId, null);
  assert.equal(repo.state().lastReadMessageId, null);
});

test("reading the specified visible message implies delivery and updates unread only through that ID", async () => {
  const repo = fixture();
  const result = await ack({ kind: "read", messageId: ids[0] });
  assert.equal(repo.state().lastReadReceiptMessageId, ids[0]);
  assert.equal(repo.state().lastReadMessageId, ids[0]);
  assert.equal(repo.state().lastDeliveredMessageId, ids[0]);
  assert.equal(result.receipt.unreadCount, 2);
});

test("older acknowledgements cannot move pointers backwards", async () => {
  const repo = fixture({
    lastDeliveredMessageId: ids[2], lastReadMessageId: ids[2], lastReadReceiptMessageId: ids[2],
  });
  const result = await ack({ kind: "read", messageId: ids[0] });
  assert.equal(result.changed, false);
  assert.equal(result.receipt.lastReadMessageId, ids[2]);
  assert.equal(repo.writes.length, 0);
});

test("duplicate acknowledgements from multiple tabs do not rewrite receipts", async () => {
  const repo = fixture();
  await ack();
  const result = await ack();
  assert.equal(result.changed, false);
  assert.equal(repo.writes.length, 1);
});

test("unread baselines and membership initialization are not advertised as read receipts", async () => {
  const repo = fixture({ lastReadMessageId: ids[2] });
  const before = receiptData(repo.state(), user);
  assert.equal(before.lastReadMessageId, null);
  assert.equal(before.lastDeliveredMessageId, null);
  const result = await ack({ kind: "read", messageId: ids[0] });
  assert.equal(result.receipt.lastReadMessageId, ids[0]);
  assert.equal(repo.state().lastReadMessageId, ids[2]);
});

test("an upsert conflict retries without creating a second read state", async () => {
  fixture();
  let attempts = 0;
  mock.method(ReadState, "findOneAndUpdate", async (filter, update, options) => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error("duplicate"), { code: 11000 });
    assert.equal(options.upsert, undefined);
    return { ...filter, ...update.$max };
  });
  assert.equal((await ack()).receipt.lastDeliveredMessageId, ids[1]);
  assert.equal(attempts, 2);
});

test("snapshots restore saved pointers and public reader names", async () => {
  fixture();
  mock.method(ReadState, "find", () => ({
    populate: async (field, fields) => {
      assert.equal(field, "userId");
      assert.equal(fields, "name avatarUrl");
      return [
        { conversationId, userId: user, lastDeliveredMessageId: ids[2], lastReadReceiptMessageId: ids[1] },
        { conversationId, userId: null },
      ];
    },
  }));
  const snapshot = await getReceiptSnapshot(conversationId, user._id);
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].lastReadMessageId, ids[1]);
  assert.deepEqual(snapshot[0].user, { _id: user._id, name: "Recipient", avatarUrl: "" });
});

test("receipt snapshots require current membership", async () => {
  fixture(null, false);
  await assert.rejects(getReceiptSnapshot(conversationId, user._id), { status: 404 });
});

function socketHarness() {
  const handlers = {};
  const events = [];
  const io = { to: (room) => ({ emit: (event, data) => events.push({ room, event, data }) }) };
  registerReceiptHandlers(io, { user, on: (event, handler) => { handlers[event] = handler; } });
  return { handlers, events };
}

test("socket delivery uses the authenticated user and broadcasts to the conversation", async () => {
  fixture();
  const { handlers, events } = socketHarness();
  let response;
  await handlers["message:delivered"]({ conversationId, messageId: ids[1], userId: other }, (res) => { response = res; });
  assert.equal(response.ok, true);
  assert.equal(response.receipt.userId, user._id);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "receipt:delivered");
  assert.equal(events[0].room, "conversation:" + conversationId);
});

test("socket reads broadcast explicit read pointers and unread counts", async () => {
  fixture();
  const { handlers, events } = socketHarness();
  let response;
  await handlers["message:read"]({ conversationId, messageId: ids[1] }, (res) => { response = res; });
  assert.equal(response.ok, true);
  assert.equal(response.receipt.unreadCount, 1);
  assert.equal(events[0].event, "receipt:read");
});

test("invalid or unauthorized socket receipts never broadcast", async () => {
  fixture(null, false);
  const { handlers, events } = socketHarness();
  for (const event of ["message:read", "message:delivered"]) {
    let response;
    await handlers[event]({ conversationId, messageId: ids[1] }, (res) => { response = res; });
    assert.equal(response.ok, false);
    assert.equal(response.status, 404);
    await handlers[event]();
  }
  assert.equal(events.length, 0);
});

test("the REST read endpoint requires a specific message instead of marking the newest blindly", async () => {
  let error;
  await markRead({ params: { id: conversationId }, user, body: {} }, {}, (err) => { error = err; });
  assert.equal(error.status, 400);
});
