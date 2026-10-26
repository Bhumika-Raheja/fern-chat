import { useRef, useState } from "react";
import { getSocket } from "../socket/socket";

export default function MessageInput({ placeholder, conversationId, onSend }) {
    const [text, setText] = useState("");
    const lastSent = useRef(0);

    function handleChange(e) {
        setText(e.target.value);

        // Tell the server I'm typing, at most once every 2 seconds
        const now = Date.now();
        if (e.target.value && now - lastSent.current > 2000) {
            lastSent.current = now;
            const socket = getSocket();
            console.log("[typing] sending", conversationId, "connected:", socket?.connected);
            if (socket?.connected) socket.emit("typing", { conversationId });
        }
    }

    function submit() {
        const body = text.trim();
        if (!body) return;
        onSend(body);
        setText("");
        lastSent.current = 0;
    }

    function handleKeyDown(e) {
        // Enter sends, Shift+Enter makes a new line
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    }

    return (
        <div className="border-t border-line p-4">
            <div className="flex items-end gap-2 rounded-xl border border-line bg-white p-2">
                <textarea
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    rows={1}
                    className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
                />
                <button
                    onClick={submit}
                    className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white"
                >
                    Send
                </button>
            </div>
            <p className="mt-1 text-xs text-muted">Enter to send, Shift+Enter for a new line</p>
        </div>
    );
}