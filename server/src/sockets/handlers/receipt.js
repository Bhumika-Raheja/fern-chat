import { acknowledgeReceipt, broadcastReceipt } from "../../services/receiptService.js";

export function registerReceiptHandlers(io, socket) {
  for (const kind of ["delivered", "read"]) {
    socket.on("message:" + kind, async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const result = await acknowledgeReceipt({
          conversationId: payload?.conversationId,
          messageId: payload?.messageId,
          user: socket.user,
          kind,
        });
        if (result.changed) broadcastReceipt(io, kind, result.receipt);
        reply({ ok: true, receipt: result.receipt });
      } catch (err) {
        if (!err.status) console.error("Could not save receipt:", err.message);
        reply({ ok: false, status: err.status || 500, error: err.status ? err.message : "Could not save receipt" });
      }
    });
  }
}
