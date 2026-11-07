//! Deterministic battle simulation. Pure functions, no Solana types, so it can be
//! unit tested on the host and mirrored 1:1 in the TypeScript client.
//!
//! Map: 15x15 grid. Row 7 is a river. Three crossings on row 7 are the capture
//! points: West Bridge (2,7), Ford (7,7), East Bridge (12,7). The map is symmetric
//! under a 180 degree rotation, so side 0 (south) and side 1 (north) are equal.

pub const W: u8 = 15;
pub const H: u8 = 15;
pub const RIVER_Y: u8 = 7;
pub const SQUADS: usize = 3;
pub const POINTS: [(u8, u8); 3] = [(2, 7), (7, 7), (12, 7)];
pub const HILLS: [(u8, u8); 2] = [(4, 4), (10, 10)];
pub const FORESTS: [(u8, u8); 8] = [
    (9, 3),
    (10, 3),
    (9, 4),
    (10, 4),
    (4, 10),
    (5, 10),
    (4, 11),
    (5, 11),
];

pub const WIN_SCORE: u16 = 150;
pub const MAX_TICKS: u16 = 480;

pub const KIND_INFANTRY: u8 = 0;
pub const KIND_SCOUT: u8 = 1;

// Action kinds
pub const A_HOLD: u8 = 0;
pub const A_MOVE: u8 = 1; // move, fight anything adjacent on the way
pub const A_ATTACK: u8 = 2; // move, but stop and fight when an enemy is adjacent
pub const A_RETREAT: u8 = 3; // move, never stop, never fight

// Trigger kinds
pub const T_NONE: u8 = 0;
pub const T_ENEMY_WITHIN: u8 = 1; // a = radius around this squad
pub const T_ENEMY_NEAR: u8 = 2; // enemy seen within c tiles of (a,b)
pub const T_HP_BELOW: u8 = 3; // a = hp threshold
pub const T_AFTER_TICK: u8 = 4; // tick >= a*256 + b
pub const T_POINT_LOST: u8 = 5; // capture point a is held by the enemy

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Act {
    pub kind: u8,
    pub x: u8,
    pub y: u8,
}

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Trig {
    pub kind: u8,
    pub a: u8,
    pub b: u8,
    pub c: u8,
}

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct RuleS {
    pub trigger: Trig,
    pub action: Act,
    pub fired: bool,
}

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Unit {
    pub kind: u8,
    pub x: u8,
    pub y: u8,
    pub hp: u8,
    pub cooldown: u8,
    pub action: Act,
    pub rules: [RuleS; 2],
}

impl Unit {
    pub fn alive(&self) -> bool {
        self.hp > 0
    }
    pub fn max_hp(&self) -> u8 {
        if self.kind == KIND_SCOUT { 60 } else { 100 }
    }
    pub fn damage(&self) -> u8 {
        if self.kind == KIND_SCOUT { 5 } else { 10 }
    }
    pub fn move_every(&self) -> u8 {
        if self.kind == KIND_SCOUT { 1 } else { 2 }
    }
    pub fn sight(&self) -> u8 {
        let base = if self.kind == KIND_SCOUT { 5 } else { 3 };
        if is_hill(self.x, self.y) { base + 2 } else { base }
    }
}

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Seen {
    pub visible: bool,
    pub x: u8,
    pub y: u8,
    pub hp: u8,
    pub last_seen: u16,
}

pub fn dist(ax: u8, ay: u8, bx: u8, by: u8) -> u8 {
    let dx = (ax as i16 - bx as i16).unsigned_abs() as u8;
    let dy = (ay as i16 - by as i16).unsigned_abs() as u8;
    dx.max(dy)
}

pub fn is_hill(x: u8, y: u8) -> bool {
    HILLS.iter().any(|&(hx, hy)| hx == x && hy == y)
}

pub fn is_forest(x: u8, y: u8) -> bool {
    FORESTS.iter().any(|&(fx, fy)| fx == x && fy == y)
}

pub fn is_crossing(x: u8, y: u8) -> bool {
    y == RIVER_Y && POINTS.iter().any(|&(px, _)| px == x)
}

