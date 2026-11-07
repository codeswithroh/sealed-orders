import { NextResponse } from "next/server";
import { BN } from "@coral-xyz/anchor";
import { server, startAndCrank } from "@/lib/server/ops";
import { updateGame } from "@/lib/server/registry";
import { watchGame } from "@/lib/server/ai";

export const runtime = "nodejs";

/** vs-AI battles start when the human presses Start, so the AI gets no head start. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await startAndCrank(new BN(id), server().ai);
    updateGame(id, { status: "active" });
    watchGame(id, true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
