import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useConversationStore } from "../store/conversationStore";
import { usePresenceStore } from "../store/presenceStore";
import Avatar from "./Avatar";

export default function MembersDialog({ conversation, onClose }) {
  const dialogRef = useRef(null);
  const pendingRef = useRef(false);
  const user = useAuthStore((s) => s.user);
  const online = usePresenceStore((s) => s.online);
  const { addMembers, removeMember, changeMemberRole, leaveConversation } = useConversationStore();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState({ query: "", users: [], error: "" });
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const search = query.trim();
  const admins = conversation.adminIds || [];
  const isAdmin = admins.includes(user?.id);
  const lastAdmin = isAdmin && admins.length === 1;
  const full = conversation.memberIds.length >= 100;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    if (!isAdmin || search.length < 2) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      api.get("/api/users", { params: { q: search }, signal: controller.signal })
        .then((res) => {
          if (active) setResult({ query: search, users: res.data.users, error: "" });
        })
        .catch((err) => {
          if (active) setResult({
            query: search, users: [],
            error: err.response?.data?.message || "Could not search users. Try again.",
          });
        });
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [search, isAdmin]);

  function close() { if (!pendingRef.current) onClose(); }

  async function run(key, action, confirmation) {
    if (pendingRef.current || (confirmation && !window.confirm(confirmation))) return;
    pendingRef.current = true;
    setPending(key);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.response?.data?.message || "Could not update members. Please try again.");
    } finally {
      pendingRef.current = false;
      setPending("");
    }
  }

  const currentIds = new Set(conversation.memberIds.map((member) => member._id));
  const searching = search.length >= 2 && result.query !== search;
  const candidates = result.query === search
    ? result.users.filter((member) => !currentIds.has(member._id)) : [];
  const searchError = result.query === search ? result.error : "";

  return (
    <dialog ref={dialogRef} aria-labelledby="members-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-cream p-0 text-ink shadow-xl backdrop:bg-black/40">
        <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id="members-title" className="text-xl font-semibold">Members</h2>
          <p className="mt-1 text-sm text-muted">{conversation.name} &middot; {conversation.memberIds.length} members</p>
        </div>
        <button type="button" autoFocus onClick={close} disabled={!!pending}
          aria-label="Close members" className="rounded-lg px-2 py-1 text-xl text-muted hover:bg-sidebar disabled:opacity-50">&times;</button>
      </div>

      {isAdmin && (
        <section className="mb-5 rounded-xl border border-line bg-white/50 p-3" aria-label="Add members">
          <label htmlFor="member-search" className="block text-sm font-medium">Add people</label>
          <input id="member-search" value={query} maxLength={80} disabled={!!pending || full}
            onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" autoComplete="off"
            className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50" />
          <div aria-live="polite" className="mt-2">
            {full && <p className="text-xs text-muted">This conversation has reached its 100-member limit.</p>}
            {!full && search.length < 2 && <p className="text-xs text-muted">Type at least 2 characters to find someone to add.</p>}
            {searching && <p className="text-sm text-muted">Searching...</p>}
            {searchError && <p role="alert" className="text-sm text-danger">{searchError}</p>}
            {!searching && !searchError && search.length >= 2 && candidates.length === 0 && (
              <p className="text-sm text-muted">No new people found. Matching users may already be members.</p>
            )}
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {candidates.map((member) => (
                <div key={member._id} className="flex items-center gap-2 py-2">
                  <Avatar name={member.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm">{member.name}</span>
                  <button type="button" disabled={!!pending || full}
                    onClick={() => run("add:" + member._id, () => addMembers(conversation._id, [member._id]))}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                    {pending === "add:" + member._id ? "Adding..." : "Add"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {!isAdmin && <p className="mb-3 text-sm text-muted">Admins can add or remove members and change roles.</p>}
      <ul className="space-y-2" aria-label="Conversation members" aria-busy={!!pending}>
        {conversation.memberIds.map((member) => {
          const admin = admins.includes(member._id);
          const onlyAdmin = admin && admins.length === 1;
          const me = member._id === user?.id;
          return (
            <li key={member._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
              <Avatar name={member.name} size={36} online={!!online[member._id]} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.name}{me && " (you)"}</p>
                <p className={"text-xs " + (admin ? "font-medium text-primary" : "text-muted")}>{admin ? "Admin" : "Member"}</p>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!!pending || onlyAdmin}
                    aria-label={(admin ? "Demote " : "Promote ") + member.name}
                    onClick={() => run("role:" + member._id,
                      () => changeMemberRole(conversation._id, member._id, admin ? "member" : "admin"))}
                    className="rounded-lg border border-line px-2 py-1.5 text-xs hover:bg-sidebar disabled:opacity-40">
                    {pending === "role:" + member._id ? "Saving..." : admin ? "Make member" : "Make admin"}
                  </button>
                  {!me && (
                    <button type="button" disabled={!!pending || onlyAdmin}
                      aria-label={"Remove " + member.name}
                      onClick={() => run("remove:" + member._id,
                        () => removeMember(conversation._id, member._id), "Remove " + member.name + " from this conversation?")}
                      className="rounded-lg px-2 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-40">
                      {pending === "remove:" + member._id ? "Removing..." : "Remove"}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      <div className="mt-5 border-t border-line pt-4">
        {lastAdmin && <p className="mb-3 text-sm text-muted">Promote another member before leaving or giving up admin access.</p>}
        <button type="button" disabled={!!pending || lastAdmin}
          onClick={() => run("leave", () => leaveConversation(conversation._id), "Leave this conversation? An admin will need to add you again.")}
          className="rounded-lg border border-danger px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-40">
          {pending === "leave" ? "Leaving..." : "Leave conversation"}
        </button>
      </div>
      </div>
    </dialog>
  );
}
