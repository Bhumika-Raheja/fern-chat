import { useConnectionStore } from "../store/connectionStore";

export default function ConnectionBanner() {
    const status = useConnectionStore((s) => s.status);

    if (status === "reconnecting") {
        return (
            <div className="flex items-center gap-2 border-b border-accent bg-accent/15 px-4 py-2 text-sm">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Reconnecting... Messages will be sent when you're back online
            </div>
        );
    }

    if (status === "restored") {
        return (
            <div className="flex items-center gap-2 border-b border-online bg-online/15 px-4 py-2 text-sm">
                <span>✓</span>
                Back online
            </div>
        );
    }

    return null;
}