"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import type { Connection } from "@solana/web3.js";
import { Check, Copy, Crosshair, Loader2, Lock, Map as MapIcon, Mic, MicOff, Send, Shield, ShieldX, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { Battlefield, type MapUnit } from "@/components/Battlefield";
import { Battle3D, type Battle3DHandle } from "@/components/Battle3D";
import type { SceneUnit } from "@/game3d/engine";
import { sfx } from "@/game3d/sfx";
import { getCommander, sideFor } from "@/lib/client/commander";
import { armyPda, issueOrders, readSide, teeConnection } from "@/lib/chain";
import {
  A,
  type ArmyState,
  type GameState,
  H,
  type IntelState,
  MAX_TICKS,
  NO_RULE,
  type Order,
  POINT_NAMES,
  type Rule,
  SQUAD_NAMES,
  T,
  W,
  WIN_SCORE,
  describeAction,
  describeTrigger,
  maxHp,
  tileName,
  visibleTiles,
} from "@/lib/game";

type Sent = { text: string; understood: string; orders: Order[]; ms: number; sig: string };
type Ev = { id: number; text: string; tone: "good" | "bad" | "info" | "rule"; at: number };

const soldiers = (hp: number, kind: number) => (hp <= 0 ? 0 : Math.ceil((hp / maxHp(kind)) * (kind === 1 ? 2 : 4)));
const SPAWN = [
  [3, 13],
  [11, 13],
  [7, 13],
];
const spawnFor = (side: number, i: number) => (side === 0 ? { x: SPAWN[i][0], y: SPAWN[i][1] } : { x: W - 1 - SPAWN[i][0], y: H - 1 - SPAWN[i][1] });

export default function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const gameId = useMemo(() => new BN(id), [id]);
  const [side, setSide] = useState<number | null>(null);
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
    if (!conn || side === null) return;
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

  if (loadErr)
    return (
      <Screen>
        <div className="hud max-w-md p-6 text-sm">
          <div className="font-bold text-red-300">{loadErr}</div>
          <Link href="/app" className="mt-4 inline-block font-semibold underline">
            Back to the war room
          </Link>
        </div>
      </Screen>
    );
  if (!game || !army || side === null || !conn)
    return (
      <Screen>
        <div className="flex items-center gap-3 text-sm text-white/80">
          <Loader2 className="animate-spin" size={18} /> Reading your sealed army from the rollup…
        </div>
      </Screen>
    );
  return <Game id={id} game={game} army={army} intel={intel} side={side} conn={conn} gameId={gameId} />;
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#0f141a] p-4 text-white">{children}</div>;
}

