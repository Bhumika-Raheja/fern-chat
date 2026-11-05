import { acknowledgeReceipt, getReceiptSnapshot, broadcastReceipt } from "../services/receiptService.js";

export async function getReceipts(req, res, next) {
  try {
    res.json({ receipts: await getReceiptSnapshot(req.params.id, req.user._id) });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const result = await acknowledgeReceipt({
      conversationId: req.params.id, messageId: req.body?.messageId,
      user: req.user, kind: "read",
    });
    if (result.changed) broadcastReceipt(req.app.get("io"), "read", result.receipt);
    res.json({ ok: true, receipt: result.receipt });
  } catch (err) {
    next(err);
  }
}
