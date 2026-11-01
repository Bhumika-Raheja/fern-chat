import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Conversation from "../src/models/Conversation.js";
import { getConversation, updateConversation } from "../src/controllers/conversationController.js";

const adminId = "507f1f77bcf86cd799439011";
const memberId = "507f1f77bcf86cd799439012";
const conversationId = "507f1f77bcf86cd799439014";

afterEach(() => mock.restoreAll());

function harness({ userId = adminId, params = { id: conversationId }, body = {} } = {}) {
  const events = [];
  const io = {
    to: (rooms) => ({ emit: (event, data) => events.push({ rooms, event, data }) }),
  };
  const req = { user: { _id: userId }, params, body, app: { get: () => io } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const next = (err) => { throw err; };
  return { req, res, next, events };
}

function makeConversation(overrides = {}) {
  const doc = {
    _id: conversationId,
    type: "group",
    name: "Project Team",
    description: "Initial notes",
    memberIds: [adminId, memberId],
    adminIds: [adminId],
    __v: 0,
    ...overrides,
    async populate(field, selection) {
      assert.equal(field, "memberIds");
      assert.equal(selection, "name avatarUrl");
      this.memberIds = this.memberIds.map((id) => ({
        _id: String(id),
        name: String(id) === adminId ? "Anirudh" : "Teammate",
        avatarUrl: "",
      }));
      return this;
    },
    toObject() {
      const { populate, toObject, ...rest } = this;
      return rest;
    },
  };
  return doc;
}

test("getConversation rejects invalid IDs and returns 404 for non-members", async () => {
  mock.method(Conversation, "findOne", () => { throw new Error("Unexpected query"); });
  const bad = harness({ params: { id: "bad-id" } });
  await getConversation(bad.req, bad.res, bad.next);
  assert.equal(bad.res.statusCode, 400);

  mock.method(Conversation, "findOne", () => ({
    populate: async () => null,
  }));
  const missing = harness();
  await getConversation(missing.req, missing.res, missing.next);
  assert.equal(missing.res.statusCode, 404);
});

test("getConversation returns populated conversation for members", async () => {
  const conv = makeConversation();
  mock.method(Conversation, "findOne", (filter) => {
    assert.deepEqual(filter, { _id: conversationId, memberIds: adminId });
    return {
      populate: async (field, selection) => {
        await conv.populate(field, selection);
        return conv;
      },
    };
  });

  const h = harness();
  await getConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(h.res.body.conversation.name, "Project Team");
  assert.equal(h.res.body.conversation.memberIds[0].name, "Anirudh");
});

test("updateConversation validates payloads before database access", async () => {
  mock.method(Conversation, "findOne", () => { throw new Error("Unexpected query"); });
  for (const body of [
    {},
    { name: "" },
    { name: "   " },
    { name: 123 },
    { description: {} },
    { description: "x".repeat(201) },
  ]) {
    const h = harness({ body });
    await updateConversation(h.req, h.res, h.next);
    assert.equal(h.res.statusCode, 400);
  }
});

test("updateConversation blocks DMs, non-members, and non-admin members", async () => {
  mock.method(Conversation, "findOne", async () => null);
  const missing = harness({ body: { name: "New" } });
  await updateConversation(missing.req, missing.res, missing.next);
  assert.equal(missing.res.statusCode, 404);

  mock.method(Conversation, "findOne", async () => makeConversation({ type: "dm", name: "" }));
  const dm = harness({ body: { name: "New" } });
  await updateConversation(dm.req, dm.res, dm.next);
  assert.equal(dm.res.statusCode, 400);

  mock.method(Conversation, "findOne", async () => makeConversation());
  const nonAdmin = harness({ userId: memberId, body: { name: "New" } });
  await updateConversation(nonAdmin.req, nonAdmin.res, nonAdmin.next);
  assert.equal(nonAdmin.res.statusCode, 403);
});

test("updateConversation normalizes channel names, bumps version, and broadcasts update", async () => {
  const existing = makeConversation({ type: "channel", name: "general", description: "" });
  mock.method(Conversation, "findOne", async () => existing);
  mock.method(Conversation, "findOneAndUpdate", async (filter, update, options) => {
    assert.equal(filter._id, conversationId);
    assert.equal(filter.adminIds, adminId);
    assert.equal(filter.__v, 0);
    assert.deepEqual(update.$set, { name: "backend-ops", description: "Server discussions" });
    assert.deepEqual(update.$inc, { __v: 1 });
    assert.equal(options.returnDocument, "after");
    return makeConversation({
      type: "channel",
      name: update.$set.name,
      description: update.$set.description,
      __v: 1,
    });
  });

  const h = harness({ body: { name: "  Backend   Ops ", description: "  Server discussions  " } });
  await updateConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(h.res.body.conversation.name, "backend-ops");
  assert.equal(h.res.body.conversation.description, "Server discussions");
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].event, "conversation:updated");
  assert.deepEqual(h.events[0].rooms, ["user:" + adminId, "user:" + memberId]);
});

test("updateConversation skips write and broadcast when settings are unchanged", async () => {
  mock.method(Conversation, "findOne", async () => makeConversation());
  mock.method(Conversation, "findOneAndUpdate", () => { throw new Error("Unexpected write"); });

  const h = harness({ body: { name: " Project Team ", description: "Initial notes" } });
  await updateConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(h.events.length, 0);
});

test("updateConversation returns 409 on duplicate channel names", async () => {
  mock.method(Conversation, "findOne", async () => makeConversation({ type: "channel", name: "general" }));
  mock.method(Conversation, "findOneAndUpdate", async () => {
    throw Object.assign(new Error("duplicate"), { code: 11000 });
  });

  const h = harness({ body: { name: "announcements" } });
  await updateConversation(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 409);
});
