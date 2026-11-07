// Mirrors programs/sealed-orders/src/sim.rs. Keep the two in sync.

export const W = 15;
export const H = 15;
export const RIVER_Y = 7;
export const WIN_SCORE = 600;
export const MAX_TICKS = 480;
export const TICK_MS = 500;

export const POINTS: [number, number][] = [
  [2, 7],
  [7, 7],
  [12, 7],
];
export const POINT_NAMES = ["West Bridge", "Ford", "East Bridge"];
export const HILLS: [number, number][] = [
  [4, 4],
  [10, 10],
];
export const FORESTS: [number, number][] = [
  [9, 3],
  [10, 3],
  [9, 4],
  [10, 4],
  [4, 10],
  [5, 10],
  [4, 11],
  [5, 11],
];

export const SQUAD_NAMES = ["Alpha", "Bravo", "Scout"];

export const A = { HOLD: 0, MOVE: 1, ATTACK: 2, RETREAT: 3 } as const;
export const T = {
  NONE: 0,
  ENEMY_WITHIN: 1,
  ENEMY_NEAR: 2,
  HP_BELOW: 3,
  AFTER_TICK: 4,
  POINT_LOST: 5,
} as const;

export const ACTION_LABEL = ["Hold", "Move", "Attack", "Retreat"];

export type Action = { kind: number; x: number; y: number };
export type Trigger = { kind: number; a: number; b: number; c: number };
export type Rule = { trigger: Trigger; action: Action };
export type RuleState = Rule & { fired: number };
export type Order = { squad: number; action: Action; rules: [Rule, Rule] };

export type Unit = {
  kind: number;
  x: number;
  y: number;
  hp: number;
  cooldown: number;
  action: Action;
  rules: RuleState[];
};
export type Seen = { visible: number; x: number; y: number; hp: number; lastSeen: number };
export type LogEntry = { tick: number; mask: number; text: string };

export type GameState = {
  gameId: string;
  commanders: string[];
  joined: number;
  status: number; // 0 waiting, 1 active, 2 ended
  vsAi: boolean;
  tick: number;
  control: number[];
  scores: number[];
  winner: number; // 0 running, 1 side0, 2 side1, 3 draw
  createdAt: number;
};
export type ArmyState = { side: number; commander: string; units: Unit[]; log: LogEntry[] };
export type IntelState = { side: number; seen: Seen[] };

export const NO_RULE: Rule = { trigger: { kind: 0, a: 0, b: 0, c: 0 }, action: { kind: 0, x: 0, y: 0 } };

export const isHill = (x: number, y: number) => HILLS.some(([a, b]) => a === x && b === y);
export const isForest = (x: number, y: number) => FORESTS.some(([a, b]) => a === x && b === y);
export const isCrossing = (x: number, y: number) => y === RIVER_Y && POINTS.some(([a]) => a === x);
export const isWater = (x: number, y: number) => y === RIVER_Y && !isCrossing(x, y);
export const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const maxHp = (kind: number) => (kind === 1 ? 60 : 100);
export const sight = (u: { kind: number; x: number; y: number }) =>
  (u.kind === 1 ? 5 : 3) + (isHill(u.x, u.y) ? 2 : 0);

/** Tiles this army can see right now (for drawing fog). */
export function visibleTiles(units: Unit[]): Set<string> {
  const out = new Set<string>();
  for (const u of units) {
    if (u.hp <= 0) continue;
    const s = sight(u);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = dist(u.x, u.y, x, y);
        if (isForest(x, y) ? d <= 1 : d <= s) out.add(`${x},${y}`);
      }
  }
  return out;
}

export function tileName(x: number, y: number): string {
  const p = POINTS.findIndex(([a, b]) => a === x && b === y);
  if (p >= 0) return POINT_NAMES[p];
  if (isHill(x, y)) return x < 7 ? "North-west Hill" : "South-east Hill";
  if (isForest(x, y)) return x > 7 ? "North Woods" : "South Woods";
  return `(${x},${y})`;
}

export function describeTrigger(t: Trigger): string {
  switch (t.kind) {
    case T.ENEMY_WITHIN:
      return `enemy within ${t.a}`;
    case T.ENEMY_NEAR:
      return `enemy near ${tileName(t.a, t.b)}`;
    case T.HP_BELOW:
      return `HP below ${t.a}`;
    case T.AFTER_TICK:
      return `after tick ${t.a * 256 + t.b}`;
    case T.POINT_LOST:
      return `${POINT_NAMES[t.a]} lost`;
    default:
      return "";
  }
}

export function describeAction(a: Action): string {
  if (a.kind === A.HOLD) return "Hold";
  return `${ACTION_LABEL[a.kind]} to ${tileName(a.x, a.y)}`;
}
