"use client";
import { use, useEffect, useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { Loader2, Unlock } from "lucide-react";
import { Battlefield, type MapUnit } from "@/components/Battlefield";
import { getCommander } from "@/lib/client/commander";
import { allPdas, decodeArmy, decodeGame, teeConnection } from "@/lib/chain";
import { type ArmyState, type GameState, SQUAD_NAMES } from "@/lib/game";

export default function Replay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [game, setGame] = useState<GameState | null>(null);
  const [armies, setArmies] = useState<(ArmyState | null)[]>([null, null]);
  const [state, setState] = useState<"loading" | "sealed" | "ready">("loading");

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const conn = await teeConnection(getCommander());
        const p = allPdas(new BN(id));
        const [g, a0, a1] = await conn.getMultipleAccountsInfo([p.game, p.army0, p.army1]);
        if (stop) return;
        if (g) setGame(decodeGame(g.data));
        if (a0 && a1) {
          setArmies([decodeArmy(a0.data), decodeArmy(a1.data)]);
          setState("ready");
          return;
        }
        setState("sealed");
      } catch {
        setState("sealed");
      }
      if (!stop) setTimeout(load, 3000);
    };
    load();
    return () => {
      stop = true;
    };
  }, [id]);

  const timeline = useMemo(() => {
    const rows: { tick: number; side: number; text: string; mask: number }[] = [];
    armies.forEach((a, side) => a?.log.forEach((l) => rows.push({ ...l, side })));
    return rows.sort((a, b) => a.tick - b.tick);
  }, [armies]);

  const units: MapUnit[] = armies.flatMap((a, side) =>
    (a?.units ?? []).map((u, i) => ({ ...u, squad: i, team: side === 0 ? ("blue" as const) : ("red" as const) })),
  );

  if (state === "loading")
    return (
      <div className="card mx-auto flex max-w-xl items-center gap-3 p-6 text-sm text-muted">
        <Loader2 className="animate-spin" size={18} /> Loading…
      </div>
    );
  if (state === "sealed")
    return (
      <div className="card mx-auto max-w-xl p-6 text-sm">
        <div className="flex items-center gap-2 font-bold">
          <Loader2 className="animate-spin" size={18} /> Still sealed
        </div>
        <p className="mt-2 text-muted">The armies become public once the battle ends and the reveal transaction lands. This page retries every 3 s.</p>
      </div>
    );

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Replay #{id.slice(-6)}</h1>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Unlock size={14} /> Every account is now public. Final positions, no fog.
          </div>
        </div>
        <div className="card p-3 sm:p-4">
          <Battlefield units={units} fog={null} control={game?.control} className="mx-auto w-full max-w-[720px] rounded-xl" />
        </div>
        {game && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Result" value={game.winner === 1 ? "Blue won" : game.winner === 2 ? (game.vsAi ? "Claude won" : "Red won") : "Draw"} />
            <Stat label="Score" value={`${game.scores[0]} – ${game.scores[1]}`} />
            <Stat label="Length" value={`${game.tick} ticks`} />
          </div>
        )}
      </div>
      <aside className="card p-5">
        <div className="font-bold">Every order, unsealed</div>
        <p className="mt-1 text-xs text-muted">Read straight from both army accounts. Neither side could see the other&apos;s column during the battle.</p>
        <ol className="mt-4 space-y-3">
          {timeline.map((r, i) => (
            <li key={i} className={`flex gap-3 ${r.side === 1 ? "flex-row-reverse text-right" : ""}`}>
              <span className="w-10 shrink-0 font-mono text-xs text-muted">t{r.tick}</span>
              <div className={`min-w-0 rounded-xl px-3 py-2 text-sm ${r.side === 0 ? "bg-[#eaf1fe]" : "bg-[#fdeeee]"}`}>
                <div className="text-[11px] font-bold opacity-70">
                  {r.side === 0 ? "Blue" : game?.vsAi ? "Claude" : "Red"} ·{" "}
                  {SQUAD_NAMES.filter((_, k) => r.mask & (1 << k)).join(", ")}
                </div>
                {r.text}
              </div>
            </li>
          ))}
          {timeline.length === 0 && <li className="text-sm text-muted">No orders were given.</li>}
        </ol>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1 text-xl font-extrabold">{value}</div>
    </div>
  );
}
