import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useConversationStore } from "../store/conversationStore";
import MessageList from "./MessageList";

const sortById = (a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);

// Add new messages and refresh ones we already have (edits, deletes, reactions)
function merge(current, incoming) {
  const map = new Map(current.map((m) => [m._id, m]));
  incoming.forEach((m) => map.set(m._id, { ...m, status: "sent" }));
  return [...map.values()].sort(sortById);
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.500 5.700 12 3z" />
    </svg>
  );
}

export default function ChannelPreview({ channel }) {
  const user = useAuthStore((s) => s.user);
  const joinChannel = useConversationStore((s) => s.joinChannel);
  const setActive = useConversationStore((s) => s.setActive);
  const joined = useConversationStore((s) => s.conversations.some((c) => c._id === channel._id));
  const [state, setState] = useState({
    messages: [], nextCursor: null, loading: true, loadingOlder: false, error: "",
  });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  // First page of history
  useEffect(() => {
    let cancelled = false;
    api.get("/api/channels/" + channel._id + "/messages")
      .then((res) => {
        if (cancelled) return;
        setState({
          messages: merge([], [...res.data.messages].reverse()),
          nextCursor: res.data.nextCursor,
          loading: false, loadingOlder: false, error: "",
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({
          ...s, loading: false,
          error: err.response?.data?.message || "Could not load this channel.",
        }));
      });
    return () => { cancelled = true; };
  }, [channel._id]);

  // A read-only preview is not live, so look for new messages every few seconds
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await api.get("/api/channels/" + channel._id + "/messages", {
          params: { limit: 30 },
        });
        setState((s) => (s.loading ? s
          : { ...s, messages: merge(s.messages, [...res.data.messages].reverse()) }));
      } catch {
        // try again on the next tick
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [channel._id]);

  // If I became a member (for example in another tab), switch to the full chat
  useEffect(() => {
    if (joined) setActive(channel._id);
  }, [joined, channel._id, setActive]);

  async function loadOlder() {
    if (!state.nextCursor || state.loadingOlder) return;
    setState((s) => ({ ...s, loadingOlder: true }));
    try {
      const res = await api.get("/api/channels/" + channel._id + "/messages", {
        params: { before: state.nextCursor },
      });
      setState((s) => ({
        ...s,
        messages: merge(s.messages, [...res.data.messages].reverse()),
        nextCursor: res.data.nextCursor,
        loadingOlder: false,
      }));
    } catch {
      setState((s) => ({ ...s, loadingOlder: false }));
    }
  }

  async function join() {
    if (joining) return;
    setJoining(true);
    setJoinError("");
    try {
      await joinChannel(channel._id);
    } catch (err) {
      setJoinError(err.response?.data?.message || "Could not join. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-cream px-6 py-3">
        <h1 className="truncate text-lg font-semibold"># {channel.name}</h1>
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <GlobeIcon /> Public
        </span>
        <span className="text-sm text-muted">
          {channel.memberCount} {channel.memberCount === 1 ? "member" : "members"}
        </span>
        {channel.description && (
          <p className="w-full truncate text-sm text-muted">{channel.description}</p>
        )}
      </header>

      <MessageList
        messages={state.messages}
        loading={state.loading}
        loadingOlder={state.loadingOlder}
        hasMore={!!state.nextCursor}
        error={state.error}
        myId={user?.id}
        onLoadOlder={loadOlder}
        readOnly
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sidebar/60 px-6 py-4">
        <div>
          <p className="text-sm font-medium">You're previewing this public channel.</p>
          <p className="text-xs text-muted">Join to send messages and get live updates.</p>
          {joinError && <p role="alert" className="mt-1 text-xs text-danger">{joinError}</p>}
        </div>
        <button type="button" onClick={join} disabled={joining}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
          {joining ? "Joining..." : "Join channel"}
        </button>
      </div>
    </div>
  );
}