import { create } from "zustand";
import { api } from "../api/client";

let fetchVersion = 0;
const removedVersions = new Map();
const revision = (conversation) => conversation?.__v ?? 0;
const byRecent = (a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);

function available(conversation) {
  const removed = removedVersions.get(conversation._id);
  if (removed === undefined) return true;
  if (revision(conversation) <= removed) return false;
  removedVersions.delete(conversation._id);
  return true;
}

async function membershipRequest(get, method, id, suffix, payload) {
  const res = await api[method]("/api/conversations/" + id + suffix, payload);
  if (res.data.removed) {
    get().removeConversation(id, res.data.version, "You left the conversation.");
  } else {
    get().upsertConversation(res.data.conversation);
  }
  return res.data;
}

export const useConversationStore = create((set, get) => ({
  conversations: [],
  activeId: null,
  loading: false,
  error: "",
  notice: "",

  fetchConversations: async () => {
    const version = ++fetchVersion;
    const before = new Map(get().conversations.map((c) => [c._id, c]));
    set({ loading: true, error: "" });
    try {
      const res = await api.get("/api/conversations");
      if (version !== fetchVersion) return;
      set((s) => {
        const current = new Map(s.conversations.map((c) => [c._id, c]));
        const fetched = res.data.conversations.filter(available);
        const fetchedIds = new Set(fetched.map((c) => c._id));
        const conversations = fetched.map((c) => {
          const live = current.get(c._id);
          const preserve = live && (revision(live) > revision(c) ||
            (revision(live) === revision(c) && live !== before.get(c._id)));
          const merged = preserve ? { ...c, ...live } : c;
          return merged;
        });
        const added = s.conversations.filter((c) => !fetchedIds.has(c._id) && !before.has(c._id));
        const all = [...added, ...conversations].sort(byRecent);
        return {
          conversations: all, loading: false,
          activeId: all.some((c) => c._id === s.activeId) ? s.activeId : null,
        };
      });
    } catch (err) {
      if (version !== fetchVersion) return;
      set({ error: err.response?.data?.message || "Could not load conversations", loading: false });
    }
  },

  upsertConversation: (conversation) => {
    if (!available(conversation)) return;
    set((s) => {
      const previous = s.conversations.find((c) => c._id === conversation._id);
      if (previous && revision(previous) > revision(conversation)) return s;
      const merged = {
        ...previous, ...conversation,
        unreadCount: previous?.unreadCount ?? conversation.unreadCount ?? 0,
      };
      return { conversations: [
        merged, ...s.conversations.filter((c) => c._id !== conversation._id),
      ].sort(byRecent) };
    });
  },

  removeConversation: (id, version, notice = "You no longer have access to this conversation.") => {
    const previous = get().conversations.find((c) => c._id === id);
    const removed = version ?? revision(previous);
    if (previous && revision(previous) > removed) return;
    if ((removedVersions.get(id) ?? -1) > removed) return;
    removedVersions.set(id, removed);
    fetchVersion++;
    set((s) => ({
      conversations: s.conversations.filter((c) => c._id !== id),
      activeId: s.activeId === id ? null : s.activeId,
      loading: false, notice,
    }));
  },

  createConversation: async (payload) => {
    const res = await api.post("/api/conversations", payload);
    const conversation = res.data.conversation;
    get().upsertConversation(conversation);
    get().setActive(conversation._id);
    return conversation;
  },

  addMembers: (id, memberIds) => membershipRequest(get, "post", id, "/members", { memberIds }),
  removeMember: (id, userId) => membershipRequest(get, "delete", id, "/members/" + userId),
  changeMemberRole: (id, userId, role) =>
    membershipRequest(get, "patch", id, "/members/" + userId + "/role", { role }),
  leaveConversation: (id) => membershipRequest(get, "post", id, "/leave"),

  setActive: (id) => {
    if (!get().conversations.some((c) => c._id === id)) return;
    set({ activeId: id, notice: "" });
  },

  setUnread: (id, unreadCount) => set((s) => ({
    conversations: s.conversations.map((c) => c._id === id ? { ...c, unreadCount } : c),
  })),
  bumpUnread: (id) => set((s) => ({
    conversations: s.conversations.map((c) =>
      c._id === id ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
    ),
  })),
  dismissNotice: () => set({ notice: "" }),
  reset: () => {
    fetchVersion++;
    removedVersions.clear();
    set({ conversations: [], activeId: null, loading: false, error: "", notice: "" });
  },
}));
