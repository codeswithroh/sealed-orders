"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Lock, Sparkles, Zap } from "lucide-react";
import { Battlefield, type MapUnit } from "../Battlefield";
import { type Unit, visibleTiles } from "@/lib/game";
import { step, type P } from "./mini-sim";

type Scene = {
  key: string;
  label: string;
  text: string;
  understood: string;
  chips: { tone: "blue" | "rule"; t: string }[];
  blue: P[];
  red: P[];
  blueTo: (P | null)[];
  redTo: (P | null)[];
  rule?: { squad: number; within: number; enemy: number; to: P; toast: string };
  ticks: number;
};

const SCENES: Scene[] = [
  {
    key: "ford",
    label: "Everyone take the Ford",
    text: "Everyone take the Ford",
    understood: "All three squads moving to the Ford (7,7).",
    chips: [
      { tone: "blue", t: "Alpha → Ford" },
      { tone: "blue", t: "Bravo → Ford" },
      { tone: "blue", t: "Scout → Ford" },
    ],
    blue: [{ x: 3, y: 13 }, { x: 11, y: 13 }, { x: 7, y: 13 }],
    red: [{ x: 11, y: 1 }, { x: 3, y: 1 }, { x: 7, y: 1 }],
    blueTo: [{ x: 6, y: 8 }, { x: 8, y: 8 }, { x: 7, y: 7 }],
    redTo: [{ x: 12, y: 6 }, { x: 2, y: 6 }, null],
    ticks: 22,
  },
  {
    key: "woods",
    label: "Scout, hide in the North Woods",
    text: "Scout, sneak into the North Woods and watch the east bridge",
    understood: "Scout heading for the North Woods (9,3). Hidden unless someone walks next to it.",
    chips: [{ tone: "blue", t: "Scout → North Woods" }],
    blue: [{ x: 6, y: 8 }, { x: 8, y: 8 }, { x: 7, y: 7 }],
    red: [{ x: 12, y: 1 }, { x: 3, y: 2 }, { x: 6, y: 1 }],
    blueTo: [null, null, { x: 9, y: 3 }],
    redTo: [{ x: 12, y: 6 }, null, null],
    ticks: 18,
  },
  {
    key: "trap",
    label: "Bravo hold the Ford, fall back if they close in",
    text: "Bravo hold the Ford. If they get within 2, fall back to the hill.",
    understood: "Bravo holds the Ford. If an enemy gets within 2 tiles, it retreats to the South-east Hill.",
    chips: [
      { tone: "blue", t: "Bravo → hold Ford" },
      { tone: "rule", t: "if enemy within 2 → retreat (10,10)" },
    ],
    blue: [{ x: 2, y: 8 }, { x: 7, y: 7 }, { x: 7, y: 10 }],
    red: [{ x: 11, y: 2 }, { x: 4, y: 2 }, { x: 7, y: 1 }],
    blueTo: [null, null, null],
    redTo: [null, null, { x: 7, y: 6 }],
    rule: { squad: 1, within: 2, enemy: 2, to: { x: 10, y: 10 }, toast: "Rule fired on tick 214 · Bravo falls back to the hill" },
    ticks: 22,
  },
];

type Phase = "typing" | "compiling" | "sealed" | "running" | "done";

function matchScene(text: string): number {
  const t = text.toLowerCase();
  if (/\bif\b|fall back|retreat|within|when/.test(t)) return 2;
  if (/wood|hide|sneak|scout/.test(t)) return 1;
  return 0;
}

