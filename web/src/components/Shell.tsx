"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, LayoutGrid, Lock, Menu, ShieldCheck, ShieldAlert, Swords, X } from "lucide-react";
import { getCommander } from "@/lib/client/commander";

const NAV = [
  { href: "/app", label: "War room", icon: LayoutGrid },
  { href: "/app/guide", label: "How to command", icon: BookOpen },
];

export function useEnclave() {
  const [state, setState] = useState<{ ok: boolean | null; ms?: number; error?: string }>({ ok: null });
  useEffect(() => {
    fetch("/api/verify")
      .then((r) => r.json())
      .then((j) => setState({ ok: j.ok, ms: j.ms, error: j.error }))
      .catch((e) => setState({ ok: false, error: String(e) }));
  }, []);
  return state;
}

export function EnclaveChip() {
  const s = useEnclave();
  if (s.ok === null)
    return (
      <span className="chip bg-bg text-muted">
        <ShieldCheck size={12} /> checking enclave…
      </span>
    );
  return s.ok ? (
    <span className="chip bg-[#eef6f1] text-green" title={`Fresh Intel TDX quote verified in ${s.ms} ms`}>
      <ShieldCheck size={12} /> TDX enclave verified
    </span>
  ) : (
    <span className="chip bg-[#fdeeee] text-red" title={s.error}>
      <ShieldAlert size={12} /> enclave check failed
    </span>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState("");
  useEffect(() => setMe(getCommander().publicKey.toBase58()), []);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => {
        const active = n.href === "/app" ? path === "/app" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${active ? "bg-ink text-white" : "text-muted hover:bg-bg hover:text-ink"}`}
          >
            <n.icon size={16} /> {n.label}
          </Link>
        );
      })}
      {path.startsWith("/app/battle") && (
        <span className="flex items-center gap-3 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">
          <Swords size={16} /> Battle in progress
        </span>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden border-r border-line bg-white p-4 lg:flex lg:flex-col lg:gap-6">
        <Link href="/" className="flex items-center gap-2 px-2 pt-1 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white">
            <Lock size={16} />
          </span>
          Sealed Orders
        </Link>
        {nav}
        <div className="mt-auto rounded-xl bg-bg p-3 text-xs text-muted">
          <div className="label mb-1">Your commander key</div>
          <div className="break-all font-mono text-[11px] text-ink">{me || "…"}</div>
          <div className="mt-2">Generated in this browser. Only this key can read your army.</div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-64 bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-ghost mb-4 h-9 w-9 p-0" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={16} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost h-9 w-9 p-0 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={16} />
            </button>
            <span className="hidden text-sm font-semibold text-muted sm:inline">Solana devnet · MagicBlock TEE rollup</span>
          </div>
          <EnclaveChip />
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
