import FernLogo from "./FernLogo";

const chips = ["Real-time messaging", "Channels and DMs", "Share files and ideas"];

function Illustration() {
    return (
        <svg viewBox="0 0 320 240" className="w-full max-w-sm" fill="none">
            <circle cx="160" cy="130" r="95" fill="#d9e3c4" opacity="0.6" />
            <path d="M160 215 C160 160 160 110 160 60" stroke="#8a9a6b" strokeWidth="3" strokeLinecap="round" />
            <path d="M160 150 C120 145 100 120 105 100 C140 100 160 125 160 150Z" fill="#8a9a6b" />
            <path d="M160 120 C200 115 222 90 216 68 C180 70 160 95 160 120Z" fill="#5e6f45" />
            <path d="M160 90 C135 85 124 66 128 50 C150 52 160 70 160 90Z" fill="#b8c99a" />
            <rect x="20" y="30" width="150" height="40" rx="14" fill="#5e6f45" />
            <text x="36" y="55" fontSize="13" fill="#ffffff" fontFamily="Inter, sans-serif">
                Let's review the sprint tokens
            </text>
            <rect x="150" y="170" width="150" height="40" rx="14" fill="#ffffff" stroke="#ddd5c8" />
            <text x="166" y="195" fontSize="13" fill="#2b2a26" fontFamily="Inter, sans-serif">
                Looking clean and calm!
            </text>
        </svg>
    );
}

export default function AuthLayout({ children }) {
    return (
        <div className="flex min-h-screen">
            {/* Left panel: hidden on small screens */}
            <div className="hidden flex-1 flex-col justify-between bg-sidebar p-10 lg:flex">
                <div>
                    <div className="flex items-center gap-2">
                        <FernLogo size={36} />
                        <span className="text-xl font-semibold">Fern</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">Conversations that grow.</p>
                </div>

                <div className="flex justify-center">
                    <Illustration />
                </div>

                <div className="flex flex-wrap gap-2">
                    {chips.map((c) => (
                        <span key={c} className="rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-ink">
                            {c}
                        </span>
                    ))}
                </div>
            </div>

            {/* Right side: the form */}
            <div className="flex flex-1 items-center justify-center bg-cream p-4">
                <div className="w-full max-w-[420px]">
                    <div className="mb-6 flex items-center gap-2 lg:hidden">
                        <FernLogo size={32} />
                        <span className="text-xl font-semibold">Fern</span>
                    </div>
                    <div className="rounded-xl border border-line bg-white p-8 shadow-sm">{children}</div>
                </div>
            </div>
        </div>
    );
}