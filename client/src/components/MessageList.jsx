import { useLayoutEffect, useRef } from "react";

function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageList({
    messages,
    loading,
    loadingOlder,
    hasMore,
    error,
    myId,
    onLoadOlder,
}) {
    const boxRef = useRef(null);
    const atBottom = useRef(true);
    const prev = useRef({ firstId: null, lastId: null, height: 0 });

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
    }, [messages]);

    function handleScroll() {
        const el = boxRef.current;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (el.scrollTop < 80 && hasMore && !loadingOlder) onLoadOlder();
    }

    return (
        <div ref={boxRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-4">
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

            {messages.map((m) => {
                const mine = m.senderId?._id === myId;
                return (
                    <div key={m._id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[70%]">
                            {!mine && (
                                <p className="mb-0.5 text-xs font-medium">{m.senderId?.name || "Unknown"}</p>
                            )}
                            <div
                                className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${mine ? "bg-primary text-white" : "border border-line bg-received"
                                    } ${m.status === "pending" ? "opacity-60" : ""} ${m.status === "failed" ? "border border-danger" : ""
                                    }`}
                            >
                                {m.body}
                            </div>
                            <p className={`mt-0.5 text-xs text-muted ${mine ? "text-right" : ""}`}>
                                {formatTime(m.createdAt)}
                                {m.status === "pending" && " · Sending..."}
                                {m.status === "failed" && (
                                    <span className="text-danger"> · Failed to send</span>
                                )}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}