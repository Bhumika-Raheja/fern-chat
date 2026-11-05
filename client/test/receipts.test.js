import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, test } from "node:test";
import { receiptSummary, canMarkRead, newestVisibleMessage } from "../src/utils/receipts.js";

const api = {};
globalThis.__fernReceiptApi = api;
globalThis.__fernReceiptSocket = null;
const storeUrl = new URL("../src/store/receiptStore.js", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === storeUrl && ["../api/client", "../socket/socket"].includes(specifier)) {
      const source = specifier === "../api/client"
        ? "export const api = globalThis.__fernReceiptApi;"
        : "export const getSocket = () => globalThis.__fernReceiptSocket;";
      return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { useReceiptStore: store } = await import(storeUrl);
const ids = ["607f1f77bcf86cd799439011", "607f1f77bcf86cd799439012", "607f1f77bcf86cd799439013"];
const conversationId = "conversation";
const own = "recipient";
const message = { _id: ids[1], conversationId, senderId: { _id: "sender" }, status: "sent" };
const receipt = (changes = {}) => ({
  conversationId, userId: own, user: { _id: own, name: "Recipient" },
  lastDeliveredMessageId: null, lastReadMessageId: null, ...changes,
});
let calls;

beforeEach(() => {
  store.getState().reset();
  store.getState().setUser(own);
  calls = [];
  globalThis.__fernReceiptSocket = { connected: false, timeout: () => ({
    emit: (event, payload, ack) => calls.push({ event, payload, ack }),
  }) };
  api.get = async () => ({ data: { receipts: [], messages: [] } });
});
afterEach(() => store.getState().reset());

test("a sender's own acknowledgements never count as recipient delivery", () => {
  const receipts = { sender: receipt({ userId: "sender", lastDeliveredMessageId: ids[2], lastReadMessageId: ids[2] }) };
  assert.equal(receiptSummary(message, receipts).status, "sent");
});

test("delivery and reading are distinct states", () => {
  assert.equal(receiptSummary(message).status, "sent");
  assert.equal(receiptSummary(message, { own: receipt({ lastDeliveredMessageId: ids[1] }) }).status, "delivered");
  assert.equal(receiptSummary(message, { own: receipt({ lastReadMessageId: ids[1] }) }).status, "read");
});

test("group receipts identify everyone who read a message and exclude its sender", () => {
  const result = receiptSummary(message, {
    own: receipt({ lastReadMessageId: ids[2] }),
    another: receipt({ userId: "another", user: { name: "Another" }, lastReadMessageId: ids[1] }),
    sender: receipt({ userId: "sender", lastReadMessageId: ids[2] }),
  });
  assert.deepEqual(result.readers.map((r) => r.user.name), ["Recipient", "Another"]);
});

test("pending and failed sends are not upgraded by unrelated receipt pointers", () => {
  for (const status of ["pending", "failed"]) {
    assert.equal(receiptSummary({ ...message, status }, { own: receipt({ lastReadMessageId: ids[2] }) }).status, status);
  }
});

test("older receipt snapshots cannot regress newer live receipt events", () => {
  store.getState().mergeReceipt(receipt({ lastDeliveredMessageId: ids[2], lastReadMessageId: ids[2], unreadCount: 0 }));
  store.getState().mergeReceipt(receipt({ lastDeliveredMessageId: ids[0], lastReadMessageId: ids[0], unreadCount: 5 }));
  const current = store.getState().byConversation[conversationId].byUser[own];
  assert.equal(current.lastReadMessageId, ids[2]);
  assert.equal(current.lastDeliveredMessageId, ids[2]);
  assert.equal(current.unreadCount, 0);
});

test("a delivery acknowledgement never creates a read receipt", () => {
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().markDelivered(conversationId, ids[1]);
  assert.equal(calls[0].event, "message:delivered");
  calls[0].ack(null, { ok: true, receipt: receipt({ lastDeliveredMessageId: ids[1] }) });
  assert.equal(store.getState().byConversation[conversationId].byUser[own].lastReadMessageId, null);
});

test("offline acknowledgements are queued and sent after reconnect", () => {
  store.getState().markRead(conversationId, ids[1]);
  assert.equal(calls.length, 0);
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().flushPending();
  assert.equal(calls[0].event, "message:read");
  assert.equal(calls[0].payload.messageId, ids[1]);
  calls[0].ack(null, { ok: true, receipt: receipt({ lastReadMessageId: ids[1] }) });
  store.getState().flushPending();
  assert.equal(calls.length, 1);
});

test("read requests coalesce while an older acknowledgement is in flight", () => {
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().markRead(conversationId, ids[0]);
  store.getState().markRead(conversationId, ids[2]);
  assert.equal(calls.length, 1);
  calls[0].ack(null, { ok: true, receipt: receipt({ lastReadMessageId: ids[0] }) });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].payload.messageId, ids[2]);
  calls[1].ack(null, { ok: true, receipt: receipt({ lastReadMessageId: ids[2] }) });
});

