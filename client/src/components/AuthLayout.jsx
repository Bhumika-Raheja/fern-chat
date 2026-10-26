import FernLogo from "./FernLogo";

const chips = ["Real-time messaging", "Channels and DMs", "Share files and ideas"];

function Illustration() {
    return (
        <svg viewBox="0 0 400 260" className="w-full max-w-md" fill="none">
            <circle cx="200" cy="140" r="100" fill="#d9e3c4" opacity="0.6" />
            <path d="M200 225 C200 170 200 120 200 70" stroke="#8a9a6b" strokeWidth="3" strokeLinecap="round" />
            <path d="M200 160 C160 155 140 130 145 110 C180 110 200 135 200 160Z" fill="#8a9a6b" />
            <path d="M200 130 C240 125 262 100 256 78 C220 80 200 105 200 130Z" fill="#5e6f45" />
            <path d="M200 100 C175 95 164 76 168 60 C190 62 200 80 200 100Z" fill="#b8c99a" />

            <rect x="20" y="20" width="230" height="44" rx="16" fill="#5e6f45" />
            <text x="40" y="48" fontSize="14" fill="#ffffff" fontFamily="Inter, sans-serif">
                Let's review the sprint tokens
            </text>

            <rect x="150" y="190" width="230" height="44" rx="16" fill="#ffffff" stroke="#ddd5c8" />
            <text x="170" y="218" fontSize="14" fill="#2b2a26" fontFamily="Inter, sans-serif">
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