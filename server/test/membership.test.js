import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Conversation from "../src/models/Conversation.js";
import User from "../src/models/User.js";
import { changeMembership } from "../src/services/membershipService.js";
import { withConversationLock } from "../src/services/conversationLock.js";
import { publishMembershipChange } from "../src/sockets/conversations.js";

const admin = "507f1f77bcf86cd799439011";
const member = "507f1f77bcf86cd799439012";
const newcomer = "507f1f77bcf86cd799439013";
const conversationId = "507f1f77bcf86cd799439014";
afterEach(() => mock.restoreAll());

function repository(overrides = {}) {
  let state = { _id: conversationId, type: "group", memberIds: [admin, member], adminIds: [admin], __v: 0, ...overrides };
  const snapshot = () => ({ ...state, memberIds: [...state.memberIds], adminIds: [...state.adminIds] });
  mock.method(Conversation, "findOne", async (filter) =>
    state.memberIds.includes(String(filter.memberIds)) ? snapshot() : null);
  mock.method(Conversation, "findOneAndUpdate", async (filter, update) => {
    const matchesVersion = typeof filter.__v === "object" ? state.__v === undefined : filter.__v === state.__v;
    if (!matchesVersion || !state.memberIds.includes(String(filter.memberIds)) ||
        (filter.adminIds && !state.adminIds.includes(String(filter.adminIds)))) return null;
    state = { ...state, ...update.$set, __v: (state.__v || 0) + update.$inc.__v };
    return snapshot();
  });
  mock.method(User, "countDocuments", async (filter) => filter._id.$in.length);
  return { state: () => snapshot(), replace: (value) => { state = { ...state, ...value }; } };
}

const change = (options) => changeMembership({ conversationId, actorId: admin, ...options });

test("members cannot add, remove, or change roles", async () => {
  repository();
  for (const options of [
    { action: "add", memberIds: [newcomer] },
    { action: "remove", targetId: admin },
    { action: "role", targetId: member, role: "admin" },
  ]) {
    await assert.rejects(change({ ...options, actorId: member }), { status: 403 });
  }
});

test("non-members cannot inspect or change memberships", async () => {
  repository();
  await assert.rejects(change({ actorId: newcomer, action: "leave" }), { status: 404 });
});

test("DM membership cannot be changed", async () => {
  repository({ type: "dm" });
  await assert.rejects(change({ action: "leave" }), { status: 400 });
});

test("invalid IDs, empty additions, and invalid roles are rejected", async () => {
  repository();
  for (const options of [
    { conversationId: "invalid", action: "leave" },
    { action: "add", memberIds: [] },
    { action: "add", memberIds: "not-an-array" },
    { action: "add", memberIds: ["invalid"] },
    { action: "remove", targetId: "invalid" },
    { action: "role", targetId: member, role: "owner" },
  ]) {
    await assert.rejects(change(options), { status: 400 });
  }
});

test("admins add unique existing users without promoting them", async () => {
  const repo = repository();
  const result = await change({ action: "add", memberIds: [member, newcomer.toUpperCase(), newcomer] });
  assert.deepEqual(result.addedMemberIds, [newcomer]);
  assert.deepEqual(repo.state().memberIds, [admin, member, newcomer]);
  assert.deepEqual(repo.state().adminIds, [admin]);
  assert.equal(repo.state().__v, 1);
});

test("adding an existing member is a no-op", async () => {
  repository();
  const result = await change({ action: "add", memberIds: [member] });
  assert.equal(result.changed, false);
  assert.equal(result.conversation.__v, 0);
});

test("nonexistent users cannot be added", async () => {
  repository();
  mock.method(User, "countDocuments", async () => 0);
  await assert.rejects(change({ action: "add", memberIds: [newcomer] }), { status: 400 });
});

test("membership is capped at 100", async () => {
  repository({ memberIds: [admin, ...Array.from({ length: 99 }, (_, i) => (i + 100).toString(16).padStart(24, "0"))] });
  await assert.rejects(change({ action: "add", memberIds: [newcomer] }), { status: 400 });
});

test("admins may promote only current members", async () => {
  const repo = repository();
  await assert.rejects(change({ action: "role", targetId: newcomer, role: "admin" }), { status: 404 });
  await change({ action: "role", targetId: member, role: "admin" });
  assert.deepEqual(repo.state().adminIds, [admin, member]);
});

