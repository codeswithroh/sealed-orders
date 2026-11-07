export function Donut({
  parts,
  size = 120,
  stroke = 14,
  center,
  caption,
}: {
  parts: { v: number; c: string }[];
  size?: number;
  stroke?: number;
  center?: string;
  caption?: string;
}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.v, 0);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceee9" strokeWidth={stroke} />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.v / total) * C;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.c}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - 2)} ${C}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-xl font-extrabold leading-none">{center}</div>
          {caption && <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{caption}</div>}
        </div>
      </div>
    </div>
  );
}

export function Ring({ value, max, size = 64, stroke = 7, color = "var(--ink)", children }: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceee9" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${frac * C} ${C}`} style={{ transition: "stroke-dasharray 0.4s" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const frac = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#eceee9]">
      <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: color, transition: "width 0.4s" }} />
    </div>
  );
}
