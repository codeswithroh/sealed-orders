import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  A,
  ArmyState,
  H,
  IntelState,
  isWater,
  NO_RULE,
  Order,
  POINT_NAMES,
  POINTS,
  Rule,
  SQUAD_NAMES,
  T,
  W,
  describeAction,
  describeTrigger,
  maxHp,
} from "../game";

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";
const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ACTIONS = ["hold", "move", "attack", "retreat"] as const;
const TRIGGERS = ["enemy_within", "enemy_near", "hp_below", "after_tick", "point_lost"] as const;

const actionSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ACTIONS },
    x: { type: "integer", minimum: 0, maximum: W - 1 },
    y: { type: "integer", minimum: 0, maximum: H - 1 },
  },
  required: ["kind", "x", "y"],
};

const tool = {
  name: "issue_orders",
  description: "Issue compiled orders to one or more squads.",
  input_schema: {
    type: "object" as const,
    properties: {
      text: {
        type: "string",
        description: "Only when you are the commander: the plain-English order you are giving, max 90 characters.",
      },
      understood: {
        type: "string",
        description: "One short line read back to the commander, like a radio operator. Max 100 characters.",
      },
      orders: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            squad: { type: "integer", minimum: 0, maximum: 2, description: "0 Alpha, 1 Bravo, 2 Scout" },
            action: actionSchema,
            rules: {
              type: "array",
              maxItems: 2,
              description: "Conditional orders. Each fires once, when its trigger first becomes true.",
              items: {
                type: "object",
                properties: {
                  trigger: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: TRIGGERS },
                      radius: { type: "integer", minimum: 1, maximum: 6 },
                      x: { type: "integer", minimum: 0, maximum: W - 1 },
                      y: { type: "integer", minimum: 0, maximum: H - 1 },
                      hp: { type: "integer", minimum: 1, maximum: 100 },
                      tick: { type: "integer", minimum: 0, maximum: 480 },
                      point: { type: "integer", minimum: 0, maximum: 2 },
                    },
                    required: ["type"],
                  },
                  then: actionSchema,
                },
                required: ["trigger", "then"],
              },
            },
          },
          required: ["squad", "action"],
        },
      },
    },
    required: ["understood", "orders"],
  },
};

function mapBrief(side: number) {
  const home = side === 0 ? "south (high y)" : "north (low y)";
  const enemy = side === 0 ? "north (low y)" : "south (high y)";
  return `MAP: ${W}x${H} grid, x 0..14 left to right, y 0..14 top to bottom. North = lower y.
Row y=7 is a river. Units can only cross at three crossings, which are also the capture points:
  0 West Bridge (2,7), 1 Ford (7,7), 2 East Bridge (12,7).
Hills (+2 sight, -25% damage taken): North-west Hill (4,4), South-east Hill (10,10).
Woods (units inside are hidden unless an enemy is adjacent): North Woods (9..10,3..4), South Woods (4..5,10..11).
You are side ${side}. Your base is the ${home}. The enemy comes from the ${enemy}.
"Forward"/"advance" means toward the enemy. "Back"/"fall back" means toward your base.
Holding points scores 1/tick each; first to 150 wins. Ticks are 0.5s; the game lasts at most 480 ticks.
Squads: 0 Alpha (infantry, 100hp, slow), 1 Bravo (infantry, 100hp, slow), 2 Scout (60hp, fast, sees 5 tiles).
Actions: hold (stay, fight adjacent, -25% damage taken), move (walk to x,y, fights adjacent enemies on the way),
attack (walk, stop and fight when an enemy is adjacent), retreat (walk without fighting).`;
}

function stateBrief(army: ArmyState, intel: IntelState | null, tick: number) {
  const mine = army.units
    .map((u, i) => {
      const rules = u.rules
        .filter((r) => r.trigger.kind !== T.NONE && !r.fired)
        .map((r) => `if ${describeTrigger(r.trigger)} then ${describeAction(r.action)}`)
        .join("; ");
      return `  ${i} ${SQUAD_NAMES[i]} at (${u.x},${u.y}) hp ${u.hp}/${maxHp(u.kind)}, doing: ${describeAction(u.action)}${rules ? `, standing orders: ${rules}` : ""}${u.hp === 0 ? " (destroyed)" : ""}`;
    })
    .join("\n");
  const seen = (intel?.seen ?? [])
    .map((s, i) =>
      s.visible
        ? `  enemy ${SQUAD_NAMES[i]} visible at (${s.x},${s.y}) hp ${s.hp}`
        : s.lastSeen > 0 && s.hp > 0
          ? `  enemy ${SQUAD_NAMES[i]} last seen at (${s.x},${s.y}) on tick ${s.lastSeen}`
          : `  enemy ${SQUAD_NAMES[i]}: ${s.hp === 0 && s.lastSeen > 0 ? "destroyed" : "unknown"}`,
    )
    .join("\n");
  return `TICK ${tick}\nYOUR SQUADS:\n${mine}\nINTEL (only what your squads can see):\n${seen}`;
}

