"use client";
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Eye, EyeOff, Lock, MessageSquareText, ShieldCheck, Timer } from "lucide-react";

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{children}</div>;
}

/* ---------------- Their view vs yours ---------------- */

export function ViewSlider() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(70);
  const [drag, setDrag] = useState(false);
  const inView = useInView(ref, { once: true, margin: "-120px" });

  useEffect(() => {
    if (!inView) return;
    const c = animate(70, 50, { duration: 1.4, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setPos(v) });
    return () => c.stop();
  }, [inView]);

  const setFrom = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(4, Math.min(96, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <motion.div {...reveal} className="mx-auto max-w-2xl text-center">
        <Eyebrow>The problem with onchain games</Eyebrow>
        <h2 className="mt-3 font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl">
          Same battle. <span className="italic text-ocean">Two very different views.</span>
        </h2>
        <p className="mt-4 text-lg text-muted">On a normal chain, every order is a public transaction, so your opponent reads your plan the moment you send it. Drag the line to compare.</p>
      </motion.div>

      <motion.div {...reveal} className="mx-auto mt-12 max-w-2xl">
        <div
          ref={ref}
          className="relative select-none overflow-hidden rounded-3xl border border-line bg-white p-3 shadow-[0_24px_60px_-24px_rgba(21,23,26,0.25)] touch-none"
          onPointerDown={(e) => {
            setDrag(true);
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setFrom(e.clientX);
          }}
          onPointerMove={(e) => drag && setFrom(e.clientX)}
          onPointerUp={() => setDrag(false)}
        >
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/shots/fog.webp" alt="The battle as you see it: enemy squads hidden under fog" draggable={false} className="block aspect-square w-full rounded-2xl object-cover" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shots/all.webp" alt="The same battle on a public chain: every enemy squad visible" draggable={false} className="block aspect-square w-full rounded-2xl object-cover" />
              <div className="absolute inset-0 rounded-2xl bg-red/5" />
            </div>
            <div className="absolute inset-y-0" style={{ left: `${pos}%` }}>
              <div className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" />
              <div className={`absolute top-1/2 -left-5 grid h-10 w-10 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-white shadow-lg ring-1 ring-black/10 transition ${drag ? "scale-110" : ""}`}>
                <span className="text-xs font-bold text-muted">⇆</span>
              </div>
            </div>
            <span className="absolute left-3 top-3 chip bg-white/90 text-red shadow-sm">
              <Eye size={12} /> Any other chain: they see everything
            </span>
            <span className="absolute right-3 top-3 chip bg-white/90 text-green shadow-sm">
              <EyeOff size={12} /> Sealed Orders: fog of war
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 font-mono text-[12px] sm:grid-cols-2">
          <div className="rounded-xl bg-[#fdeeee] px-4 py-3 text-red">getAccountInfo(enemyArmy) → 1,720 bytes: positions + orders</div>
          <div className="rounded-xl bg-[#eef6f1] px-4 py-3 text-green">getAccountInfo(enemyArmy) → null · not a member</div>
        </div>
      </motion.div>
    </section>
  );
}

/* ---------------- Feature cards ---------------- */

function Tilt({ children, className }: { children: React.ReactNode; className: string }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useTransform(rx, (v) => `${v}deg`);
  const rotateY = useTransform(ry, (v) => `${v}deg`);
  return (
    <motion.div
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 8);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 8);
      }}
      onPointerLeave={() => {
        animate(rx, 0, { duration: 0.4 });
        animate(ry, 0, { duration: 0.4 });
      }}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const Window = ({ children }: { children: React.ReactNode }) => (
  <div className="relative -mb-8 -mr-8 ml-1 mt-auto min-h-[150px] rounded-tl-2xl border border-white/70 bg-white p-3 pb-10 text-ink shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)]">
    <div className="mb-2 flex gap-1">
      <span className="h-2 w-2 rounded-full bg-black/15" />
      <span className="h-2 w-2 rounded-full bg-black/15" />
      <span className="h-2 w-2 rounded-full bg-black/15" />
    </div>
    {children}
  </div>
);

