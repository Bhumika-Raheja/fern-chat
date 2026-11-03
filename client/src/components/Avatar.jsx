const colors = ["#8a9a6b", "#c77d4e", "#6f8a8f", "#a38b6d", "#7a6f9b", "#5e6f45"];

function pickColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

// online: true / false shows a presence dot, undefined shows no dot
export default function Avatar({ name = "?", size = 32, online, ring = "var(--fern-bg)" }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
        style={{ background: pickColor(name), fontSize: size * 0.38 }}
      >
        {initials}
      </span>
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${
            online ? "bg-online" : "bg-offline"
          }`}
          style={{ borderColor: ring }}
        />
      )}
    </span>
  );
}