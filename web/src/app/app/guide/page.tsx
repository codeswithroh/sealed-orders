import { Battlefield } from "@/components/Battlefield";

const EXAMPLES = [
  { o: "Everyone take the Ford", c: "Alpha, Bravo, Scout → move (7,7)" },
  { o: "Scout sneak into the North Woods", c: "Scout → move (9,3)" },
  { o: "Alpha hold the West Bridge. If HP below 40, retreat home", c: "Alpha → hold (2,7) · if hp < 40 → retreat (3,13)" },
  { o: "Bravo attack the East Bridge. If we lose the Ford, go back to it", c: "Bravo → attack (12,7) · if Ford lost → move (7,7)" },
  { o: "After tick 200, everyone push to the north hill", c: "all → rule: after tick 200 → attack (4,4)" },
];

export default function Guide() {
  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">How to command</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { t: "Win", d: "Each crossing you hold scores 1 point per tick. First to 150, or most points after 480 ticks (4 min). Wiping out the enemy also wins." },
            { t: "Squads", d: "Alpha and Bravo: infantry, 100 HP, move every other tick. Scout: 60 HP, moves every tick, sees 5 tiles." },
            { t: "Terrain", d: "River on the middle row; cross only at the 3 points. Hills: +2 sight, 25% less damage. Woods: invisible unless an enemy is adjacent." },
            { t: "Actions", d: "Hold (fights, 25% less damage) · Move (fights on the way) · Attack (stops to fight) · Retreat (never fights)." },
            { t: "Standing orders", d: "Each squad keeps up to 2 rules: enemy within N, enemy near a place, HP below N, after tick N, point lost. Each fires once." },
            { t: "Fair AI", d: "Triggers use only what your army can see. The AI opponent reads only its own sealed accounts." },
          ].map((x) => (
            <div key={x.t} className="card p-5">
              <div className="font-bold">{x.t}</div>
              <div className="mt-1 text-sm text-muted">{x.d}</div>
            </div>
          ))}
        </div>
        <div className="card p-3 sm:p-4">
          <Battlefield units={[]} control={[0, 0, 0]} className="mx-auto w-full max-w-[640px] rounded-xl" />
          <div className="mt-2 text-center text-xs text-muted">You start in the south. Points from west to east: West Bridge, Ford, East Bridge.</div>
        </div>
      </div>
      <aside className="card p-5">
        <div className="font-bold">Order → what the program stores</div>
        <ul className="mt-4 space-y-3">
          {EXAMPLES.map((e) => (
            <li key={e.o} className="rounded-xl border border-line p-3">
              <div className="text-sm font-semibold">&ldquo;{e.o}&rdquo;</div>
              <div className="mt-1 font-mono text-[12px] text-muted">{e.c}</div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
