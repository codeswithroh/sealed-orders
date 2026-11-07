// Client-side copy of the movement rule from sim.rs (next_step), used only to
// animate the landing page. The real game runs onchain.
import { POINTS, RIVER_Y, W, H, isWater } from "@/lib/game";

export type P = { x: number; y: number };

const side = (y: number) => (y < RIVER_Y ? -1 : y > RIVER_Y ? 1 : 0);

export function step(from: P, to: P, blocked: (x: number, y: number) => boolean = () => false): P {
  if (from.x === to.x && from.y === to.y) return from;
  let goal = to;
  const s0 = side(from.y);
  if (s0 !== 0 && side(to.y) !== s0) {
    let best = POINTS[0];
    let cost = Infinity;
    for (const p of POINTS) {
      const c = Math.max(Math.abs(from.x - p[0]), Math.abs(from.y - p[1])) + Math.max(Math.abs(p[0] - to.x), Math.abs(p[1] - to.y));
      if (c < cost) {
        cost = c;
        best = p;
      }
    }
    goal = { x: best[0], y: best[1] };
  }
  const dx = Math.sign(goal.x - from.x);
  const dy = Math.sign(goal.y - from.y);
  for (const [cx, cy] of [
    [dx, dy],
    [dx, 0],
    [0, dy],
  ]) {
    if (cx === 0 && cy === 0) continue;
    const nx = from.x + cx;
    const ny = from.y + cy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || isWater(nx, ny) || blocked(nx, ny)) continue;
    return { x: nx, y: ny };
  }
  return from;
}