test("the last admin cannot leave, remove themselves, or demote themselves", async () => {
  const repo = repository();
  for (const options of [
    { action: "leave" },
    { action: "remove", targetId: admin },
    { action: "role", targetId: admin, role: "member" },
  ]) {
    await assert.rejects(change(options), { status: 409 });
  }
  assert.deepEqual(repo.state().adminIds, [admin]);
});

test("an admin can demote themselves after promoting a successor", async () => {
  const repo = repository({ adminIds: [admin, member] });
  await change({ action: "role", targetId: admin, role: "member" });
  assert.deepEqual(repo.state().adminIds, [member]);
  assert.deepEqual(repo.state().memberIds, [admin, member]);
});

test("members can leave and admins can remove other members", async () => {
  let repo = repository();
  let result = await change({ actorId: member, action: "leave" });
  assert.deepEqual(result.removedMemberIds, [member]);
  assert.deepEqual(repo.state().memberIds, [admin]);
  repo = repository();
  result = await change({ action: "remove", targetId: member });
  assert.deepEqual(result.removedMemberIds, [member]);
  assert.deepEqual(repo.state().memberIds, [admin]);
});

test("removing an admin also removes their role", async () => {
  const repo = repository({ adminIds: [admin, member] });
  await change({ action: "remove", targetId: member });
  assert.deepEqual(repo.state().adminIds, [admin]);
  assert.deepEqual(repo.state().memberIds, [admin]);
});

test("two admins leaving concurrently cannot leave a group without an admin", async () => {
  const repo = repository({ adminIds: [admin, member] });
  const results = await Promise.allSettled([
    change({ action: "leave" }),
    change({ actorId: member, action: "leave" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
  assert.equal(repo.state().adminIds.length, 1);
  assert.equal(repo.state().memberIds.length, 1);
});

test("permissions are rechecked after a concurrent version conflict", async () => {
  const repo = repository();
  mock.method(Conversation, "findOneAndUpdate", async () => {
    repo.replace({ adminIds: [member], __v: 1 });
    return null;
  });
  await assert.rejects(change({ action: "add", memberIds: [newcomer] }), { status: 403 });
  assert.equal(repo.state().memberIds.includes(newcomer), false);
});

test("persistent write conflicts return a retryable conflict", async () => {
  repository();
  mock.method(Conversation, "findOneAndUpdate", async () => null);
  await assert.rejects(change({ action: "add", memberIds: [newcomer] }), { status: 409 });
});

test("legacy conversations without a version can be updated", async () => {
  const repo = repository({ __v: undefined });
  await change({ action: "add", memberIds: [newcomer] });
  assert.equal(repo.state().__v, 1);
});

test("room eviction happens before updates and removed users receive no conversation details", async () => {
  const calls = [];
  const io = {
    in: (rooms) => ({
      socketsLeave: async (room) => calls.push({ action: "leave", rooms, room }),
      socketsJoin: async (room) => calls.push({ action: "join", rooms, room }),
    }),
    to: (rooms) => ({ emit: (event, data) => calls.push({ event, rooms, data }) }),
  };
  const conversation = { _id: conversationId, __v: 2, memberIds: [{ _id: admin }, { _id: newcomer }] };
  await publishMembershipChange(io, conversation, { addedMemberIds: [newcomer], removedMemberIds: [member] });
  assert.equal(calls[0].action, "leave");
  assert.deepEqual(calls[0].rooms, ["user:" + member]);
  assert.equal(calls[1].event, "conversation:removed");
  assert.deepEqual(calls[1].data, { conversationId, version: 2, reason: "removed" });
  assert.equal(calls[2].action, "join");
  assert.equal(calls[3].event, "conversation:created");
  assert.deepEqual(calls[3].rooms, ["user:" + newcomer]);
  assert.equal(calls[4].event, "conversation:updated");
  assert.deepEqual(calls[4].rooms, ["user:" + admin]);
});

test("local membership operations keep their notifications ordered even after a failure", async () => {
  const calls = [];
  let release;
  const first = withConversationLock("same-chat", async () => {
    calls.push("first");
    await new Promise((resolve) => { release = resolve; });
    throw new Error("expected");
  });
  const caught = first.catch(() => {});
  await Promise.resolve();
  const second = withConversationLock("same-chat", async () => { calls.push("second"); });
  await Promise.resolve();
  assert.deepEqual(calls, ["first"]);
  release();
  await caught;
  await second;
  assert.deepEqual(calls, ["first", "second"]);
});
