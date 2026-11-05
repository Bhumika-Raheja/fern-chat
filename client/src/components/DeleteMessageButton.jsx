import { useEffect, useState } from "react";
import { DELETE_WINDOW_MS, isWithinDeleteWindow } from "../../../shared/messagePolicy.mjs";

export default function DeleteMessageButton({ createdAt, disabled, deleting, onDelete }) {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        const refresh = () => setNow(Date.now());
        const sentAt = new Date(createdAt).getTime();
        const expiresAt = sentAt + DELETE_WINDOW_MS;
        const currentTime = Date.now();
        // Schedule one refresh at expiry; also recover when a background tab returns.
        const nextChange = currentTime < sentAt ? sentAt : expiresAt;
        const timer = Number.isFinite(nextChange) && currentTime < expiresAt
            ? setTimeout(refresh, Math.max(0, nextChange - currentTime))
            : undefined;
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [createdAt, now]);

    if (!isWithinDeleteWindow(createdAt, now) && !deleting) return null;
    return (
        <button onClick={onDelete} disabled={disabled}
            title="Delete within 5 minutes of sending"
            className="hover:text-danger disabled:opacity-50">
            {deleting ? "Deleting..." : "Delete"}
        </button>
    );
}
