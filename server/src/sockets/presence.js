const GRACE_MS = 3000;

const counts = new Map(); // userId -> number of open connections
const timers = new Map(); // userId -> pending "go offline" timer

// Returns true if this person just became online
export function userConnected(userId) {
    if (!userId) return false;
    const id = String(userId);
    clearTimeout(timers.get(id));
    timers.delete(id);

    const wasOnline = counts.has(id);
    counts.set(id, (counts.get(id) || 0) + 1);
    return !wasOnline;
}

// When the last connection closes, wait a few seconds before saying "offline"
export function userDisconnected(userId, onOffline) {
    if (!userId) return;
    const id = String(userId);
    if (!counts.has(id)) return;
    const left = counts.get(id) - 1;

    if (left > 0) {
        counts.set(id, left);
        return;
    }

    counts.set(id, 0); // still counted as online during the grace period
    timers.set(
        id,
        setTimeout(() => {
            if ((counts.get(id) || 0) === 0) {
                counts.delete(id);
                timers.delete(id);
                if (typeof onOffline === "function") onOffline();
            }
        }, GRACE_MS)
    );
}

export function onlineAmong(ids) {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(String))].filter((id) => counts.has(id));
}