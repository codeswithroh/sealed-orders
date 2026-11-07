import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { joinGame } from "@/lib/server/ops";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { commander } = await req.json();
    return NextResponse.json(await joinGame(id, new PublicKey(commander)));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
