import { NextResponse } from "next/server";
import { BN } from "@coral-xyz/anchor";
import { scheduleCrank } from "@/lib/server/ops";
import { updateGame } from "@/lib/server/registry";
import { watchGame } from "@/lib/server/ai";

export const runtime = "nodejs";

/** Called by the joining browser right after it starts a friend battle. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await scheduleCrank(new BN(id));
    updateGame(id, { status: "active" });
    watchGame(id, false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
