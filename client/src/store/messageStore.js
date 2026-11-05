import { create } from "zustand";
import { api } from "../api/client";
import { getSocket } from "../socket/socket";
import { mergeReactionUpdate, mergeSavedMessage } from "../utils/messages.js";
import { validMessageId } from "../utils/receipts.js";

const epochs = new Map();
const epoch = (id) => epochs.get(id) || 0;

const empty = {
  messages: [],
  nextCursor: null,
  loading: false,
  loadingOlder: false,
  loaded: false,
  error: "",
};

// Small helper: change the data of one conversation
function patch(set, id, change) {
  set((s) => ({
    byConversation: {
      ...s.byConversation,
      [id]: change(s.byConversation[id] || empty),
    },
  }));
}

// Change the status of one message that is not saved yet
function setStatus(set, conversationId, clientId, status) {
  patch(set, conversationId, (c) => ({
    ...c,
    messages: c.messages.map((m) =>
      m.clientId === clientId && m.status !== "sent" ? { ...m, status } : m
    ),
  }));
}

// Send one message through the socket. If we are offline, it simply stays
// "pending" and is sent again when the connection comes back.
function deliver(get, set, conversationId, message) {
  const started = epoch(conversationId);
  const socket = getSocket();
  if (!socket || !socket.connected) return;

  socket.timeout(8000).emit(
    "message:send",
    {
      conversationId,
      body: message.body,
      clientId: message.clientId,
      attachments: message.attachments || [],
    },
    (err, res) => {
      if (started !== epoch(conversationId)) return;
      if (err || !res?.ok) {
        setStatus(set, conversationId, message.clientId, "failed");
        return;
      }
      get().receiveMessage(res.message);
    }
  );
}

// Ask the server to do something and wait for its answer: { ok, message?, error? }
function request(event, payload) {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket || !socket.connected) {
      resolve({ ok: false, error: "You're offline. Try again when you're back online." });
      return;
    }
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err || !res) {
        resolve({ ok: false, error: "No answer from the server. Please try again." });
        return;
      }
      resolve(res);
    });
  });
}

// The _id of the newest message that is saved on the server
function lastSavedId(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].status === "sent") return messages[i]._id;
  }
  return null;
}

// Fetch whatever this conversation missed while we were offline
async function syncOne(get, conversationId) {
  const started = epoch(conversationId);
  const c = get().byConversation[conversationId];
  if (!c || !c.loaded) return; // never opened: it will load fresh when opened

  try {
    let after = lastSavedId(c.messages);
    for (let round = 0; round < 10; round++) {
      const params = after ? { after, limit: 100 } : { limit: 30 };
      const res = await api.get(`/api/conversations/${conversationId}/messages`, { params });

      if (started !== epoch(conversationId)) return;
      // "after" answers oldest first, the normal list answers newest first
      const list = after ? res.data.messages : [...res.data.messages].reverse();
      list.forEach((m) => get().receiveMessage(m));

      if (!after || !res.data.hasMoreNewer || list.length === 0) break;
      after = list[list.length - 1]._id;
    }
  } catch {
    // ignore: the next reconnect will try again
  }
}

async function syncReactions(get, conversationId) {
  const started = epoch(conversationId);
  const c = get().byConversation[conversationId];
  if (!c?.loaded) return;
  const ids = c.messages.filter((m) => m.status === "sent" && validMessageId(m._id)).map((m) => m._id);
  try {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const res = await api.get("/api/conversations/" + conversationId + "/messages/reactions", {
        params: { ids: ids.slice(offset, offset + 100).join(",") },
      });
      if (started !== epoch(conversationId)) return;
      res.data.reactions.forEach((update) => get().updateReactions(update));
    }
  } catch {
    // A later reconnect or history reload retries the snapshot.
  }
}

