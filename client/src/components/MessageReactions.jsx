import { useRef, useState } from "react";
import { groupReactions } from "../../../shared/reactions.mjs";
import EmojiPickerDialog from "./EmojiPickerDialog";

export default function MessageReactions({ message, myId, mine, onReact }) {
  const [picker, setPicker] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  if (message.deletedAt || message.status !== "sent") return null;
  const groups = groupReactions(message.reactions, myId);

  async function react(emoji, active) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setPending(emoji);
    setError("");
    try {
      const response = await onReact(message.conversationId, message._id, emoji, active);
      if (!response.ok) {
        setError(response.error || "Could not update the reaction.");
        return false;
      }
      return true;
    } catch {
      setError("Could not update the reaction. Please try again.");
      return false;
    } finally {
      busyRef.current = false;
      setPending("");
    }
  }

  return (
    <div className={"mt-1 " + (mine ? "text-right" : "text-left")}>
      <div className={"flex flex-wrap items-center gap-1 " + (mine ? "justify-end" : "")} aria-label="Message reactions">
        {groups.map((group) => {
          const names = group.users.map((user) => user.name).join(", ");
          return (
            <button type="button" key={group.emoji} aria-pressed={group.mine} disabled={!!pending}
              title={names}
              aria-label={group.label + ", " + group.users.length + " reactions. Reacted by " + names +
                ". " + (group.mine ? "Remove your reaction" : "Add your reaction")}
              onClick={() => react(group.emoji, !group.mine)}
              className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs disabled:opacity-50 " +
                (group.mine ? "border-primary bg-sidebar text-primary" : "border-line bg-white/70 text-ink hover:bg-sidebar")}>
              <span className="text-base" aria-hidden="true">{group.emoji}</span>
              <span>{group.users.length}</span>
            </button>
          );
        })}
        <button type="button" aria-label="Add emoji reaction" title="Add emoji reaction"
          disabled={!!pending} onClick={() => { setError(""); setPicker(true); }}
          className="rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:bg-sidebar hover:text-ink disabled:opacity-50">
          + React
        </button>
      </div>
      {groups.length > 0 && (
        <details className="mt-1 text-xs text-muted">
          <summary className="cursor-pointer">Who reacted</summary>
          <ul className="mt-1 space-y-1 rounded-lg border border-line bg-white/70 p-2 text-left text-ink">
            {groups.map((group) => (
              <li key={group.emoji}><span aria-label={group.label}>{group.emoji}</span>{" "}
                {group.users.map((user) => user.name + (user._id === myId ? " (you)" : "")).join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && !picker && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
      {picker && <EmojiPickerDialog onClose={() => setPicker(false)} onSelect={react}
        selected={groups.filter((group) => group.mine).map((group) => group.emoji)} pending={pending} error={error} />}
    </div>
  );
}
