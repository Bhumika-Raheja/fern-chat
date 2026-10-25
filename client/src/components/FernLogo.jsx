export default function FernLogo({ size = 32 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Fern">
            <rect width="64" height="58" rx="14" fill="var(--fern-primary)" />
            <path d="M14 50 L9 60 L24 54 Z" fill="var(--fern-primary)" />
            <path d="M32 13C45 17 49 30 41 40C37 45 30 46 24 44C20 34 22 22 32 13Z" fill="#fff" />
            <path d="M26 42C30 34 34 26 38 20" stroke="var(--fern-primary)" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}