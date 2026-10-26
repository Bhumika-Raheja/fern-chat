import FernLogo from "./FernLogo";
import { useConversationStore } from "../store/conversationStore";
import { useAuthStore } from "../store/authStore";
import { usePresenceStore } from "../store/presenceStore";

function Section({ title, items, activeId, onSelect, renderName }) {
    return (
        <div className="mb-5">
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {title}
            </p>
            {items.length === 0 && (
                <p className="px-3 text-sm text-muted">Nothing here yet</p>
            )}
            {items.map((c) => {
                const unread = c.unreadCount || 0;
                return (
                    <button
                        key={c._id}
                        onClick={() => onSelect(c._id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${activeId === c._id ? "bg-primary text-white" : "hover:bg-line/50"
                            } ${unread > 0 && activeId !== c._id ? "font-semibold" : ""}`}
                    >
                        <span className="min-w-0 truncate">{renderName(c)}</span>
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
    const { conversations, activeId, setActive, loading, error } =
        useConversationStore();
    const user = useAuthStore((s) => s.user);
    const online = usePresenceStore((s) => s.online);

    const channels = conversations.filter((c) => c.type === "channel");
    const groups = conversations.filter((c) => c.type === "group");
    const dms = conversations.filter((c) => c.type === "dm");

    // For a DM: a presence dot and the other person's name
    function dmName(c) {
        const other = c.memberIds.find((m) => m._id !== user?.id);
        const isOnline = other && online[other._id];
        return (
            <span className="flex items-center gap-2">
                <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${isOnline ? "bg-online" : "bg-offline"
                        }`}
                />
                {other ? other.name : "Direct message"}
            </span>
        );
    }

    return (
        <aside className="flex h-screen w-72 flex-col bg-sidebar p-3">
            <div className="mb-4 flex items-center gap-2 px-2">
                <FernLogo size={28} />
                <span className="text-lg font-semibold">Fern</span>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading && <p className="px-3 text-sm text-muted">Loading...</p>}
                {error && <p className="px-3 text-sm text-danger">{error}</p>}

                <Section
                    title="Channels"
                    items={channels}
                    activeId={activeId}
                    onSelect={setActive}
                    renderName={(c) => `# ${c.name}`}
                />
                <Section
                    title="Groups"
                    items={groups}
                    activeId={activeId}
                    onSelect={setActive}
                    renderName={(c) => c.name}
                />
                <Section
                    title="Direct messages"
                    items={dms}
                    activeId={activeId}
                    onSelect={setActive}
                    renderName={dmName}
                />
            </div>

            <div className="flex items-center justify-between border-t border-line pt-3 px-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user?.name}</p>
                    <p className="truncate text-xs text-muted">{user?.statusMessage || "Online"}</p>
                </div>
                <button onClick={onLogout} className="text-sm text-muted hover:text-ink">
                    Log out
                </button>
            </div>
        </aside>
    );
}