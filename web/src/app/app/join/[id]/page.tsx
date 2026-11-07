"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BN } from "@coral-xyz/anchor";
import { Loader2 } from "lucide-react";
import { getCommander, rememberGame } from "@/lib/client/commander";
import { gamePda, programFor, sendIxs, teeConnection } from "@/lib/chain";

export default function Join({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [step, setStep] = useState("Joining the battle…");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const kp = getCommander();
        const r = await fetch(`/api/games/${id}/join`, { method: "POST", body: JSON.stringify({ commander: kp.publicKey.toBase58() }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not join");
        rememberGame(id, 1);
        setStep("Starting the battle on the rollup…");
        const conn = await teeConnection(kp);
        const program = programFor(conn, kp);
        const ix = await program.methods.startGame().accountsPartial({ game: gamePda(new BN(id)), commander: kp.publicKey }).instruction();
        await sendIxs(conn, [ix], [kp]);
        setStep("Scheduling the tick crank…");
        await fetch(`/api/games/${id}/crank`, { method: "POST" });
        if (!done) router.replace(`/app/battle/${id}`);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
    return () => {
      done = true;
    };
  }, [id, router]);

  return (
    <div className="card mx-auto max-w-xl p-6">
      {err ? (
        <div className="text-sm text-red">{err}</div>
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="animate-spin" size={18} /> {step}
        </div>
      )}
    </div>
  );
}
