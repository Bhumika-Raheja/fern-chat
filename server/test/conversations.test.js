import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import User from "../src/models/User.js";
import Conversation from "../src/models/Conversation.js";
import ReadState from "../src/models/ReadState.js";
import { createConversation } from "../src/controllers/conversationController.js";
import { searchUsers } from "../src/controllers/userController.js";
import { connectConversationMembers } from "../src/sockets/conversations.js";

const me = "507f1f77bcf86cd799439011";
const other = "507f1f77bcf86cd799439012";
const third = "507f1f77bcf86cd799439013";
const conversationId = "507f1f77bcf86cd799439014";
afterEach(() => mock.restoreAll());

function harness(body = {}) {
  const events = [];
  const io = {
    in: (rooms) => ({ socketsJoin: async (room) => { events.push({ join: room, rooms }); } }),
    to: (rooms) => ({ emit: (event, data) => { events.push({ rooms, event, data }); } }),
  };
  const req = { user: { _id: me }, body, app: { get: () => io } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const next = (err) => { throw err; };
  return { req, res, next, events, io };
}

function document(data = {}) {
  return {
    _id: conversationId, type: "dm", memberIds: [me, other], ...data,
    async populate(field, selection) {
      assert.equal(field, "memberIds");
      assert.equal(selection, "name avatarUrl");
      this.memberIds = this.memberIds.map((id) => ({
        _id: String(id), name: String(id) === me ? "Maya" : "Teammate", avatarUrl: "",
      }));
    },
    toObject() {
      const { populate, toObject, ...value } = this;
      return value;
    },
  };
}

function database() {
  const created = [];
  const reads = [];
  mock.method(User, "countDocuments", async (filter) => filter._id.$in.length);
  mock.method(Conversation, "findOne", async () => null);
  mock.method(Conversation, "create", async (data) => {
    created.push(data);
    return document(data);
  });
  mock.method(ReadState, "bulkWrite", async (operations) => { reads.push(...operations); });
  return { created, reads };
}

test("creation rejects invalid member lists, empty groups, and invalid types", async () => {
  for (const body of [
    { type: "invalid", memberIds: [other] },
    { type: "dm" },
    { type: "dm", memberIds: "not-an-array" },
    { type: "dm", memberIds: ["bad"] },
    { type: "dm", memberIds: [42] },
    { type: "dm", memberIds: [other, third] },
    { type: "dm", memberIds: [me] },
    { type: "dm", memberIds: [other].concat(Array(99).fill(third)) },
    { type: "group", name: "Team", memberIds: [] },
  ]) {
    const h = harness(body);
    await createConversation(h.req, h.res, h.next);
    assert.equal(h.res.statusCode, 400);
    assert.equal(h.events.length, 0);
  }
});

test("creation validates names and descriptions before database access", async () => {
  for (const body of [
    { type: "group", name: 123 },
    { type: "channel", name: "   " },
    { type: "group", name: "x".repeat(41) },
    { type: "group", name: "Team", description: {} },
    { type: "group", name: "Team", description: "x".repeat(201) },
  ]) {
    const h = harness({ memberIds: [other], ...body });
    await createConversation(h.req, h.res, h.next);
    assert.equal(h.res.statusCode, 400);
  }
});

test("selected users must exist", async () => {
  const { created } = database();
  mock.method(User, "countDocuments", async () => 0);
  const h = harness({ type: "dm", memberIds: [other] });
  await createConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 400);
  assert.equal(created.length, 0);
});

test("a new DM returns populated members, initializes reads, joins rooms, and notifies members", async () => {
  const { created, reads } = database();
  const h = harness({ type: "dm", memberIds: [other] });
  await createConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 201);
  assert.equal(created[0].dmKey, [me, other].sort().join(":"));
  assert.deepEqual(created[0].memberIds, [me, other]);
  assert.equal(h.res.body.conversation.memberIds[1].name, "Teammate");
  assert.equal(reads.length, 2);
  assert.equal(reads[1].updateOne.filter.userId, other);
  assert.equal(reads[1].updateOne.update.$setOnInsert.lastReadMessageId, null);
  assert.equal(h.events[0].join, "conversation:" + conversationId);
  assert.deepEqual(h.events[0].rooms, ["user:" + me, "user:" + other]);
  assert.equal(h.events[1].event, "conversation:created");
  assert.deepEqual(h.events[1].rooms, ["user:" + me, "user:" + other]);
  assert.equal(h.events[2].event, "presence:snapshot");
});

