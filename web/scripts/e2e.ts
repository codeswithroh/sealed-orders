// End-to-end check against devnet: create a vs-AI battle through the running
// server, read our sealed army, issue an order, spy on the enemy, watch ticks.
import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { armyPda, issueOrders, readSide, teeConnection } from "../src/lib/chain";
import { NO_RULE } from "../src/lib/game";

const BASE = process.env.APP_URL || "http://localhost:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const me = Keypair.generate();
  let t = Date.now();
  const r = await fetch(`${BASE}/api/games`, { method: "POST", body: JSON.stringify({ commander: me.publicKey.toBase58(), vsAi: true }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  console.log("created", j.gameId, `${Date.now() - t}ms`);
  const st = await fetch(`${BASE}/api/games/${j.gameId}/start`, { method: "POST" });
  console.log("started", st.status);
  const id = new BN(j.gameId);
  const conn = await teeConnection(me);
  let s = await readSide(conn, id, 0);
  console.log("status", s.game?.status, "tick", s.game?.tick, "units", s.army?.units.map((u) => `${u.x},${u.y}`).join(" "));
  t = Date.now();
  const sig = await issueOrders(conn, me, id, 0, [{ squad: 2, action: { kind: 1, x: 7, y: 7 }, rules: [NO_RULE, NO_RULE] }], "Scout take the Ford");
  console.log("order sealed", sig.slice(0, 10), `${Date.now() - t}ms`);
  const spy = await conn.getAccountInfo(armyPda(id, 1)).catch((e) => `error: ${e.message}`);
  console.log("spy on enemy army ->", spy === null ? "null (sealed)" : typeof spy === "string" ? spy : `READ ${spy.data.length} bytes!`);
  for (let i = 0; i < 8; i++) {
    await sleep(1500);
    s = await readSide(conn, id, 0);
    const sc = s.army!.units[2];
    console.log(`tick ${s.game?.tick} scout ${sc.x},${sc.y} scores ${s.game?.scores} ctl ${s.game?.control} seen ${s.intel?.seen.filter((x) => x.visible).length}`);
  }
  console.log("log:", s.army?.log.map((l) => `t${l.tick} ${l.text}`));
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
