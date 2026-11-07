"use client";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

/** Soft sky with drifting clouds that lean toward the cursor. */
export function Sky({ children }: { children: React.ReactNode }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 20 });
  const sy = useSpring(my, { stiffness: 40, damping: 20 });
  const near = { x: useTransform(sx, (v) => v * 28), y: useTransform(sy, (v) => v * 14) };
  const far = { x: useTransform(sx, (v) => v * -12), y: useTransform(sy, (v) => v * -6) };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my]);

  return (
    <div className="relative overflow-hidden bg-[linear-gradient(180deg,#9fcdf0_0%,#bfe0f7_42%,#e6f2fb_78%,#fbf8f3_100%)]">
      <div className="grain pointer-events-none absolute inset-0 opacity-40" />
      <motion.div style={far} className="pointer-events-none absolute inset-0">
        <Cloud className="drift-slow left-[58%] top-[6%] h-40 w-[30rem] opacity-70" />
        <Cloud className="drift left-[-8%] top-[30%] h-32 w-[26rem] opacity-60" />
      </motion.div>
      <motion.div style={near} className="pointer-events-none absolute inset-0">
        <Cloud className="drift left-[-6%] top-[52%] h-56 w-[34rem]" />
        <Cloud className="drift-slow right-[-10%] top-[18%] h-52 w-[36rem]" />
      </motion.div>
      <div className="relative">{children}</div>
    </div>
  );
}

function Cloud({ className }: { className: string }) {
  return (
    <div className={`absolute ${className}`}>
      <div className="absolute inset-0 rounded-full bg-white blur-2xl" />
      <div className="absolute left-[12%] top-[-30%] h-[110%] w-[45%] rounded-full bg-white blur-xl" />
      <div className="absolute left-[42%] top-[-50%] h-[130%] w-[40%] rounded-full bg-white blur-xl" />
      <div className="grain absolute inset-0 rounded-full opacity-60 mix-blend-overlay" />
    </div>
  );
}

/** Deterministic torn-paper top edge. */
export function tornPath(w: number, h: number, seed: number, amp = 14, step = 18) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let d = `M0 ${h} L0 ${amp + rnd() * amp}`;
  for (let x = step; x <= w; x += step * (0.6 + rnd() * 0.8)) {
    d += ` L${x.toFixed(1)} ${(rnd() * amp * 2).toFixed(1)}`;
  }
  d += ` L${w} ${amp} L${w} ${h} Z`;
  return d;
}

export function TornLayers() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%]">
      <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className="absolute bottom-[38%] left-[-4%] h-[70%] w-[52%] drop-shadow-sm">
        <path d={tornPath(1200, 300, 7, 18, 30)} fill="#93a9f2" />
      </svg>
      <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className="absolute bottom-[30%] right-[-6%] h-[70%] w-[46%] rotate-[-4deg] drop-shadow-sm">
        <defs>
          <pattern id="lines" width="1200" height="22" patternUnits="userSpaceOnUse">
            <rect width="1200" height="22" fill="#f8de85" />
            <line x1="0" y1="21" x2="1200" y2="21" stroke="#e6c25c" strokeWidth="1.5" />
          </pattern>
        </defs>
        <path d={tornPath(1200, 300, 21, 16, 26)} fill="url(#lines)" />
      </svg>
      <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className="absolute bottom-[34%] left-[38%] h-[60%] w-[30%] rotate-[3deg]">
        <path d={tornPath(1200, 300, 3, 22, 34)} fill="#cfd3d6" />
      </svg>
      <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className="absolute bottom-0 left-0 h-[64%] w-full drop-shadow-[0_-6px_12px_rgba(0,0,0,0.06)]">
        <path d={tornPath(1200, 300, 11, 12, 22)} fill="#fbf8f3" />
      </svg>
    </div>
  );
}