test("starting an existing DM reuses it without resetting reads or announcing a new chat", async () => {
  const { created, reads } = database();
  mock.method(Conversation, "findOne", async () => document());
  const h = harness({ type: "dm", memberIds: [other] });
  await createConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(created.length, 0);
  assert.equal(reads.length, 0);
  assert.equal(h.res.body.conversation._id, conversationId);
  assert.equal(h.events.some((e) => e.event === "conversation:created"), false);
});

test("concurrent DM creation recovers the existing pair after a unique-index conflict", async () => {
  database();
  let lookups = 0;
  mock.method(Conversation, "findOne", async () => ++lookups === 1 ? null : document());
  mock.method(Conversation, "create", async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); });
  const h = harness({ type: "dm", memberIds: [other] });
  await createConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(lookups, 2);
  assert.equal(h.events.some((e) => e.event === "conversation:created"), false);
});

test("group creation deduplicates members, includes the creator, and assigns the creator as admin", async () => {
  const { created } = database();
  const h = harness({ type: "group", name: "  Project team  ", memberIds: [other, other, me, third] });
  await createConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 201);
  assert.deepEqual(created[0].memberIds, [me, other, third]);
  assert.deepEqual(created[0].adminIds, [me]);
  assert.equal(created[0].name, "Project team");
  assert.equal(created[0].dmKey, undefined);
});

test("uppercase ObjectIDs cannot bypass self or duplicate-member checks", async () => {
  const { created } = database();
  const h = harness({ type: "dm", memberIds: [me.toUpperCase(), other.toUpperCase(), other] });
  await createConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 201);
  assert.deepEqual(created[0].memberIds, [me, other]);
});

test("channel creation normalizes names and trims descriptions", async () => {
  const { created } = database();
  const h = harness({ type: "channel", name: " Design  Team ", description: " Our work ", memberIds: [other] });
  await createConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 201);
  assert.equal(created[0].name, "design-team");
  assert.equal(created[0].description, "Our work");
});

test("duplicate channel names return a useful conflict", async () => {
  database();
  mock.method(Conversation, "create", async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); });
  const h = harness({ type: "channel", name: "design", memberIds: [other] });
  await createConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 409);
});

test("empty or short user searches do not list all registered users", async () => {
  mock.method(User, "find", () => { throw new Error("Unexpected database call"); });
  for (const q of ["", "a", ["Maya"]]) {
    const h = harness();
    h.req.query = { q };
    await searchUsers(h.req, h.res, h.next);
    assert.deepEqual(h.res.body, { users: [] });
  }
});

test("user search excludes the caller, escapes regex syntax, and returns only public profile fields", async () => {
  const publicUser = { _id: other, name: "A+b", avatarUrl: "" };
  let filter;
  mock.method(User, "find", (value) => {
    filter = value;
    return {
      select(fields) { assert.equal(fields, "_id name avatarUrl"); return this; },
      sort() { return this; },
      limit(count) { assert.equal(count, 20); return this; },
      lean: async () => [publicUser],
    };
  });
  const h = harness();
  h.req.query = { q: " a+b " };
  await searchUsers(h.req, h.res, h.next);
  assert.equal(filter._id.$ne, me);
  assert.equal(filter.$or[0].name.test("A+b"), true);
  assert.equal(filter.$or[0].name.test("aaab"), false);
  assert.equal(filter.$or[1].email.test("a+b@example.com"), true);
  assert.deepEqual(h.res.body.users, [publicUser]);
});

test("overlong user searches are rejected", async () => {
  const h = harness();
  h.req.query = { q: "a".repeat(81) };
  await searchUsers(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 400);
});

test("room joining completes before a conversation is announced", async () => {
  const calls = [];
  const io = {
    in: () => ({ socketsJoin: async () => { await Promise.resolve(); calls.push("joined"); } }),
    to: () => ({ emit: (event) => calls.push(event) }),
  };
  await connectConversationMembers(io, { _id: conversationId, memberIds: [{ _id: me }, { _id: other }] });
  assert.deepEqual(calls, ["joined", "conversation:created", "presence:snapshot"]);
});

test("DM pair keys are uniquely indexed without requiring keys on legacy conversations", () => {
  const index = Conversation.schema.indexes().find(([fields]) => fields.dmKey === 1);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, { dmKey: { $type: "string" } });
});
