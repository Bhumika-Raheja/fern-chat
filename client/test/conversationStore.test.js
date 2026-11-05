import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const api = {};
globalThis.__fernConversationApi = api;
const storeUrl = new URL("../src/store/conversationStore.js", import.meta.url).href;

// Load the real store with a fake HTTP transport; no browser or server is needed.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === storeUrl && specifier === "../api/client") {
      return {
        url: "data:text/javascript," + encodeURIComponent("export const api = globalThis.__fernConversationApi;"),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { useConversationStore: store } = await import(storeUrl);
const { usePresenceStore: presence } = await import("../src/store/presenceStore.js");

const first = { _id: "first", type: "dm", memberIds: [], unreadCount: 3, lastMessageAt: "2026-11-05T10:00:00Z" };
const second = { _id: "second", type: "group", name: "Team", memberIds: [], lastMessageAt: "2026-11-05T11:00:00Z" };

beforeEach(() => {
  store.getState().reset();
  presence.getState().setList([]);
  api.get = async () => ({ data: { conversations: [] } });
  api.post = async () => ({ data: {} });
});

test("a created event and HTTP response produce one sidebar entry", () => {
  store.getState().upsertConversation(second);
  store.getState().upsertConversation(second);
  assert.equal(store.getState().conversations.length, 1);
});

test("a recipient gets the new conversation without switching the open chat", () => {
  store.setState({ conversations: [first], activeId: first._id });
  store.getState().upsertConversation(second);
  assert.equal(store.getState().activeId, first._id);
  assert.equal(store.getState().conversations.length, 2);
});

test("metadata updates preserve unread badges", () => {
  store.setState({ conversations: [first] });
  store.getState().upsertConversation({ ...first, unreadCount: undefined, name: "Updated" });
  assert.equal(store.getState().conversations[0].unreadCount, 3);
});

test("starting a conversation opens it without sending an automatic read receipt", async () => {
  const requests = [];
  api.post = async (url, payload) => {
    requests.push({ url, payload });
    return { data: { conversation: second } };
  };
  const payload = { type: "group", name: "Team", memberIds: ["other"] };
  await store.getState().createConversation(payload);
  assert.equal(store.getState().activeId, second._id);
  assert.equal(store.getState().conversations[0].unreadCount, 0);
  assert.deepEqual(requests[0], { url: "/api/conversations", payload });
  assert.equal(requests.length, 1);
});

test("a failed creation preserves the open conversation", async () => {
  store.setState({ conversations: [first], activeId: first._id });
  api.post = async () => { throw new Error("Offline"); };
  await assert.rejects(store.getState().createConversation({ type: "dm" }), /Offline/);
  assert.equal(store.getState().activeId, first._id);
  assert.equal(store.getState().conversations.length, 1);
});

test("a background fetch cannot discard a newly created conversation", async () => {
  let resolve;
  api.get = () => new Promise((done) => { resolve = done; });
  const fetching = store.getState().fetchConversations();
  store.getState().upsertConversation(second);
  resolve({ data: { conversations: [first] } });
  await fetching;
  assert.deepEqual(store.getState().conversations.map((c) => c._id), ["second", "first"]);
});

test("a background fetch preserves unread changes from live messages", async () => {
  store.setState({ conversations: [first] });
  let resolve;
  api.get = () => new Promise((done) => { resolve = done; });
  const fetching = store.getState().fetchConversations();
  store.getState().bumpUnread(first._id);
  resolve({ data: { conversations: [{ ...first, unreadCount: 0 }] } });
  await fetching;
  assert.equal(store.getState().conversations[0].unreadCount, 4);
});

test("an older fetch cannot overwrite a newer response", async () => {
  const pending = [];
  api.get = () => new Promise((resolve) => pending.push(resolve));
  const older = store.getState().fetchConversations();
  const newer = store.getState().fetchConversations();
  pending[1]({ data: { conversations: [second] } });
  await newer;
  pending[0]({ data: { conversations: [first] } });
  await older;
  assert.deepEqual(store.getState().conversations.map((c) => c._id), ["second"]);
});

test("reset clears the sidebar and invalidates in-flight requests", async () => {
  store.setState({ conversations: [first], activeId: first._id });
  let resolve;
  api.get = () => new Promise((done) => { resolve = done; });
  const fetching = store.getState().fetchConversations();
  store.getState().reset();
  resolve({ data: { conversations: [first] } });
  await fetching;
  assert.equal(store.getState().activeId, null);
  assert.deepEqual(store.getState().conversations, []);
});

test("presence for new members merges without clearing unrelated contacts", () => {
  presence.getState().setList(["old-contact", "new-offline"]);
  presence.getState().mergeSnapshot(["new-online", "new-offline"], ["new-online"]);
  assert.deepEqual(presence.getState().online, { "old-contact": true, "new-online": true });
});

test("removing the active conversation clears selection and blocks stale events", () => {
  store.setState({ conversations: [{ ...second, __v: 1 }], activeId: second._id });
  store.getState().removeConversation(second._id, 2);
  store.getState().upsertConversation({ ...second, __v: 1 });
  assert.equal(store.getState().activeId, null);
  assert.deepEqual(store.getState().conversations, []);
  assert.match(store.getState().notice, /access/);
});

test("an in-flight list response cannot resurrect a removed conversation", async () => {
  store.setState({ conversations: [{ ...second, __v: 1 }] });
  let resolve;
  api.get = () => new Promise((done) => { resolve = done; });
  const fetching = store.getState().fetchConversations();
  store.getState().removeConversation(second._id, 2);
  resolve({ data: { conversations: [{ ...second, __v: 1 }] } });
  await fetching;
  assert.deepEqual(store.getState().conversations, []);
});

test("a newer re-add permits access while delayed removal events are ignored", () => {
  store.getState().removeConversation(second._id, 2);
  store.getState().upsertConversation({ ...second, __v: 3 });
  store.getState().removeConversation(second._id, 2);
  assert.equal(store.getState().conversations.length, 1);
  assert.equal(store.getState().conversations[0].__v, 3);
});

test("older membership updates cannot undo newer admin changes", () => {
  store.getState().upsertConversation({ ...second, __v: 3, adminIds: ["successor"] });
  store.getState().upsertConversation({ ...second, __v: 2, adminIds: ["old-admin"] });
  assert.deepEqual(store.getState().conversations[0].adminIds, ["successor"]);
});

test("leaving removes the conversation even without a socket notification", async () => {
  store.setState({ conversations: [second], activeId: second._id });
  api.post = async () => ({ data: { removed: true, conversationId: second._id, version: 1 } });
  await store.getState().leaveConversation(second._id);
  assert.equal(store.getState().activeId, null);
  assert.deepEqual(store.getState().conversations, []);
});

test("membership requests use the correct REST routes and apply updated members", async () => {
  const requests = [];
  for (const method of ["post", "patch", "delete"]) {
    api[method] = async (url, payload) => {
      requests.push({ method, url, payload });
      return { data: { conversation: { ...second, __v: requests.length } } };
    };
  }
  await store.getState().addMembers(second._id, ["new-person"]);
  await store.getState().changeMemberRole(second._id, "new-person", "admin");
  await store.getState().removeMember(second._id, "new-person");
  assert.deepEqual(requests.map((r) => [r.method, r.url]), [
    ["post", "/api/conversations/second/members"],
    ["patch", "/api/conversations/second/members/new-person/role"],
    ["delete", "/api/conversations/second/members/new-person"],
  ]);
  assert.deepEqual(requests[0].payload, { memberIds: ["new-person"] });
  assert.equal(store.getState().conversations[0].__v, 3);
});

test("opening a conversation does not clear unread messages before viewing them", () => {
  store.setState({ conversations: [first] });
  store.getState().setActive(first._id);
  assert.equal(store.getState().conversations[0].unreadCount, 3);
});

test("refreshing an active conversation preserves server unread counts until a visible read acknowledgement", async () => {
  store.setState({ conversations: [first], activeId: first._id });
  api.get = async () => ({ data: { conversations: [{ ...first, unreadCount: 4 }] } });
  await store.getState().fetchConversations();
  assert.equal(store.getState().conversations[0].unreadCount, 4);
  store.getState().setUnread(first._id, 1);
  assert.equal(store.getState().conversations[0].unreadCount, 1);
});