type RawAction = { kind: string; x: number; y: number };
type RawRule = {
  trigger: { type: string; radius?: number; x?: number; y?: number; hp?: number; tick?: number; point?: number };
  then: RawAction;
};
type RawOrder = { squad: number; action: RawAction; rules?: RawRule[] };

const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

function toAction(a: RawAction) {
  let x = clamp(a.x, 0, W - 1);
  const y = clamp(a.y, 0, H - 1);
  const kind = Math.max(0, ACTIONS.indexOf(a.kind as (typeof ACTIONS)[number]));
  if (isWater(x, y)) {
    // snap to the nearest crossing
    x = POINTS.reduce((b, [px]) => (Math.abs(px - x) < Math.abs(b - x) ? px : b), POINTS[0][0]);
  }
  return { kind, x, y };
}

function toRule(r: RawRule): Rule {
  const t = r.trigger;
  let trigger = { kind: T.NONE as number, a: 0, b: 0, c: 0 };
  switch (t.type) {
    case "enemy_within":
      trigger = { kind: T.ENEMY_WITHIN, a: clamp(t.radius ?? 2, 1, 6), b: 0, c: 0 };
      break;
    case "enemy_near":
      trigger = { kind: T.ENEMY_NEAR, a: clamp(t.x, 0, W - 1), b: clamp(t.y, 0, H - 1), c: clamp(t.radius ?? 2, 0, 6) };
      break;
    case "hp_below":
      trigger = { kind: T.HP_BELOW, a: clamp(t.hp ?? 40, 1, 100), b: 0, c: 0 };
      break;
    case "after_tick": {
      const k = clamp(t.tick ?? 0, 0, 480);
      trigger = { kind: T.AFTER_TICK, a: k >> 8, b: k & 255, c: 0 };
      break;
    }
    case "point_lost":
      trigger = { kind: T.POINT_LOST, a: clamp(t.point ?? 0, 0, 2), b: 0, c: 0 };
      break;
  }
  return { trigger, action: toAction(r.then) };
}

export type Compiled = { orders: Order[]; understood: string; text?: string };

function toOrders(raw: RawOrder[]): Order[] {
  const seen = new Set<number>();
  const out: Order[] = [];
  for (const o of raw ?? []) {
    const squad = clamp(o.squad, 0, 2);
    if (seen.has(squad)) continue;
    seen.add(squad);
    const rules = (o.rules ?? []).slice(0, 2).map(toRule);
    while (rules.length < 2) rules.push(NO_RULE);
    out.push({ squad, action: toAction(o.action), rules: [rules[0], rules[1]] });
  }
  return out;
}

async function callTool(system: string, user: string) {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 800,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("no orders returned");
  return block.input as { text?: string; understood: string; orders: RawOrder[] };
}

/** Translate a human commander's plain-English order. */
export async function compileOrder(text: string, army: ArmyState, intel: IntelState | null, tick: number): Promise<Compiled> {
  const system = `You are the field lieutenant in a real-time strategy game. Your commander gives orders in plain English.
Translate them into the issue_orders tool call. Only include squads the order is about ("everyone"/"all" = all three alive squads).
Use exact coordinates. Pick named places from the map. Turn conditions ("if they cross", "when hurt", "after a minute") into rules.
Never invent moves the commander did not ask for. If the order is unclear, make the most literal safe reading.
${mapBrief(army.side)}`;
  const out = await callTool(system, `${stateBrief(army, intel, tick)}\n\nCOMMANDER'S ORDER: "${text}"`);
  return { orders: toOrders(out.orders), understood: out.understood?.slice(0, 120) ?? "Understood." };
}

/** The AI commander decides what to do from its own sealed view of the battle. */
export async function aiDecide(army: ArmyState, intel: IntelState | null, tick: number, control: number[], scores: number[]): Promise<Compiled> {
  const me = army.side;
  const ctl = control
    .map((c, i) => `${POINT_NAMES[i]}: ${c === 0 ? "nobody" : c - 1 === me ? "you" : "enemy"}`)
    .join(", ");
  const system = `You are a sharp, aggressive commander in a real-time strategy game playing against a human.
Decide your next orders. Write them as a short radio order in "text" (like a human would type, max 90 chars),
and compile them into the orders field. Use conditional rules to set ambushes and fallbacks.
You only know what your squads can see. Change plans only when it matters; it is fine to issue orders to just one squad.
${mapBrief(me)}`;
  const out = await callTool(
    system,
    `${stateBrief(army, intel, tick)}\nCAPTURE POINTS: ${ctl}\nSCORE you ${scores[me]} vs enemy ${scores[1 - me]}\n\nYour orders:`,
  );
  return {
    orders: toOrders(out.orders),
    understood: out.understood ?? "",
    text: (out.text || out.understood || "Orders updated").slice(0, 90),
  };
}

export const _test = { toOrders, A };
