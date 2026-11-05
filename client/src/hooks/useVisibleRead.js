import { useEffect } from "react";
import { canMarkRead, newestVisibleMessage } from "../utils/receipts.js";

export function useVisibleRead(rootRef, messages, onRead) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onRead) return;
    let timer;
    let frame;
    function check() {
      clearTimeout(timer);
      if (!canMarkRead(document)) return;
      const items = [...root.querySelectorAll("[data-message-id]")].map((node) => ({
        id: node.dataset.messageId, rect: node.getBoundingClientRect(),
      }));
      const id = newestVisibleMessage(items, root.getBoundingClientRect());
      if (id) timer = setTimeout(() => {
        if (canMarkRead(document)) onRead(id);
      }, 200);
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    }
    const observer = typeof IntersectionObserver === "undefined" ? null
      : new IntersectionObserver(schedule, { root, threshold: [0, 0.1, 0.25, 0.5, 1] });
    root.querySelectorAll("[data-message-id]").forEach((node) => observer?.observe(node));
    root.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", schedule);
    document.addEventListener("focusin", schedule);
    window.addEventListener("focus", schedule);
    window.addEventListener("blur", schedule);
    schedule();
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      root.removeEventListener("scroll", schedule);
      document.removeEventListener("visibilitychange", schedule);
      document.removeEventListener("focusin", schedule);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("blur", schedule);
    };
  }, [rootRef, messages, onRead]);
}
