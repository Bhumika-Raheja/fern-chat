import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Conversation from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import { searchMessages } from "../src/controllers/messageController.js";

const userId = "507f1f77bcf86cd799439011";
const conversationId = "507f1f77bcf86cd799439013";
const messageIds = [
  "607f1f77bcf86cd799439011",
  "607f1f77bcf86cd799439012",
  "607f1f77bcf86cd799439013",
];

afterEach(() => mock.restoreAll());

function harness(query = {}) {
  const req = { user: { _id: userId }, params: { id: conversationId }, query };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const next = (err) => { throw err; };
  return { req, res, next };
}

test("searchMessages validates query length and cursor before querying MongoDB", async () => {
  mock.method(Conversation, "findOne", () => { throw new Error("Unexpected query"); });
  for (const query of [
    {},
    { q: "a" },
    { q: "   " },
    { q: ["hi"] },
    { q: "x".repeat(101) },
    { q: "hello", before: "bad-cursor" },
  ]) {
    const h = harness(query);
    await searchMessages(h.req, h.res, h.next);
    assert.equal(h.res.statusCode, 400);
  }
});

test("searchMessages requires conversation membership", async () => {
  mock.method(Conversation, "findOne", async () => null);
  const h = harness({ q: "deploy" });
  await searchMessages(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 404);
});

test("searchMessages escapes regex metacharacters, excludes deleted messages, and paginates", async () => {
  mock.method(Conversation, "findOne", async () => ({ _id: conversationId }));
  let capturedFilter;
  let capturedLimit;
  const rows = [
    { _id: messageIds[2], body: "v2.0+fix?" },
    { _id: messageIds[1], body: "v2.0+fix? earlier" },
    { _id: messageIds[0], body: "v2.0+fix? oldest" },
  ];
  mock.method(Message, "find", (filter) => {
    capturedFilter = filter;
    return {
      sort(order) { assert.deepEqual(order, { _id: -1 }); return this; },
      limit(n) { capturedLimit = n; return this; },
      populate(field, select) {
        assert.ok(["senderId", "reactions.userId"].includes(field));
        assert.equal(select, "name avatarUrl");
        if (field === "reactions.userId") return Promise.resolve(rows);
        return this;
      },
    };
  });

  const h = harness({ q: " v2.0+fix? ", limit: "2", before: messageIds[2] });
  await searchMessages(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(capturedFilter.conversationId, conversationId);
  assert.equal(capturedFilter.deletedAt, null);
  assert.deepEqual(capturedFilter._id, { $lt: messageIds[2] });
  assert.equal(capturedFilter.body.test("v2.0+fix?"), true);
  assert.equal(capturedFilter.body.test("v2a0bfix"), false);
  assert.equal(capturedLimit, 3);
  assert.equal(h.res.body.messages.length, 2);
  assert.equal(h.res.body.nextCursor, messageIds[1]);
});

test("searchMessages caps limit at 50 and omits nextCursor on final page", async () => {
  mock.method(Conversation, "findOne", async () => ({ _id: conversationId }));
  let capturedLimit;
  mock.method(Message, "find", () => ({
    sort() { return this; },
    limit(n) { capturedLimit = n; return this; },
    populate(field) {
      if (field === "reactions.userId") return Promise.resolve([{ _id: messageIds[0], body: "match" }]);
      return this;
    },
  }));

  const h = harness({ q: "match", limit: "200" });
  await searchMessages(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(capturedLimit, 51);
  assert.equal(h.res.body.messages.length, 1);
  assert.equal(h.res.body.nextCursor, null);
});