pub fn passable(x: u8, y: u8) -> bool {
    x < W && y < H && (y != RIVER_Y || is_crossing(x, y))
}

pub fn spawn(side: u8) -> [Unit; SQUADS] {
    // Alpha, Bravo (infantry), Charlie (scout)
    let base = [(3u8, 13u8, KIND_INFANTRY), (11, 13, KIND_INFANTRY), (7, 13, KIND_SCOUT)];
    let mut out = [Unit::default(); SQUADS];
    for (i, &(x, y, kind)) in base.iter().enumerate() {
        let (x, y) = if side == 0 { (x, y) } else { (W - 1 - x, H - 1 - y) };
        let mut u = Unit { kind, x, y, ..Default::default() };
        u.hp = u.max_hp();
        u.action = Act { kind: A_HOLD, x, y };
        out[i] = u;
    }
    out
}

/// Can an observer army see tile (x,y) holding a unit? Forest hides a unit unless
/// an observer is adjacent.
pub fn sees(observers: &[Unit; SQUADS], x: u8, y: u8) -> bool {
    observers.iter().filter(|o| o.alive()).any(|o| {
        let d = dist(o.x, o.y, x, y);
        if is_forest(x, y) { d <= 1 } else { d <= o.sight() }
    })
}

fn sign(v: i16) -> i16 {
    v.signum()
}

/// One step from (x,y) toward (tx,ty), routing through the nearest crossing when
/// the river is in the way. `blocked` reports tiles occupied by enemies.
pub fn next_step(x: u8, y: u8, tx: u8, ty: u8, blocked: &dyn Fn(u8, u8) -> bool) -> (u8, u8) {
    if x == tx && y == ty {
        return (x, y);
    }
    let side = |yy: u8| -> i8 {
        if yy < RIVER_Y { -1 } else if yy > RIVER_Y { 1 } else { 0 }
    };
    let (mut gx, mut gy) = (tx, ty);
    let (s0, s1) = (side(y), side(ty));
    if s0 != 0 && s1 != s0 {
        // must cross: aim at the crossing with the shortest total path
        let mut best = (POINTS[0].0, RIVER_Y);
        let mut best_cost = u16::MAX;
        for &(px, py) in POINTS.iter() {
            let c = dist(x, y, px, py) as u16 + dist(px, py, tx, ty) as u16;
            if c < best_cost {
                best_cost = c;
                best = (px, py);
            }
        }
        gx = best.0;
        gy = best.1;
    }
    let dx = sign(gx as i16 - x as i16);
    let dy = sign(gy as i16 - y as i16);
    let cands = [(dx, dy), (dx, 0), (0, dy)];
    for &(cx, cy) in cands.iter() {
        if cx == 0 && cy == 0 {
            continue;
        }
        let nx = x as i16 + cx;
        let ny = y as i16 + cy;
        if nx < 0 || ny < 0 {
            continue;
        }
        let (nx, ny) = (nx as u8, ny as u8);
        if passable(nx, ny) && !blocked(nx, ny) {
            return (nx, ny);
        }
    }
    (x, y)
}

pub fn eval_trigger(
    t: &Trig,
    me: &Unit,
    intel: &[Seen; SQUADS],
    control: &[u8; 3],
    my_side: u8,
    tick: u16,
) -> bool {
    match t.kind {
        T_ENEMY_WITHIN => intel
            .iter()
            .any(|s| s.visible && dist(me.x, me.y, s.x, s.y) <= t.a),
        T_ENEMY_NEAR => intel
            .iter()
            .any(|s| s.visible && dist(t.a, t.b, s.x, s.y) <= t.c),
        T_HP_BELOW => me.hp < t.a,
        T_AFTER_TICK => tick >= (t.a as u16) * 256 + t.b as u16,
        T_POINT_LOST => {
            let p = t.a as usize;
            p < 3 && control[p] == if my_side == 0 { 2 } else { 1 }
        }
        _ => false,
    }
}

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct World {
    pub armies: [[Unit; SQUADS]; 2],
    pub intel: [[Seen; SQUADS]; 2],
    pub control: [u8; 3], // 0 nobody, 1 side0, 2 side1
    pub scores: [u16; 2],
    pub tick: u16,
    pub winner: u8, // 0 running, 1 side0, 2 side1, 3 draw
}

