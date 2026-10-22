"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import type { CoinDetail } from "@/lib/data";
import { TickerBadge } from "./TickerBadge";
import { Prospectus } from "./Prospectus";
import { Chart } from "./Chart";
import { FightCard } from "./FightCard";
import { Trade, CreatorTools, date } from "./coin-parts";
import { useNow, countdown } from "./useBoard";
import { EXPLORER, FACTORY, SITE } from "@/lib/config";
import { factoryAbi } from "@/lib/abi";
import { connect, publicClient, walletMessage } from "@/lib/wallet";
import { fmtNum, fmtPct, fmtUsd, shortAddr } from "@/lib/math";

const START_FEE = 50, BASE_FEE = 1, DECAY = 120;
const ago = (now: number, t: number) => {
  const s = Math.max(0, now - t);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

export function CoinView({ address }: { address: Address }) {
  const [d, setD] = useState<CoinDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/coin/${address}`, { cache: "no-store" })).json();
      if (j.error) setErr(j.error);
      else setD(j);
    } catch {
      setErr("Couldn't load this coin. Refresh to try again.");
    }
  }, [address]);
  useEffect(() => {
    void load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [load]);
  const now = useNow(d?.now);

  if (!d)
    return (
      <main className="coinpage wrap">
        <p className="empty">{err ?? "Loading the fight card…"}</p>
      </main>
    );

  const open = now >= d.openAt;
  const elapsed = now - d.openAt;
  const fee = !open ? START_FEE : elapsed >= DECAY ? BASE_FEE : START_FEE - ((START_FEE - BASE_FEE) * elapsed) / DECAY;
  const usd = d.ethUsd;
  const money = (v: number) => (usd != null ? fmtUsd(v * usd) : `${fmtNum(v, 3)} ETH`);
  const change = open && d.startPrice ? (d.price / d.startPrice - 1) * 100 : null;
  const dayVol = d.swaps.filter((s) => s.time >= now - 86400).reduce((a, s) => a + s.eth, 0);
  const lockLeft = d.locked > 0 ? d.unlockAt - now : 0;

  const rows: [string, string][] = [
    ["Arena round", `${new Date(d.round * 86400 * 1000).toLocaleDateString([], { month: "short", day: "numeric" })}${d.roundSettled ? " (settled)" : ""}`],
    ["Total supply", `${fmtNum(d.supply, 3)} (fixed)`],
    ["Burned", d.burned ? fmtNum(d.burned) : "0"],
    ["Liquidity", "Locked forever"],
    ["Creator coins", d.creatorAmount ? `${fmtNum(d.creatorAmount)} (${((d.creatorAmount / 1e9) * 100).toFixed(1)}%)` : "None"],
    ["Creator lockup", d.locked ? (lockLeft > 0 ? `${Math.ceil(lockLeft / 86400)} days left` : "Ended") : d.creatorAmount ? "Not locked" : "–"],
    ["Bond", d.bond ? `${fmtNum(d.bond, 3)} ETH (${d.bondState})` : "None"],
    ["Fee split", `10% Arena${d.battle ? " · 20% pot in battle" : ""} · rest ${100 - d.protocolBps / 100}/${d.protocolBps / 100} creator/platform`],
    ["Creator", shortAddr(d.creator)],
  ];
  const seals = [
    { label: "Fixed supply", good: true },
    { label: "Liquidity locked forever", good: true },
    ...(d.bond ? [{ label: d.bondState === "active" ? `Bonded ${fmtNum(d.bond, 2)} ETH` : d.bondState === "kept" ? "Bond kept" : "Bond broken", good: d.bondState === "active" || d.bondState === "kept" }] : []),
    { label: !d.creatorAmount ? "No dev coins" : d.locked && lockLeft > 0 ? `Dev locked ${Math.ceil(lockLeft / 86400)}d` : "Dev coins unlocked", good: !d.creatorAmount || (d.locked > 0 && lockLeft > 0) },
  ];
  const share = `https://x.com/intent/post?text=${encodeURIComponent(`$${d.symbol} is in the Throwdown Arena${d.rank ? `, ranked #${d.rank}` : ""}. Pick a side.\n\n${SITE}/c/${d.token}`)}`;

  return (
    <main className="coinpage wrap">
      <div className="coinbar" style={{ marginBottom: 16 }}>
        <TickerBadge symbol={d.symbol} image={d.meta.image} address={d.token} size={60} />
        <div>
          <h1 className="display">{d.name}</h1>
          <span className="sym">
            ${d.symbol} / ETH · {open ? <span className="status live">Fighting</span> : <span className="status wait">Opens in {countdown(d.openAt - now)}</span>}{" "}
            {d.bondState === "active" && <span className="shield">Bonded</span>}
            {d.bondState === "broken" && <span className="shield bad">Bond broken</span>}
          </span>
        </div>
        <div className="px">
          <b>{usd != null ? "$" + fmtNum(d.price * usd) : `${fmtNum(d.price)} ETH`}</b>
          <span className={(change ?? 0) >= 0 ? "up" : "down"}>{change == null ? "Not trading yet" : `${fmtPct(change)} since launch`}</span>
        </div>
      </div>

      <div className="cgrid">
        <div>
          <div className="panel">
            <div className="statrow">
              <div>
                <span>Arena rank</span>
                <b>{d.rank ? `#${d.rank}` : "–"}</b>
              </div>
              <div>
                <span>Net ETH in</span>
                <b>{fmtNum(d.arenaNet, 3)}</b>
              </div>
              <div>
                <span>Market cap</span>
                <b>{money(d.mcap)}</b>
              </div>
              <div>
                <span>Volume 24h</span>
                <b>{fmtNum(dayVol, 3)} ETH</b>
              </div>
            </div>
          </div>

          {open && elapsed < DECAY && (
            <div className="tax" role="status">
              <span className="eyebrow" style={{ color: "var(--bell)" }}>
                Sniper tax live
              </span>
              <div className="bar">
                <i style={{ width: `${(fee / START_FEE) * 100}%` }} />
              </div>
              <p>
                The fee is {fee.toFixed(1)}% right now and reaches 1% in {DECAY - elapsed}s.
              </p>
            </div>
          )}

          {d.battleInfo && <FightCard f={d.battleInfo} now={now} />}

          {open ? (
            <div className="panel">
              <Chart points={d.swaps.filter((s) => s.time > 0).map((s) => ({ time: s.time, price: s.price }))} start={d.startPrice} openAt={d.openAt} now={now} />
            </div>
          ) : (
            <div className="panel waiting">
              <p className="eyebrow">The bell rings in</p>
              <div className="digits" style={{ color: "var(--bell)", fontFamily: "var(--mono)", fontSize: 56 }}>
                {countdown(d.openAt - now)}
              </div>
              <p className="muted">Trading opens {date(d.openAt)}. The sniper tax starts at 50% and falls to 1% over two minutes.</p>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h3>Ringside</h3>
              <span className="eyebrow">{d.swaps.length} trades</span>
            </div>
            {d.swaps.length ? (
              <ul className="feed">
                {[...d.swaps].reverse().slice(0, 25).map((s) => (
                  <li key={s.tx + s.tokens}>
                    <span className="dot" style={{ background: s.side === "sell" ? "var(--down)" : s.side === "buyback" ? "var(--bell)" : "var(--up)" }} />
                    <a className="who" href={`${EXPLORER}/tx/${s.tx}`} target="_blank" rel="noreferrer">
                      {s.side === "buyback" ? "Prize buyback burned" : `${shortAddr(s.trader)} ${s.side === "buy" ? "bought" : "sold"}`} {fmtNum(s.tokens)}
                    </a>
                    <em>
                      {fmtNum(s.eth, 4)} ETH · {s.time ? ago(now, s.time) : "now"}
                    </em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">{open ? "No trades yet. Throw the first punch." : "Trades show up here after the bell."}</p>
            )}
          </div>
        </div>

        <div>
          <Trade d={d} open={open} fee={fee} onDone={load} />
          {d.bond > 0 && <BondBox d={d} now={now} onDone={load} />}
          <CreatorTools d={d} now={now} onDone={load} />
          <div className="panel fans">
            <div className="panel-head">
              <h3>Top holders</h3>
              <span className="eyebrow">${d.symbol}</span>
            </div>
            {d.fans.length ? (
              <ol className="ladder">
                {d.fans.map((f, i) => (
                  <li key={f.address}>
                    <a href={`${EXPLORER}/address/${f.address}`} target="_blank" rel="noreferrer" style={{ gridTemplateColumns: "44px 1fr auto" }}>
                      <span className="rk">{i + 1}</span>
                      <span className="mono">{shortAddr(f.address)}</span>
                      <span className="val">{f.pct.toFixed(2)}%</span>
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">No holders yet.</p>
            )}
          </div>
          <Prospectus address={d.token} name={d.name} symbol={d.symbol} image={d.meta.image} description={d.meta.description} pair={`${d.symbol} / ETH`} listsAt={date(d.openAt)} rows={rows} seals={seals} kicker="Fight card" />
          <div className="links">
            {d.meta.website && (
              <a href={d.meta.website} target="_blank" rel="noreferrer nofollow">
                Website
              </a>
            )}
            {d.meta.x && (
              <a href={d.meta.x} target="_blank" rel="noreferrer nofollow">
                X
              </a>
            )}
            {d.meta.telegram && (
              <a href={d.meta.telegram} target="_blank" rel="noreferrer nofollow">
                Telegram
              </a>
            )}
            <a href={`${EXPLORER}/token/${d.token}`} target="_blank" rel="noreferrer">
              Contract {shortAddr(d.token)}
            </a>
            <a href={share} target="_blank" rel="noreferrer">
              Share on X
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

function BondBox({ d, now, onDone }: { d: CoinDetail; now: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  const canSettle = (d.bondState === "broken" && now >= d.openAt) || (d.bondState === "active" && now >= d.bondEnd);
  async function settle() {
    setBusy(true);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      const hash = await wallet.writeContract({ account, chain: wallet.chain, address: FACTORY!, abi: factoryAbi, functionName: "settleBond", args: [d.token] });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("The transaction failed.");
      setMsg({ text: "Bond settled.", kind: "ok" });
      onDone();
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel bondbox">
      <span className={`shield ${d.bondState === "broken" || d.bondState === "burned" ? "bad" : ""}`}>
        {d.bondState === "active" ? "Bond active" : d.bondState === "kept" ? "Bond kept" : d.bondState === "broken" ? "Bond broken" : "Bond burned"}
      </span>
      <h3>{fmtNum(d.bond, 3)} ETH bond</h3>
      <p>
        {d.bondState === "active"
          ? `The creator promised their wallet won't sell or move $${d.symbol} until ${date(d.bondEnd)}. If they do, this ETH buys $${d.symbol} back and burns it.`
          : d.bondState === "kept"
            ? "The creator kept their promise and got the bond back."
            : d.bondState === "broken"
              ? `The creator's wallet moved $${d.symbol}. Anyone can now spend the bond buying it back and burning it.`
              : `The creator broke the promise, and the bond bought back and burned $${d.symbol}.`}
      </p>
      {canSettle && (
        <button className="btn bell full" onClick={settle} disabled={busy}>
          {busy ? "Settling…" : d.bondState === "broken" ? "Burn with the bond" : "Return the bond"}
        </button>
      )}
      {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
    </div>
  );
}
