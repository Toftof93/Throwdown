"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, connect, publicClient, walletMessage } from "@/lib/wallet";
import { TickerBadge } from "./TickerBadge";
import { FACTORY } from "@/lib/config";
import { factoryAbi } from "@/lib/abi";
import { fmtNum } from "@/lib/math";

type View = { pending: number; coins: { token: Address; name: string; symbol: string; bond: number; burned: number }[] };

export function Creators() {
  const [account, setAccount] = useAccount();
  const [v, setV] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  const load = () => account && fetch(`/api/creator/${account}`, { cache: "no-store" }).then((r) => r.json()).then(setV).catch(() => {});
  useEffect(() => {
    if (!account) return setV(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  async function withdraw() {
    setBusy(true);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      const hash = await wallet.writeContract({ account, chain: wallet.chain, address: FACTORY!, abi: factoryAbi, functionName: "withdraw", args: [] });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("The withdrawal failed.");
      setMsg({ text: "Sent to your wallet.", kind: "ok" });
      void load();
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="how wrap">
      <p className="eyebrow">Creators</p>
      <h1 className="display">
        Your corner, <em>your cut.</em>
      </h1>
      <p className="lead">Every trade on your coin pays a fee. 10% feeds the Arena pool, 20% feeds your battle pot while you're fighting, and you get 80% of the rest. Collect it from any of your coins, then withdraw.</p>
      {!account ? (
        <button
          className="btn bell big"
          style={{ marginTop: 18 }}
          onClick={async () => {
            try {
              setAccount((await connect()).account);
            } catch (e) {
              setMsg({ text: walletMessage(e), kind: "err" });
            }
          }}
        >
          Connect wallet
        </button>
      ) : !v ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="belt" style={{ marginTop: 22 }}>
            <div>
              <span className="eyebrow">Ready to withdraw</span>
              <div className="pool">{fmtNum(v.pending, 5)} ETH</div>
              <p>Fees you've collected, plus any bond you got back.</p>
            </div>
            <button className="btn bell big" onClick={withdraw} disabled={busy || v.pending <= 0}>
              {busy ? "Sending…" : "Withdraw"}
            </button>
          </div>
          {v.coins.length ? (
            <div className="panel">
              <ul className="rows">
                {v.coins.map((t) => (
                  <li key={t.token}>
                    <a href={`/c/${t.token}`}>
                      <TickerBadge symbol={t.symbol} address={t.token} size={38} />
                      <span className="nm">
                        <b>${t.symbol}</b>
                        <span>{t.name}</span>
                      </span>
                      <span className="val">
                        Collect fees →<small>{t.bond ? `${fmtNum(t.bond, 3)} ETH bond` : t.burned ? `${fmtNum(t.burned)} burned` : "No bond"}</small>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="notice">
              This wallet hasn't launched a coin yet.{" "}
              <a className="link" href="/launch">
                Step into the ring →
              </a>
            </p>
          )}
        </>
      )}
      {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
    </main>
  );
}
