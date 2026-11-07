// Map geometry shared by the 3D scene: tile <-> world mapping and terrain height.
import { FORESTS, H, HILLS, POINTS, RIVER_Y, W, isWater } from "@/lib/game";
import { step } from "@/components/landing/mini-sim";

export const T = 3; // metres per tile
export const HALF = (W - 1) / 2; // 7
export const WATER_Y = -0.45;
export const DECK_Y = 0.55;

/** Display tile coords: your own base is always at the bottom (+Z, near the camera). */
export const disp = (x: number, y: number, flip: boolean) => (flip ? { x: W - 1 - x, y: H - 1 - y } : { x, y });
export const toWorld = (dx: number, dy: number) => ({ x: (dx - HALF) * T, z: (dy - HALF) * T });
export const tileToWorld = (x: number, y: number, flip: boolean) => {
  const d = disp(x, y, flip);
  return toWorld(d.x, d.y);
};
/** World point -> sim tile (or null outside the map). */
export function worldToTile(wx: number, wz: number, flip: boolean) {
  const dx = Math.round(wx / T + HALF);
  const dy = Math.round(wz / T + HALF);
  if (dx < 0 || dy < 0 || dx >= W || dy >= H) return null;
  return disp(dx, dy, flip);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Display-space features (river row and crossings are symmetric under the flip).
const hillsD = (flip: boolean) => HILLS.map(([x, y]) => disp(x, y, flip));
const crossX = POINTS.map(([x]) => x); // 2, 7, 12 (symmetric)
export const FORD_X = 7;
export const BRIDGE_X = [2, 12];

const roadSegs: [number, number, number, number][] = [
  [3, 13.9, 2, 8.4],
  [7, 13.9, 7, 8.4],
  [11, 13.9, 12, 8.4],
  [2.6, 13.6, 11.4, 13.6],
];
const roads = roadSegs.concat(roadSegs.map(([a, b, c, d]) => [W - 1 - a, H - 1 - b, W - 1 - c, H - 1 - d] as [number, number, number, number]));

function segDist(px: number, py: number, [ax, ay, bx, by]: [number, number, number, number]) {
  const vx = bx - ax,
    vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

export const roadAmount = (fx: number, fy: number) => {
  let d = 9;
  for (const s of roads) d = Math.min(d, segDist(fx, fy, s));
  return smooth(0.34, 0.16, d);
};

const noise = (x: number, z: number) =>
  Math.sin(x * 0.31 + Math.cos(z * 0.17) * 2) * 0.5 + Math.sin(z * 0.23 + x * 0.05) * 0.35 + Math.sin((x + z) * 0.9) * 0.08;

export function riverAmount(fx: number, fy: number) {
  const dz = Math.abs(fy - RIVER_Y) + 0.06 * Math.sin(fx * 1.3);
  return smooth(0.95, 0.42, dz);
}

/** Terrain height at a world point (flip only moves the hills). */
export function heightAt(wx: number, wz: number, flip: boolean) {
  const fx = wx / T + HALF;
  const fy = wz / T + HALF;
  let h = noise(wx, wz) * 0.18;
  for (const p of hillsD(flip)) {
    const d2 = (fx - p.x) ** 2 + (fy - p.y) ** 2;
    h += 2.5 * Math.exp(-d2 / (2 * 1.25 * 1.25));
  }
  const edge = Math.max(Math.abs(fx - HALF), Math.abs(fy - HALF));
  h += smooth(7.9, 13, edge) * (5 + noise(wx * 1.7, wz * 1.3) * 3);
  h -= roadAmount(fx, fy) * 0.06;
  const r = riverAmount(fx, fy);
  if (r > 0) {
    const ford = smooth(0.95, 0.35, Math.abs(fx - FORD_X));
    const bed = -1.35 * (1 - ford) + -0.6 * ford;
    h = h * (1 - r) + bed * r;
  }
  return h;
}

export function onBridge(wx: number, wz: number) {
  return BRIDGE_X.some((bx) => Math.abs(wx - (bx - HALF) * T) < 1.15 && Math.abs(wz) < 2.75);
}
/** Where a soldier's feet go. */
export const footY = (wx: number, wz: number, flip: boolean) => (onBridge(wx, wz) ? DECK_Y : heightAt(wx, wz, flip));

export const isForestD = (dx: number, dy: number, flip: boolean) => {
  const t = disp(dx, dy, flip);
  return FORESTS.some(([a, b]) => a === t.x && b === t.y);
};

/** Sim path (sim tiles) from a tile to a target, using the onchain movement rule. */
export function pathTo(from: { x: number; y: number }, to: { x: number; y: number }) {
  const out = [from];
  let cur = from;
  for (let i = 0; i < 40; i++) {
    const n = step(cur, to);
    if (n.x === cur.x && n.y === cur.y) break;
    out.push(n);
    cur = n;
  }
  return out;
}

/** Snap a clicked water tile to the nearest bank on the clicked side. */
export function snapTile(x: number, y: number, clickWz: number, flip: boolean) {
  if (!isWater(x, y)) return { x, y };
  const near = clickWz >= 0 !== flip ? RIVER_Y + 1 : RIVER_Y - 1;
  return { x, y: near };
}

export { crossX };
