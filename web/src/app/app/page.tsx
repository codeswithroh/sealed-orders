"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, Check, Copy, Loader2, Swords, Trophy, Users } from "lucide-react";
import { getCommander, myGames, rememberGame } from "@/lib/client/commander";
import { Donut } from "@/components/charts";

type Row = {
  gameId: string;
  vsAi: boolean;
  createdAt: number;
  host: string;
  status: "waiting" | "active" | "ended";
  winner?: number;
  scores?: number[];
  ticks?: number;
};

const STAGES = [
  "Creating game accounts on Solana",
  "Delegating them to the TEE rollup",
  "Sealing each army to its commander",
  "Starting the 500 ms tick crank",
];

export default function WarRoom() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "ai" | "friend">(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMine(myGames().map((g) => g.gameId));
    const load = () =>
      fetch("/api/games")
        .then((r) => r.json())
        .then((j) => setRows(j.games ?? []))
        .catch(() => setRows([]));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  async function create(vsAi: boolean) {
    setBusy(vsAi ? "ai" : "friend");
    setError(null);
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), vsAi ? 4500 : 3500);
    try {
      const commander = getCommander().publicKey.toBase58();
      const r = await fetch("/api/games", { method: "POST", body: JSON.stringify({ commander, vsAi }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not create the battle");
      rememberGame(j.gameId, 0);
      if (vsAi) router.push(`/app/battle/${j.gameId}`);
      else setInvite(`${location.origin}/app/join/${j.gameId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer);
      setBusy(null);
    }
  }

  const ended = (rows ?? []).filter((r) => r.status === "ended");
  const aiGames = ended.filter((r) => r.vsAi);
  const humanWins = aiGames.filter((r) => r.winner === 1).length;
  const aiWins = aiGames.filter((r) => r.winner === 2).length;
  const draws = aiGames.length - humanWins - aiWins;
  const avgTicks = ended.length ? Math.round(ended.reduce((s, r) => s + (r.ticks ?? 0), 0) / ended.length) : 0;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">War room</h1>
          <p className="text-sm text-muted">Start a battle. Your orders and positions stay sealed until it ends.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => create(true)}
            disabled={!!busy}
            className="card group flex flex-col items-start gap-3 bg-ink p-6 text-left text-white transition hover:-translate-y-0.5 disabled:opacity-80"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent">
              <Bot size={20} />
            </span>
            <div>
              <div className="text-lg font-extrabold">Battle the AI</div>
              <div className="text-sm text-white/65">Claude commands the red army from its own sealed view.</div>
            </div>
            <span className="btn btn-accent mt-1">{busy === "ai" ? <Loader2 size={16} className="animate-spin" /> : <Swords size={16} />} Deploy</span>
          </button>
          <button
            onClick={() => create(false)}
            disabled={!!busy}
            className="card flex flex-col items-start gap-3 p-6 text-left transition hover:-translate-y-0.5 disabled:opacity-80"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg">
              <Users size={20} />
            </span>
            <div>
              <div className="text-lg font-extrabold">Challenge a friend</div>
              <div className="text-sm text-muted">Get a link. They join from any browser, no wallet needed.</div>
            </div>
            <span className="btn btn-ghost mt-1">{busy === "friend" ? <Loader2 size={16} className="animate-spin" /> : null} Create invite</span>
          </button>
        </div>

        {busy && (
          <div className="card p-5" aria-live="polite">
            <div className="label mb-3">Setting up the battlefield · ~20 s</div>
            <ol className="grid gap-2 sm:grid-cols-4">
              {STAGES.map((s, i) => (
                <li key={s} className={`flex items-center gap-2 text-sm ${i <= stage ? "text-ink" : "text-muted"}`}>
                  {i < stage ? <Check size={16} className="text-green" /> : i === stage ? <Loader2 size={16} className="animate-spin" /> : <span className="h-4 w-4 rounded-full border border-line" />}
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}
        {error && <div className="card border-red/40 bg-[#fdeeee] p-4 text-sm text-red">{error}</div>}
        {invite && (
          <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="label">Send this link to your opponent</div>
              <div className="truncate font-mono text-sm">{invite}</div>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => {
                navigator.clipboard.writeText(invite);
                setCopied(true);
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
            </button>
            <Link href={`/app/battle/${invite.split("/").pop()}`} className="btn btn-primary">
              Go to battle
            </Link>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Battles fought" value={ended.length} sub={`${(rows ?? []).filter((r) => r.status === "active").length} live now`} />
          <Stat label="Avg battle length" value={avgTicks ? `${Math.round((avgTicks * 0.5) / 6) / 10} min` : "–"} sub={avgTicks ? `${avgTicks} ticks` : "no battles yet"} />
          <Stat label="Your battles" value={mine.length} sub="on this browser" />
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="font-bold">Recent battles</div>
            <span className="text-xs text-muted">Ended battles are public replays</span>
          </div>
          {rows === null ? (
            <div className="px-5 pb-5 text-sm text-muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 pb-6 text-sm text-muted">No battles yet. Start the first one above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-y border-line bg-bg/60 text-left text-xs text-muted">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Battle</th>
                    <th className="px-5 py-2 font-semibold">Mode</th>
                    <th className="px-5 py-2 font-semibold">Status</th>
                    <th className="px-5 py-2 font-semibold">Score</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 12).map((r) => (
                    <tr key={r.gameId} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 font-mono text-xs">#{r.gameId.slice(-6)}</td>
                      <td className="px-5 py-3">{r.vsAi ? "vs AI" : "vs friend"}</td>
                      <td className="px-5 py-3">
                        <StatusChip r={r} />
                      </td>
                      <td className="px-5 py-3 font-mono">{r.scores ? `${r.scores[0]} – ${r.scores[1]}` : "–"}</td>
                      <td className="px-5 py-3 text-right">
                        {r.status === "ended" ? (
                          <Link href={`/app/replay/${r.gameId}`} className="font-semibold text-blue hover:underline">
                            Replay
                          </Link>
                        ) : mine.includes(r.gameId) ? (
                          <Link href={`/app/battle/${r.gameId}`} className="font-semibold text-blue hover:underline">
                            Rejoin
                          </Link>
                        ) : r.status === "waiting" ? (
                          <Link href={`/app/join/${r.gameId}`} className="font-semibold text-blue hover:underline">
                            Join
                          </Link>
                        ) : (
                          <span className="text-muted">sealed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 font-bold">
            <Trophy size={16} /> Humans vs AI
          </div>
          <div className="mt-4 flex items-center gap-5">
            <Donut
              size={112}
              parts={[
                { v: humanWins, c: "var(--blue)" },
                { v: aiWins, c: "var(--red)" },
                { v: draws, c: "#c9ccc4" },
              ]}
              center={aiGames.length ? `${Math.round((humanWins / aiGames.length) * 100)}%` : "–"}
              caption="human wins"
            />
            <ul className="space-y-2 text-sm">
              <Legend c="var(--blue)" l="Humans" v={humanWins} />
              <Legend c="var(--red)" l="Claude" v={aiWins} />
              <Legend c="#c9ccc4" l="Draws" v={draws} />
            </ul>
          </div>
        </div>
        <div className="card p-5">
          <div className="font-bold">Orders that work</div>
          <ul className="mt-3 space-y-2">
            {[
              "Everyone take the Ford",
              "Scout go to the North Woods and stay hidden",
              "Alpha hold the West Bridge. If HP below 40, retreat home",
              "Bravo attack the East Bridge. If we lose the Ford, go back to it",
            ].map((o) => (
              <li key={o} className="rounded-lg bg-bg px-3 py-2 font-mono text-[12px]">
                {o}
              </li>
            ))}
          </ul>
          <Link href="/app/guide" className="mt-3 inline-block text-sm font-semibold text-blue hover:underline">
            Full command guide
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="card p-5">
      <div className="label">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}

function Legend({ c, l, v }: { c: string; l: string; v: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
      <span className="text-muted">{l}</span>
      <span className="ml-auto font-bold">{v}</span>
    </li>
  );
}

function StatusChip({ r }: { r: Row }) {
  if (r.status === "waiting") return <span className="chip bg-[#fff5e6] text-amber">waiting</span>;
  if (r.status === "active")
    return (
      <span className="chip bg-[#eaf1fe] text-blue">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue" /> live
      </span>
    );
  const label = r.winner === 1 ? "blue won" : r.winner === 2 ? (r.vsAi ? "AI won" : "red won") : "draw";
  return <span className="chip bg-bg text-ink">{label}</span>;
}
