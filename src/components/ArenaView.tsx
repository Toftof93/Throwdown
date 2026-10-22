"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useBoard, useNow, countdown } from "./useBoard";
import { Ladder } from "./Ladder";
import { FACTORY } from "@/lib/config";
import { factoryAbi } from "@/lib/abi";
import { connect, publicClient, walletMessage } from "@/lib/wallet";
import { fmtNum, fmtUsd } from "@/lib/math";
import type { BoardData } from "@/lib/data";

const day = (r: number) => new Date(r * 86400 * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export function ArenaView() {
  const raw = useBoard() as (BoardData & { live: true }) | { live: false } | null;
  const b = raw && raw.live ? raw : null;
  const now = useNow(b?.now);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);

  async function tx(label: string, functionName: string, args: unknown[]) {
    const { wallet, account } = await connect();
    setMsg({ text: `${label}: confirm in your wallet…` });
    const hash = await wallet.writeContract({ account, chain: wallet.chain, address: FACTORY!, abi: factoryAbi, functionName, args });
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error(`${label} failed.`);
  }

  async function coinsOf(r: number): Promise<Address[]> {
    return (await (await fetch(`/api/round/${r}`)).json()).coins ?? [];
  }

  async function feed(r: number) {
    setBusy(`feed${r}`);
    setMsg(null);
    try {
      const coins = await coinsOf(r);
      if (!coins.length) throw new Error("No coins in this round yet.");
      await tx("Collect fees", "claimMany", [coins]);
      setMsg({ text: "Fees collected. 10% went into the prize pool.", kind: "ok" });
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(null);
    }
  }

  async function ring(r: number) {
    setBusy(`ring${r}`);
    setMsg(null);
    try {
      const coins = await coinsOf(r);
      // Sweep the round's fees into its pool first, then settle.
      if (coins.length) await tx("Collect fees", "claimMany", [coins]);
      await tx("Final bell", "settleRound", [BigInt(r)]);
      setMsg({ text: "Round settled. The top three were bought back and burned.", kind: "ok" });
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="home wrap">
      <p className="eyebrow">The Arena</p>
      <h1 className="display" style={{ fontSize: "clamp(48px, 8vw, 96px)", margin: "8px 0 18px" }}>
        Today&apos;s card
      </h1>
      <div className="belt">
        <div>
          <span className="eyebrow">Prize pool · {b ? day(b.round) : "…"}</span>
          <div className="pool">
            {b ? fmtNum(b.pool, 4) : "–"} ETH{b?.ethUsd != null && <small>{fmtUsd(b.pool * b.ethUsd)}</small>}
          </div>
          <p>Grows each time fees are collected. Anyone can push them in.</p>
        </div>
        <div className="clock">
          <b>{b ? countdown(b.roundEnd - now) : "--:--"}</b>
          <span>until the final bell</span>
        </div>
      </div>
      {b && (
        <div className="cta-row" style={{ marginBottom: 14 }}>
          <button className="btn" onClick={() => feed(b.round)} disabled={!!busy}>
            {busy === `feed${b.round}` ? "Collecting…" : "Collect fees into the pool"}
          </button>
          <a className="btn bell" href="/launch">
            Enter a coin
          </a>
        </div>
      )}
      {msg && (
        <p className={`notice ${msg.kind ?? ""}`} style={{ marginBottom: 14 }}>
          {msg.text}
        </p>
      )}
      <div className="panel">
        <div className="panel-head">
          <h3>Standings</h3>
          <span className="eyebrow">Net ETH in · top 3 win</span>
        </div>
        {b ? <Ladder coins={b.arena} usd={b.ethUsd} /> : <p className="empty">Loading…</p>}
      </div>

      {b && b.toSettle.length > 0 && (
        <section className="sec">
          <div className="sec-row">
            <h2>Waiting for the final bell</h2>
          </div>
          <div className="hall">
            {b.toSettle.map((t) => (
              <div className="card" key={t.round}>
                <h4>{day(t.round)} · {t.coins} coins</h4>
                <p className="muted" style={{ fontSize: 13.5, margin: "0 0 10px" }}>
                  This round is over. Anyone can ring the final bell to pay the winners.
                </p>
                <button className="btn bell full" onClick={() => ring(t.round)} disabled={!!busy}>
                  {busy === `ring${t.round}` ? "Ringing…" : "Ring the final bell"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {b && b.hall.length > 0 && (
        <section className="sec">
          <div className="sec-row">
            <h2>Past champions</h2>
          </div>
          <div className="hall">
            {b.hall.map((h) => (
              <div className="card" key={h.round}>
                <h4>{day(h.round)}</h4>
                {h.winners.map((w, i) => (
                  <a key={w.token} href={`/c/${w.token}`}>
                    <span>
                      <span className="medal">{i + 1}</span>${w.symbol}
                    </span>
                    <b>
                      {fmtNum(w.prize, 4)} ETH · {fmtNum(w.burned)} burned
                    </b>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
