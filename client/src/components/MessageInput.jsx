import { useState } from "react";

export default function MessageInput({ placeholder, onSend }) {
    const [text, setText] = useState("");

    function submit() {
        const body = text.trim();
        if (!body) return;
        onSend(body);
        setText("");
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
                    onChange={(e) => setText(e.target.value)}
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