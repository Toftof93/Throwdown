"use client";

import { useCallback, useEffect, useState } from "react";
import type { BattleCard, CoinDetail } from "@/lib/data";
import { TickerBadge } from "./TickerBadge";
import { tugShare } from "./FightCard";
import { useNow, countdown } from "./useBoard";
import { FACTORY, SITE } from "@/lib/config";
import { factoryAbi } from "@/lib/abi";
import { connect, publicClient, walletMessage } from "@/lib/wallet";
import { fmtNum, fmtUsd } from "@/lib/math";

type Data = { battle: BattleCard; a: CoinDetail; b: CoinDetail | null };

export function BattleView({ id }: { id: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  const load = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/battle/${id}`, { cache: "no-store" })).json();
      if (j.error) setErr(j.error);
      else setD(j);
    } catch {
      setErr("Couldn't load this fight.");
    }
  }, [id]);
  useEffect(() => {
    void load();
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, [load]);
  const now = useNow(d?.a.now);

  if (!d)
    return (
      <main className="battlepage wrap">
        <p className="empty">{err ?? "Entering the ring…"}</p>
      </main>
    );

  const f = d.battle;
  const end = f.start + 86400;
  const share = tugShare(d.a.battleNet, d.b?.battleNet ?? 0);
  const usd = d.a.ethUsd;
  const money = (v: number) => (usd != null ? fmtUsd(v * usd) : `${fmtNum(v, 3)} ETH`);
  const winner = f.winner ? (f.winner === d.a.token ? d.a : d.b) : null;
  const tweet = `https://x.com/intent/post?text=${encodeURIComponent(`$${d.a.symbol} vs $${d.b?.symbol ?? f.rival}${f.status === "open" ? ". Who's answering?" : ". Pick a side."}\n\n${SITE}/b/${f.id}`)}`;

  async function settle() {
    setBusy(true);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      setMsg({ text: "Confirm in your wallet…" });
      const hash = await wallet.writeContract({ account, chain: wallet.chain, address: FACTORY!, abi: factoryAbi, functionName: "settleBattle", args: [BigInt(f.id)] });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("The transaction failed.");
      setMsg({ text: "Fight settled. The winner's tokens were bought back and burned.", kind: "ok" });
      void load();
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  const Corner = ({ c, side }: { c: CoinDetail | null; side: "r" | "b" }) =>
    c ? (
      <div className={`corner ${side}`}>
        <TickerBadge symbol={c.symbol} image={c.meta.image} address={c.token} size={84} />
        <h2>${c.symbol}</h2>
        <span className="net">
          {c.battleNet >= 0 ? "+" : "−"}
          {fmtNum(Math.abs(c.battleNet), 3)} ETH in · {money(c.mcap)} cap
        </span>
        {winner?.token === c.token && <span className="winner-tag">WINNER</span>}
        {c.bondState === "active" && <span className="shield">Bonded {fmtNum(c.bond, 2)} ETH</span>}
        <a className={`btn ${side === "r" ? "red" : "blue"}`} href={`/c/${c.token}`}>
          {now >= f.start ? `Back $${c.symbol}` : `View $${c.symbol}`}
        </a>
      </div>
    ) : (
      <div className="corner b">
        <span className="wanted" style={{ width: 84, height: 84, fontSize: 40 }}>
          ?
        </span>
        <h2>${f.rival}</h2>
        <span className="net">Wanted. Answer before the clock runs out.</span>
        {f.status === "open" && (
          <a className="btn blue" href={`/launch?answer=${f.id}`}>
            Answer as ${f.rival}
          </a>
        )}
      </div>
    );

  return (
    <main className="battlepage wrap">
      <section className="ring">
        <div className="corners">
          <Corner c={d.a} side="r" />
          <div className="mid">
            <b>VS</b>
            <span>
              {f.status === "open"
                ? `Answer window: ${countdown(f.start - now)}`
                : f.status === "starting"
                  ? `Bell in ${countdown(f.start - now)}`
                  : f.status === "live"
                    ? `${countdown(end - now)} left`
                    : f.status === "unanswered"
                      ? "Nobody answered"
                      : f.status === "ended"
                        ? "Final bell rang"
                        : "Settled"}
            </span>
          </div>
          <Corner c={d.b} side="b" />
        </div>
        {d.b && (
          <div className="tug" aria-label="Who's winning">
            <i className="r" style={{ width: `${share * 100}%` }} />
            <i className="b" style={{ width: `${(1 - share) * 100}%` }} />
          </div>
        )}
        {d.b && (
          <div className="tug-pct">
            <span>{Math.round(share * 100)}%</span>
            <span>{100 - Math.round(share * 100)}%</span>
          </div>
        )}
        <div className="meta">
          <span>Pot: {fmtNum(f.pot, 4)} ETH (20% of both sides' fees, more once fees are collected)</span>
          <span>Score: net ETH in during the fight</span>
        </div>
      </section>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {f.status === "ended" && (
          <button className="btn bell big full" onClick={settle} disabled={busy}>
            {busy ? "Settling…" : "Settle the fight: pay the winner"}
          </button>
        )}
        {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
        <div className="links">
          <a href={tweet} target="_blank" rel="noreferrer">
            Share this fight on X
          </a>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>The rules</h3>
          </div>
          <ul className="goal-list" style={{ listStyle: "none", padding: "12px 16px", margin: 0, display: "grid", gap: 8, color: "var(--ink-2)", fontSize: 14 }}>
            <li>Both projects open at the same second. The fight lasts 24 hours.</li>
            <li>Score = ETH flowing in: buys minus sells. Buying and selling back scores nothing.</li>
            <li>20% of both sides' ETH fees during the fight go into the pot. The pot buys back the winner's token and burns it.</li>
            <li>Both projects also fight in the daily Arena at the same time.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
