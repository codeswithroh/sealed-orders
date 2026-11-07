"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import type { Connection } from "@solana/web3.js";
import { Check, Copy, EyeOff, Loader2, Lock, Mic, MicOff, Send, ShieldX } from "lucide-react";
import { Battlefield, type MapUnit } from "@/components/Battlefield";
import { Bar, Ring } from "@/components/charts";
import { getCommander, sideFor } from "@/lib/client/commander";
import { armyPda, issueOrders, readSide, teeConnection } from "@/lib/chain";
import {
  A,
  type ArmyState,
  type GameState,
  type IntelState,
  MAX_TICKS,
  type Order,
  POINT_NAMES,
  SQUAD_NAMES,
  T,
  WIN_SCORE,
  describeAction,
  describeTrigger,
  maxHp,
  tileName,
  visibleTiles,
} from "@/lib/game";

type Sent = { text: string; understood: string; orders: Order[]; ms: number; sig: string; at: number };

export default function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const gameId = useMemo(() => new BN(id), [id]);
  const [side, setSide] = useState<number>(0);
  const [conn, setConn] = useState<Connection | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [army, setArmy] = useState<ArmyState | null>(null);
  const [intel, setIntel] = useState<IntelState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    setSide(sideFor(id) ?? 0);
    teeConnection(getCommander())
      .then(setConn)
      .catch((e) => setLoadErr(`Could not authenticate with the rollup: ${e.message}`));
  }, [id]);

  useEffect(() => {
    if (!conn) return;
    let stop = false;
    const poll = async () => {
      try {
        const s = await readSide(conn, gameId, side);
        if (stop) return;
        if (s.game) setGame(s.game);
        if (s.army) setArmy(s.army);
        if (s.intel) setIntel(s.intel);
      } catch {}
      if (!stop) setTimeout(poll, 400);
    };
    poll();
    return () => {
      stop = true;
    };
  }, [conn, gameId, side]);

  if (loadErr) return <div className="card mx-auto max-w-xl p-6 text-sm text-red">{loadErr}</div>;
  if (!game || !army)
    return (
      <div className="card mx-auto flex max-w-xl items-center gap-3 p-6 text-sm text-muted">
        <Loader2 className="animate-spin" size={18} /> Reading your sealed army from the rollup…
      </div>
    );
  if (game.status === 0) return game.vsAi ? <Ready id={id} army={army} /> : <Waiting id={id} />;
  return <Battle game={game} army={army} intel={intel} side={side} conn={conn!} gameId={gameId} />;
}

