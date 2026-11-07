# Sealed Orders

A real-time strategy game on Solana where you command your army in plain English, and your opponent can't read a single order until the battle is over.

Built for the **MLH Solana Hackathon** (Nov 6–8, 2026).

- You type (or say) an order: *"Bravo hold the Ford. If they get within 2, fall back to the hill."*
- Claude compiles it into a small rule: `hold (7,7)` + `if enemy_within 2 → retreat (10,10)`.
- The rule is written into your army account on a **MagicBlock Private Ephemeral Rollup**, inside an Intel TDX enclave. Only your key can read that account.
- A crank inside the rollup advances the battle every 500 ms and fires your rules when their triggers come true, even while you're typing the next order.
- When the battle ends, every account is made public, so anyone can replay both sides' orders with their original text.

## Why the privacy matters

In a normal onchain game, every order is a public transaction. Your opponent can read your plan the moment you send it. In Sealed Orders:

| | Normal onchain game | Sealed Orders |
|---|---|---|
| Your squads' positions | Public | Only your key can read them |
| Your orders | Public | Only your key can read them |
| What you know about the enemy | Everything | Only what your squads can see (fog of war) |
| `getAccountInfo(enemyArmy)` | Full data | `null`: you're not a member |

The battle screen has a **"Try to read the enemy army"** button that runs that exact call with your own key, so you can watch it fail.

## How it works

```
Browser (commander key, never leaves the browser)
  │  types an order
  ▼
/api/compile ── Claude (claude-haiku-5-5) ──► structured orders (validated, clamped)
  │
  ▼  issue_orders, signed by the commander key, 0 SOL
MagicBlock Private Ephemeral Rollup (Intel TDX)
  ├─ Game     (scores, tick)        readable by both commanders + server
  ├─ Army 0   (squads, orders, log) readable by commander 0 only
  ├─ Army 1                         readable by commander 1 only
  ├─ Intel 0  (what side 0 can see) readable by commander 0 only
  ├─ Intel 1                        readable by commander 1 only
  └─ tick crank every 500 ms ─► sim::step (movement, combat, triggers, capture, fog)
                                  ▼ when someone wins
                                reveal: all 5 permissions flipped to public
```

- **Program** ([programs/sealed-orders](programs/sealed-orders/src)): Anchor 1.0 with `ephemeral-rollups-sdk` (access control and cranks). The battle rules live in [`sim.rs`](programs/sealed-orders/src/sim.rs), pure functions with unit tests. The army account is zero-copy, so it's never copied onto the 4 KB BPF stack.
- **Players need no wallet.** The server pays base-layer rent and delegation. Each browser generates a commander key that signs the rollup's auth challenge and your orders. The server never sees your key, so it can't read your army.
- **The AI opponent plays fair.** It has its own key and reads only its own army and intel. It writes its orders as plain-English radio messages, which show up in the replay.
- **Enclave check.** The top bar asks the rollup for a fresh Intel TDX quote over a random challenge and verifies it (`verifyTeeRpcIntegrity`).

## Game rules

- 15×15 map. A river runs across the middle row and can only be crossed at 3 points: West Bridge, Ford, East Bridge. These are also the capture points.
- Each point you hold scores 1 point per tick. First to 600 wins, otherwise the higher score after 480 ticks (4 minutes). Destroying the whole enemy army also wins.
- Squads:
  - Alpha and Bravo: infantry, 100 HP.
  - Scout: 60 HP, moves twice as fast, sees 5 tiles.
- Terrain:
  - Hills give +2 sight and 25% less damage.
  - Woods hide a unit unless an enemy is next to it.
- Each squad can carry up to 2 standing rules. Triggers: enemy within N, enemy near a place, HP below N, after tick N, point lost.

## Run it locally

Prerequisites: Node 20+, pnpm, and a devnet keypair at `~/.config/solana/id.json` with a little SOL (about 0.05 SOL per battle).

```bash
cd web
cp .env.example .env.local   # add ANTHROPIC_API_KEY
pnpm install
pnpm dev
```

Open http://localhost:3000, then click **Open the war room** and then **Battle the AI**.

The program is deployed on devnet at `3i78SahtFXsvLVUbEJc1cgoUk3WnUTB9LHtEwMDbNCxH`. To build and deploy it yourself:

```bash
anchor build      # Anchor 1.0.2
solana program deploy -u devnet --program-id target/deploy/sealed_orders-keypair.json target/deploy/sealed_orders.so
```

End-to-end checks against devnet (with the dev server running):

```bash
cd web && npx tsx scripts/e2e.ts       # create, order, spy, watch ticks
cd web && npx tsx scripts/e2e-end.ts   # play to the end and verify the reveal
```

## Limits, stated plainly

- The server sees the plain-English text when it sends it to Claude for compiling. It never holds your key, so it can't read your army on the rollup. Running the compiler inside an enclave too is the next step.
- The privacy relies on Intel TDX hardware (MagicBlock's TEE validator), not on zero-knowledge proofs.
- Devnet only. There are no stakes yet.

## AI tools used

As MLH rules require: Claude Code helped write this project, and the game uses Claude (`claude-haiku-5-5`) at runtime to compile orders and to command the AI army.
