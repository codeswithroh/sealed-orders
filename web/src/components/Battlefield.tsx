"use client";
import { FORESTS, H, HILLS, POINTS, POINT_NAMES, RIVER_Y, SQUAD_NAMES, W, isCrossing, maxHp } from "@/lib/game";

export type MapUnit = {
  x: number;
  y: number;
  hp: number;
  kind: number;
  squad: number;
  team: "blue" | "red";
  ghost?: boolean; // last known position, not currently visible
  target?: { x: number; y: number } | null;
  label?: string;
};

type Props = {
  units: MapUnit[];
  fog?: Set<string> | null; // tiles you can see; null = no fog (replay)
  control?: number[]; // per point: 0 none, 1 side0, 2 side1
  mySide?: number; // rotates so your base is at the bottom
  onTile?: (x: number, y: number) => void;
  highlight?: number | null;
  className?: string;
};

const CELL = 10;

export function Battlefield({ units, fog = null, control = [0, 0, 0], mySide = 0, onTile, highlight, className }: Props) {
  const flip = mySide === 1;
  const tx = (x: number) => (flip ? W - 1 - x : x);
  const ty = (y: number) => (flip ? H - 1 - y : y);
  const owner = (c: number) => (c === 0 ? null : c - 1 === mySide ? "blue" : "red");

  const tiles = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let fill = "var(--grass)";
      if (y === RIVER_Y) fill = isCrossing(x, y) ? "var(--crossing)" : "var(--river)";
      tiles.push(
        <rect
          key={`t${x},${y}`}
          x={tx(x) * CELL}
          y={ty(y) * CELL}
          width={CELL}
          height={CELL}
          fill={fill}
          onClick={onTile ? () => onTile(x, y) : undefined}
          style={onTile ? { cursor: "crosshair" } : undefined}
        />,
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${W * CELL} ${H * CELL}`} className={className} role="img" aria-label="Battlefield">
      <g>{tiles}</g>
      {/* woods */}
      {FORESTS.map(([x, y]) => (
        <g key={`f${x},${y}`} pointerEvents="none">
          <rect x={tx(x) * CELL} y={ty(y) * CELL} width={CELL} height={CELL} fill="var(--woods)" />
          <circle cx={tx(x) * CELL + 3.5} cy={ty(y) * CELL + 4} r={2.2} fill="#8fb07c" />
          <circle cx={tx(x) * CELL + 6.8} cy={ty(y) * CELL + 6.4} r={2.2} fill="#8fb07c" />
        </g>
      ))}
      {/* hills */}
      {HILLS.map(([x, y]) => (
        <g key={`h${x},${y}`} pointerEvents="none">
          <circle cx={tx(x) * CELL + 5} cy={ty(y) * CELL + 5} r={9} fill="var(--hill)" opacity={0.55} />
          <circle cx={tx(x) * CELL + 5} cy={ty(y) * CELL + 5} r={5.5} fill="none" stroke="#b3b996" strokeWidth={0.5} />
          <circle cx={tx(x) * CELL + 5} cy={ty(y) * CELL + 5} r={2.5} fill="none" stroke="#b3b996" strokeWidth={0.5} />
        </g>
      ))}
      {/* grid */}
      <g stroke="rgba(21,23,26,0.06)" strokeWidth={0.2} pointerEvents="none">
        {Array.from({ length: W + 1 }, (_, i) => (
          <line key={`gx${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={H * CELL} />
        ))}
        {Array.from({ length: H + 1 }, (_, i) => (
          <line key={`gy${i}`} x1={0} y1={i * CELL} x2={W * CELL} y2={i * CELL} />
        ))}
      </g>
      {/* capture points */}
      {POINTS.map(([x, y], i) => {
        const o = owner(control[i] ?? 0);
        const color = o === "blue" ? "var(--blue)" : o === "red" ? "var(--red)" : "#8a8f86";
        return (
          <g key={`p${i}`} pointerEvents="none">
            <circle cx={tx(x) * CELL + 5} cy={ty(y) * CELL + 5} r={13} fill="none" stroke={color} strokeWidth={0.8} strokeDasharray="2 1.5" />
            <text x={tx(x) * CELL + 5} y={ty(y) * CELL + (flip ? 22 : -10)} textAnchor="middle" fontSize={4} fontWeight={700} fill={color}>
              {POINT_NAMES[i].toUpperCase()}
            </text>
          </g>
        );
      })}
      {/* fog */}
      {fog && (
        <g pointerEvents="none">
          {Array.from({ length: W * H }, (_, k) => {
            const x = k % W;
            const y = Math.floor(k / W);
            if (fog.has(`${x},${y}`)) return null;
            return <rect key={`fog${k}`} x={tx(x) * CELL} y={ty(y) * CELL} width={CELL} height={CELL} fill="rgba(21,23,26,0.42)" />;
          })}
        </g>
      )}
      {/* move targets */}
      {units
        .filter((u) => u.team === "blue" && u.target && u.hp > 0 && (u.target.x !== u.x || u.target.y !== u.y))
        .map((u) => (
          <line
            key={`m${u.squad}`}
            x1={tx(u.x) * CELL + 5}
            y1={ty(u.y) * CELL + 5}
            x2={tx(u.target!.x) * CELL + 5}
            y2={ty(u.target!.y) * CELL + 5}
            stroke="var(--blue)"
            strokeWidth={0.7}
            strokeDasharray="1.5 1.5"
            opacity={0.8}
            pointerEvents="none"
          />
        ))}
      {/* units */}
      {units
        .filter((u) => u.hp > 0 || u.ghost)
        .map((u) => {
          const px = tx(u.x) * CELL + 5;
          const py = ty(u.y) * CELL + 5;
          const cx = 0;
          const cy = 0;
          const color = u.team === "blue" ? "var(--blue)" : "var(--red)";
          const frac = Math.max(0, u.hp / maxHp(u.kind));
          const r = u.kind === 1 ? 3.4 : 4;
          return (
            <g
              key={`${u.team}${u.squad}${u.ghost ? "g" : ""}`}
              pointerEvents="none"
              style={{ transform: `translate(${px}px, ${py}px)`, transition: "transform 0.42s cubic-bezier(.4,.0,.2,1)" }}
            >
              {highlight === u.squad && u.team === "blue" && <circle cx={cx} cy={cy} r={6} fill="none" stroke={color} strokeWidth={0.6} />}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={u.ghost ? "white" : color}
                stroke={u.ghost ? color : "white"}
                strokeWidth={u.ghost ? 0.6 : 0.8}
                strokeDasharray={u.ghost ? "1 1" : undefined}
                opacity={u.ghost ? 0.85 : 1}
              />
              <text x={cx} y={cy + 1.5} textAnchor="middle" fontSize={4.2} fontWeight={800} fill={u.ghost ? color : "white"}>
                {u.label ?? SQUAD_NAMES[u.squad][0]}
              </text>
              {!u.ghost && (
                <g>
                  <rect x={cx - 4} y={cy + r + 0.8} width={8} height={1.1} rx={0.5} fill="rgba(21,23,26,0.15)" />
                  <rect x={cx - 4} y={cy + r + 0.8} width={8 * frac} height={1.1} rx={0.5} fill={frac > 0.5 ? "var(--green)" : frac > 0.25 ? "var(--amber)" : "var(--red)"} />
                </g>
              )}
            </g>
          );
        })}
    </svg>
  );
}
