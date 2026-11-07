import { AnchorProvider, BN, BorshAccountsCoder, Program, type Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { getAuthToken, permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";
import idl from "@/sealed_orders.json";
import type { SealedOrders } from "@/sealed_orders_types";
import type { ArmyState, GameState, IntelState, Order } from "./game";

export const PROGRAM_ID = new PublicKey(idl.address);
export const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC || "https://api.devnet.solana.com";
export const TEE_URL = process.env.NEXT_PUBLIC_TEE_URL || "https://devnet-tee.magicblock.app";
export const TEE_WS = TEE_URL.replace(/^http/, "ws");
export const TEE_VALIDATOR = new PublicKey(
  process.env.NEXT_PUBLIC_TEE_VALIDATOR || "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo",
);

const le8 = (id: BN) => id.toArrayLike(Buffer, "le", 8);
export const gamePda = (id: BN) =>
  PublicKey.findProgramAddressSync([Buffer.from("game"), le8(id)], PROGRAM_ID)[0];
export const armyPda = (id: BN, side: number) =>
  PublicKey.findProgramAddressSync([Buffer.from("army"), le8(id), Buffer.from([side])], PROGRAM_ID)[0];
export const intelPda = (id: BN, side: number) =>
  PublicKey.findProgramAddressSync([Buffer.from("intel"), le8(id), Buffer.from([side])], PROGRAM_ID)[0];
export const permissionPda = (acc: PublicKey) => permissionPdaFromAccount(acc);

export function allPdas(id: BN) {
  return {
    game: gamePda(id),
    army0: armyPda(id, 0),
    army1: armyPda(id, 1),
    intel0: intelPda(id, 0),
    intel1: intelPda(id, 1),
  };
}

/** Minimal Anchor wallet around a Keypair (works in the browser too). */
export class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) tx.partialSign(this.payer);
    else tx.sign([this.payer]);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
}

export function programFor(connection: Connection, kp: Keypair) {
  const provider = new AnchorProvider(connection, new KeypairWallet(kp), { commitment: "confirmed" });
  return new Program<SealedOrders>(idl as SealedOrders, provider);
}

export const coder = new BorshAccountsCoder(idl as SealedOrders);

/** Auth token for reading private accounts on the TEE rollup. Cached per key. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
export async function teeToken(kp: Keypair) {
  const key = kp.publicKey.toBase58();
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const t = await getAuthToken(TEE_URL, kp.publicKey, async (m) => nacl.sign.detached(m, kp.secretKey));
  tokenCache.set(key, t);
  return t.token;
}

export async function teeConnection(kp: Keypair) {
  const token = await teeToken(kp);
  return new Connection(`${TEE_URL}?token=${token}`, {
    wsEndpoint: `${TEE_WS}?token=${token}`,
    commitment: "confirmed",
  });
}

export async function sendIxs(connection: Connection, ixs: TransactionInstruction[], signers: Keypair[]) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const res = await connection.confirmTransaction(sig, "confirmed");
  if (res.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

// ---------- decoding ----------

const pk = (p: PublicKey) => p.toBase58();

export function decodeGame(data: Buffer): GameState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = coder.decode("Game", data);
  return {
    gameId: g.game_id.toString(),
    commanders: g.commanders.map(pk),
    joined: g.joined,
    status: g.status,
    vsAi: g.vs_ai,
    tick: g.tick,
    control: Array.from(g.control as number[]),
    scores: Array.from(g.scores as number[]),
    winner: g.winner,
    createdAt: Number(g.created_at),
  };
}

export function decodeArmy(data: Buffer): ArmyState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: any = coder.decode("Army", data);
  const count: number = a.log_count;
  const entries = [];
  const n = Math.min(count, a.log.length);
  for (let i = count - n; i < count; i++) {
    const e = a.log[i % a.log.length];
    entries.push({
      tick: e.tick,
      mask: e.mask,
      text: Buffer.from(e.text.slice(0, e.len)).toString("utf8"),
    });
  }
  return {
    side: a.side,
    commander: pk(a.commander),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    units: a.units.map((u: any) => ({
      kind: u.kind,
      x: u.x,
      y: u.y,
      hp: u.hp,
      cooldown: u.cooldown,
      action: u.action,
      rules: u.rules,
    })),
    log: entries,
  };
}

export function decodeIntel(data: Buffer): IntelState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i: any = coder.decode("Intel", data);
  return {
    side: i.side,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    seen: i.seen.map((s: any) => ({ visible: s.visible, x: s.x, y: s.y, hp: s.hp, lastSeen: s.last_seen })),
  };
}

/** Read whatever this key is allowed to see. Missing/forbidden accounts come back null. */
export async function readSide(conn: Connection, id: BN, side: number) {
  const p = allPdas(id);
  const [g, a, i] = await conn.getMultipleAccountsInfo(
    [p.game, side === 0 ? p.army0 : p.army1, side === 0 ? p.intel0 : p.intel1],
    "processed",
  );
  return {
    game: g ? decodeGame(g.data) : null,
    army: a ? decodeArmy(a.data) : null,
    intel: i ? decodeIntel(i.data) : null,
  };
}

export async function readGame(conn: Connection, id: BN) {
  const info = await conn.getAccountInfo(gamePda(id), "processed");
  return info ? decodeGame(info.data) : null;
}

export async function issueOrders(conn: Connection, kp: Keypair, id: BN, side: number, orders: Order[], text: string) {
  const program = programFor(conn, kp);
  const bytes = Buffer.from(text, "utf8").subarray(0, 96);
  const ix = await program.methods
    .issueOrders(orders, bytes)
    .accountsPartial({ game: gamePda(id), army: armyPda(id, side), commander: kp.publicKey })
    .instruction();
  return sendIxs(conn, [ix], [kp]);
}
