import { NextResponse } from "next/server";
import { compileOrder } from "@/lib/server/compiler";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { text, army, intel, tick } = await req.json();
    if (typeof text !== "string" || !text.trim() || text.length > 300) {
      return NextResponse.json({ error: "Order must be 1-300 characters" }, { status: 400 });
    }
    return NextResponse.json(await compileOrder(text.trim(), army, intel, tick ?? 0));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
