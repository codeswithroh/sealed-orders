import { NextResponse } from "next/server";
import { verifyTeeRpcIntegrity } from "@magicblock-labs/ephemeral-rollups-sdk";
import { TEE_URL } from "@/lib/chain";

export const runtime = "nodejs";

/** Ask the rollup for a fresh Intel TDX quote over a random challenge and verify it. */
export async function GET() {
  const started = Date.now();
  try {
    await verifyTeeRpcIntegrity(TEE_URL);
    return NextResponse.json({ ok: true, ms: Date.now() - started, rpc: TEE_URL, checkedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, rpc: TEE_URL });
  }
}
