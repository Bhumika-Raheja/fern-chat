import { useEffect, useRef } from "react";

function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageList({ messages, loading, error, myId }) {
    const bottomRef = useRef(null);

    // Scroll to the newest message whenever the count changes
    useEffect(() => {
        bottomRef.current?.scrollIntoView();
    }, [messages.length]);

    return (
        <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && <p className="text-sm text-muted">Loading messages...</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
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
                                className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${mine
                                        ? "bg-primary text-white"
                                        : "border border-line bg-received"
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
            <div ref={bottomRef} />
        </div>
    );
}