export const useMessageStore = create((set, get) => ({
  byConversation: {},

  forgetConversation: (conversationId) => {
    epochs.set(conversationId, epoch(conversationId) + 1);
    set((s) => {
      const byConversation = { ...s.byConversation };
      delete byConversation[conversationId];
      return { byConversation };
    });
  },

  fetchMessages: async (conversationId) => {
    const started = epoch(conversationId);
    const current = get().byConversation[conversationId];
    if (current?.loaded || current?.loading) return;

    patch(set, conversationId, (c) => ({ ...c, loading: true, error: "" }));
    try {
      const res = await api.get(`/api/conversations/${conversationId}/messages`);
      if (started !== epoch(conversationId)) return;
      // The API sends newest first, the screen needs oldest first
      const messages = [...res.data.messages].reverse();
      patch(set, conversationId, (c) => {
        const existing = new Map(c.messages.map((m) => [m._id, m]));
        const ids = new Set(messages.map((m) => m._id));
        const clients = new Set(messages.map((m) => m.clientId).filter(Boolean));
        const merged = messages.map((m) => mergeSavedMessage(existing.get(m._id) ||
          c.messages.find((current) => current.clientId && current.clientId === m.clientId), m));
        const extra = c.messages.filter((m) => !ids.has(m._id) && (!m.clientId || !clients.has(m.clientId)));
        return {
          ...empty,
          messages: [...merged, ...extra].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)),
          nextCursor: res.data.nextCursor, loaded: true,
        };
      });
      // Recover reaction events for history IDs that were not cached when the event arrived.
      await syncReactions(get, conversationId);
    } catch (err) {
      if (started !== epoch(conversationId)) return;
      patch(set, conversationId, (c) => ({
        ...c,
        loading: false,
        error: err.response?.data?.message || "Could not load messages",
      }));
    }
  },

  // Load the next 30 older messages and put them above the current ones
  loadOlder: async (conversationId) => {
    const started = epoch(conversationId);
    const current = get().byConversation[conversationId];
    if (!current || !current.nextCursor || current.loadingOlder) return;

    patch(set, conversationId, (c) => ({ ...c, loadingOlder: true }));
    try {
      const res = await api.get(`/api/conversations/${conversationId}/messages`, {
        params: { before: current.nextCursor },
      });
      if (started !== epoch(conversationId)) return;
      const older = res.data.messages.reverse().map((m) => ({ ...m, status: "sent" }));
      patch(set, conversationId, (c) => {
        const have = new Set(c.messages.map((m) => m._id));
        return {
          ...c,
          messages: [...older.filter((m) => !have.has(m._id)), ...c.messages.map((m) => {
            const incoming = older.find((item) => item._id === m._id);
            return incoming ? mergeSavedMessage(m, incoming) : m;
          })],
          nextCursor: res.data.nextCursor,
          loadingOlder: false,
        };
      });
      await syncReactions(get, conversationId);
    } catch {
      if (started !== epoch(conversationId)) return;
      patch(set, conversationId, (c) => ({ ...c, loadingOlder: false }));
    }
  },

  // A message arrived from the server (from me or from someone else)
  receiveMessage: (message) => {
    patch(set, message.conversationId, (c) => {
      if (c.messages.some((m) => m._id === message._id)) {
        return { ...c, messages: c.messages.map((m) => m._id === message._id ? mergeSavedMessage(m, message) : m) };
      }

      // Is it my own unsent message coming back? Replace it.
      const index = c.messages.findIndex(
        (m) => m.clientId && m.clientId === message.clientId
      );
      const final = mergeSavedMessage(index >= 0 ? c.messages[index] : null, message);
      if (index >= 0) {
        const copy = [...c.messages];
        copy[index] = final;
        return { ...c, messages: copy };
      }

      return { ...c, messages: [...c.messages, final] };
    });
  },

  // A message I already have was edited or deleted
  updateMessage: (message) => {
    if (!get().byConversation[message.conversationId]) return;
    patch(set, message.conversationId, (c) => ({
      ...c,
      messages: c.messages.map((m) => {
        if (m._id !== message._id) return m;
        return mergeSavedMessage(m, message);
      }),
    }));
  },

  updateReactions: (update) => {
    if (!get().byConversation[update.conversationId]) return;
    patch(set, update.conversationId, (c) => ({
      ...c, messages: c.messages.map((m) => m._id === update.messageId ? mergeReactionUpdate(m, update) : m),
    }));
  },

  setReaction: async (conversationId, messageId, emoji, active) => {
    const started = epoch(conversationId);
    const res = await request("message:react", { conversationId, messageId, emoji, active });
    if (started !== epoch(conversationId)) return { ok: false, error: "This conversation is no longer available." };
    if (res.ok) get().updateReactions(res.reaction);
    return res;
  },

  editMessage: async (messageId, body) => {
    const res = await request("message:edit", { messageId, body });
    if (res.ok) get().updateMessage(res.message);
    return res;
  },

  deleteMessage: async (messageId) => {
    const res = await request("message:delete", { messageId });
    if (res.ok) get().updateMessage(res.message);
    return res;
  },

  sendMessage: (conversationId, body, user, attachments = []) => {
    const clientId = crypto.randomUUID();

    // Show the message immediately as "pending"
    const pending = {
      _id: clientId,
      clientId,
      conversationId,
      body,
      attachments,
      createdAt: new Date().toISOString(),
      senderId: { _id: user.id, name: user.name },
      status: "pending",
    };
    patch(set, conversationId, (c) => ({ ...c, messages: [...c.messages, pending] }));

    deliver(get, set, conversationId, pending);
  },

  // The "Retry" button on a failed message
  retryMessage: (conversationId, clientId) => {
    const c = get().byConversation[conversationId];
    const message = c?.messages.find((m) => m.clientId === clientId && m.status === "failed");
    if (!message) return;

    setStatus(set, conversationId, clientId, "pending");
    deliver(get, set, conversationId, message);
  },

  // Send again everything that never got confirmed
  resendUnsent: () => {
    const all = get().byConversation;
    Object.entries(all).forEach(([conversationId, c]) => {
      const unsent = c.messages.filter((m) => m.status === "pending" || m.status === "failed");
      unsent.forEach((m) => {
        setStatus(set, conversationId, m.clientId, "pending");
        deliver(get, set, conversationId, m);
      });
    });
  },

  // Called every time the socket connects
  syncAfterReconnect: async () => {
    const ids = Object.keys(get().byConversation);
    await Promise.all(ids.map(async (id) => {
      await syncOne(get, id);
      await syncReactions(get, id);
    }));
    get().resendUnsent();
  },
}));