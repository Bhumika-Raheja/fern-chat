export const DELETE_WINDOW_MS = 5 * 60 * 1000;
export const DELETE_WINDOW_ERROR = "Messages can only be deleted within 5 minutes of sending.";

export function isWithinDeleteWindow(createdAt, now = Date.now()) {
    if (!createdAt) return false;
    const sentAt = new Date(createdAt).getTime();
    return Number.isFinite(sentAt) && sentAt <= now && now < sentAt + DELETE_WINDOW_MS;
}