export function HeroWindow() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [blue, setBlue] = useState<P[]>(SCENES[0].blue);
  const [red, setRed] = useState<P[]>(SCENES[0].red);
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(201);
  const [draft, setDraft] = useState("");
  const [userText, setUserText] = useState<string | null>(null);
  const run = useRef(0);
  const scene = SCENES[sceneIdx];

  const play = useCallback((idx: number, text?: string) => {
    const id = ++run.current;
    const s = SCENES[idx];
    const full = text ?? s.text;
    setSceneIdx(idx);
    setUserText(text ?? null);
    setBlue(s.blue);
    setRed(s.red);
    setToast(null);
    setTyped("");
    setPhase("typing");
    const alive = () => run.current === id;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      for (let i = 1; i <= full.length; i++) {
        if (!alive()) return;
        setTyped(full.slice(0, i));
        await sleep(text ? 4 : 32);
      }
      await sleep(250);
      if (!alive()) return;
      setPhase("compiling");
      await sleep(900);
      if (!alive()) return;
      setPhase("sealed");
      await sleep(700);
      if (!alive()) return;
      setPhase("running");
      let b = s.blue.map((p) => ({ ...p }));
      let r = s.red.map((p) => ({ ...p }));
      const bTo = s.blueTo.map((p) => (p ? { ...p } : null));
      let fired = false;
      for (let t = 0; t < s.ticks; t++) {
        await sleep(420);
        if (!alive()) return;
        setTick((v) => v + 1);
        const occupiedByRed = (x: number, y: number) => r.some((q) => q.x === x && q.y === y);
        const occupiedByBlue = (x: number, y: number) => b.some((q) => q.x === x && q.y === y);
        b = b.map((p, i) => {
          const to = bTo[i];
          if (!to || (i !== 2 && t % 2 === 1)) return p;
          return step(p, to, occupiedByRed);
        });
        r = r.map((p, i) => {
          const to = s.redTo[i];
          if (!to || (i !== 2 && t % 2 === 1)) return p;
          return step(p, to, occupiedByBlue);
        });
        if (s.rule && !fired) {
          const me = b[s.rule.squad];
          const e = r[s.rule.enemy];
          if (Math.max(Math.abs(me.x - e.x), Math.abs(me.y - e.y)) <= s.rule.within) {
            fired = true;
            bTo[s.rule.squad] = s.rule.to;
            setToast(s.rule.toast);
          }
        }
        setBlue(b);
        setRed(r);
      }
      setPhase("done");
      await sleep(2400);
      if (alive()) play((idx + 1) % SCENES.length);
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => play(0), 600);
    return () => {
      clearTimeout(t);
      run.current++;
    };
  }, [play]);

  const asUnits = useMemo(
    () => blue.map((p, i) => ({ kind: i === 2 ? 1 : 0, x: p.x, y: p.y, hp: 100, cooldown: 0, action: { kind: 0, x: 0, y: 0 }, rules: [] })) as Unit[],
    [blue],
  );
  const fog = useMemo(() => visibleTiles(asUnits), [asUnits]);
  const units: MapUnit[] = [
    ...blue.map((p, i) => ({ ...p, hp: 100, kind: i === 2 ? 1 : 0, squad: i, team: "blue" as const, target: scene.blueTo[i] })),
    ...red
      .map((p, i) => ({ ...p, hp: 100, kind: i === 2 ? 1 : 0, squad: i, team: "red" as const }))
      .filter((u) => fog.has(`${u.x},${u.y}`)),
  ];

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    play(matchScene(t), t.slice(0, 120));
  };

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/70 bg-white/80 shadow-[0_30px_80px_-20px_rgba(31,70,120,0.35)] backdrop-blur-xl">
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto flex items-center gap-2 rounded-full bg-black/[0.04] px-3 py-1 text-xs text-muted">
          <Lock size={11} /> battle #9a2c41 · tick {tick}
        </div>
        <span className="hidden text-xs font-semibold text-green sm:inline">● TDX verified</span>
      </div>

      <div className="grid md:grid-cols-[1.15fr_1fr]">
        <div className="relative border-b border-black/5 p-3 md:border-b-0 md:border-r">
          <Battlefield units={units} fog={fog} control={[0, phase === "running" || phase === "done" ? (sceneIdx === 2 && toast ? 0 : 1) : 0, sceneIdx > 0 ? 2 : 0]} className="w-full rounded-xl" />
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-6 bottom-6 flex items-center gap-2 rounded-xl bg-ink/90 px-3 py-2 text-xs font-semibold text-white shadow-lg"
              >
                <Zap size={14} className="text-sun" /> {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {SCENES.map((s, i) => (
              <button
                key={s.key}
                onClick={() => play(i)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${sceneIdx === i && !userText ? "bg-ink text-white" : "bg-black/[0.05] text-ink hover:bg-black/10"}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="min-h-[76px] rounded-2xl border border-black/10 bg-cream px-3 py-2.5 font-mono text-[13px] leading-5">
            <span className="text-muted">› </span>
            {typed}
            {phase === "typing" && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-ink" />}
          </div>

          <div className="min-h-[118px]">
            <AnimatePresence mode="wait">
              {phase === "compiling" && (
                <motion.div key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-2xl bg-[#f1f5fb] p-3 text-sm text-ocean">
                  <Sparkles size={16} className="animate-spin [animation-duration:2.5s]" /> Claude is compiling your order…
                </motion.div>
              )}
              {(phase === "sealed" || phase === "running" || phase === "done") && (
                <motion.div key="u" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-black/10 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Understood</div>
                  <div className="mt-1 text-sm font-semibold leading-snug">{scene.understood}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {scene.chips.map((c, i) => (
                      <motion.span
                        key={c.t}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.08 * i }}
                        className={`chip ${c.tone === "rule" ? "bg-[#fff1eb] text-accent" : "bg-[#eaf1fe] text-blue"}`}
                      >
                        {c.t}
                      </motion.span>
                    ))}
                  </div>
                  <motion.div
                    initial={{ opacity: 0, scale: 1.4, rotate: -8 }}
                    animate={{ opacity: 1, scale: 1, rotate: -3 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18 }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border-2 border-green px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-green"
                  >
                    <Lock size={11} /> sealed · 0.8 s · 0 SOL
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="mt-auto flex items-center gap-2 rounded-full border border-black/10 bg-white py-1 pl-4 pr-1"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your own order…"
              aria-label="Type an order"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white" aria-label="Send order">
              <CornerDownLeft size={14} />
            </button>
          </form>
          <div className="text-[11px] text-muted">Preview runs in your browser. In the game, Claude compiles every order.</div>
        </div>
      </div>
    </div>
  );
}
