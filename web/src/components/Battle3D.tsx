"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { BattleEngine, EngineOpts, SceneState } from "@/game3d/engine";

export type Battle3DHandle = { focusTile: (x: number, y: number) => void; focusSquad: (i: number) => void; celebrate: () => void };

type Props = EngineOpts & { state: SceneState; className?: string };

/** Mounts the three.js battlefield. The engine module loads on the client only. */
export const Battle3D = forwardRef<Battle3DHandle, Props>(function Battle3D({ state, className, ...opts }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const eng = useRef<BattleEngine | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const m = await import("@/game3d/engine");
        await m.loadAssets((p) => !dead && setProgress(p));
        if (dead || !box.current) return;
        eng.current = new m.BattleEngine(box.current, {
          mySide: optsRef.current.mySide,
          get interactive() {
            return optsRef.current.interactive;
          },
          intro: optsRef.current.intro,
          onSelect: (s) => optsRef.current.onSelect?.(s),
          onCommand: (...a) => optsRef.current.onCommand?.(...a),
          onTile: (x, y) => optsRef.current.onTile?.(x, y),
        });
        setReady(true);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
    return () => {
      dead = true;
      eng.current?.dispose();
      eng.current = null;
    };
  }, [opts.mySide]);

  useEffect(() => {
    if (ready) eng.current?.setState(state);
  }, [state, ready]);

  useImperativeHandle(ref, () => ({
    focusTile: (x, y) => eng.current?.focusTile(x, y),
    focusSquad: (i) => eng.current?.focusSquad(i),
    celebrate: () => eng.current?.celebrate(),
  }));

  return (
    <div ref={box} className={`overflow-hidden bg-[#b9d6ec] ${className ?? "relative"}`}>
      {!ready && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[#0f141a] text-white">
          <div className="w-56 text-center">
            <div className="text-sm font-semibold tracking-wide text-white/80">{err ? "3D view failed to load" : "Deploying troops"}</div>
            {err ? (
              <div className="mt-2 text-xs text-red-300">{err}</div>
            ) : (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#4d8dff] transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