function Ready({ id, army }: { id: string; army: ArmyState }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/games/${id}/start`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const units: MapUnit[] = army.units.map((u, i) => ({ ...u, squad: i, team: "blue" }));
  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_320px]">
      <div className="card p-3 sm:p-4">
        <Battlefield units={units} fog={visibleTiles(army.units)} mySide={army.side} className="w-full rounded-xl" />
      </div>
      <div className="card flex flex-col gap-4 p-6">
        <div>
          <div className="label">Battlefield ready</div>
          <div className="mt-1 text-2xl font-extrabold">Your army is sealed</div>
          <p className="mt-2 text-sm text-muted">Three squads at your base in the south. Claude is in the north and can&apos;t see you. Hold crossings to score; first to {WIN_SCORE} wins.</p>
        </div>
        <ul className="space-y-1 text-sm">
          <li>· Take the Ford early, it&apos;s the shortest walk for both sides</li>
          <li>· Your scout sees 5 tiles; woods hide it</li>
          <li>· Add &ldquo;if…&rdquo; to any order to set a trap</li>
        </ul>
        <button className="btn btn-accent h-12 text-base" onClick={start} disabled={busy}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : null} {busy ? "Starting the crank…" : "Start the battle"}
        </button>
        {err && <div className="text-sm text-red">{err}</div>}
      </div>
    </div>
  );
}

function Waiting({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${location.origin}/app/join/${id}` : "";
  return (
    <div className="card mx-auto max-w-xl p-6">
      <div className="flex items-center gap-2 font-bold">
        <Loader2 className="animate-spin" size={18} /> Waiting for your opponent
      </div>
      <p className="mt-2 text-sm text-muted">The battle starts as soon as they open this link.</p>
      <div className="mt-4 flex gap-2">
        <div className="min-w-0 flex-1 truncate rounded-lg bg-bg px-3 py-2 font-mono text-sm">{link}</div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

function Battle({ game, army, intel, side, conn, gameId }: { game: GameState; army: ArmyState; intel: IntelState | null; side: number; conn: Connection; gameId: BN }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "compiling" | "sealing">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);
  const [listening, setListening] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  const me = side;
  const enemy = 1 - side;
  const fog = useMemo(() => visibleTiles(army.units), [army.units]);

  const units: MapUnit[] = useMemo(() => {
    const out: MapUnit[] = army.units.map((u, i) => ({ ...u, squad: i, team: "blue", target: u.action.kind !== A.HOLD ? { x: u.action.x, y: u.action.y } : null }));
    (intel?.seen ?? []).forEach((s, i) => {
      const kind = i === 2 ? 1 : 0;
      if (s.visible) out.push({ x: s.x, y: s.y, hp: s.hp, kind, squad: i, team: "red" });
      else if (s.lastSeen > 0 && s.hp > 0) out.push({ x: s.x, y: s.y, hp: s.hp, kind, squad: i, team: "red", ghost: true });
    });
    return out;
  }, [army.units, intel]);

  const submit = useCallback(async () => {
    const t = text.trim();
    if (!t || phase !== "idle") return;
    setErr(null);
    setPhase("compiling");
    const started = performance.now();
    try {
      const r = await fetch("/api/compile", { method: "POST", body: JSON.stringify({ text: t, army, intel, tick: game.tick }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The lieutenant didn't understand that");
      if (!j.orders?.length) throw new Error(`"${j.understood}" — no squad orders came out of that. Try naming a squad and a place.`);
      setPhase("sealing");
      const sig = await issueOrders(conn, getCommander(), gameId, side, j.orders, t);
      setSent((s) => [{ text: t, understood: j.understood, orders: j.orders, ms: Math.round(performance.now() - started), sig, at: game.tick }, ...s].slice(0, 20));
      setText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPhase("idle");
    }
  }, [text, phase, army, intel, game.tick, conn, gameId, side]);

  const toggleMic = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setErr("Voice input isn't supported in this browser. Try Chrome.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => setText(Array.from(e.results).map((r: any) => r[0].transcript).join(" "));
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const ended = game.status === 2;
  const myScore = game.scores[me];
  const theirScore = game.scores[enemy];
  const won = game.winner === me + 1;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Battle #{game.gameId.slice(-6)}</h1>
            <div className="text-sm text-muted">{game.vsAi ? "You (blue) vs Claude (red)" : `You are ${me === 0 ? "south" : "north"}`} · click the map to drop a coordinate into your order</div>
          </div>
          <SpyButton conn={conn} gameId={gameId} enemySide={enemy} />
        </div>

        <div className="card relative p-3 sm:p-4">
          <Battlefield units={units} fog={fog} control={game.control} mySide={me} highlight={highlight} className="mx-auto w-full max-w-[720px] rounded-xl" onTile={(x, y) => {
            setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${tileName(x, y).startsWith("(") ? `(${x},${y})` : tileName(x, y)} `);
            inputRef.current?.focus();
          }} />
          {ended && (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-white/80 backdrop-blur-sm">
              <div className="text-center">
                <div className="text-4xl font-extrabold">{game.winner === 3 ? "Draw" : won ? "Victory" : "Defeat"}</div>
                <div className="mt-1 font-mono text-muted">
                  {myScore} – {theirScore} · {game.tick} ticks
                </div>
                <Link href={`/app/replay/${game.gameId}`} className="btn btn-primary mt-4">
                  Open the unsealed replay
                </Link>
                <div className="mt-2 text-xs text-muted">The server reveals every account a few seconds after the end.</div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {army.units.map((u, i) => (
            <div key={i} className="card p-4" onMouseEnter={() => setHighlight(i)} onMouseLeave={() => setHighlight(null)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-blue text-[11px] font-extrabold text-white">{SQUAD_NAMES[i][0]}</span>
                  {SQUAD_NAMES[i]}
                </div>
                <span className="font-mono text-xs text-muted">
                  {u.hp}/{maxHp(u.kind)}
                </span>
              </div>
              <div className="mt-2">
                <Bar value={u.hp} max={maxHp(u.kind)} color={u.hp / maxHp(u.kind) > 0.5 ? "var(--green)" : u.hp / maxHp(u.kind) > 0.25 ? "var(--amber)" : "var(--red)"} />
              </div>
              <div className="mt-3 text-sm font-semibold">{u.hp === 0 ? "Destroyed" : describeAction(u.action)}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {u.rules
                  .filter((r) => r.trigger.kind !== T.NONE)
                  .map((r, k) => (
                    <span key={k} className={`chip ${r.fired ? "bg-bg text-muted line-through" : "bg-[#fff1eb] text-accent"}`} title={r.fired ? "already fired" : "armed"}>
                      if {describeTrigger(r.trigger)} → {describeAction(r.action)}
                    </span>
                  ))}
                {u.rules.every((r) => r.trigger.kind === T.NONE) && <span className="text-xs text-muted">no standing orders</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-4">
            <Ring value={game.tick} max={MAX_TICKS} size={72} color="var(--ink)">
              <div className="text-center leading-none">
                <div className="text-sm font-extrabold">{Math.max(0, Math.ceil((MAX_TICKS - game.tick) / 2))}s</div>
                <div className="text-[9px] font-semibold uppercase text-muted">left</div>
              </div>
            </Ring>
            <div className="flex-1 space-y-3">
              <ScoreRow label="You" v={myScore} color="var(--blue)" />
              <ScoreRow label={game.vsAi ? "Claude" : "Enemy"} v={theirScore} color="var(--red)" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {POINT_NAMES.map((n, i) => {
              const c = game.control[i];
              const mine = c === me + 1;
              const theirs = c === enemy + 1;
              return (
                <div key={n} className={`rounded-lg px-2 py-2 text-center text-[11px] font-bold ${mine ? "bg-[#eaf1fe] text-blue" : theirs ? "bg-[#fdeeee] text-red" : "bg-bg text-muted"}`}>
                  {n}
                  <div className="font-semibold opacity-70">{mine ? "yours" : theirs ? "theirs" : "open"}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="font-bold">Give an order</div>
            <span className="chip bg-[#eef6f1] text-green">
              <Lock size={12} /> sealed · 0 SOL
            </span>
          </div>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={ended}
            rows={3}
            maxLength={300}
            placeholder="Bravo hold the Ford. If they get within 2, fall back to the hill."
            className="mt-3 w-full resize-none rounded-xl border border-line bg-bg p-3 text-sm outline-none focus:border-ink"
          />
          <div className="mt-2 flex gap-2">
            <button className="btn btn-primary flex-1" onClick={submit} disabled={!text.trim() || phase !== "idle" || ended}>
              {phase === "idle" ? <Send size={16} /> : <Loader2 size={16} className="animate-spin" />}
              {phase === "compiling" ? "Lieutenant is reading…" : phase === "sealing" ? "Sealing on the rollup…" : "Send order"}
            </button>
            <button className={`btn ${listening ? "btn-accent" : "btn-ghost"} w-11 p-0`} onClick={toggleMic} aria-label="Speak an order" disabled={ended}>
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </div>
          {err && <div className="mt-3 rounded-lg bg-[#fdeeee] p-3 text-sm text-red">{err}</div>}
          {sent[0] && (
            <div className="mt-3 rounded-xl border border-line p-3">
              <div className="label">Understood</div>
              <div className="mt-1 text-sm font-semibold">{sent[0].understood}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {sent[0].orders.map((o) => (
                  <span key={o.squad} className="chip bg-[#eaf1fe] text-blue">
                    {SQUAD_NAMES[o.squad]}: {describeAction(o.action)}
                  </span>
                ))}
              </div>
              <div className="mt-2 font-mono text-[11px] text-muted">
                compiled + sealed in {sent[0].ms} ms · tx {sent[0].sig.slice(0, 8)}…
              </div>
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="font-bold">Your sealed order log</div>
            <span className="text-xs text-muted">{army.log.length} orders</span>
          </div>
          {army.log.length === 0 ? (
            <div className="mt-2 text-sm text-muted">Nothing yet. Your squads are holding their spawn.</div>
          ) : (
            <ol className="mt-3 space-y-2">
              {[...army.log].reverse().map((l, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted">t{l.tick}</span>
                  <span className="min-w-0">{l.text}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <EyeOff size={12} /> Stored in your army account. Your opponent can&apos;t read it until the battle ends.
          </div>
        </div>
      </aside>
    </div>
  );
}

function ScoreRow({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-semibold">
        <span>{label}</span>
        <span className="font-mono">
          {v}/{WIN_SCORE}
        </span>
      </div>
      <Bar value={v} max={WIN_SCORE} color={color} />
    </div>
  );
}

function SpyButton({ conn, gameId, enemySide }: { conn: Connection; gameId: BN; enemySide: number }) {
  const [res, setRes] = useState<null | { ok: boolean; msg: string; ms: number }>(null);
  const [busy, setBusy] = useState(false);
  const spy = async () => {
    setBusy(true);
    const t = performance.now();
    try {
      const info = await conn.getAccountInfo(armyPda(gameId, enemySide), "processed");
      const ms = Math.round(performance.now() - t);
      setRes(info ? { ok: false, msg: `Read ${info.data.length} bytes. The enemy army is NOT sealed.`, ms } : { ok: true, msg: "Rollup returned nothing: your key isn't a member of the enemy's army account.", ms });
    } catch (e) {
      setRes({ ok: true, msg: `Rollup refused: ${(e as Error).message.slice(0, 90)}`, ms: Math.round(performance.now() - t) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-end gap-2">
      <button className="btn btn-ghost" onClick={spy} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldX size={16} />} Try to read the enemy army
      </button>
      {res && (
        <div className={`max-w-sm rounded-lg px-3 py-2 text-xs ${res.ok ? "bg-[#eef6f1] text-green" : "bg-[#fdeeee] text-red"}`}>
          <span className="font-mono">getAccountInfo(army{enemySide})</span> · {res.ms} ms
          <br />
          {res.msg}
        </div>
      )}
    </div>
  );
}
