import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useConversationStore } from "../store/conversationStore";

export default function ChannelBrowser({ onClose }) {
  const dialogRef = useRef(null);
  const joiningRef = useRef(false);
  const conversations = useConversationStore((s) => s.conversations);
  const joinChannel = useConversationStore((s) => s.joinChannel);
  const openPreview = useConversationStore((s) => s.openPreview);
  const setActive = useConversationStore((s) => s.setActive);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState({ query: null, channels: [], error: "" });
  const [joining, setJoining] = useState("");
  const [error, setError] = useState("");
  const search = query.trim();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      api.get("/api/channels", { params: { q: search }, signal: controller.signal })
        .then((res) => {
          if (active) setResult({ query: search, channels: res.data.channels, error: "" });
        })
        .catch((err) => {
          if (active) setResult({
            query: search, channels: [],
            error: err.response?.data?.message || "Could not load channels. Try again.",
          });
        });
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [search]);

  const loading = result.query !== search;
  const myIds = new Set(conversations.map((c) => c._id));

  function close() {
    if (!joiningRef.current) onClose();
  }

  async function join(channel) {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setJoining(channel._id);
    setError("");
    try {
      await joinChannel(channel._id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Could not join the channel. Try again.");
    } finally {
      joiningRef.current = false;
      setJoining("");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="browse-channels-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-cream p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="browse-channels-title" className="text-xl font-semibold">Browse channels</h2>
            <p className="mt-1 text-sm text-muted">
              Public channels. Anyone on Fern can read them and join.
            </p>
          </div>
          <button type="button" onClick={close} disabled={!!joining} aria-label="Close channel browser"
            className="rounded-lg px-2 py-1 text-xl text-muted hover:bg-line/50 disabled:opacity-50">
            &times;
          </button>
        </div>

        <input
          autoFocus
          value={query}
          maxLength={40}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search channels"
          autoComplete="off"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary"
        />

        <div className="mt-4 min-h-24" aria-live="polite">
          {loading && <p className="py-4 text-sm text-muted">Loading channels...</p>}
          {!loading && result.error && (
            <p role="alert" className="py-4 text-sm text-danger">{result.error}</p>
          )}
          {!loading && !result.error && result.channels.length === 0 && (
            <p className="py-4 text-sm text-muted">
              {search ? "No channels match that search." : "No channels yet. Use the + button to create the first one."}
            </p>
          )}

          {!loading && (
            <ul className="space-y-2">
              {result.channels.map((c) => {
                const joined = c.joined || myIds.has(c._id);
                return (
                  <li key={c._id} className="rounded-xl border border-line bg-white/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium"># {c.name}</p>
                        <p className="text-xs text-muted">
                          {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                        </p>
                        {c.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {joined ? (
                          <button type="button"
                            onClick={() => { setActive(c._id); onClose(); }}
                            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-sidebar">
                            Open
                          </button>
                        ) : (
                          <>
                            <button type="button" disabled={!!joining}
                              onClick={() => { openPreview(c); onClose(); }}
                              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-sidebar disabled:opacity-50">
                              Preview
                            </button>
                            <button type="button" disabled={!!joining} onClick={() => join(c)}
                              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                              {joining === c._id ? "Joining..." : "Join"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </dialog>
  );
}