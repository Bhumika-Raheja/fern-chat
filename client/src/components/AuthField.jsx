import { useState } from "react";

function EyeIcon({ off }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {off && <path d="M3 3l18 18" />}
        </svg>
    );
}

export default function AuthField({
    label,
    type = "text",
    value,
    onChange,
    error,
    placeholder,
    autoComplete,
}) {
    const [show, setShow] = useState(false);
    const isPassword = type === "password";

    return (
        <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
            <div className="relative">
                <input
                    type={isPassword && show ? "text" : type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted ${error ? "border-danger bg-red-50" : "border-line bg-cream focus:border-primary"
                        } ${isPassword ? "pr-10" : ""}`}
                />
                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShow(!show)}
                        aria-label={show ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                    >
                        <EyeIcon off={show} />
                    </button>
                )}
            </div>
            {error && (
                <p className="mt-1 flex items-center gap-1 text-xs text-danger">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                        !
                    </span>
                    {error}
                </p>
            )}
        </div>
    );
}