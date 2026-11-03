import { useState } from "react";
import FernLogo from "./FernLogo";
import Avatar from "./Avatar";
import { useConversationStore } from "../store/conversationStore";
import { useAuthStore } from "../store/authStore";
import { usePresenceStore } from "../store/presenceStore";

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function Section({ title, items, activeId, onSelect, renderName }) {
  return (
    <div className="mb-5">
      <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      {items.length === 0 && <p className="px-3 text-sm text-muted">Nothing here yet</p>}
      {items.map((c) => {
        const unread = c.unreadCount || 0;
        const active = activeId === c._id;
        return (
          <button
            key={c._id}
            onClick={() => onSelect(c._id)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${
              active ? "bg-primary text-white" : "hover:bg-line/50"
            } ${unread > 0 && !active ? "font-semibold" : ""}`}
          >
            <span className="min-w-0 flex-1 truncate">{renderName(c)}</span>
            {unread > 0 && (
              <span className="min-w-[1.25rem] shrink-0 rounded-full bg-danger px-1.5 text-center text-xs font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function Sidebar({ onLogout }) {
  const { conversations, activeId, setActive, loading, error } = useConversationStore();
  const user = useAuthStore((s) => s.user);
  const online = usePresenceStore((s) => s.online);
  const [query, setQuery] = useState("");

  function otherPerson(c) {
    return c.memberIds.find((m) => m._id !== user?.id);
  }

  // Filter by name (for a DM, by the other person's name)
  const q = query.trim().toLowerCase();
  const visible = conversations.filter((c) => {
    if (!q) return true;
    const label = c.type === "dm" ? otherPerson(c)?.name || "" : c.name || "";
    return label.toLowerCase().includes(q);
  });

  const channels = visible.filter((c) => c.type === "channel");
  const groups = visible.filter((c) => c.type === "group");
  const dms = visible.filter((c) => c.type === "dm");

  function dmName(c) {
    const other = otherPerson(c);
    return (
      <span className="flex items-center gap-2">
        <Avatar
          name={other?.name || "?"}
          size={22}
          online={!!(other && online[other._id])}
          ring="var(--fern-sidebar)"
        />
        <span className="truncate">{other ? other.name : "Direct message"}</span>
      </span>
    );
  }

  return (
    <aside className="flex h-screen w-[280px] shrink-0 flex-col bg-sidebar p-3">
      <div className="mb-4 flex items-center gap-2 px-2">
        <FernLogo size={30} />
        <span className="text-lg font-semibold">Fern</span>
      </div>

      <div className="relative mb-4">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <SearchIcon />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search channels and people"
          className="w-full rounded-lg border border-line bg-white/60 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-primary"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 && (
          <p className="px-3 text-sm text-muted">Loading...</p>
        )}
        {error && <p className="px-3 text-sm text-danger">{error}</p>}

        <Section
          title="Channels"
          items={channels}
          activeId={activeId}
          onSelect={setActive}
          renderName={(c) => `# ${c.name}`}
        />
        <Section
          title="Private groups"
          items={groups}
          activeId={activeId}
          onSelect={setActive}
          renderName={(c) => (
            <span className="flex items-center gap-2">
              <LockIcon />
              <span className="truncate">{c.name}</span>
            </span>
          )}
        />
        <Section
          title="Direct messages"
          items={dms}
          activeId={activeId}
          onSelect={setActive}
          renderName={dmName}
        />
      </div>

      <div className="flex items-center gap-3 border-t border-line px-2 pt-3">
        <Avatar name={user?.name || "?"} size={36} online={true} ring="var(--fern-sidebar)" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-muted">{user?.statusMessage || "Online"}</p>
        </div>
        <button
          onClick={onLogout}
          title="Log out"
          aria-label="Log out"
          className="rounded-lg p-1.5 text-muted hover:bg-line/50 hover:text-ink"
        >
          <LogoutIcon />
        </button>
      </div>
    </aside>
  );
}