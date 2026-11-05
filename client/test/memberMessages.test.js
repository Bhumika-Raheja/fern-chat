import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const api = {};
globalThis.__fernMemberMessageApi = api;
globalThis.__fernMemberSocket = null;
const storeUrl = new URL("../src/store/messageStore.js", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === storeUrl && ["../api/client", "../socket/socket"].includes(specifier)) {
      const source = specifier === "../api/client"
        ? "export const api = globalThis.__fernMemberMessageApi;"
        : "export const getSocket = () => globalThis.__fernMemberSocket;";
      return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { useMessageStore: store } = await import(storeUrl);
const { useTypingStore: typing } = await import("../src/store/typingStore.js");
const id = "group";
const message = { _id: "message", conversationId: id, body: "history", status: "sent", senderId: { _id: "other" } };

beforeEach(() => {
  store.getState().forgetConversation(id);
  store.setState({ byConversation: {} });
  typing.getState().forgetConversation(id);
  globalThis.__fernMemberSocket = null;
  api.get = async () => ({ data: { messages: [], nextCursor: null } });
});

test("removal clears loaded and unsent messages", () => {
  store.setState({ byConversation: { [id]: { loaded: true, messages: [message, { ...message, status: "pending" }] } } });
  store.getState().forgetConversation(id);
  assert.equal(store.getState().byConversation[id], undefined);
});

test("history arriving after removal cannot recreate the message cache", async () => {
  let resolve;
  api.get = () => new Promise((done) => { resolve = done; });
  const fetching = store.getState().fetchMessages(id);
  store.getState().forgetConversation(id);
  resolve({ data: { messages: [message] } });
  await fetching;
  assert.equal(store.getState().byConversation[id], undefined);
});

test("history errors arriving after removal cannot recreate the message cache", async () => {
  let reject;
  api.get = () => new Promise((_resolve, fail) => { reject = fail; });
  const fetching = store.getState().fetchMessages(id);
  store.getState().forgetConversation(id);
  reject(new Error("No access"));
  await fetching;
  assert.equal(store.getState().byConversation[id], undefined);
});

test("older history arriving after removal is ignored", async () => {
  store.setState({ byConversation: { [id]: { loaded: true, messages: [message], nextCursor: "before" } } });
  let resolve;
  api.get = () => new Promise((done) => { resolve = done; });
  const fetching = store.getState().loadOlder(id);
  store.getState().forgetConversation(id);
  resolve({ data: { messages: [message] } });
  await fetching;
  assert.equal(store.getState().byConversation[id], undefined);
});

test("reconnect catch-up arriving after removal is ignored", async () => {
  store.setState({ byConversation: { [id]: { loaded: true, messages: [message] } } });
  let resolve;
  api.get = () => new Promise((done) => { resolve = done; });
  const syncing = store.getState().syncAfterReconnect();
  store.getState().forgetConversation(id);
  resolve({ data: { messages: [message] } });
  await syncing;
  assert.equal(store.getState().byConversation[id], undefined);
});

test("late send acknowledgements do not restore removed messages", () => {
  let acknowledge;
  globalThis.__fernMemberSocket = { connected: true, timeout: () => ({
    emit: (_event, _payload, ack) => { acknowledge = ack; },
  }) };
  store.getState().sendMessage(id, "pending", { id: "me", name: "Me" });
  store.getState().forgetConversation(id);
  acknowledge(null, { ok: true, message });
  assert.equal(store.getState().byConversation[id], undefined);
});

test("old history cannot overwrite a fresh load after being re-added", async () => {
  const pending = [];
  api.get = () => new Promise((resolve) => pending.push(resolve));
  const old = store.getState().fetchMessages(id);
  store.getState().forgetConversation(id);
  const fresh = store.getState().fetchMessages(id);
  pending[1]({ data: { messages: [{ ...message, body: "fresh history" }] } });
  await fresh;
  pending[0]({ data: { messages: [message] } });
  await old;
  assert.equal(store.getState().byConversation[id].messages[0].body, "fresh history");
});

test("removal clears typing timers and indicators", () => {
  typing.getState().setTyping(id, "other", "Other");
  typing.getState().forgetConversation(id);
  assert.equal(typing.getState().typing[id], undefined);
});
