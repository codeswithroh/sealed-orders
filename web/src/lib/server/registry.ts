import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { GameState } from "../game";

/** Tiny on-disk index of games this server created, for the lobby and leaderboard.
 *  The game state itself always comes from the chain. */
export type GameRow = {
  gameId: string;
  vsAi: boolean;
  createdAt: number;
  host: string;
  status: "waiting" | "active" | "ended";
  winner?: number;
  scores?: number[];
  ticks?: number;
};

const FILE = process.env.REGISTRY_FILE || path.join(process.cwd(), ".games.json");

function load(): GameRow[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}
function save(rows: GameRow[]) {
  fs.writeFileSync(FILE, JSON.stringify(rows.slice(-500), null, 1));
}

export function listGames(): GameRow[] {
  return load().sort((a, b) => b.createdAt - a.createdAt);
}

export function addGame(row: GameRow) {
  const rows = load().filter((r) => r.gameId !== row.gameId);
  rows.push(row);
  save(rows);
}

export function updateGame(gameId: string, patch: Partial<GameRow>) {
  const rows = load();
  const r = rows.find((x) => x.gameId === gameId);
  if (r) Object.assign(r, patch);
  save(rows);
}

export function recordResult(g: GameState) {
  updateGame(g.gameId, { status: "ended", winner: g.winner, scores: g.scores, ticks: g.tick });
}
