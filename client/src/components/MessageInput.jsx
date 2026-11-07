import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { getSocket } from "../socket/socket";

const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024;

function prettySize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.500l-8.500 8.500a5.500 5.500 0 0 1-7.800-7.800l8.800-8.800a3.700 3.700 0 0 1 5.200 5.200l-8.800 8.800a1.800 1.800 0 0 1-2.600-2.600l8-8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default function MessageInput({ placeholder, conversationId, onSend }) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [error, setError] = useState("");
  const lastSent = useRef(0);
  const fileInput = useRef(null);
  const uploadId = useRef(0); // lets us ignore the result of a cancelled upload

  // Free the preview image when this component goes away
  useEffect(() => {
    return () => {
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    };
  }, [attachment?.previewUrl]);

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

  async function handlePick(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still works
    if (!file) return;

    setError("");
    if (!ALLOWED.includes(file.type)) {
      setError("Only PNG, JPG, GIF, WebP and PDF files are allowed");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File is too large. The limit is 5 MB.");
      return;
    }

    const myUpload = ++uploadId.current;
    setAttachment({
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      name: file.name,
      size: file.size,
      progress: 0,
      status: "uploading",
      result: null,
    });

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await api.post("/api/uploads", form, {
        onUploadProgress: (p) => {
          if (myUpload !== uploadId.current) return;
          const percent = p.total ? Math.round((p.loaded * 100) / p.total) : 0;
          setAttachment((a) => (a ? { ...a, progress: percent } : a));
        },
      });
      if (myUpload !== uploadId.current) return;
      setAttachment((a) =>
        a ? { ...a, status: "done", progress: 100, result: res.data.file } : a
      );
    } catch (err) {
      if (myUpload !== uploadId.current) return;
      setAttachment((a) => (a ? { ...a, status: "error" } : a));
      setError(err.response?.data?.message || "Could not upload the file. Please try again.");
    }
  }

  function removeAttachment() {
    uploadId.current++; // ignore anything the running upload reports from now on
    setAttachment(null);
    setError("");
  }

  const uploading = attachment?.status === "uploading";
  const ready = attachment?.status === "done";
  const broken = attachment?.status === "error";
  const canSend = !uploading && !broken && (text.trim().length > 0 || ready);

  function submit() {
    if (!canSend) return;
    onSend(text.trim(), ready ? [attachment.result] : []);
    setText("");
    setAttachment(null);
    setError("");
    lastSent.current = 0;
  }

    function handleKeyDown(e) {
    if (e.nativeEvent.isComposing) return; // Enter confirms a suggestion, not a send
    // Enter sends, Shift+Enter makes a new line
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="px-6 pb-4 pt-1">
      <div className="rounded-2xl border border-line bg-white p-2 focus-within:border-primary">
        {attachment && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-line bg-cream p-2">
            {attachment.previewUrl ? (
              <img
                src={attachment.previewUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-line text-xs font-semibold">
                PDF
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{attachment.name}</p>
              {uploading && (
                <div className="mt-1">
                  <div className="h-1.5 w-full rounded-full bg-line">
                    <div
                      className="h-1.5 rounded-full bg-primary transition-all"
                      style={{ width: `${attachment.progress}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">Uploading... {attachment.progress}%</p>
                </div>
              )}
              {ready && <p className="text-xs text-muted">{prettySize(attachment.size)} · Ready to send</p>}
              {broken && <p className="text-xs text-danger">Upload failed. Remove it and try again.</p>}
            </div>

            <button
              onClick={removeAttachment}
              aria-label="Remove file"
              className="rounded-full p-1.5 text-muted hover:bg-line hover:text-ink"
            >
              <CloseIcon />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
            onChange={handlePick}
            className="hidden"
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            aria-label="Attach a file"
            title="Attach a file"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink disabled:opacity-40"
          >
            <PaperclipIcon />
          </button>

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
            disabled={!canSend}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          Enter to send, Shift+Enter for a new line. Images and PDFs up to 5 MB.
        </p>
      )}
    </div>
  );
}