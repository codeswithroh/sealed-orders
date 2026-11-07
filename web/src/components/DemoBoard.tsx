"use client";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Battlefield, type MapUnit } from "./Battlefield";
import { visibleTiles, type Unit } from "@/lib/game";

// A scripted 12-step loop: Bravo holds the Ford, the enemy scout walks into its
// trigger radius and Bravo falls back to the hill, exactly as ordered.
const FRAMES: { blue: [number, number][]; red: [number, number][]; log: string }[] = [
  { blue: [[3, 11], [7, 9], [7, 12]], red: [[11, 3], [7, 2], [3, 4]], log: "Bravo hold the Ford. If they get within 2, fall back to the hill." },
  { blue: [[3, 10], [7, 8], [7, 11]], red: [[11, 4], [7, 3], [3, 5]], log: "Compiled → hold (7,7) · rule: enemy_within 2 → retreat (10,10)" },
  { blue: [[3, 9], [7, 7], [7, 10]], red: [[11, 4], [7, 4], [3, 5]], log: "Sealed in army account · tick 214" },
  { blue: [[3, 8], [7, 7], [7, 10]], red: [[12, 5], [7, 5], [3, 6]], log: "Tick 220 · enemy scout spotted near the Ford" },
  { blue: [[2, 8], [8, 8], [7, 10]], red: [[12, 6], [7, 6], [2, 6]], log: "Rule fired: Bravo falls back" },
  { blue: [[2, 8], [9, 9], [7, 10]], red: [[12, 6], [7, 7], [2, 6]], log: "Enemy takes the Ford…" },
  { blue: [[2, 8], [10, 10], [7, 9]], red: [[12, 7], [7, 8], [2, 6]], log: "…and walks into the scout's line of sight" },
  { blue: [[2, 8], [10, 10], [7, 9]], red: [[12, 7], [7, 8], [2, 6]], log: "Alpha holds the West Bridge · +1/tick" },
];

export function DemoBoard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % FRAMES.length), 1400);
    return () => clearInterval(t);
  }, []);
  const f = FRAMES[i];
  const blue: MapUnit[] = f.blue.map(([x, y], s) => ({ x, y, hp: s === 1 && i > 4 ? 70 : 100, kind: s === 2 ? 1 : 0, squad: s, team: "blue" }));
  const units = blue.map((u) => ({ ...u, action: { kind: 0, x: u.x, y: u.y }, rules: [], cooldown: 0 })) as unknown as Unit[];
  const fog = visibleTiles(units);
  const red: MapUnit[] = f.red
    .map(([x, y], s) => ({ x, y, hp: 100, kind: s === 1 ? 1 : 0, squad: s, team: "red" as const }))
    .filter((u) => fog.has(`${u.x},${u.y}`));
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="text-sm font-semibold">Your view · fog of war</div>
        <span className="chip bg-[#eef6f1] text-green">
          <Lock size={12} /> sealed
        </span>
      </div>
      <Battlefield units={[...blue, ...red]} fog={fog} control={[1, i > 5 ? 2 : 0, 0]} className="w-full rounded-xl" />
      <div className="mt-3 rounded-lg bg-bg px-3 py-2 font-mono text-[12px] text-ink" aria-live="polite">
        {f.log}
      </div>
    </div>
  );
}