test("already confirmed watermarks do not generate duplicate writes", () => {
  store.getState().mergeReceipt(receipt({ lastReadMessageId: ids[2] }));
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().markRead(conversationId, ids[1]);
  store.getState().markDelivered(conversationId, ids[1]);
  assert.equal(calls.length, 0);
});

test("invalid local message IDs do not generate receipt events", () => {
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().markRead(conversationId, "pending-uuid");
  store.getState().markDelivered(conversationId, undefined);
  assert.equal(calls.length, 0);
});

test("removal invalidates receipt snapshots already in flight", async () => {
  let resolve;
  api.get = () => new Promise((done) => { resolve = done; });
  const fetching = store.getState().fetchReceipts(conversationId);
  store.getState().forgetConversation(conversationId);
  resolve({ data: { receipts: [receipt({ lastReadMessageId: ids[2] })] } });
  await fetching;
  assert.equal(store.getState().byConversation[conversationId], undefined);
});

test("late receipt acknowledgements cannot restore a removed conversation", () => {
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().markRead(conversationId, ids[1]);
  store.getState().forgetConversation(conversationId);
  calls[0].ack(null, { ok: true, receipt: receipt({ lastReadMessageId: ids[1] }) });
  assert.equal(store.getState().byConversation[conversationId], undefined);
});

test("changing accounts discards the previous account's acknowledgements", () => {
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().markRead(conversationId, ids[1]);
  store.getState().setUser("new-account");
  calls[0].ack(null, { ok: true, receipt: receipt({ lastReadMessageId: ids[1] }) });
  assert.deepEqual(store.getState().byConversation, {});
});

test("refresh restores persisted receipts without inventing new read acknowledgements", async () => {
  api.get = async () => ({ data: { receipts: [receipt({ lastReadMessageId: ids[2], lastDeliveredMessageId: ids[2] })] } });
  globalThis.__fernReceiptSocket.connected = true;
  await store.getState().syncAfterReconnect([{ _id: conversationId, unreadCount: 0 }]);
  assert.equal(receiptSummary(message, store.getState().byConversation[conversationId].byUser).status, "read");
  assert.equal(calls.length, 0);
});

test("reconnecting receives unread history and acknowledges delivery without reading", async () => {
  api.get = async (url) => ({ data: url.endsWith("/receipts") ? { receipts: [] } : { messages: [message] } });
  globalThis.__fernReceiptSocket.connected = true;
  await store.getState().syncAfterReconnect([{ _id: conversationId, unreadCount: 1 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, "message:delivered");
  calls[0].ack(null, { ok: true, receipt: receipt({ lastDeliveredMessageId: ids[1] }) });
});

test("rejected receipts are discarded rather than retried indefinitely", () => {
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().markRead(conversationId, ids[1]);
  calls[0].ack(null, { ok: false, status: 404 });
  store.getState().flushPending();
  assert.equal(calls.length, 1);
});

test("transport timeouts preserve acknowledgements for the next reconnect", () => {
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().markDelivered(conversationId, ids[1]);
  globalThis.__fernReceiptSocket.connected = false;
  calls[0].ack(new Error("offline"));
  globalThis.__fernReceiptSocket.connected = true;
  store.getState().flushPending();
  assert.equal(calls.length, 2);
  calls[1].ack(null, { ok: true, receipt: receipt({ lastDeliveredMessageId: ids[1] }) });
});

test("background tabs, unfocused windows, and open dialogs do not count as viewing", () => {
  assert.equal(canMarkRead({ visibilityState: "hidden", hasFocus: () => true }), false);
  assert.equal(canMarkRead({ visibilityState: "visible", hasFocus: () => false }), false);
  assert.equal(canMarkRead({ visibilityState: "visible", hasFocus: () => true, querySelector: () => ({}) }), false);
  assert.equal(canMarkRead({ visibilityState: "visible", hasFocus: () => true, querySelector: () => null }), true);
});

test("only messages visible in the message viewport advance the read watermark", () => {
  const rect = (top, bottom) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top });
  const viewport = { top: 100, bottom: 500, left: 0, right: 100 };
  const items = [
    { id: ids[0], rect: rect(120, 160) },
    { id: ids[1], rect: rect(200, 240) },
    { id: ids[2], rect: rect(501, 550) },
  ];
  assert.equal(newestVisibleMessage(items, viewport), ids[1]);
  assert.equal(newestVisibleMessage([{ id: ids[2], rect: rect(499, 550) }], viewport), null);
  assert.equal(newestVisibleMessage([{ id: ids[0], rect: rect(0, 1000) }], viewport), ids[0]);
});

test("a newer snapshot cannot reuse an unread count from an older read pointer", () => {
  store.getState().mergeReceipt(receipt({ lastReadMessageId: ids[0], unreadCount: 5 }));
  store.getState().mergeReceipt(receipt({ lastReadMessageId: ids[2] }));
  const current = store.getState().byConversation[conversationId].byUser[own];
  assert.equal(current.lastReadMessageId, ids[2]);
  assert.equal(current.unreadCount, undefined);
});
