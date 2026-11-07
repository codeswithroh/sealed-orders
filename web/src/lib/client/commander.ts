"use client";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/** Your commander key lives only in this browser. It signs your orders and the
 *  rollup auth challenge, so nobody else (not even our server) can read your army. */
const KEY = "sealed-orders:commander";

export function getCommander(): Keypair {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return Keypair.fromSecretKey(bs58.decode(s));
  } catch {}
  const kp = Keypair.generate();
  try {
    localStorage.setItem(KEY, bs58.encode(kp.secretKey));
  } catch {}
  return kp;
}

export function rememberGame(gameId: string, side: number) {
  try {
    const raw = localStorage.getItem("sealed-orders:games");
    const list: { gameId: string; side: number; at: number }[] = raw ? JSON.parse(raw) : [];
    const next = [{ gameId, side, at: Date.now() }, ...list.filter((g) => g.gameId !== gameId)].slice(0, 50);
    localStorage.setItem("sealed-orders:games", JSON.stringify(next));
  } catch {}
}

export function myGames(): { gameId: string; side: number; at: number }[] {
  try {
    return JSON.parse(localStorage.getItem("sealed-orders:games") || "[]");
  } catch {
    return [];
  }
}

export function sideFor(gameId: string): number | null {
  const g = myGames().find((x) => x.gameId === gameId);
  return g ? g.side : null;
}