fn refresh_intel(w: &mut World) {
    for side in 0..2usize {
        let enemy = 1 - side;
        for i in 0..SQUADS {
            let e = w.armies[enemy][i];
            let vis = e.alive() && sees(&w.armies[side], e.x, e.y);
            let s = &mut w.intel[side][i];
            s.visible = vis;
            if vis {
                s.x = e.x;
                s.y = e.y;
                s.hp = e.hp;
                s.last_seen = w.tick;
            } else if !e.alive() && s.hp != 0 && sees(&w.armies[side], s.x, s.y) {
                // we can see the spot where it died
                s.hp = 0;
            }
        }
    }
}

/// Advance the world by one tick.
pub fn step(w: &mut World) {
    if w.winner != 0 {
        return;
    }
    w.tick = w.tick.saturating_add(1);

    // 1. Triggers (each army only uses its own intel: the AI lieutenant knows
    //    what you know, nothing more).
    for side in 0..2usize {
        let intel = w.intel[side];
        let control = w.control;
        for i in 0..SQUADS {
            let u = w.armies[side][i];
            if !u.alive() {
                continue;
            }
            let mut unit = u;
            for r in 0..2 {
                let rule = unit.rules[r];
                if rule.fired || rule.trigger.kind == T_NONE {
                    continue;
                }
                if eval_trigger(&rule.trigger, &unit, &intel, &control, side as u8, w.tick) {
                    unit.action = rule.action;
                    unit.rules[r].fired = true;
                }
            }
            w.armies[side][i] = unit;
        }
    }

    // 2. Combat, simultaneous.
    let mut dmg = [[0u16; SQUADS]; 2];
    for side in 0..2usize {
        let enemy = 1 - side;
        for i in 0..SQUADS {
            let u = w.armies[side][i];
            if !u.alive() || u.action.kind == A_RETREAT {
                continue;
            }
            // weakest adjacent enemy
            let mut target: Option<usize> = None;
            for j in 0..SQUADS {
                let e = w.armies[enemy][j];
                if e.alive() && dist(u.x, u.y, e.x, e.y) <= 1 {
                    match target {
                        Some(t) if w.armies[enemy][t].hp <= e.hp => {}
                        _ => target = Some(j),
                    }
                }
            }
            if let Some(j) = target {
                let e = w.armies[enemy][j];
                let mut d = u.damage() as u16;
                if is_hill(e.x, e.y) {
                    d = d * 3 / 4;
                }
                if e.action.kind == A_HOLD {
                    d = d * 3 / 4;
                }
                dmg[enemy][j] += d.max(1);
            }
        }
    }
    for side in 0..2 {
        for i in 0..SQUADS {
            let u = &mut w.armies[side][i];
            u.hp = (u.hp as u16).saturating_sub(dmg[side][i]) as u8;
        }
    }

    // 3. Movement.
    for side in 0..2usize {
        let enemy = 1 - side;
        for i in 0..SQUADS {
            let u = w.armies[side][i];
            if !u.alive() || u.action.kind == A_HOLD {
                continue;
            }
            let engaged = w.armies[enemy]
                .iter()
                .any(|e| e.alive() && dist(u.x, u.y, e.x, e.y) <= 1);
            if u.action.kind == A_ATTACK && engaged {
                continue;
            }
            let mut unit = u;
            if unit.cooldown > 0 {
                unit.cooldown -= 1;
                w.armies[side][i] = unit;
                continue;
            }
            let enemies = w.armies[enemy];
            let blocked = |x: u8, y: u8| enemies.iter().any(|e| e.alive() && e.x == x && e.y == y);
            let (nx, ny) = next_step(unit.x, unit.y, unit.action.x, unit.action.y, &blocked);
            if (nx, ny) != (unit.x, unit.y) {
                unit.x = nx;
                unit.y = ny;
                unit.cooldown = unit.move_every() - 1;
            }
            if unit.x == unit.action.x && unit.y == unit.action.y {
                unit.action.kind = A_HOLD;
            }
            w.armies[side][i] = unit;
        }
    }

    // 4. Capture points: held by a side with a squad within 1 tile and no enemy
    //    within 1 tile. Contested points keep their owner.
    for (p, &(px, py)) in POINTS.iter().enumerate() {
        let near = |side: usize| {
            w.armies[side]
                .iter()
                .any(|u| u.alive() && dist(u.x, u.y, px, py) <= 1)
        };
        let (a, b) = (near(0), near(1));
        if a && !b {
            w.control[p] = 1;
        } else if b && !a {
            w.control[p] = 2;
        }
    }
    for p in 0..3 {
        match w.control[p] {
            1 => w.scores[0] = w.scores[0].saturating_add(1),
            2 => w.scores[1] = w.scores[1].saturating_add(1),
            _ => {}
        }
    }

    // 5. Intel for next tick.
    refresh_intel(w);

    // 6. End conditions.
    let alive = |side: usize| w.armies[side].iter().any(|u| u.alive());
    let (a0, a1) = (alive(0), alive(1));
    w.winner = if !a0 && !a1 {
        3
    } else if !a1 {
        1
    } else if !a0 {
        2
    } else if w.scores[0] >= WIN_SCORE || w.scores[1] >= WIN_SCORE || w.tick >= MAX_TICKS {
        if w.scores[0] > w.scores[1] {
            1
        } else if w.scores[1] > w.scores[0] {
            2
        } else {
            3
        }
    } else {
        0
    };
}

