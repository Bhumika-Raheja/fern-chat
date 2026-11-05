import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useConversationStore } from "../store/conversationStore";
import Avatar from "./Avatar";

const types = [
  { value: "dm", label: "Direct message" },
  { value: "group", label: "Private group" },
  { value: "channel", label: "Channel" },
];

export default function NewConversationDialog({ initialType = "dm", onClose, onCreated }) {
  const dialogRef = useRef(null);
  const pendingRef = useRef(false);
  const createConversation = useConversationStore((s) => s.createConversation);
  const [type, setType] = useState(initialType);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState({ query: "", users: [], error: "" });
  const [creating, setCreating] = useState(false);
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
    if (search.length < 2) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      api.get("/api/users", { params: { q: search }, signal: controller.signal })
        .then((res) => {
          if (active) setResult({ query: search, users: res.data.users, error: "" });
        })
        .catch((err) => {
          if (active) setResult({
            query: search,
            users: [],
            error: err.response?.data?.message || "Could not search users. Try again.",
          });
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const searching = search.length >= 2 && result.query !== search;
  const users = result.query === search && search.length >= 2 ? result.users : [];
  const searchError = result.query === search ? result.error : "";
  const valid = selected.length > 0 && (type === "dm" || name.trim().length > 0);

  function changeType(value) {
    setType(value);
    setError("");
    if (value === "dm") setSelected((members) => members.slice(0, 1));
  }

  function toggleUser(user) {
    setError("");
    setSelected((members) => {
      if (members.some((member) => member._id === user._id)) {
        return members.filter((member) => member._id !== user._id);
      }
      if (type === "dm") return [user];
      return members.length < 99 ? [...members, user] : members;
    });
  }

  function close() {
    if (!pendingRef.current) onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (!valid || pendingRef.current) return;
    pendingRef.current = true;
    setCreating(true);
    setError("");
    try {
      await createConversation({
        type,
        memberIds: selected.map((member) => member._id),
        ...(type !== "dm" ? { name: name.trim(), description: description.trim() } : {}),
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Could not create the conversation. Try again.");
    } finally {
      pendingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="new-conversation-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-cream p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="p-6" aria-busy={creating}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="new-conversation-title" className="text-xl font-semibold">New conversation</h2>
            <p className="mt-1 text-sm text-muted">Find someone or bring your team together.</p>
          </div>
          <button type="button" onClick={close} disabled={creating} aria-label="Close new conversation"
            className="rounded-lg px-2 py-1 text-xl text-muted hover:bg-line/50 disabled:opacity-50">
            &times;
          </button>
        </div>

        <fieldset disabled={creating}>
          <legend className="sr-only">Conversation type</legend>
          <div className="mb-5 flex gap-1 rounded-lg bg-sidebar p-1">
            {types.map((option) => (
              <button key={option.value} type="button" aria-pressed={type === option.value}
                onClick={() => changeType(option.value)}
                className={"flex-1 rounded-md px-2 py-2 text-sm font-medium " +
                  (type === option.value ? "bg-white text-primary shadow-sm" : "text-muted hover:text-ink")}>
                {option.label}
              </button>
            ))}
          </div>

          {type !== "dm" && (
            <div className="mb-4 space-y-3">
              <label className="block text-sm font-medium">
                {type === "channel" ? "Channel name" : "Group name"}
                <input value={name} onChange={(event) => { setName(event.target.value); setError(""); }}
                  maxLength={40} required placeholder={type === "channel" ? "design-team" : "Project team"}
                  className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 font-normal outline-none focus:border-primary" />
              </label>
              <label className="block text-sm font-medium">
                Description <span className="font-normal text-muted">(optional)</span>
                <input value={description} onChange={(event) => setDescription(event.target.value)}
                  maxLength={200} placeholder="What is this conversation for?"
                  className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 font-normal outline-none focus:border-primary" />
              </label>
              {type === "channel" && (
                <p className="text-xs text-muted">Spaces in the channel name become hyphens. Selected members will be added.</p>
              )}
            </div>
          )}

          <label className="block text-sm font-medium" htmlFor="conversation-user-search">
            {type === "dm" ? "Find a person" : "Add members"}
          </label>
          <input id="conversation-user-search" autoFocus value={query} maxLength={80}
            onChange={(event) => setQuery(event.target.value)} autoComplete="off"
            placeholder="Search by name or email"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary" />

          {selected.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Selected members">
              {selected.map((user) => (
                <button type="button" key={user._id} onClick={() => toggleUser(user)}
                  aria-label={"Remove " + user.name}
                  className="flex items-center gap-2 rounded-full bg-sidebar py-1 pl-2 pr-3 text-xs font-medium">
                  <Avatar name={user.name} size={20} /> {user.name} <span aria-hidden="true">&times;</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 min-h-28" aria-live="polite">
            {search.length < 2 && <p className="py-4 text-sm text-muted">Type at least 2 characters to find registered users.</p>}
            {searching && <p className="py-4 text-sm text-muted">Searching...</p>}
            {searchError && <p role="alert" className="py-4 text-sm text-danger">{searchError}</p>}
            {!searching && !searchError && search.length >= 2 && users.length === 0 && (
              <p className="py-4 text-sm text-muted">No users found. Try another name or email.</p>
            )}
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {users.map((user) => {
                const chosen = selected.some((member) => member._id === user._id);
                return (
                  <button type="button" key={user._id} aria-pressed={chosen}
                    disabled={!chosen && type !== "dm" && selected.length >= 99}
                    onClick={() => toggleUser(user)}
                    className={"flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm " +
                      (chosen ? "border-primary bg-sidebar" : "border-transparent hover:bg-sidebar/60")}>
                    <Avatar name={user.name} size={32} />
                    <span className="min-w-0 flex-1 truncate">{user.name}</span>
                    <span className="text-xs font-medium text-primary">{chosen ? "Selected" : "Select"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>

        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-muted">
            {selected.length} {selected.length === 1 ? "person" : "people"} selected
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={creating}
              className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-sidebar disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={!valid || creating}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {creating ? "Opening..." : type === "dm" ? "Start chat" : type === "group" ? "Create group" : "Create channel"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
