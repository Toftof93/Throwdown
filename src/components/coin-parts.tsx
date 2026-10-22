"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits, zeroAddress, type Address } from "viem";
import type { CoinDetail } from "@/lib/data";
import { FACTORY, ROUTER } from "@/lib/config";
import { erc20Abi, factoryAbi, routerAbi } from "@/lib/abi";
import { connect, publicClient, useAccount, walletMessage } from "@/lib/wallet";
import { fmtNum } from "@/lib/math";

type Key = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
export const date = (t: number) => new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function useKey(token: Address) {
  const [key, setKey] = useState<Key | null>(null);
  useEffect(() => {
    if (!FACTORY) return;
    publicClient
      .readContract({ address: FACTORY, abi: factoryAbi, functionName: "poolKey", args: [token] })
      .then((k) => setKey(k as Key))
      .catch(() => {});
  }, [token]);
  return key;
}

export function Trade({ d, open, fee, onDone }: { d: CoinDetail; open: boolean; fee: number; onDone: () => void }) {
  const key = useKey(d.token);
  const [account] = useAccount();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(5);
  const [out, setOut] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  const [bal, setBal] = useState<{ q: bigint; t: bigint } | null>(null);

  const qAddr = zeroAddress;
  const native = qAddr === zeroAddress;
  const inDec = side === "buy" ? 18 : 18;
  const inSym = side === "buy" ? "ETH" : d.symbol;
  const outSym = side === "buy" ? d.symbol : "ETH";
  const outDec = side === "buy" ? 18 : 18;
  // The quote is currency0 unless the token sorts first.
  const zeroForOne = side === "buy" ? !false : false;
  const amountIn = useMemo(() => {
    try {
      return amount && Number(amount) > 0 ? parseUnits(amount, inDec) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, inDec]);

  const refreshBal = useCallback(async () => {
    if (!account) return setBal(null);
    const [q, t] = await Promise.all([
      native ? publicClient.getBalance({ address: account }) : (publicClient.readContract({ address: qAddr, abi: erc20Abi, functionName: "balanceOf", args: [account] }) as Promise<bigint>),
      publicClient.readContract({ address: d.token, abi: erc20Abi, functionName: "balanceOf", args: [account] }) as Promise<bigint>,
    ]).catch(() => [0n, 0n]);
    setBal({ q, t });
  }, [account, native, qAddr, d.token]);
  useEffect(() => {
    void refreshBal();
  }, [refreshBal]);

  // Live quote from the router, debounced.
  const seq = useRef(0);
  useEffect(() => {
    setOut(null);
    if (!key || !ROUTER || !open || amountIn === 0n) return;
    const n = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const r = await publicClient.simulateContract({ address: ROUTER!, abi: routerAbi, functionName: "quote", args: [key, zeroForOne, amountIn] });
        if (n === seq.current) setOut((r.result as [bigint, bigint])[0]);
      } catch {
        if (n === seq.current) setOut(null);
      } finally {
        if (n === seq.current) setQuoting(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [key, amountIn, zeroForOne, open]);

  async function go() {
    if (!key || !ROUTER || amountIn === 0n) return;
    setBusy(true);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      const fresh = await publicClient.simulateContract({ address: ROUTER, abi: routerAbi, functionName: "quote", args: [key, zeroForOne, amountIn] });
      const expected = (fresh.result as [bigint, bigint])[0];
      const minOut = (expected * BigInt(Math.round((100 - slip) * 100))) / 10000n;
      const input = side === "buy" ? qAddr : d.token;
      if (input !== zeroAddress) {
        const allowance = (await publicClient.readContract({ address: input, abi: erc20Abi, functionName: "allowance", args: [account, ROUTER] })) as bigint;
        if (allowance < amountIn) {
          setMsg({ text: `Approve ${inSym} in your wallet…` });
          const h = await wallet.writeContract({ account, chain: wallet.chain, address: input, abi: erc20Abi, functionName: "approve", args: [ROUTER, amountIn] });
          await publicClient.waitForTransactionReceipt({ hash: h });
        }
      }
      setMsg({ text: "Confirm the trade in your wallet…" });
      // Ten minutes by the chain's clock, not the device's.
      const deadline = (await publicClient.getBlock()).timestamp + 600n;
      const hash = await wallet.writeContract({
        account,
        chain: wallet.chain,
        address: ROUTER,
        abi: routerAbi,
        functionName: "swap",
        args: [key, zeroForOne, amountIn, minOut, account, deadline],
        value: input === zeroAddress ? amountIn : 0n,
      });
      setMsg({ text: "Trading… waiting for the network." });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("The trade failed.");
      setMsg({ text: `Done. You ${side === "buy" ? "bought" : "sold"} $${d.symbol}.`, kind: "ok" });
      setAmount("");
      void refreshBal();
      onDone();
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  const have = bal ? (side === "buy" ? bal.q : bal.t) : null;
  const short = have != null && amountIn > have;

  return (
    <div className="panel trade">
      <div className="side" role="tablist">
        <button className={`b ${side === "buy" ? "on" : ""}`} onClick={() => setSide("buy")}>
          Buy
        </button>
        <button className={`s ${side === "sell" ? "on" : ""}`} onClick={() => setSide("sell")}>
          Sell
        </button>
      </div>
      <div className="amount">
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" inputMode="decimal" aria-label={`Amount of ${inSym}`} />
        <span>{inSym}</span>
        {have != null && have > 0n && (
          <button className="link" style={{ fontSize: 12 }} onClick={() => setAmount(formatUnits(side === "buy" && native ? (have * 98n) / 100n : have, inDec))}>
            Max
          </button>
        )}
      </div>
      <div className="quote-line">
        <span>You get about</span>
        <b>{quoting ? "…" : out != null ? `${fmtNum(Number(formatUnits(out, outDec)), 4)} ${outSym}` : "–"}</b>
      </div>
      <div className="quote-line">
        <span>Balance</span>
        <b>{have != null ? `${fmtNum(Number(formatUnits(have, inDec)), 4)} ${inSym}` : "Connect to see"}</b>
      </div>
      <div className="quote-line">
        <span>Fee now</span>
        <b>{fee.toFixed(fee < 2 ? 0 : 1)}%</b>
      </div>
      <div className="quote-line" style={{ alignItems: "center" }}>
        <span>Max slippage</span>
        <div className="chips">
          {[1, 3, 5, 10].map((s) => (
            <button key={s} className={slip === s ? "on" : ""} onClick={() => setSlip(s)} style={{ padding: "4px 9px" }}>
              {s}%
            </button>
          ))}
        </div>
      </div>
      {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
      <button className={`btn big full ${side}`} onClick={go} disabled={!open || busy || amountIn === 0n || short || !key}>
        {!open ? "Opens at showtime" : busy ? "Working…" : short ? `Not enough ${inSym}` : `${side === "buy" ? "Buy" : "Sell"} $${d.symbol}`}
      </button>
      {!account && <small className="muted">You'll connect your wallet when you trade.</small>}
    </div>
  );
}


/** The creator's controls: collect fees, release or extend locked coins. */
export function CreatorTools({ d, now, onDone }: { d: CoinDetail; now: number; onDone: () => void }) {
  const [account] = useAccount();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const isCreator = !!account && account.toLowerCase() === d.creator.toLowerCase();
  useEffect(() => {
    if (!isCreator || !FACTORY) return;
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "pending", args: [account] }).then((v) => setPending(Number(v) / 1e18)).catch(() => {});
  }, [isCreator, account, busy]);
  if (!isCreator || !FACTORY) return null;

  async function run(label: string, functionName: string, args: unknown[]) {
    setBusy(label);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      setMsg({ text: "Confirm in your wallet…" });
      const hash = await wallet.writeContract({ account, chain: wallet.chain, address: FACTORY!, abi: factoryAbi, functionName, args });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("The transaction failed.");
      setMsg({ text: `${label}: done.`, kind: "ok" });
      onDone();
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel creator-tools">
      <div className="panel-head" style={{ margin: "-16px -16px 0", borderRadius: "16px 16px 0 0" }}>
        <h3>Your corner</h3>
        <span className="eyebrow">Creator</span>
      </div>
      <div className="quote-line">
        <span>Waiting for you</span>
        <b>{pending == null ? "…" : `${fmtNum(pending, 5)} ETH`}</b>
      </div>
      <button className="btn bell full" disabled={!!busy} onClick={() => run("Collect fees", "collect", [d.token])}>
        {busy === "Collect fees" ? "Collecting…" : "Collect fees and withdraw"}
      </button>
      <small className="muted">Your 80% of trading fees, after 10% to the Arena pool{d.battle ? " and 20% to the battle pot while your fight runs" : ""}.</small>
      {d.locked > 0 && (
        <>
          <div className="quote-line">
            <span>Locked coins</span>
            <b>{fmtNum(d.locked)}</b>
          </div>
          <div className="quote-line">
            <span>Unlocks</span>
            <b>{date(d.unlockAt)}</b>
          </div>
          {now >= d.unlockAt ? (
            <button className="btn full" disabled={!!busy} onClick={() => run("Unlock", "unlock", [d.token])}>
              Release my coins
            </button>
          ) : (
            <div className="chips">
              {[30, 90, 365].map((x) => (
                <button key={x} disabled={!!busy} onClick={() => run("Extend lock", "extendLock", [d.token, BigInt(Math.max(d.unlockAt, now) + x * 86400)])}>
                  Lock {x === 365 ? "1 year" : `${x} days`} longer
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
    </div>
  );
}