pub fn new_world() -> World {
    let mut w = World {
        armies: [spawn(0), spawn(1)],
        ..Default::default()
    };
    refresh_intel(&mut w);
    w
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_is_symmetric() {
        for &(x, y) in FORESTS.iter() {
            assert!(is_forest(W - 1 - x, H - 1 - y));
        }
        for &(x, y) in HILLS.iter() {
            assert!(is_hill(W - 1 - x, H - 1 - y));
        }
        for &(x, y) in POINTS.iter() {
            assert!(is_crossing(W - 1 - x, H - 1 - y));
        }
    }

    #[test]
    fn routes_over_a_crossing() {
        let none = |_: u8, _: u8| false;
        let (mut x, mut y) = (3u8, 13u8);
        for _ in 0..40 {
            let (nx, ny) = next_step(x, y, 3, 1, &none);
            assert!(passable(nx, ny));
            x = nx;
            y = ny;
        }
        assert_eq!((x, y), (3, 1));
    }

    #[test]
    fn fog_hides_far_units() {
        let w = new_world();
        assert!(w.intel[0].iter().all(|s| !s.visible));
    }

    #[test]
    fn trigger_fires_and_retreats() {
        let mut w = new_world();
        // side 0 alpha holds the west bridge; retreat to (3,13) if enemy within 2
        w.armies[0][0].x = 2;
        w.armies[0][0].y = 8;
        w.armies[0][0].action = Act { kind: A_HOLD, x: 2, y: 8 };
        w.armies[0][0].rules[0] = RuleS {
            trigger: Trig { kind: T_ENEMY_WITHIN, a: 2, b: 0, c: 0 },
            action: Act { kind: A_RETREAT, x: 3, y: 13 },
            fired: false,
        };
        // side 1 scout walks to the bridge
        w.armies[1][2].action = Act { kind: A_MOVE, x: 2, y: 6 };
        let mut fired_at = None;
        for _ in 0..40 {
            step(&mut w);
            if w.armies[0][0].rules[0].fired && fired_at.is_none() {
                fired_at = Some(w.tick);
            }
        }
        assert!(fired_at.is_some());
        assert_eq!(w.armies[0][0].action.kind, A_HOLD); // arrived after retreating
        assert_eq!((w.armies[0][0].x, w.armies[0][0].y), (3, 13));
    }

    #[test]
    fn game_ends() {
        let mut w = new_world();
        w.armies[0][0].action = Act { kind: A_MOVE, x: 2, y: 8 };
        for _ in 0..(MAX_TICKS as usize + 5) {
            step(&mut w);
        }
        assert_eq!(w.winner, 1);
    }
}
