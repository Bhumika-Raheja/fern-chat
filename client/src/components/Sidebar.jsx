import FernLogo from "./FernLogo";
import { useConversationStore } from "../store/conversationStore";
import { useAuthStore } from "../store/authStore";

function Section({ title, items, activeId, onSelect, renderName }) {
    return (
        <div className="mb-5">
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {title}
            </p>
            {items.length === 0 && (
                <p className="px-3 text-sm text-muted">Nothing here yet</p>
            )}
            {items.map((c) => (
                <button
                    key={c._id}
                    onClick={() => onSelect(c._id)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${activeId === c._id ? "bg-primary text-white" : "hover:bg-line/50"
                        }`}
                >
                    {renderName(c)}
                </button>
            ))}
        </div>
    );
}

export default function Sidebar({ onLogout }) {
    const { conversations, activeId, setActive, loading, error } =
        useConversationStore();
    const user = useAuthStore((s) => s.user);

    const channels = conversations.filter((c) => c.type === "channel");
    const groups = conversations.filter((c) => c.type === "group");
    const dms = conversations.filter((c) => c.type === "dm");

    // For a DM, show the other person's name
    function dmName(c) {
        const other = c.memberIds.find((m) => m._id !== user?.id);
        return other ? other.name : "Direct message";
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