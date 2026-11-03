import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useMessageStore } from "../store/messageStore";
import { usePresenceStore } from "../store/presenceStore";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.500 5.700 12 3z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.500 20c0-3.600 2.900-6 6.500-6s6.500 2.400 6.500 6" />
      <path d="M16 4.500a3.500 3.500 0 0 1 0 7" />
      <path d="M18 14.500c2.100.7 3.500 2.700 3.500 5.500" />
    </svg>
  );
}

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
  const isPublic = conversation.type === "channel";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-cream px-6 py-3">
        <h1 className="truncate text-lg font-semibold">{title}</h1>

        {conversation.type !== "dm" && (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            {isPublic ? <GlobeIcon /> : <LockIcon />}
            {isPublic ? "Public" : "Private"}
          </span>
        )}

        <span className="flex items-center gap-1.5 text-sm text-muted">
          <PeopleIcon />
          {conversation.memberIds.length}
        </span>

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