"use client";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { ArrowRight, Lock } from "lucide-react";
import { Sky, TornLayers } from "@/components/landing/Sky";
import { HeroWindow } from "@/components/landing/HeroWindow";
import { FeatureCards, FinalCta, Stamps, Stats, ViewSlider } from "@/components/landing/Sections";

const words = ["Give", "orders", "in", "plain", "English."];

export default function Landing() {
  const { scrollY } = useScroll();
  const navShadow = useTransform(scrollY, [0, 80], ["0 0 0 rgba(0,0,0,0)", "0 10px 30px -12px rgba(21,23,26,0.25)"]);

  return (
    <main className="min-h-screen bg-cream">
      <motion.nav
        style={{ boxShadow: navShadow }}
        className="fade-up fixed inset-x-0 top-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-3xl items-center justify-between gap-2 rounded-full border border-white/70 bg-white/70 py-2 pl-5 pr-2 backdrop-blur-xl"
      >
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-white">
            <Lock size={14} />
          </span>
          <span className="hidden sm:inline">Sealed Orders</span>
        </Link>
        <div className="hidden items-center gap-1 text-sm font-medium md:flex">
          {[
            ["#views", "Why sealed"],
            ["#how", "How it plays"],
            ["#kit", "Field kit"],
          ].map(([h, l]) => (
            <a key={h} href={h} className="rounded-full px-3 py-1.5 text-ink/80 transition hover:bg-black/5 hover:text-ink">
              {l}
            </a>
          ))}
        </div>
        <Link href="/app" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-white transition hover:bg-[#2a2d31]">
          Play now <ArrowRight size={14} />
        </Link>
      </motion.nav>

      <Sky>
        <section className="relative px-4 pb-0 pt-32 sm:px-6 sm:pt-40">
          <div className="mx-auto max-w-4xl text-center">
            <div style={{ "--d": "0.1s" } as React.CSSProperties} className="fade-up inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-ink/70 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" /> Live on Solana devnet · MLH Solana Hackathon
            </div>
            <h1 className="mt-6 text-balance font-serif text-[12vw] leading-[0.95] tracking-tight text-ink sm:text-6xl md:text-7xl lg:text-[5.4rem]">
              {words.map((w, i) => (
                <span key={w} style={{ "--d": `${0.15 + i * 0.07}s` } as React.CSSProperties} className="fade-up inline-block">
                  {w}
                </span>
              )).flatMap((el, i) => (i ? [" ", el] : [el]))}
              <br />
              <span style={{ "--d": "0.6s" } as React.CSSProperties} className="fade-up inline-block italic text-ocean">
                Nobody else can read them.
              </span>
            </h1>
            <p
              style={{ "--d": "0.85s" } as React.CSSProperties}
              className="fade-up mx-auto mt-6 max-w-xl text-lg text-ink/70"
            >
              A real-time strategy game on Solana. An AI lieutenant turns what you type into rules the game runs every half second, sealed inside an Intel TDX enclave that only your key can read.
            </p>
            <div style={{ "--d": "1s" } as React.CSSProperties} className="fade-up mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/app" className="group inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-white shadow-lg transition hover:bg-[#2a2d31]">
                Battle the AI <ArrowRight size={16} className="transition group-hover:translate-x-1" />
              </Link>
              <a href="#views" className="inline-flex h-12 items-center rounded-full bg-white/80 px-6 font-semibold text-ink backdrop-blur transition hover:bg-white">
                Why it&apos;s sealed
              </a>
            </div>
          </div>

          <div className="relative mx-auto mt-14 max-w-5xl pb-16">
            <TornLayers />
            <div style={{ "--d": "0.5s" } as React.CSSProperties} className="fade-up relative">
              <HeroWindow />
            </div>
          </div>
        </section>
      </Sky>

      <div id="views">
        <ViewSlider />
      </div>
      <div id="how">
        <FeatureCards />
      </div>
      <div id="kit">
        <Stamps />
      </div>
      <Stats />
      <FinalCta />

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <span className="font-serif text-lg italic text-ink">Sealed Orders</span>
          <span>Solana · MagicBlock Private Ephemeral Rollups · Claude · MLH Solana Hackathon 2026</span>
          <a href="https://github.com/codeswithroh/sealed-orders" className="font-semibold text-ink hover:underline">
            Source on GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