function Game({ id, game, army, intel, side, conn, gameId }: { id: string; game: GameState; army: ArmyState; intel: IntelState | null; side: number; conn: Connection; gameId: BN }) {
  const view = useRef<Battle3DHandle>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "compiling" | "sealing">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [pending, setPending] = useState<{ squad: number; x: number; y: number } | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [muted, setMuted] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const evId = useRef(0);

  const me = side;
  const enemy = 1 - side;
  const started = game.status !== 0;
  const ended = game.status === 2;
  const won = game.winner === me + 1;
  const foe = game.vsAi ? "Claude" : "Enemy";

  useEffect(() => setMuted(sfx.muted), []);
  useEffect(() => {
    if (selected !== null && (army.units[selected]?.hp ?? 0) <= 0) setSelected(null);
  }, [army.units, selected]);
  useEffect(() => {
    const t = setInterval(() => setEvents((e) => e.filter((x) => Date.now() - x.at < 9000)), 1000);
    return () => clearInterval(t);
  }, []);

  const push = useCallback((text: string, tone: Ev["tone"]) => {
    setEvents((e) => [...e, { id: ++evId.current, text, tone, at: Date.now() }].slice(-6));
  }, []);

  // ---- derive battle events from state changes ----
  const prev = useRef<{ game: GameState; army: ArmyState; intel: IntelState | null } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { game, army, intel };
    if (!p) return;
    army.units.forEach((u, i) => {
      const o = p.army.units[i];
      if (!o) return;
      if (o.hp > 0 && u.hp === 0) push(`${SQUAD_NAMES[i]} was wiped out`, "bad");
      else if (soldiers(u.hp, u.kind) < soldiers(o.hp, o.kind)) push(`${SQUAD_NAMES[i]} lost a soldier`, "bad");
      u.rules.forEach((r, k) => {
        if (r.fired && !o.rules[k]?.fired && r.trigger.kind !== T.NONE) {
          push(`${SQUAD_NAMES[i]}: rule fired → ${describeAction(r.action)}`, "rule");
          sfx.alert();
        }
      });
    });
    game.control.forEach((c, i) => {
      if (c === p.game.control[i]) return;
      if (c === me + 1) {
        push(`You took the ${POINT_NAMES[i]}`, "good");
        sfx.capture(true);
      } else if (c === enemy + 1) {
        push(`${foe} took the ${POINT_NAMES[i]}`, "bad");
        sfx.capture(false);
      } else push(`${POINT_NAMES[i]} is neutral again`, "info");
    });
    intel?.seen.forEach((s, i) => {
      const o = p.intel?.seen[i];
      if (s.visible && !o?.visible && s.hp > 0) {
        push(`Contact: enemy ${SQUAD_NAMES[i]} at ${tileName(s.x, s.y)}`, "info");
        sfx.contact();
      }
      if (o && o.hp > 0 && s.hp === 0) push(`Enemy ${SQUAD_NAMES[i]} destroyed`, "good");
    });
    if (game.status === 2 && p.game.status !== 2) {
      if (game.winner === me + 1) sfx.victory();
      else sfx.defeat();
      view.current?.celebrate();
    }
  }, [game, army, intel, me, enemy, foe, push]);

  // ---- 3D scene input ----
  const units: SceneUnit[] = useMemo(() => {
    const out: SceneUnit[] = army.units.map((u, i) => {
      const tgt = pending?.squad === i ? { x: pending.x, y: pending.y } : u.action.kind !== A.HOLD ? { x: u.action.x, y: u.action.y } : null;
      return { ...u, squad: i, team: "blue" as const, target: tgt };
    });
    (intel?.seen ?? []).forEach((s, i) => {
      const kind = i === 2 ? 1 : 0;
      if (s.visible) out.push({ x: s.x, y: s.y, hp: s.hp, kind, squad: i, team: "red" });
      else if (s.lastSeen > 0 && s.hp > 0) out.push({ x: s.x, y: s.y, hp: s.hp, kind, squad: i, team: "red", ghost: true });
    });
    return out;
  }, [army.units, intel, pending]);
  const fog = useMemo(() => visibleTiles(army.units), [army.units]);
  const sceneState = useMemo(() => ({ units, fog, control: game.control, selected }), [units, fog, game.control, selected]);

  const seal = useCallback(
    async (orders: Order[], label: string, understood?: string) => {
      const t0 = performance.now();
      const sig = await issueOrders(conn, getCommander(), gameId, side, orders, label);
      const ms = Math.round(performance.now() - t0);
      setSent({ text: label, understood: understood ?? label, orders, ms, sig });
      push(`Sealed in ${ms} ms: ${understood ?? label}`, "info");
    },
    [conn, gameId, side, push],
  );

  const command = useCallback(
    async (squad: number, kind: "move" | "attack" | "hold" | "retreat", x: number, y: number) => {
      const u = army.units[squad];
      if (!u || u.hp <= 0 || ended || !started) return;
      const ak = kind === "move" ? A.MOVE : kind === "attack" ? A.ATTACK : kind === "retreat" ? A.RETREAT : A.HOLD;
      const rules = u.rules.map((r) => (r.fired ? NO_RULE : { trigger: r.trigger, action: r.action })) as [Rule, Rule];
      const label =
        kind === "hold" ? `${SQUAD_NAMES[squad]}: hold position` : `${SQUAD_NAMES[squad]}: ${kind === "move" ? "move to" : kind === "attack" ? "attack at" : "fall back to"} ${tileName(x, y)}`;
      setErr(null);
      if (kind !== "hold") setPending({ squad, x, y });
      sfx.radio();
      try {
        await seal([{ squad, action: { kind: ak, x, y }, rules }], label);
      } catch (e) {
        setErr((e as Error).message);
        sfx.error();
      } finally {
        setPending(null);
      }
    },
    [army.units, ended, started, seal],
  );

  const submit = useCallback(async () => {
    const t = text.trim();
    if (!t || phase !== "idle") return;
    setErr(null);
    setPhase("compiling");
    sfx.radio();
    try {
      const r = await fetch("/api/compile", { method: "POST", body: JSON.stringify({ text: t, army, intel, tick: game.tick }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The lieutenant didn't understand that");
      if (!j.orders?.length) throw new Error(`"${j.understood}": no squad orders came out of that. Name a squad and a place.`);
      setPhase("sealing");
      await seal(j.orders, t, j.understood);
      setText("");
    } catch (e) {
      setErr((e as Error).message);
      sfx.error();
    } finally {
      setPhase("idle");
    }
  }, [text, phase, army, intel, game.tick, seal]);

  const toggleMic = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return setErr("Voice input needs Chrome or Edge.");
    if (listening) return recRef.current?.stop();
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

  const select = (i: number | null) => {
    if (i !== null && army.units[i]?.hp <= 0) return;
    setSelected(i);
  };
  const sel = selected !== null ? army.units[selected] : null;
  const secsLeft = Math.max(0, Math.ceil((MAX_TICKS - game.tick) / 2));

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#0f141a] text-white">
      <Battle3D
        ref={view}
        className="absolute inset-0"
        state={sceneState}
        mySide={me}
        interactive={started && !ended}
        intro
        onSelect={select}
        onCommand={(s, k, x, y) => command(s, k, x, y)}
        onTile={(x, y) => {
          setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${tileName(x, y)} `);
        }}
      />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link href="/app" className="hud grid h-10 w-10 place-items-center" aria-label="Leave battle">
            <X size={18} />
          </Link>
          <div className="hud hidden h-10 items-center gap-2 px-3 text-sm font-semibold lg:flex">
            Battle #{game.gameId.slice(-6)}
            <span className="flex items-center gap-1 rounded-full bg-[#2e9e6a]/25 px-2 py-0.5 text-[11px] text-[#7be0ac]">
              <Lock size={11} /> sealed in TDX
            </span>
          </div>
        </div>

        {started && (
          <div className="hud pointer-events-auto flex min-w-0 flex-1 items-center gap-2 px-3 py-2 sm:max-w-md sm:flex-none sm:gap-3 sm:px-4">
            <Score v={game.scores[me]} color="#4d8dff" label="You" />
            <div className="shrink-0 text-center">
              <div className="font-mono text-lg font-extrabold leading-none tabular-nums">
                {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, "0")}
              </div>
              <div className="mt-1 flex justify-center gap-1">
                {game.control.map((c, i) => (
                  <span key={i} title={POINT_NAMES[i]} className="h-2 w-4 rounded-sm" style={{ background: c === me + 1 ? "#4d8dff" : c === enemy + 1 ? "#ff5a5a" : "rgba(255,255,255,0.25)" }} />
                ))}
              </div>
            </div>
            <Score v={game.scores[enemy]} color="#ff5a5a" label={foe} right />
          </div>
        )}

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            className="hud grid h-10 w-10 place-items-center"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              sfx.setMuted(!muted);
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button className={`hud hidden h-10 w-10 place-items-center sm:grid ${showMap ? "text-[#7fb2ff]" : ""}`} aria-label="Toggle map" onClick={() => setShowMap((m) => !m)}>
            <MapIcon size={18} />
          </button>
          {started && <SpyButton conn={conn} gameId={gameId} enemySide={enemy} />}
        </div>
      </div>

      {/* event feed */}
      {started && (
        <div className="pointer-events-none absolute right-3 top-16 flex w-[min(320px,calc(100%-24px))] flex-col items-end gap-1.5 sm:right-4 sm:top-20">
          {events.slice(-4).map((e) => (
            <div
              key={e.id}
              className={`feed-in rounded-lg px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur ${
                e.tone === "good" ? "bg-[#1f6fd6]/85" : e.tone === "bad" ? "bg-[#b3261e]/85" : e.tone === "rule" ? "bg-[#c7651a]/90" : "bg-black/60"
              }`}
            >
              {e.text}
            </div>
          ))}
        </div>
      )}

      {/* squads */}
      {started && (
        <div className="absolute bottom-[132px] left-3 right-3 no-sb flex gap-2 overflow-x-auto sm:bottom-auto sm:left-4 sm:right-auto sm:top-24 sm:w-60 sm:flex-col sm:overflow-visible">
          {army.units.map((u, i) => {
            const f = u.hp / maxHp(u.kind);
            const active = selected === i;
            const armed = u.rules.filter((r) => r.trigger.kind !== T.NONE && !r.fired);
            return (
              <button
                key={i}
                onClick={() => {
                  if (u.hp <= 0) return;
                  sfx.select();
                  select(active ? null : i);
                  if (!active) view.current?.focusSquad(i);
                }}
                className={`hud min-w-[150px] shrink-0 p-2.5 text-left transition sm:min-w-0 ${active ? "ring-2 ring-[#4d8dff]" : ""} ${u.hp <= 0 ? "opacity-40" : "hover:bg-black/80"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <span className="grid h-5 w-5 place-items-center rounded bg-[#4d8dff] text-[10px] font-extrabold">{i + 1}</span>
                    {SQUAD_NAMES[i]}
                  </div>
                  <span className="flex gap-0.5">
                    {Array.from({ length: u.kind === 1 ? 2 : 4 }, (_, k) => (
                      <span key={k} className={`h-2.5 w-1.5 rounded-sm ${k < soldiers(u.hp, u.kind) ? "bg-white/90" : "bg-white/15"}`} />
                    ))}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full transition-all" style={{ width: `${f * 100}%`, background: f > 0.5 ? "#3ccf7e" : f > 0.25 ? "#f2b13d" : "#ff5a5a" }} />
                </div>
                <div className="mt-1.5 truncate text-[11px] text-white/70">{u.hp <= 0 ? "Destroyed" : describeAction(u.action)}</div>
                {armed.length > 0 && (
                  <div className="mt-1 hidden truncate rounded bg-[#c7651a]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#ffc89a] sm:block" title={armed.map((r) => `if ${describeTrigger(r.trigger)} → ${describeAction(r.action)}`).join("\n")}>
                    {armed.length} trap{armed.length > 1 ? "s" : ""} armed · if {describeTrigger(armed[0].trigger)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* minimap */}
      {started && showMap && (
        <div className="hud absolute bottom-4 right-4 hidden w-48 p-1.5 lg:block">
          <Battlefield
            units={units.map((u) => ({ ...u, target: u.target ?? null }) as MapUnit)}
            fog={fog}
            control={game.control}
            mySide={me}
            highlight={selected}
            onTile={(x, y) => view.current?.focusTile(x, y)}
            className="w-full rounded-lg"
          />
        </div>
      )}

      {/* command console */}
      {started && !ended && (
        <div className="absolute inset-x-3 bottom-3 mx-auto max-w-2xl sm:bottom-4">
          {sel && selected !== null ? (
            <div className="hud mb-2 flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="font-bold text-[#7fb2ff]">{SQUAD_NAMES[selected]} selected</span>
              <span className="hidden text-white/60 sm:inline">Tap the ground to move, tap an enemy to attack</span>
              <span className="text-white/60 sm:hidden">Tap ground to move</span>
              <div className="ml-auto flex gap-1.5">
                <button className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-semibold hover:bg-white/20" onClick={() => command(selected, "hold", sel.x, sel.y)}>
                  <Shield size={12} /> Hold
                </button>
                <button
                  className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-semibold hover:bg-white/20"
                  onClick={() => {
                    const s = spawnFor(me, selected);
                    command(selected, "retreat", s.x, s.y);
                  }}
                >
                  <Undo2 size={12} /> Fall back
                </button>
                <button className="rounded-md bg-white/10 px-2 py-1 font-semibold hover:bg-white/20" onClick={() => select(null)} aria-label="Deselect">
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (
            (err || phase !== "idle" || sent) && (
              <div className={`hud mb-2 px-3 py-2 text-xs ${err ? "text-[#ffb4ab]" : "text-white/80"}`}>
                {err ? (
                  err
                ) : phase === "compiling" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> Claude is turning that into orders…
                  </span>
                ) : phase === "sealing" ? (
                  <span className="flex items-center gap-2">
                    <Lock size={12} /> Sealing on the rollup…
                  </span>
                ) : (
                  sent && (
                    <span>
                      <b className="text-[#7be0ac]">Understood:</b> {sent.understood} <span className="font-mono text-white/50">· {sent.ms} ms</span>
                    </span>
                  )
                )}
              </div>
            )
          )}
          <div className="hud flex items-center gap-2 p-2">
            <Crosshair size={16} className="ml-1 hidden shrink-0 text-white/50 sm:block" />
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              maxLength={300}
              placeholder={listening ? "Listening…" : "Bravo hold the Ford. If they get within 2, fall back to the hill."}
              className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-white/35"
            />
            <button className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${listening ? "bg-[#e5582b]" : "bg-white/10 hover:bg-white/20"}`} onClick={toggleMic} aria-label="Speak an order">
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#4d8dff] px-3 text-sm font-bold disabled:opacity-40"
              onClick={submit}
              disabled={!text.trim() || phase !== "idle"}
            >
              {phase === "idle" ? <Send size={15} /> : <Loader2 size={15} className="animate-spin" />}
              <span className="hidden sm:inline">Order</span>
            </button>
          </div>
        </div>
      )}

      {/* pre-battle */}
      {!started && (game.vsAi ? <Ready id={id} /> : <Waiting id={id} />)}

      {/* end */}
      {ended && (
        <div className="absolute inset-0 grid place-items-center bg-black/35 p-4">
          <div className="text-center">
            <div className={`banner font-serif text-6xl italic sm:text-8xl ${game.winner === 3 ? "text-white" : won ? "text-[#9cc3ff]" : "text-[#ff8a80]"}`} style={{ textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
              {game.winner === 3 ? "Draw" : won ? "Victory" : "Defeat"}
            </div>
            <div className="mt-3 font-mono text-white/80">
              {game.scores[me]} – {game.scores[enemy]} · {Math.round(game.tick / 2)} s
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={`/app/replay/${game.gameId}`} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#15171a]">
                Open the unsealed replay
              </Link>
              <Link href="/app" className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold backdrop-blur hover:bg-white/25">
                New battle
              </Link>
            </div>
            <div className="mt-3 text-xs text-white/60">The server reveals both armies a few seconds after the end.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Score({ v, color, label, right }: { v: number; color: string; label: string; right?: boolean }) {
  return (
    <div className={`min-w-0 flex-1 sm:w-32 sm:flex-none ${right ? "text-right" : ""}`}>
      <div className={`flex items-baseline justify-between gap-1 text-[11px] font-bold ${right ? "flex-row-reverse" : ""}`}>
        <span className="truncate text-white/70">{label}</span>
        <span className="font-mono tabular-nums">{v}</span>
      </div>
      <div className={`mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/15 ${right ? "justify-end" : ""}`}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (v / WIN_SCORE) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function Ready({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = async () => {
    sfx.unlock();
    sfx.ambience();
    sfx.radio();
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
  return (
    <div className="absolute inset-x-3 bottom-3 mx-auto max-w-lg sm:bottom-6 sm:left-6 sm:right-auto sm:mx-0 sm:w-[440px]">
      <div className="hud p-5 sm:p-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#7fb2ff]">Battlefield ready</div>
        <div className="mt-1 font-serif text-3xl italic">Your army is sealed.</div>
        <p className="mt-2 text-sm text-white/70">
          Three squads at your base. Claude is across the river and can&apos;t see them. Hold crossings to score; first to {WIN_SCORE} wins.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-white/70">
          <div className="rounded-lg bg-white/5 p-2">
            <b className="block text-white">Tap a squad</b>then the ground
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <b className="block text-white">Type or speak</b>orders with &ldquo;if…&rdquo;
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <b className="block text-white">Drag / scroll</b>to move the camera
          </div>
        </div>
        <button className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e5582b] text-base font-bold disabled:opacity-60" onClick={start} disabled={busy}>
          {busy && <Loader2 size={18} className="animate-spin" />} {busy ? "Starting the crank…" : "Start the battle"}
        </button>
        {err && <div className="mt-2 text-sm text-[#ffb4ab]">{err}</div>}
      </div>
    </div>
  );
}

function Waiting({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${location.origin}/app/join/${id}` : "";
  return (
    <div className="absolute inset-x-3 bottom-3 mx-auto max-w-lg sm:bottom-6">
      <div className="hud p-5">
        <div className="flex items-center gap-2 font-bold">
          <Loader2 className="animate-spin" size={18} /> Waiting for your opponent
        </div>
        <p className="mt-1 text-sm text-white/70">The battle starts as soon as they open this link.</p>
        <div className="mt-3 flex gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg bg-white/10 px-3 py-2 font-mono text-sm">{link}</div>
          <button
            className="grid w-10 place-items-center rounded-lg bg-white/10"
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>
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
      setRes(info ? { ok: false, msg: `Read ${info.data.length} bytes. The enemy army is NOT sealed.`, ms } : { ok: true, msg: "Rollup returned nothing. Your key can't read the enemy army.", ms });
    } catch (e) {
      setRes({ ok: true, msg: `Rollup refused: ${(e as Error).message.slice(0, 90)}`, ms: Math.round(performance.now() - t) });
    } finally {
      setBusy(false);
      setTimeout(() => setRes(null), 7000);
    }
  };
  return (
    <div className="relative">
      <button className="hud flex h-10 items-center gap-2 px-3 text-sm font-semibold" onClick={spy} disabled={busy} title="Try to read the enemy army">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldX size={16} />}
        <span className="hidden md:inline">Spy on enemy</span>
      </button>
      {res && (
        <div className={`feed-in absolute right-0 top-12 w-72 rounded-lg px-3 py-2 text-xs shadow-xl ${res.ok ? "bg-[#14532d]/95 text-[#bbf7d0]" : "bg-[#7f1d1d]/95 text-[#fecaca]"}`}>
          <span className="font-mono">getAccountInfo(army{enemySide})</span> · {res.ms} ms
          <br />
          {res.msg}
        </div>
      )}
    </div>
  );
}
