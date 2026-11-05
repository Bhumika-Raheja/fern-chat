import { create } from "zustand";
import { api } from "../api/client";
import { getSocket } from "../socket/socket";
import { maxMessageId, validMessageId } from "../utils/receipts.js";

const pending = new Map();
const flights = new Map();
const retries = new Map();
const epochs = new Map();
let session = 0;
const marker = (id) => session + ":" + (epochs.get(id) || 0);

function queue(get, conversationId, messageId, kind) {
  if (!get().userId || !validMessageId(messageId)) return;
  const own = get().byConversation[conversationId]?.byUser[get().userId];
  const known = kind === "read" ? own?.lastReadMessageId : own?.lastDeliveredMessageId;
  if (known && known >= messageId) return;
  const key = conversationId + ":" + kind;
  const before = pending.get(key);
  pending.set(key, { conversationId, kind, messageId: maxMessageId(before?.messageId, messageId) });
  flush(get, key);
}

function flush(get, key) {
  const item = pending.get(key);
  const socket = getSocket();
  if (!item || flights.has(key) || !socket?.connected || !get().userId) return;
  const token = {};
  const started = marker(item.conversationId);
  flights.set(key, token);
  clearTimeout(retries.get(key));
  retries.delete(key);
  socket.timeout(8000).emit("message:" + item.kind, {
    conversationId: item.conversationId, messageId: item.messageId,
  }, (err, res) => {
    if (flights.get(key) !== token || marker(item.conversationId) !== started) return;
    flights.delete(key);
    if (!err && res?.ok && res.receipt) {
      get().mergeReceipt(res.receipt);
      const confirmed = item.kind === "read"
        ? res.receipt.lastReadMessageId : res.receipt.lastDeliveredMessageId;
      if (confirmed && pending.get(key)?.messageId <= confirmed) pending.delete(key);
      if (pending.has(key)) flush(get, key);
    } else if (!err && res?.status >= 400 && res.status < 500) {
      pending.delete(key);
    } else if (getSocket()?.connected) {
      retries.set(key, setTimeout(() => {
        retries.delete(key);
        flush(get, key);
      }, 2000));
    }
  });
}

export const useReceiptStore = create((set, get) => ({
  userId: null,
  byConversation: {},

  setUser: (userId) => {
    if (get().userId === userId) return;
    get().reset();
    set({ userId });
  },

  mergeReceipt: (receipt) => {
    set((s) => {
      const current = s.byConversation[receipt.conversationId] || { byUser: {} };
      const previous = current.byUser[receipt.userId] || {};
      const lastReadMessageId = maxMessageId(previous.lastReadMessageId, receipt.lastReadMessageId);
      const merged = {
        ...previous, ...receipt,
        user: receipt.user || previous.user,
        lastReadMessageId,
        lastDeliveredMessageId: maxMessageId(
          maxMessageId(previous.lastDeliveredMessageId, receipt.lastDeliveredMessageId), lastReadMessageId),
      };
      // Snapshots carry pointers, not a fresh unread count. Do not attach an
      // older count to a newer pointer learned from another device.
      if (!Object.hasOwn(receipt, "unreadCount") &&
          (receipt.lastReadMessageId || "") > (previous.lastReadMessageId || "")) {
        delete merged.unreadCount;
      }
      if (previous.lastReadMessageId && previous.lastReadMessageId > (receipt.lastReadMessageId || "")) {
        merged.unreadCount = previous.unreadCount;
      }
      return { byConversation: {
        ...s.byConversation,
        [receipt.conversationId]: { ...current, byUser: { ...current.byUser, [receipt.userId]: merged } },
      } };
    });
  },

  markDelivered: (id, messageId) => queue(get, id, messageId, "delivered"),
  markRead: (id, messageId) => queue(get, id, messageId, "read"),
  flushPending: () => { for (const key of pending.keys()) flush(get, key); },

  fetchReceipts: async (id) => {
    const started = marker(id);
    try {
      const res = await api.get("/api/conversations/" + id + "/receipts");
      if (marker(id) !== started) return;
      res.data.receipts.forEach((receipt) => get().mergeReceipt(receipt));
    } catch {
      // A later open/reconnect retries; pending acknowledgements remain queued.
    }
  },

  syncAfterReconnect: async (conversations) => {
    get().flushPending();
    await Promise.allSettled(conversations.map(async (conversation) => {
      const id = conversation._id;
      const started = marker(id);
      await get().fetchReceipts(id);
      if (marker(id) !== started || !conversation.unreadCount) return;
      // Receiving the latest persisted message also acknowledges offline delivery.
      const res = await api.get("/api/conversations/" + id + "/messages", { params: { limit: 1 } });
      if (marker(id) !== started) return;
      const newest = res.data.messages[0];
      if (newest) get().markDelivered(id, newest._id);
    }));
    get().flushPending();
  },

  forgetConversation: (id) => {
    epochs.set(id, (epochs.get(id) || 0) + 1);
    for (const key of pending.keys()) {
      if (key.startsWith(id + ":")) pending.delete(key);
    }
    for (const key of flights.keys()) {
      if (key.startsWith(id + ":")) flights.delete(key);
    }
    for (const [key, timer] of retries) {
      if (key.startsWith(id + ":")) { clearTimeout(timer); retries.delete(key); }
    }
    set((s) => {
      const byConversation = { ...s.byConversation };
      delete byConversation[id];
      return { byConversation };
    });
  },

  reset: () => {
    session++;
    pending.clear();
    flights.clear();
    retries.forEach(clearTimeout);
    retries.clear();
    epochs.clear();
    set({ userId: null, byConversation: {} });
  },
}));
