// Waits for a battle to end, then checks the reveal made the enemy army public.
import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { armyPda, decodeArmy, readGame, teeConnection } from "../src/lib/chain";
const BASE = process.env.APP_URL || "http://localhost:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const me = Keypair.generate();
  const j = await (await fetch(`${BASE}/api/games`, { method: "POST", body: JSON.stringify({ commander: me.publicKey.toBase58(), vsAi: true }) })).json();
  await fetch(`${BASE}/api/games/${j.gameId}/start`, { method: "POST" });
  const id = new BN(j.gameId);
  const conn = await teeConnection(me);
  for (;;) {
    await sleep(10_000);
    const g = await readGame(conn, id);
    console.log("tick", g?.tick, "scores", g?.scores, "status", g?.status);
    if (g?.status === 2) break;
  }
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const a = await conn.getAccountInfo(armyPda(id, 1));
    if (a) {
      const army = decodeArmy(a.data);
      console.log("REVEALED enemy army; AI orders:", army.log.map((l) => `t${l.tick} ${l.text}`));
      return;
    }
  }
  console.log("enemy army still sealed 60s after the end");
})();
