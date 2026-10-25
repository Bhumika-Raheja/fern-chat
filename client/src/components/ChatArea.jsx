import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useMessageStore } from "../store/messageStore";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";

export default function ChatArea({ conversation }) {
    const user = useAuthStore((s) => s.user);
    const fetchMessages = useMessageStore((s) => s.fetchMessages);
    const sendMessage = useMessageStore((s) => s.sendMessage);
    const state = useMessageStore((s) => s.byConversation[conversation._id]);

    useEffect(() => {
        fetchMessages(conversation._id);
    }, [conversation._id]);

    let title = conversation.name;
    if (conversation.type === "channel") title = `# ${conversation.name}`;
    if (conversation.type === "dm") {
        const other = conversation.memberIds.find((m) => m._id !== user?.id);
        title = other ? other.name : "Direct message";
    }

    return (
        <div className="flex h-full flex-1 flex-col">
            <header className="flex items-center gap-3 border-b border-line px-6 py-3">
                <h1 className="text-lg font-semibold">{title}</h1>
                <span className="text-sm text-muted">{conversation.memberIds.length} members</span>
            </header>

            <MessageList
                messages={state?.messages || []}
                loading={state?.loading}
                error={state?.error}
                myId={user?.id}
            />

            <MessageInput
                placeholder={`Message ${title}`}
                onSend={(body) => sendMessage(conversation._id, body, user)}
            />
        </div>
    );
}