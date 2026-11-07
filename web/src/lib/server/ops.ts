import "server-only";
import { BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  AUTHORITY_FLAG,
  EPHEMERAL_VAULT_ID,
  MAGIC_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  TX_LOGS_FLAG,
  waitUntilPermissionActive,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import bs58 from "bs58";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  allPdas,
  BASE_RPC,
  PROGRAM_ID,
  programFor,
  sendIxs,
  TEE_URL,
  TEE_VALIDATOR,
  teeConnection,
} from "../chain";
import { TICK_MS } from "../game";

/** The server wallet pays base-layer rent so players never need SOL or a wallet. */
function loadKey(envName: string, fallbackFile?: string): Keypair {
  const v = process.env[envName];
  if (v) {
    const t = v.trim();
    return Keypair.fromSecretKey(t.startsWith("[") ? Uint8Array.from(JSON.parse(t)) : bs58.decode(t));
  }
  if (fallbackFile && fs.existsSync(fallbackFile)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(fallbackFile, "utf8"))));
  }
  throw new Error(`${envName} is not set`);
}

const g = globalThis as unknown as { __so?: { payer: Keypair; ai: Keypair; base: Connection } };
export function server() {
  if (!g.__so) {
    const payer = loadKey("SERVER_SECRET_KEY", path.join(os.homedir(), ".config/solana/id.json"));
    // The AI commander gets its own key so it can only read its own army.
    let ai: Keypair;
    try {
      ai = loadKey("AI_SECRET_KEY");
    } catch {
      const f = path.join(process.cwd(), ".ai-commander.json");
      if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(Array.from(Keypair.generate().secretKey)));
      ai = loadKey("AI_SECRET_KEY", f);
    }
    g.__so = { payer, ai, base: new Connection(BASE_RPC, "confirmed") };
  }
  return g.__so;
}

const member = (k: PublicKey) => ({ flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: k });

