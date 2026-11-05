export const validMessageId = (id) => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
export const maxMessageId = (a, b) => !a ? b || null : !b ? a : a > b ? a : b;

export function receiptSummary(message, receipts = {}) {
  if (message.status !== "sent") return { status: message.status, readers: [], delivered: [] };
  const sender = message.senderId?._id || message.senderId;
  const others = Object.values(receipts).filter((receipt) => receipt.userId !== sender);
  const readers = others.filter((receipt) => receipt.lastReadMessageId && receipt.lastReadMessageId >= message._id);
  const delivered = others.filter((receipt) =>
    (receipt.lastDeliveredMessageId && receipt.lastDeliveredMessageId >= message._id) || readers.includes(receipt));
  return { status: readers.length ? "read" : delivered.length ? "delivered" : "sent", readers, delivered };
}

export function canMarkRead(doc) {
  return doc.visibilityState === "visible" && doc.hasFocus() && !doc.querySelector?.("dialog[open]");
}

export function newestVisibleMessage(items, viewport) {
  let newest = null;
  for (const item of items) {
    if (!validMessageId(item.id)) continue;
    const rect = item.rect;
    const visibleHeight = Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top);
    if (rect.width > 0 && rect.height > 0 && visibleHeight >= Math.min(24, rect.height) &&
        rect.right > viewport.left && rect.left < viewport.right) {
      newest = maxMessageId(newest, item.id);
    }
  }
  return newest;
}
