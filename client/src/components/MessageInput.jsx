import { useRef, useState } from "react";
import { getSocket } from "../socket/socket";

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

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

  const empty = !text.trim();

  return (
    <div className="px-6 pb-4 pt-1">
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 focus-within:border-primary">
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted"
        />
        <button
          onClick={submit}
          disabled={empty}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
        >
          <SendIcon />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Enter to send, Shift+Enter for a new line</p>
    </div>
  );
}