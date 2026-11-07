import "server-only";
import { BN } from "@coral-xyz/anchor";
import { issueOrders, readGame, readSide, teeConnection } from "../chain";
import { aiDecide } from "./compiler";
import { reveal, server, tickOnce } from "./ops";
import { recordResult } from "./registry";

type Running = {
  id: string;
  lastOrderTick: number;
  busy: boolean;
  aiPlays?: boolean;
  ticking?: ReturnType<typeof setInterval>;
};
const g = globalThis as unknown as { __aiGames?: Map<string, Running>; __aiLoop?: ReturnType<typeof setInterval> };
const games = (g.__aiGames ??= new Map());

const THINK_EVERY_TICKS = 14; // ~7s

/** Register a game with the AI commander (side 1) and, if needed, a server ticker. */
export function watchGame(id: string, aiPlays: boolean) {
  const r: Running = { id, lastOrderTick: -THINK_EVERY_TICKS, busy: false };
  if (process.env.TICK_MODE === "server") {
    r.ticking = setInterval(() => tickOnce(new BN(id)).catch(() => {}), 500);
  }
  r.aiPlays = aiPlays;
  games.set(id, r); // always watched, so the server can reveal it when it ends
  ensureLoop();
}

function ensureLoop() {
  if (g.__aiLoop) return;
  g.__aiLoop = setInterval(() => {
    for (const r of games.values()) void step(r);
  }, 1500);
}

async function step(r: Running) {
  if (r.busy) return;
  r.busy = true;
  try {
    const { ai, payer } = server();
    const id = new BN(r.id);
    const watcher = await teeConnection(payer);
    const game = await readGame(watcher, id).catch(() => null);
    if (!game) return;
    if (game.status === 2) {
      games.delete(r.id);
      if (r.ticking) clearInterval(r.ticking);
      await reveal(id).catch((e) => console.error("reveal failed", r.id, e.message));
      recordResult(game);
      return;
    }
    if (game.status !== 1 || !game.vsAi || !r.aiPlays) return;
    const first = r.lastOrderTick < 0;
    if (!first && game.tick - r.lastOrderTick < THINK_EVERY_TICKS) return;
    // The AI reads its own sealed army with its own key, nothing else.
    const conn = await teeConnection(ai);
    const { army, intel } = await readSide(conn, id, 1);
    if (!army) return;
    const plan = await aiDecide(army, intel, game.tick, game.control, game.scores);
    if (plan.orders.length) {
      await issueOrders(conn, ai, id, 1, plan.orders, plan.text ?? plan.understood);
    }
    r.lastOrderTick = game.tick;
  } catch (e) {
    console.error("ai step", r.id, (e as Error).message);
  } finally {
    r.busy = false;
  }
}