async function waitOnEr(conn: Connection, keys: PublicKey[]) {
  for (let i = 0; i < 40; i++) {
    const infos = await conn.getMultipleAccountsInfo(keys);
    if (infos.every((x) => x)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("accounts did not reach the rollup in 20s");
}

type AccountType =
  | { game: { gameId: BN } }
  | { army: { gameId: BN; side: number } }
  | { intel: { gameId: BN; side: number } };

async function delegateIx(id: BN, t: AccountType, pda: PublicKey) {
  const { payer, base } = server();
  const program = programFor(base, payer);
  return program.methods
    .delegatePda(t)
    .accountsPartial({ payer: payer.publicKey, validator: TEE_VALIDATOR, pda })
    .instruction();
}

async function initPermissions(id: BN, items: { t: AccountType; pda: PublicKey; members: PublicKey[] }[]) {
  const { payer } = server();
  const er = await teeConnection(payer);
  await waitOnEr(
    er,
    items.map((i) => i.pda),
  );
  const program = programFor(er, payer);
  const ixs = await Promise.all(
    items.map((i) =>
      program.methods
        .initPermission(i.t, i.members.map(member))
        .accountsPartial({
          permissionedAccount: i.pda,
          permission: permissionPdaFor(i.pda),
          authority: payer.publicKey,
          permissionProgram: PERMISSION_PROGRAM_ID,
          ephemeralVault: EPHEMERAL_VAULT_ID,
          magicProgram: MAGIC_PROGRAM_ID,
        })
        .instruction(),
    ),
  );
  for (let k = 0; k < ixs.length; k += 3) await sendIxs(er, ixs.slice(k, k + 3), [payer]);
  await Promise.all(items.map((i) => waitUntilPermissionActive(TEE_URL, i.pda)));
}

import { permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";
const permissionPdaFor = (p: PublicKey) => permissionPdaFromAccount(p);

export type Created = { gameId: string; side: number };

/** Create a game. Side 0 is the human; side 1 is the AI or a friend joining later. */
export async function createGame(human: PublicKey, vsAi: boolean): Promise<Created> {
  const { payer, ai, base } = server();
  const id = new BN(Date.now());
  const p = allPdas(id);
  const program = programFor(base, payer);

  const create = await program.methods
    .createGame(id, human, vsAi, 0)
    .accountsPartial({ game: p.game, army: p.army0, intel: p.intel0, payer: payer.publicKey })
    .instruction();
  const ixs = [create];
  if (vsAi) {
    ixs.push(
      await program.methods
        .joinGame(id, ai.publicKey)
        .accountsPartial({ game: p.game, army: p.army1, intel: p.intel1, payer: payer.publicKey })
        .instruction(),
    );
  }
  await sendIxs(base, ixs, [payer]);

  // Delegate. The game stays on the base layer until side 1 has joined.
  const d0 = [
    await delegateIx(id, { army: { gameId: id, side: 0 } }, p.army0),
    await delegateIx(id, { intel: { gameId: id, side: 0 } }, p.intel0),
  ];
  await sendIxs(base, d0, [payer]);
  if (vsAi) await delegateSide1AndGame(id);

  await initPermissions(id, [
    { t: { army: { gameId: id, side: 0 } }, pda: p.army0, members: [human] },
    { t: { intel: { gameId: id, side: 0 } }, pda: p.intel0, members: [human] },
  ]);
  if (vsAi) {
    await finishSide1(id, human, ai.publicKey);
    // the human presses Start on the battle page (POST /api/games/[id]/start)
  }
  return { gameId: id.toString(), side: 0 };
}

async function delegateSide1AndGame(id: BN) {
  const { payer, base } = server();
  const p = allPdas(id);
  await sendIxs(
    base,
    [
      await delegateIx(id, { game: { gameId: id } }, p.game),
      await delegateIx(id, { army: { gameId: id, side: 1 } }, p.army1),
      await delegateIx(id, { intel: { gameId: id, side: 1 } }, p.intel1),
    ],
    [payer],
  );
}

async function finishSide1(id: BN, c0: PublicKey, c1: PublicKey) {
  const p = allPdas(id);
  await initPermissions(id, [
    { t: { game: { gameId: id } }, pda: p.game, members: [c0, c1, server().payer.publicKey] },
    { t: { army: { gameId: id, side: 1 } }, pda: p.army1, members: [c1] },
    { t: { intel: { gameId: id, side: 1 } }, pda: p.intel1, members: [c1] },
  ]);
}

/** A friend joins as side 1. */
export async function joinGame(gameId: string, friend: PublicKey): Promise<Created> {
  const { payer, base } = server();
  const id = new BN(gameId);
  const p = allPdas(id);
  const program = programFor(base, payer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const game: any = await program.account.game.fetch(p.game);
  await sendIxs(
    base,
    [
      await program.methods
        .joinGame(id, friend)
        .accountsPartial({ game: p.game, army: p.army1, intel: p.intel1, payer: payer.publicKey })
        .instruction(),
    ],
    [payer],
  );
  await delegateSide1AndGame(id);
  await finishSide1(id, game.commanders[0], friend);
  return { gameId, side: 1 };
}

/** Start the battle and schedule the tick crank on the rollup. */
export async function startAndCrank(id: BN, commander: Keypair) {
  const p = allPdas(id);
  const erC = await teeConnection(commander);
  const pc = programFor(erC, commander);
  await sendIxs(erC, [await pc.methods.startGame().accountsPartial({ game: p.game, commander: commander.publicKey }).instruction()], [commander]);
  await scheduleCrank(id);
}

export async function scheduleCrank(id: BN) {
  const { payer } = server();
  const p = allPdas(id);
  if (process.env.TICK_MODE !== "server") {
    const erP = await teeConnection(payer);
    const pp = programFor(erP, payer);
    const ix = await pp.methods
      .scheduleTicks(new BN(Number(id.toString()) % 2 ** 31), new BN(TICK_MS), new BN(600))
      .accountsPartial({
        magicProgram: MAGIC_PROGRAM_ID,
        payer: payer.publicKey,
        game: p.game,
        army0: p.army0,
        army1: p.army1,
        intel0: p.intel0,
        intel1: p.intel1,
        program: PROGRAM_ID,
      })
      .instruction();
    await sendIxs(erP, [ix], [payer]);
  }
}

/** Server-side tick, used when TICK_MODE=server (fallback if cranks are unavailable). */
export async function tickOnce(id: BN) {
  const { payer } = server();
  const p = allPdas(id);
  const er = await teeConnection(payer);
  const program = programFor(er, payer);
  const ix = await program.methods
    .tick()
    .accountsPartial({ game: p.game, army0: p.army0, army1: p.army1, intel0: p.intel0, intel1: p.intel1 })
    .instruction();
  return sendIxs(er, [ix], [payer]);
}

/** After the battle: make every account public so anyone can replay it. */
export async function reveal(id: BN) {
  const { payer } = server();
  const p = allPdas(id);
  const er = await teeConnection(payer);
  const program = programFor(er, payer);
  const ix = await program.methods
    .reveal()
    .accountsPartial({
      game: p.game,
      army0: p.army0,
      army1: p.army1,
      intel0: p.intel0,
      intel1: p.intel1,
      permissionGame: permissionPdaFor(p.game),
      permissionArmy0: permissionPdaFor(p.army0),
      permissionArmy1: permissionPdaFor(p.army1),
      permissionIntel0: permissionPdaFor(p.intel0),
      permissionIntel1: permissionPdaFor(p.intel1),
      payer: payer.publicKey,
      permissionProgram: PERMISSION_PROGRAM_ID,
      ephemeralVault: EPHEMERAL_VAULT_ID,
      magicProgram: MAGIC_PROGRAM_ID,
    })
    .instruction();
  return sendIxs(er, [ix], [payer]);
}
