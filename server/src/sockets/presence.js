const GRACE_MS = 3000;

const counts = new Map(); // userId -> number of open connections
const timers = new Map(); // userId -> pending "go offline" timer

// Returns true if this person just became online
export function userConnected(userId) {
    const id = String(userId);
    clearTimeout(timers.get(id));
    timers.delete(id);

    const wasOnline = counts.has(id);
    counts.set(id, (counts.get(id) || 0) + 1);
    console.log(`[presence] ${id} open connections: ${counts.get(id)}`);
    return !wasOnline;
}

// When the last connection closes, wait a few seconds before saying "offline"
export function userDisconnected(userId, onOffline) {
    const id = String(userId);
    const left = (counts.get(id) || 1) - 1;
    console.log(`[presence] ${id} open connections: ${left}`);

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
                onOffline();
            }
        }, GRACE_MS)
    );
}

export function onlineAmong(ids) {
    return ids.map(String).filter((id) => counts.has(id));
}