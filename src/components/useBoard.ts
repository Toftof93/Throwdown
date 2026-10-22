"use client";

import { useEffect, useState } from "react";
import type { BoardData } from "@/lib/data";

export type BoardState = (BoardData & { live: true }) | { live: false } | null;

// One shared poll of the board for every component on the page.
let shared: { data: BoardState; subs: Set<(d: BoardState) => void>; timer?: ReturnType<typeof setInterval> } = { data: null, subs: new Set() };

async function pull() {
  try {
    const r = await fetch("/api/board", { cache: "no-store" });
    const j = await r.json();
    if (j.error) return;
    shared.data = j;
    shared.subs.forEach((f) => f(j));
  } catch {}
}

export function useBoard(): BoardState {
  const [d, setD] = useState<BoardState>(shared.data);
  useEffect(() => {
    shared.subs.add(setD);
    if (!shared.timer) {
      void pull();
      shared.timer = setInterval(pull, 12_000);
    }
    return () => {
      shared.subs.delete(setD);
      if (!shared.subs.size && shared.timer) {
        clearInterval(shared.timer);
        shared.timer = undefined;
      }
    };
  }, []);
  return d;
}

/** Seconds ticking on the client, for countdowns. */
export function useNow(serverNow?: number): number {
  const [offset, setOffset] = useState(0);
  const [t, setT] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (serverNow) setOffset(serverNow - Math.floor(Date.now() / 1000));
  }, [serverNow]);
  useEffect(() => {
    const i = setInterval(() => setT(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);
  return t + offset;
}

export function countdown(s: number): string {
  if (s <= 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}
