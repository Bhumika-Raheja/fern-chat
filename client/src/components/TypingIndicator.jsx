import { useTypingStore } from "../store/typingStore";

export default function TypingIndicator({ conversationId }) {
    const room = useTypingStore((s) => s.typing[conversationId]);
    const names = Object.values(room || {});

    let text = "";
    if (names.length === 1) text = `${names[0]} is typing...`;
    else if (names.length === 2) text = `${names[0]} and ${names[1]} are typing...`;
    else if (names.length > 2) text = "Several people are typing...";

    // Always take up one line, so the layout doesn't jump
    return <div className="h-5 px-6 text-xs text-muted">{text}</div>;
}