import { receiptSummary } from "../utils/receipts.js";

function Ticks({ double }) {
  return (
    <svg aria-hidden="true" width={double ? 17 : 13} height="12" viewBox={double ? "0 0 30 24" : "0 0 24 24"}
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12.5l4.5 4.5L18 7.5" />
      {double && <path d="M13 17l4.5 0L28 7.5" />}
    </svg>
  );
}

export default function MessageReceipt({ message, receipts, group, onlyRead = false }) {
  const { status, readers, delivered } = receiptSummary(message, receipts);
  if (message.status !== "sent" || (onlyRead && !readers.length)) return null;
  if (group && readers.length) {
    return (
      <details className="relative inline-block text-primary">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded focus-visible:outline">
          <Ticks double /> Read by {readers.length}
        </summary>
        <div className="absolute bottom-full right-0 z-10 mb-2 w-48 rounded-lg border border-line bg-white p-3 text-left text-ink shadow-lg">
          <p className="mb-2 font-semibold">Read by</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {readers.map((receipt) => <li key={receipt.userId}>{receipt.user?.name || "Member"}</li>)}
          </ul>
        </div>
      </details>
    );
  }
  const label = status === "read" ? "Read" : status === "delivered" ? "Delivered" : "Sent";
  return (
    <span className={"inline-flex items-center gap-1 " + (status === "read" ? "text-primary" : "")}
      title={status === "delivered" ? "Received by " + delivered.map((r) => r.user?.name || "a member").join(", ") : label}>
      <Ticks double={status !== "sent"} /> {label}
    </span>
  );
}
