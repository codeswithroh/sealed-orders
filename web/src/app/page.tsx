import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Lock, MessageSquareText, Timer, Zap } from "lucide-react";
import { DemoBoard } from "@/components/DemoBoard";

export default function Landing() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white">
            <Lock size={16} />
          </span>
          Sealed Orders
        </Link>
        <nav className="flex items-center gap-2">
          <a href="#how" className="btn btn-ghost hidden sm:inline-flex">
            How it works
          </a>
          <Link href="/app" className="btn btn-primary">
            Open the war room <ArrowRight size={16} />
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
        <div>
          <span className="chip bg-white text-muted ring-1 ring-line">
            <span className="h-1.5 w-1.5 rounded-full bg-green" /> Live on Solana devnet
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Give orders in plain English. Your opponent can&apos;t read them.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            A real-time strategy game where you type what you want and an AI lieutenant turns it into rules the game
            runs every half second. The rules live inside an Intel TDX enclave on a MagicBlock Private Ephemeral Rollup,
            readable only by your key.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className="btn btn-accent h-12 px-6 text-base">
              Play against the AI <ArrowRight size={18} />
            </Link>
            <a href="#how" className="btn btn-ghost h-12 px-6 text-base">
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">No wallet, no SOL. A battle takes about 4 minutes.</p>
        </div>
        <DemoBoard />
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-px px-4 sm:grid-cols-3 sm:px-6">
          {[
            { n: "500 ms", l: "per tick, run by a crank inside the rollup" },
            { n: "0 SOL", l: "gas per order, so you can change plans 40 times a game" },
            { n: "1 key", l: "can read your army: yours, generated in this browser" },
          ].map((s) => (
            <div key={s.n} className="py-8 sm:px-6">
              <div className="text-3xl font-extrabold tracking-tight">{s.n}</div>
              <div className="mt-1 text-sm text-muted">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight">From a sentence to a sealed rule</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <Step
            icon={<MessageSquareText size={18} />}
            n="1"
            title="You type (or say) the order"
            body={<code className="block rounded-lg bg-bg p-3 font-mono text-[13px]">Bravo hold the Ford. If they get within 2, fall back to the hill.</code>}
          />
          <Step
            icon={<Zap size={18} />}
            n="2"
            title="Claude compiles it"
            body={
              <code className="block whitespace-pre rounded-lg bg-bg p-3 font-mono text-[12px] leading-5">{`squad: Bravo
action: hold (7,7)
rule: enemy_within 2
  → retreat (10,10)`}</code>
            }
          />
          <Step
            icon={<Lock size={18} />}
            n="3"
            title="The rule is sealed and enforced"
            body={<p className="text-sm text-muted">It goes into your army account inside the enclave. The program checks the trigger every tick, even while you type the next order.</p>}
          />
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-2">
          <div className="card p-6">
            <div className="flex items-center gap-2 font-bold">
              <Eye size={18} className="text-red" /> A normal onchain game
            </div>
            <p className="mt-2 text-sm text-muted">Every order is a public transaction. Your opponent reads your plan the moment you send it.</p>
            <code className="mt-4 block rounded-lg bg-bg p-3 font-mono text-[12px] text-red">getAccountInfo(enemyArmy) → full positions + orders</code>
          </div>
          <div className="card p-6">
            <div className="flex items-center gap-2 font-bold">
              <EyeOff size={18} className="text-green" /> Sealed Orders
            </div>
            <p className="mt-2 text-sm text-muted">Armies and orders sit in permissioned accounts on a TEE rollup. You see only what your squads can see.</p>
            <code className="mt-4 block rounded-lg bg-bg p-3 font-mono text-[12px] text-green">getAccountInfo(enemyArmy) → null (not a member)</code>
          </div>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-4">
          {[
            { t: "Fog of war", d: "Woods hide you, hills let you see 2 tiles further." },
            { t: "Conditional orders", d: "Up to 2 standing rules per squad: ambush, fall back, retake." },
            { t: "AI that plays fair", d: "The AI commander reads only its own sealed view, with its own key." },
            { t: "Replay with proof", d: "When the battle ends, every account goes public with the original order text." },
          ].map((f) => (
            <div key={f.t} className="card p-5">
              <div className="font-bold">{f.t}</div>
              <div className="mt-1 text-sm text-muted">{f.d}</div>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-2xl bg-ink p-8 text-white sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Timer size={16} /> First to 600 points, or whoever holds more after 4 minutes
            </div>
            <div className="mt-2 text-2xl font-extrabold">Hold the bridges. Hide in the woods. Out-think the AI.</div>
          </div>
          <Link href="/app" className="btn btn-accent h-12 px-6 text-base">
            Start a battle <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-sm text-muted">
        Built for the MLH Solana Hackathon, Nov 2026 · Solana · MagicBlock Private Ephemeral Rollups · Claude
      </footer>
    </main>
  );
}

function Step({ icon, n, title, body }: { icon: React.ReactNode; n: string; title: string; body: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-3 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-bg text-ink">{icon}</span>
        <span className="label">Step {n}</span>
      </div>
      <div className="font-bold">{title}</div>
      {body}
    </div>
  );
}