export function FeatureCards() {
  const cards = [
    {
      bg: "bg-teal",
      icon: <MessageSquareText size={18} />,
      title: "Talk like a commander",
      body: "Type or say it. Claude turns a sentence into squad orders and up to 2 standing rules each.",
      ui: (
        <div className="space-y-2 text-[11px]">
          <div className="ml-auto w-fit max-w-[90%] rounded-xl rounded-br-sm bg-ink px-2.5 py-1.5 text-white">Alpha flank left if they push the Ford</div>
          <div className="w-fit max-w-[95%] rounded-xl rounded-bl-sm bg-[#eef6f4] px-2.5 py-1.5 text-teal">
            <b>Rule armed</b> · enemy near Ford → move (4,8)
          </div>
        </div>
      ),
    },
    {
      bg: "bg-magenta",
      icon: <Lock size={18} />,
      title: "Sealed in an enclave",
      body: "Armies live in permissioned accounts on a MagicBlock rollup running inside Intel TDX.",
      ui: (
        <div className="space-y-1.5 font-mono text-[10.5px]">
          <div className="rounded-lg bg-[#fdf0f4] px-2 py-1.5 text-magenta">getAccountInfo(army1) → null</div>
          <div className="flex items-center gap-1.5 rounded-lg bg-[#eef6f1] px-2 py-1.5 text-green">
            <ShieldCheck size={12} /> TDX quote verified · 684 ms
          </div>
        </div>
      ),
    },
    {
      bg: "bg-sun",
      icon: <Timer size={18} />,
      title: "Rules fire on their own",
      body: "A crank inside the rollup runs the battle every 500 ms and checks every trigger, even while you type.",
      ui: (
        <ol className="space-y-1.5 text-[11px]">
          {[
            ["t210", "Rule armed: enemy within 2", "text-muted"],
            ["t214", "Enemy scout at (7,5)", "text-ink"],
            ["t214", "Fired → Bravo retreats to hill", "text-[#b9770e] font-bold"],
          ].map(([t, s, c]) => (
            <li key={s} className="flex gap-2">
              <span className="font-mono text-muted">{t}</span>
              <span className={c}>{s}</span>
            </li>
          ))}
        </ol>
      ),
    },
    {
      bg: "bg-ocean",
      icon: <Bot size={18} />,
      title: "An AI that can't peek",
      body: "Claude commands red with its own key, so it reads only what its own squads can see.",
      ui: (
        <div className="space-y-1.5 text-[11px]">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Claude&apos;s radio · unsealed after the battle</div>
          <div className="rounded-lg bg-[#eef3fb] px-2 py-1.5 text-ocean">t23 Hold all three crossings. Scout, scout south to (7,9).</div>
        </div>
      ),
    },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <motion.div {...reveal} className="mx-auto max-w-2xl text-center">
        <Eyebrow>How it plays</Eyebrow>
        <h2 className="mt-3 font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl">From a sentence to a sealed rule</h2>
      </motion.div>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}>
            <Tilt className={`relative flex h-[400px] flex-col overflow-hidden rounded-[22px] ${c.bg} p-5 text-white ring-4 ring-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]`}>
              <div className="flex items-center gap-2 text-white/80">{c.icon}</div>
              <h3 className="mt-3 text-xl font-bold leading-tight">{c.title}</h3>
              <p className="mt-2 text-sm text-white/80">{c.body}</p>
              <Window>{c.ui}</Window>
            </Tilt>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Stamps ---------------- */

const STAMPS = [
  { name: "Alpha", sub: "Infantry", stat: "100 HP", tint: "#dfe9fb", fg: "var(--blue)", img: "/shots/alpha.webp", note: "Moves every 2nd tick" },
  { name: "Bravo", sub: "Infantry", stat: "100 HP", tint: "#e4eefc", fg: "var(--blue)", img: "/shots/alpha.webp", flip: true, note: "Holds take 25% less" },
  { name: "Scout", sub: "Recon", stat: "5 tiles", tint: "#e7f3ec", fg: "var(--green)", img: "/shots/scout.webp", note: "Sees farthest, 60 HP" },
  { name: "Hill", sub: "Terrain", stat: "+2 sight", tint: "#eef0e2", fg: "#7d845c", img: "/shots/hill.webp", note: "And 25% less damage" },
  { name: "Woods", sub: "Terrain", stat: "Hidden", tint: "#e3eedb", fg: "#5c8a4b", img: "/shots/woods.webp", note: "Unless they're adjacent" },
];

export function Stamps() {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#fbf8f3_0%,#cfe5f6_30%,#a9d0ee_60%,#e7dccb_100%)] py-28">
      <div className="grain pointer-events-none absolute inset-0 opacity-40" />
      <motion.div {...reveal} className="relative mx-auto max-w-2xl px-4 text-center">
        <Eyebrow>Your field kit</Eyebrow>
        <h2 className="mt-3 font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl">Three squads, two kinds of cover</h2>
      </motion.div>
      <div className="relative mx-auto mt-14 flex max-w-6xl flex-wrap justify-center gap-5 px-4">
        {STAMPS.map((s, i) => (
          <motion.div
            key={s.name}
            initial={{ opacity: 0, y: 60, rotate: 0 }}
            whileInView={{ opacity: 1, y: 0, rotate: (i - 2) * 3 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ type: "spring", stiffness: 120, damping: 16, delay: i * 0.07 }}
            whileHover={{ rotate: 0, y: -12, scale: 1.05 }}
            className="cursor-default drop-shadow-[0_14px_20px_rgba(31,70,120,0.25)]"
          >
            <div className="stamp">
              <div className="w-36 border border-black/10 bg-white p-2">
                <div className="h-32 overflow-hidden" style={{ background: s.tint }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.img} alt={`${s.name}, ${s.sub}`} loading="lazy" draggable={false} className={`h-full w-full object-cover object-bottom ${"flip" in s && s.flip ? "-scale-x-100" : ""}`} />
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <div className="font-serif text-xl leading-none">{s.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted">{s.sub}</div>
                  </div>
                  <div className="font-mono text-[11px] font-bold" style={{ color: s.fg }}>
                    {s.stat}
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-muted">{s.note}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Stats ---------------- */

function Count({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration: 1.6, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => c.stop();
  }, [inView, to]);
  return (
    <span ref={ref}>
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function Stats() {
  const items = [
    { c: "bg-blue", n: <Count to={500} suffix=" ms" />, l: "Per battle tick, run by a crank inside the rollup" },
    { c: "bg-sun", n: <Count to={0.8} decimals={1} suffix=" s" />, l: "From typed order to sealed onchain (measured on devnet)" },
    { c: "bg-magenta", n: <Count to={0} suffix=" SOL" />, l: "Gas per order. Change plans 40 times a game" },
    { c: "bg-teal", n: <Count to={1} suffix=" key" />, l: "Can read your army: yours, made in your browser" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <motion.div {...reveal} className="text-center">
        <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">Numbers from the live build</h2>
      </motion.div>
      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
        {items.map((it, i) => (
          <motion.div key={i} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="lg:px-6">
            <div className="flex items-center gap-3">
              <span className={`h-5 w-5 rounded-md ${it.c}`} />
              <span className="text-4xl font-bold tracking-tight">{it.n}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{it.l}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Final CTA ---------------- */

export function FinalCta() {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-10 text-center sm:px-6">
      <motion.p {...reveal} className="mx-auto max-w-md text-lg text-muted">
        Battle Claude in about 4 minutes. No wallet, no SOL. Every order is unsealed for the replay when it ends.
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
        whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 font-serif text-[18vw] leading-[0.9] tracking-tight text-ocean sm:text-[12vw]"
      >
        ready to <span className="italic">command?</span>
      </motion.h2>
      <motion.div {...reveal} className="mt-10">
        <Link href="/app" className="group inline-flex h-14 items-center gap-2 rounded-full bg-ink px-8 text-base font-semibold text-white transition hover:bg-[#2a2d31]">
          Open the war room <ArrowRight size={18} className="transition group-hover:translate-x-1" />
        </Link>
      </motion.div>
    </section>
  );
}
