import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useConversationStore } from "../store/conversationStore";
import { useMessageStore } from "../store/messageStore";
import { usePresenceStore } from "../store/presenceStore";
import { useTypingStore } from "../store/typingStore";
import { useReceiptStore } from "../store/receiptStore";
import { connectSocket, disconnectSocket } from "../socket/socket";
import Sidebar from "../components/Sidebar";
import ChatArea from "../components/ChatArea";
import ConnectionBanner from "../components/ConnectionBanner";

// Runs every time the socket connects (the first time and after each reconnect)
async function onSocketConnect() {
  const token = useAuthStore.getState().token;
  await useConversationStore.getState().fetchConversations();
  if (token !== useAuthStore.getState().token) return;
  await Promise.all([
    useMessageStore.getState().syncAfterReconnect(),
    useReceiptStore.getState().syncAfterReconnect(useConversationStore.getState().conversations),
  ]);
}

// Runs for every new message the server pushes to me
function onNewMessage(m) {
  if (!useConversationStore.getState().conversations.some((c) => c._id === m.conversationId)) return;
  useMessageStore.getState().receiveMessage(m);

  const senderId = m.senderId?._id;
  if (senderId) useTypingStore.getState().clearTyping(m.conversationId, senderId);

  // Unread badges: only for messages from other people
  const myId = useAuthStore.getState().user?.id;
  if (senderId && senderId !== myId) {
    useConversationStore.getState().bumpUnread(m.conversationId);
    useReceiptStore.getState().markDelivered(m.conversationId, m._id);
  }
}

function onConversationCreated(conversation) {
  useConversationStore.getState().upsertConversation(conversation);
  useReceiptStore.getState().fetchReceipts(conversation._id);
}

function onConversationRemoved(payload) {
  useConversationStore.getState().removeConversation(payload.conversationId, payload.version,
    payload.reason === "left" ? "You left the conversation." : "You were removed from the conversation.");
}

function onPresenceSnapshot(snapshot) {
  usePresenceStore.getState().mergeSnapshot(snapshot.memberIds, snapshot.onlineIds);
}

function onReceipt(receipt) {
  if (useConversationStore.getState().conversations.some((c) => c._id === receipt.conversationId)) {
    useReceiptStore.getState().mergeReceipt(receipt);
  }
}

function onReactions(reaction) {
  if (useConversationStore.getState().conversations.some((c) => c._id === reaction.conversationId)) {
    useMessageStore.getState().updateReactions(reaction);
  }
}

// A message was edited or deleted
function onUpdatedMessage(m) {
  useMessageStore.getState().updateMessage(m);
}

export default function Chat() {
  const navigate = useNavigate();
  const { token, setSession, logout } = useAuthStore();
  const { conversations, activeId, fetchConversations, notice, dismissNotice } = useConversationStore();

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    const unsubscribe = useConversationStore.subscribe((state, previous) => {
      const remaining = new Set(state.conversations.map((c) => c._id));
      previous.conversations.forEach((c) => {
        if (!remaining.has(c._id)) {
          useMessageStore.getState().forgetConversation(c._id);
          useTypingStore.getState().forgetConversation(c._id);
          useReceiptStore.getState().forgetConversation(c._id);
        }
      });
    });
    const unsubscribeMessages = useMessageStore.subscribe((state, previous) => {
      const receiptStore = useReceiptStore.getState();
      if (!receiptStore.userId) return;
      for (const [id, conversation] of Object.entries(state.byConversation)) {
        if (conversation.messages === previous.byConversation[id]?.messages) continue;
        const latest = conversation.messages.reduce((newest, m) =>
          m.status === "sent" && m.senderId?._id !== receiptStore.userId && (!newest || m._id > newest) ? m._id : newest, null);
        if (latest) receiptStore.markDelivered(id, latest);
      }
    });
    const unsubscribeReceipts = useReceiptStore.subscribe((state, previous) => {
      if (!state.userId) return;
      for (const [id, conversation] of Object.entries(state.byConversation)) {
        const own = conversation.byUser[state.userId];
        const before = previous.byConversation[id]?.byUser[state.userId];
        if (own?.lastReadMessageId && own.lastReadMessageId > (before?.lastReadMessageId || "") &&
            typeof own.unreadCount === "number") {
          useConversationStore.getState().setUnread(id, own.unreadCount);
        }
      }
    });
    let cancelled = false;
    let socket;
    const onPresenceList = (ids) => usePresenceStore.getState().setList(ids);
    const onPresenceUpdate = (p) => usePresenceStore.getState().setOne(p.userId, p.online);
    const onTyping = (t) => {
      if (useConversationStore.getState().conversations.some((c) => c._id === t.conversationId)) {
        useTypingStore.getState().setTyping(t.conversationId, t.userId, t.name);
      }
    };

    api
      .get("/api/auth/me")
      .then((res) => {
        if (cancelled) return;
        setSession(token, res.data.user);
        useReceiptStore.getState().setUser(res.data.user.id);
        fetchConversations();
        socket = connectSocket(token);

        socket.on("message:new", onNewMessage);
        socket.on("message:updated", onUpdatedMessage);
        socket.on("message:reactions", onReactions);
        socket.on("receipt:delivered", onReceipt);
        socket.on("receipt:read", onReceipt);
        socket.on("conversation:created", onConversationCreated);
        socket.on("conversation:updated", onConversationCreated);
        socket.on("conversation:removed", onConversationRemoved);
        socket.on("presence:snapshot", onPresenceSnapshot);
        socket.on("presence:list", onPresenceList);
        socket.on("presence:update", onPresenceUpdate);
        socket.on("typing", onTyping);
        socket.on("connect", onSocketConnect);
        if (socket.connected) onSocketConnect();
      })
      .catch(() => {
        if (cancelled) return;
        logout();
        navigate("/login");
      });
    return () => {
      cancelled = true;
      useConversationStore.getState().reset();
      unsubscribe();
      unsubscribeMessages();
      unsubscribeReceipts();
      useReceiptStore.getState().reset();
      useMessageStore.setState({ byConversation: {} });
      usePresenceStore.getState().setList([]);
      useTypingStore.setState({ typing: {} });
      if (!socket) return;
      socket.off("message:new", onNewMessage);
      socket.off("message:updated", onUpdatedMessage);
      socket.off("message:reactions", onReactions);
      socket.off("receipt:delivered", onReceipt);
      socket.off("receipt:read", onReceipt);
      socket.off("conversation:created", onConversationCreated);
      socket.off("conversation:updated", onConversationCreated);
      socket.off("conversation:removed", onConversationRemoved);
      socket.off("presence:snapshot", onPresenceSnapshot);
      socket.off("presence:list", onPresenceList);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("typing", onTyping);
      socket.off("connect", onSocketConnect);
      disconnectSocket();
    };
  }, [token, setSession, fetchConversations, logout, navigate]);

  function handleLogout() {
    disconnectSocket();
    logout();
    navigate("/login");
  }

  const active = conversations.find((c) => c._id === activeId);

  return (
    <div className="flex h-screen">
      <Sidebar onLogout={handleLogout} />
      <main className="flex min-w-0 flex-1 flex-col bg-cream">
        <ConnectionBanner />
        {notice && (
          <div role="status" className="flex items-center justify-between gap-3 border-b border-line bg-sidebar px-6 py-2 text-sm">
            <span>{notice}</span>
            <button onClick={dismissNotice} className="text-xs font-medium text-primary">Dismiss</button>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {active ? (
            <ChatArea key={active._id} conversation={active} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted">Select a conversation</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}