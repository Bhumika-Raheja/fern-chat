import { useEffect, useRef, useState } from "react";
import { REACTION_EMOJIS } from "../../../shared/reactions.mjs";

const categories = ["All", ...new Set(REACTION_EMOJIS.map((item) => item.category))];

export default function EmojiPickerDialog({ onClose, onSelect, selected, pending, error }) {
  const dialogRef = useRef(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const search = query.trim().toLowerCase();
  const choices = REACTION_EMOJIS.filter((item) =>
    (category === "All" || item.category === category) &&
    (!search || item.label.toLowerCase().includes(search) || item.emoji.includes(search)));

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);

  function close() { if (!pending) onClose(); }

  return (
    <dialog ref={dialogRef} aria-labelledby="emoji-picker-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-cream p-5 text-ink shadow-xl backdrop:bg-black/40">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="emoji-picker-title" className="text-lg font-semibold">React to message</h2>
        <button type="button" aria-label="Close emoji picker" onClick={close} disabled={!!pending}
          className="rounded-lg px-2 py-1 text-xl text-muted hover:bg-sidebar disabled:opacity-50">&times;</button>
      </div>
      <label htmlFor="emoji-search" className="sr-only">Search emoji</label>
      <input id="emoji-search" autoFocus autoComplete="off" value={query}
        onChange={(event) => setQuery(event.target.value)} placeholder="Search emoji"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
      <div className="my-3 flex gap-1 overflow-x-auto pb-1" aria-label="Emoji categories">
        {categories.map((value) => (
          <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}
            className={"shrink-0 rounded-full px-2.5 py-1 text-xs " +
              (category === value ? "bg-primary text-white" : "bg-sidebar text-muted hover:text-ink")}>
            {value}
          </button>
        ))}
      </div>
      <div className="grid max-h-64 grid-cols-7 gap-1 overflow-y-auto" aria-label="Choose a reaction" aria-busy={!!pending}>
        {choices.map((item) => (
          <button type="button" key={item.emoji} disabled={!!pending} aria-pressed={selected.includes(item.emoji)}
            aria-label={(selected.includes(item.emoji) ? "Remove " : "Add ") + item.label + " reaction"}
            title={item.label}
            onClick={async () => {
              if (await onSelect(item.emoji, !selected.includes(item.emoji))) onClose();
            }}
            className={"flex h-10 items-center justify-center rounded-lg border text-2xl disabled:opacity-50 " +
              (selected.includes(item.emoji) ? "border-primary bg-sidebar" : "border-transparent hover:bg-sidebar")}>
            {item.emoji}
          </button>
        ))}
      </div>
      {choices.length === 0 && <p className="py-5 text-center text-sm text-muted">No matching emoji. Try another search or category.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <p className="mt-3 text-xs text-muted">Choose an emoji to react. Select your reaction again to remove it.</p>
    </dialog>
  );
}
