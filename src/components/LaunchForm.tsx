"use client";

import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, parseEther, type Address } from "viem";
import { Prospectus } from "./Prospectus";
import { FACTORY, LIVE } from "@/lib/config";
import { factoryAbi } from "@/lib/abi";
import { connect, publicClient, walletMessage } from "@/lib/wallet";
import { fmtNum } from "@/lib/math";

type Mode = "arena" | "challenge" | "answer";
const LOCKS = [0, 7, 30, 90, 180, 365];
const BONDS = [0, 0.05, 0.1, 0.25, 0.5, 1];
const https = (v: string) => (v && /^https:\/\/[^\s"<>]+$/.test(v) ? v : undefined);

export function LaunchForm({ initialMode, answerId }: { initialMode: Mode; answerId?: number }) {
  const [mode, setMode] = useState<Mode>(answerId ? "answer" : initialMode);
  const [f, setF] = useState({ name: "", symbol: "", description: "", image: "", x: "", telegram: "", website: "", rival: "" });
  const [target, setTarget] = useState<{ id: number; rival: string; symbol: string; start: number } | null>(null);
  const [creatorPct, setCreatorPct] = useState(0);
  const [lockDays, setLockDays] = useState(30);
  const [bond, setBond] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);

  // Answering: load the challenge, and suggest the ticker it called out.
  useEffect(() => {
    if (!answerId) return;
    let tries = 0, stop = false;
    // A brand-new challenge can take a few seconds to show up, so keep asking for a bit.
    const get = () =>
      fetch(`/api/battle/${answerId}`)
        .then((r) => r.json())
        .then((j) => {
          if (j.battle) {
            setTarget({ id: answerId, rival: j.battle.rival, symbol: j.battle.coinA.symbol, start: j.battle.start });
            setF((x) => ({ ...x, symbol: x.symbol || j.battle.rival }));
          } else if (!stop && ++tries < 8) setTimeout(get, 2000);
        })
        .catch(() => !stop && ++tries < 8 && setTimeout(get, 2000));
    get();
    return () => {
      stop = true;
    };
  }, [answerId]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const clean = (v: string) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
  const symbol = clean(f.symbol);
  const rival = clean(f.rival);

  const rows = useMemo<[string, string][]>(
    () => [
      ["Fights in", mode === "arena" ? "Today's Arena" : mode === "challenge" ? `Arena + 1v1 vs $${rival || "RIVAL"}` : `Arena + 1v1 vs $${target?.symbol ?? "…"}`],
      ["Total supply", "1,000,000,000 (fixed)"],
      ["Pair", "ETH"],
      ["Creator holds", creatorPct ? `${creatorPct}%${lockDays ? `, locked ${lockDays} days` : ", unlocked"}` : "0%"],
      ["Bond", bond ? `${bond} ETH for 30 days` : "None"],
      ["Trading fee", "1% after a 2-min sniper tax"],
    ],
    [mode, rival, target, creatorPct, lockDays, bond],
  );
  const seals = [
    { label: "Fixed supply", good: true },
    { label: "Liquidity locked forever", good: true },
    ...(bond ? [{ label: `Bonded ${bond} ETH`, good: true }] : []),
    { label: creatorPct === 0 ? "No dev tokens" : lockDays ? `Dev locked ${lockDays}d` : "Dev tokens unlocked", good: creatorPct === 0 || lockDays > 0 },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!FACTORY) return;
    if (!f.name.trim() || !symbol) return setMsg({ text: "Give your project a name and a ticker.", kind: "err" });
    if (mode === "challenge" && !rival) return setMsg({ text: "Name the ticker you're calling out.", kind: "err" });
    if (mode === "answer" && !target) return setMsg({ text: "That challenge couldn't be found.", kind: "err" });
    setBusy(true);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      const meta = JSON.stringify({ description: f.description.trim().slice(0, 500) || undefined, image: https(f.image.trim()), x: https(f.x.trim()), telegram: https(f.telegram.trim()), website: https(f.website.trim()) });
      const p = { name: f.name.trim(), symbol, meta, creatorBps: Math.round(creatorPct * 100), lockDays: creatorPct ? lockDays : 0 };
      const value = bond ? parseEther(String(bond)) : 0n;
      setMsg({ text: "Confirm in your wallet…" });
      const base = { account, chain: wallet.chain, address: FACTORY, abi: factoryAbi, value } as const;
      const hash =
        mode === "arena"
          ? await wallet.writeContract({ ...base, functionName: "launch", args: [p] })
          : mode === "challenge"
            ? await wallet.writeContract({ ...base, functionName: "challenge", args: [p, rival] })
            : await wallet.writeContract({ ...base, functionName: "answer", args: [BigInt(target!.id), p] });
      setMsg({ text: "Launching… waiting for the network." });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("The launch failed.");
      let token: Address | null = null, battle = 0;
      for (const log of rc.logs) {
        try {
          const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
          const a = ev.args as unknown as { token: Address; battle: bigint };
          if (ev.eventName === "Launched") token = a.token;
          if (ev.eventName === "Challenged" || ev.eventName === "Answered") battle = Number(a.battle);
        } catch {}
      }
      setMsg({ text: "You're in. Taking you to the ring…", kind: "ok" });
      location.href = battle ? `/b/${battle}` : `/c/${token}`;
    } catch (e) {
      const m = walletMessage(e);
      setMsg({ text: /AnswerClosed/.test(m) ? "Too late, that fight has started." : /AlreadyAnswered/.test(m) ? "Someone already answered this challenge." : /BondTooSmall/.test(m) ? "Bonds start at 0.01 ETH." : m, kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="listing wrap">
      <div>
        <p className="eyebrow">Launch your project</p>
        <h1 className="display">
          Step into <em>the ring.</em>
        </h1>
        <p className="muted" style={{ fontSize: 16, margin: 0 }}>
          Memecoin, community or real project: launch its token free, you only pay gas. Every launch fights in today's Arena; start a 1v1 if you've got someone in mind.
        </p>
        {!LIVE && <p className="notice warn" style={{ marginTop: 18 }}>Throwdown opens soon. You can set up your project now; launching switches on at launch.</p>}
        <form className="form" onSubmit={submit}>
          <div className="mode" role="tablist">
            <button type="button" className={mode === "arena" ? "on" : ""} onClick={() => setMode("arena")}>
              <b>Arena</b>
              <span>Opens in 5 minutes and fights everyone today.</span>
            </button>
            <button type="button" className={mode === "challenge" ? "on" : ""} onClick={() => setMode("challenge")}>
              <b>Challenge</b>
              <span>Call out a rival. They have 1 hour to answer.</span>
            </button>
            <button type="button" className={mode === "answer" ? "on" : ""} onClick={() => (answerId ? setMode("answer") : (location.href = "/#open"))}>
              <b>Answer</b>
              <span>{target ? `Fight $${target.symbol}` : "Pick an open challenge."}</span>
            </button>
          </div>
          {mode === "challenge" && (
            <label className="field">
              <span>Who are you calling out?</span>
              <input value={f.rival} onChange={set("rival")} maxLength={10} placeholder="DOGS" aria-label="Rival ticker" />
              <small>Anyone can answer as ${rival || "DOGS"} in the next hour. Both open at the same second and fight for 24 hours.</small>
            </label>
          )}
          {mode === "answer" && target && (
            <p className="notice warn">
              You're answering ${target.symbol}'s challenge. Both open at {new Date(target.start * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
            </p>
          )}
          <div className="two">
            <label className="field">
              <span>Project or token name</span>
              <input value={f.name} onChange={set("name")} maxLength={40} placeholder="Cat Army" required />
            </label>
            <label className="field">
              <span>Ticker</span>
              <input value={f.symbol} onChange={set("symbol")} maxLength={10} placeholder="CATS" required aria-label="Ticker" />
            </label>
          </div>
          <label className="field">
            <span>What is it, and why should people fight for it?</span>
            <textarea value={f.description} onChange={set("description")} maxLength={500} placeholder="Your project in a few lines. Rally your side." />
          </label>
          <label className="field">
            <span>Image link</span>
            <input value={f.image} onChange={set("image")} placeholder="https://… (optional)" inputMode="url" />
          </label>
          <div className="three">
            <label className="field">
              <span>X</span>
              <input value={f.x} onChange={set("x")} placeholder="https://x.com/…" inputMode="url" />
            </label>
            <label className="field">
              <span>Telegram</span>
              <input value={f.telegram} onChange={set("telegram")} placeholder="https://t.me/…" inputMode="url" />
            </label>
            <label className="field">
              <span>Website</span>
              <input value={f.website} onChange={set("website")} placeholder="https://…" inputMode="url" />
            </label>
          </div>

          <fieldset className="fieldset">
            <legend>Bond</legend>
            <div className="chips">
              {BONDS.map((x) => (
                <button type="button" key={x} className={bond === x ? "on" : ""} onClick={() => setBond(x)}>
                  {x === 0 ? "No bond" : `${x} ETH`}
                </button>
              ))}
            </div>
            <small className="muted">
              Lock ETH as a promise your wallet won't sell or move this token for 30 days. Keep it and it comes back. Break it and it buys the token back and burns it.{bond ? ` You'll send ${fmtNum(bond, 2)} ETH with the launch.` : ""}
            </small>
          </fieldset>

          <fieldset className="fieldset">
            <legend>Your share and lockup</legend>
            <div className="range">
              <input type="range" min={0} max={10} step={0.5} value={creatorPct} onChange={(e) => setCreatorPct(Number(e.target.value))} aria-label="Creator allocation" />
              <b>{creatorPct}%</b>
            </div>
            {creatorPct > 0 && (
              <div className="chips">
                {LOCKS.map((d) => (
                  <button type="button" key={d} className={lockDays === d ? "on" : ""} onClick={() => setLockDays(d)}>
                    {d === 0 ? "No lock" : d === 365 ? "1 year" : `${d} days`}
                  </button>
                ))}
              </div>
            )}
            <small className="muted">Keep up to 10% for yourself. If you post a bond, moving any of it in the first 30 days breaks the bond.</small>
          </fieldset>

          {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
          <button className={`btn big full ${mode === "arena" ? "bell" : mode === "challenge" ? "red" : "blue"}`} disabled={busy || !LIVE || (mode === "answer" && !target)}>
            {busy ? "Launching…" : mode === "answer" && !target ? "Finding the challenge…" : mode === "arena" ? `Launch $${symbol || "TICKER"} into the Arena` : mode === "challenge" ? `Launch $${symbol || "TICKER"} and call out $${rival || "RIVAL"}` : `Answer with $${symbol || "TICKER"}`}
          </button>
          <small className="muted">This creates your token and its Uniswap v4 pool. It can't be undone. Tokens are risky; only launch what you'd stand behind.</small>
        </form>
      </div>
      <Prospectus
        address={"0x" + (symbol || "throw").padEnd(40, "0").slice(0, 40)}
        name={f.name}
        symbol={symbol}
        image={https(f.image.trim())}
        description={f.description.trim()}
        pair={`${symbol || "TICKER"} / ETH`}
        listsAt={mode === "arena" ? "In 5 minutes" : mode === "challenge" ? "In 1 hour" : target ? new Date(target.start * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–"}
        rows={rows}
        seals={seals}
        kicker="Fight card"
      />
    </main>
  );
}
