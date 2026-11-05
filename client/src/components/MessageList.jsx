import { useLayoutEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import DeleteMessageButton from "./DeleteMessageButton";
import { DELETE_WINDOW_ERROR, isWithinDeleteWindow } from "../../../shared/messagePolicy.mjs";
import MessageReceipt from "./MessageReceipt";
import MessageReactions from "./MessageReactions";
import { useVisibleRead } from "../hooks/useVisibleRead";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function prettySize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export default function MessageList({
  messages,
  loading,
  loadingOlder,
  hasMore,
  error,
  myId,
  onLoadOlder,
  onRetry,
  onEdit,
  onDelete,
  onReact,
  onRead,
  receipts,
  group = false,
}) {
  const boxRef = useRef(null);
  useVisibleRead(boxRef, messages, onRead);
  const atBottom = useRef(true);
  const prev = useRef({ firstId: null, lastId: null, height: 0 });
  const [showJump, setShowJump] = useState(false);

  // Editing state: which message, its text, and any error
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const actionPending = useRef(false);

  function startEdit(m) {
    if (actionPending.current) return;
    setEditingId(m._id);
    setEditText(m.body || "");
    setEditError("");
  }

  function cancelEdit() {
    if (actionPending.current) return;
    setEditingId(null);
    setEditText("");
    setEditError("");
  }

  async function saveEdit(m) {
    if (actionPending.current || m.deletedAt) return;
    const body = editText.trim();
    if (!body && !(m.attachments || []).length) {
      setEditError("Message can't be empty");
      return;
    }
    if (body.length > 4000) {
      setEditError("Message is too long");
      return;
    }
    if (body === (m.body || "")) return cancelEdit();

    actionPending.current = true;
    setSaving(true);
    setEditError("");
    try {
      const res = await onEdit(m._id, body);
      if (res.ok) {
        setEditingId(null);
        setEditText("");
      } else {
        setEditError(res.error || "Could not save the change");
      }
    } catch {
      setEditError("Could not save the change. Please try again.");
    } finally {
      actionPending.current = false;
      setSaving(false);
    }
  }

  async function remove(m) {
    if (actionPending.current) return;
    if (!isWithinDeleteWindow(m.createdAt)) {
      window.alert(DELETE_WINDOW_ERROR);
      return;
    }
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    if (!isWithinDeleteWindow(m.createdAt)) {
      window.alert(DELETE_WINDOW_ERROR);
      return;
    }
    actionPending.current = true;
    setDeletingId(m._id);
    try {
      const res = await onDelete(m._id);
      if (!res.ok) window.alert(res.error || "Could not delete the message");
    } catch {
      window.alert("Could not delete the message. Please try again.");
    } finally {
      actionPending.current = false;
      setDeletingId(null);
    }
  }

  // Decide where the scroll position should be after the messages change
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || messages.length === 0) return;

    const firstId = messages[0]._id;
    const lastId = messages[messages.length - 1]._id;
    const last = messages[messages.length - 1];
    const p = prev.current;

    if (p.firstId === null) {
      // First load: go to the newest message
      el.scrollTop = el.scrollHeight;
    } else if (firstId !== p.firstId && lastId === p.lastId) {
      // Older messages were added on top: keep the view where it was
      el.scrollTop = el.scrollHeight - p.height + el.scrollTop;
    } else if (lastId !== p.lastId && (atBottom.current || last.senderId?._id === myId)) {
      // A new message at the bottom: follow it if I'm at the bottom or I sent it
      el.scrollTop = el.scrollHeight;
    }

    prev.current = { firstId, lastId, height: el.scrollHeight };
  }, [messages, myId]);

  function handleScroll() {
    const el = boxRef.current;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = distance < 120;
    setShowJump(distance > 300);
    if (el.scrollTop < 80 && hasMore && !loadingOlder) onLoadOlder();
  }

  // An image finished loading and made the list taller: stay at the bottom if we were there
  function handleImageLoad() {
    const el = boxRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }

  function jumpToLatest() {
    const el = boxRef.current;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={boxRef}
        onScroll={handleScroll}
        className="h-full w-full overflow-y-auto px-6 py-4"
      >
        {loading && <p className="text-sm text-muted">Loading messages...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {loadingOlder && (
          <p className="mb-3 text-center text-xs text-muted">Loading older messages...</p>
        )}
        {!hasMore && messages.length > 0 && (
          <p className="mb-3 text-center text-xs text-muted">Start of the conversation</p>
        )}

        {!loading && !error && messages.length === 0 && (
          <p className="mt-10 text-center text-muted">No messages yet. Say hello!</p>
        )}

        {messages.map((m, i) => {
          const before = messages[i - 1];
          const mine = m.senderId?._id === myId;
          const name = m.senderId?.name || "Unknown";
          const deleted = !!m.deletedAt;
          const isEditing = editingId === m._id && !deleted;
          const canAct = mine && m.status === "sent" && !deleted;

          const newDay = !before || new Date(before.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const sameSender = before && before.senderId?._id === m.senderId?._id;
          const closeInTime = before && new Date(m.createdAt) - new Date(before.createdAt) < 5 * 60 * 1000;
          const showHeader = newDay || !sameSender || !closeInTime;

          let bubbleStyle = mine ? "bg-primary text-white" : "border border-line bg-received";
          if (deleted) bubbleStyle = "border border-line bg-transparent text-muted";

          return (
            <div key={m._id} data-message-id={m.status === "sent" ? m._id : undefined}>
              {newDay && (
                <div className="my-4 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted">
                  <span className="h-px flex-1 bg-line" />
                  {dayLabel(m.createdAt)}
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}

              <div
                className={`group flex gap-2 ${mine ? "justify-end" : "justify-start"} ${
                  showHeader && !newDay ? "mt-4" : "mt-1"
                }`}
              >
                {!mine &&
                  (showHeader ? (
                    <Avatar name={name} size={32} />
                  ) : (
                    <span className="w-8 shrink-0" />
                  ))}

                <div className="max-w-[70%]">
                  {!mine && showHeader && (
                    <p className="mb-0.5 flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{name}</span>
                      <span className="text-xs text-muted">
                        {formatTime(m.createdAt)}
                        {m.editedAt && !deleted && " · edited"}
                      </span>
                    </p>
                  )}

                  {isEditing ? (
                    <div className="min-w-[min(18rem,60vw)] rounded-2xl border border-primary bg-white p-2">
                      <textarea
                        autoFocus
                        rows={2}
                        value={editText}
                        aria-label="Edit message"
                        maxLength={4000}
                        disabled={saving}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Escape") cancelEdit();
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit(m);
                          }
                        }}
                        className="w-full resize-none bg-transparent px-1 text-sm outline-none"
                      />
                      {editError && <p role="alert" className="px-1 text-xs text-danger">{editError}</p>}
                      <div className="mt-1 flex justify-end gap-2 text-xs">
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="rounded-lg px-3 py-1 text-muted hover:bg-cream"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(m)}
                          disabled={saving}
                          className="rounded-lg bg-primary px-3 py-1 text-white disabled:opacity-60"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${bubbleStyle} ${
                        m.status === "pending" ? "opacity-60" : ""
                      } ${m.status === "failed" ? "border-2 border-danger" : ""}`}
                    >
                      {deleted ? (
                        <span className="italic">This message was deleted</span>
                      ) : (
                        <>
                          {(m.attachments || []).map((a, idx) =>
                            a.kind === "image" ? (
                              <a
                                key={idx}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`block ${m.body ? "mb-2" : ""}`}
                              >
                                <img
                                  src={a.url}
                                  alt={a.name}
                                  onLoad={handleImageLoad}
                                  className="max-h-64 w-auto max-w-full rounded-lg"
                                />
                              </a>
                            ) : (
                              <a
                                key={idx}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 ${
                                  m.body ? "mb-2" : ""
                                }`}
                              >
                                <FileIcon />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{a.name}</span>
                                  <span className="block text-xs opacity-70">
                                    {prettySize(a.size)}
                                  </span>
                                </span>
                              </a>
                            )
                          )}
                          {m.body}
                        </>
                      )}
                    </div>
                  )}

                  {!isEditing && <MessageReactions message={m} myId={myId} mine={mine} onReact={onReact} />}

                  {!mine && !showHeader && m.editedAt && !deleted && (
                    <p className="mt-0.5 text-xs text-muted">
                      {formatTime(m.createdAt)} {"\u00b7 edited"}
                    </p>
                  )}

                  {!mine && group && (
                    <div className="mt-0.5 text-xs text-muted"><MessageReceipt message={m} receipts={receipts} group onlyRead /></div>
                  )}

                  {mine && !isEditing && (
                    <div className="mt-0.5 flex flex-wrap items-center justify-end gap-1 text-xs text-muted">
                      {formatTime(m.createdAt)}
                      {m.editedAt && !deleted && <span>· edited</span>}
                      {m.status === "pending" && (
                        <span className="flex items-center gap-1">
                          <ClockIcon /> Sending...
                        </span>
                      )}
                      <MessageReceipt message={m} receipts={receipts} group={group} />
                      {m.status === "failed" && (
                        <span className="text-danger">
                          {" · Failed to send. "}
                          <button
                            onClick={() => onRetry(m.clientId)}
                            className="font-medium underline"
                          >
                            Retry
                          </button>
                        </span>
                      )}
                      {canAct && (
                        <span className="ml-2 flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
                          <button onClick={() => startEdit(m)} disabled={saving || deletingId !== null} className="hover:text-ink disabled:opacity-50">
                            Edit
                          </button>
                          <DeleteMessageButton createdAt={m.createdAt}
                            onDelete={() => remove(m)} disabled={saving || deletingId !== null}
                            deleting={deletingId === m._id} />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showJump && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-4 right-6 flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-cream"
        >
          <ArrowDownIcon />
          Jump to latest
        </button>
      )}
    </div>
  );
}