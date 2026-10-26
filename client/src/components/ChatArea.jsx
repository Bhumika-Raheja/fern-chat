import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useMessageStore } from "../store/messageStore";
import { usePresenceStore } from "../store/presenceStore";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";

export default function ChatArea({ conversation }) {
    const user = useAuthStore((s) => s.user);
    const online = usePresenceStore((s) => s.online);
    const fetchMessages = useMessageStore((s) => s.fetchMessages);
    const loadOlder = useMessageStore((s) => s.loadOlder);
    const sendMessage = useMessageStore((s) => s.sendMessage);
    const retryMessage = useMessageStore((s) => s.retryMessage);
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

    const onlineCount = conversation.memberIds.filter((m) => online[m._id]).length;

    return (
        <div className="flex h-full flex-1 flex-col">
            <header className="flex items-center gap-3 border-b border-line px-6 py-3">
                <h1 className="text-lg font-semibold">{title}</h1>
                <span className="text-sm text-muted">{conversation.memberIds.length} members</span>
                {conversation.type !== "dm" && (
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                        <span className="h-2 w-2 rounded-full bg-online" />
                        {onlineCount} online
                    </span>
                )}
            </header>

            <MessageList
                messages={state?.messages || []}
                loading={state?.loading}
                loadingOlder={state?.loadingOlder}
                hasMore={!!state?.nextCursor}
                error={state?.error}
                myId={user?.id}
                onLoadOlder={() => loadOlder(conversation._id)}
                onRetry={(clientId) => retryMessage(conversation._id, clientId)}
            />

            <TypingIndicator conversationId={conversation._id} />

            <MessageInput
                placeholder={`Message ${title}`}
                conversationId={conversation._id}
                onSend={(body) => sendMessage(conversation._id, body, user)}
            />
        </div>
    );
}