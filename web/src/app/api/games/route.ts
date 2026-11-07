import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createGame } from "@/lib/server/ops";
import { addGame, listGames } from "@/lib/server/registry";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({ games: listGames() });
}

export async function POST(req: Request) {
  try {
    const { commander, vsAi } = await req.json();
    const human = new PublicKey(commander);
    const g = await createGame(human, !!vsAi);
    addGame({
      gameId: g.gameId,
      vsAi: !!vsAi,
      createdAt: Date.now(),
      host: human.toBase58(),
      status: "waiting",
    });
    return NextResponse.json(g);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
