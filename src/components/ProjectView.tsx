"use client";

import { useCallback, useEffect, useState } from "react";
import { parseEther } from "viem";
import type { ProjectDetail } from "@/lib/showcase";
import { TickerBadge } from "./TickerBadge";
import { useNow, countdown } from "./useBoard";
import { EXPLORER, SHOWCASE, SITE } from "@/lib/config";
import { showcaseAbi } from "@/lib/abi";
import { connect, publicClient, useAccount, walletMessage } from "@/lib/wallet";
import { fmtNum, fmtUsd, shortAddr } from "@/lib/math";

const CHIPS = ["0.001", "0.005", "0.01", "0.05"];
const ago = (now: number, t: number) => {
  const s = Math.max(0, now - t);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

export function ProjectView({ id }: { id: number }) {
  const [d, setD] = useState<ProjectDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/project/${id}`, { cache: "no-store" })).json();
      if (j.error) setErr(j.error);
      else setD(j);
    } catch {
      setErr("Couldn't load this project. Refresh to try again.");
    }
  }, [id]);
  useEffect(() => {
    void load();
    const i = setInterval(load, 6000);
    return () => clearInterval(i);
  }, [load]);
  const now = useNow(d?.now);
  const [account] = useAccount();

  if (!d)
    return (
      <main className="coinpage wrap">
        <p className="empty">{err ?? "Loading the project…"}</p>
      </main>
    );

  const usd = d.ethUsd;
  const isBuilder = !!account && account.toLowerCase() === d.builder.toLowerCase();
  const share = `https://x.com/intent/post?text=${encodeURIComponent(`${d.name} is on the Throwdown Showcase${d.rank ? `, #${d.rank} today` : ""}. Back the build.\n\n${SITE}/p/${d.id}`)}`;

  return (
    <main className="coinpage wrap">
      <div className="coinbar" style={{ marginBottom: 16 }}>
        <TickerBadge symbol={d.name.replace(/[^A-Za-z0-9]/g, "") || "?"} image={d.meta.image} address={`showcase-${d.id}`} size={60} />
        <div style={{ minWidth: 0 }}>
          <h1 className="display">{d.name}</h1>
          <span className="sym">
            Showcase #{d.id} · No token · {d.hidden ? <span className="shield bad">Hidden</span> : <span className="status live">Backing open</span>}
          </span>
        </div>
        <div className="px">
          <b>{fmtNum(d.raised, 4)} ETH</b>
          <span className="muted">backed in total{usd != null ? ` · ${fmtUsd(d.raised * usd)}` : ""}</span>
        </div>
      </div>

      <div className="cgrid">
        <div>
          <div className="panel">
            <div className="statrow">
              <div>
                <span>Rank today</span>
                <b>{d.rank ? `#${d.rank}` : "–"}</b>
              </div>
              <div>
                <span>Backed today</span>
                <b>{fmtNum(d.today, 4)}</b>
              </div>
              <div>
                <span>Backers</span>
                <b>{d.backers}</b>
              </div>
              <div>
                <span>Reset in</span>
                <b>{countdown(d.dayEnd - now)}</b>
              </div>
            </div>
          </div>

          <div className="panel bondbox">
            <h3>About</h3>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{d.meta.description || "The builder hasn't written anything yet."}</p>
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
              <a href={`${EXPLORER}/address/${d.builder}`} target="_blank" rel="noreferrer">
                Builder {shortAddr(d.builder)}
              </a>
              <a href={share} target="_blank" rel="noreferrer">
                Share on X
              </a>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Backers' wall</h3>
              <span className="eyebrow">{d.backings.length} backings</span>
            </div>
            {d.backings.length ? (
              <ul className="feed">
                {d.backings.slice(0, 30).map((b) => (
                  <li key={b.tx + b.amount}>
                    <span className="dot" style={{ background: "var(--up)" }} />
                    <a className="who" href={`${EXPLORER}/tx/${b.tx}`} target="_blank" rel="noreferrer">
                      {shortAddr(b.backer)}
                      {b.note ? ` · "${b.note}"` : " backed it"}
                    </a>
                    <em>
                      {fmtNum(b.amount, 4)} ETH · {b.time ? ago(now, b.time) : "now"}
                    </em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">No backers yet. Be the first name on the wall.</p>
            )}
          </div>
        </div>

        <div>
          <BackBox d={d} onDone={load} />
          {isBuilder && <BuilderBox d={d} onDone={load} />}
          <div className="panel fans">
            <div className="panel-head">
              <h3>Top backers</h3>
            </div>
            {d.topBackers.length ? (
              <ol className="ladder">
                {d.topBackers.map((f, i) => (
                  <li key={f.backer}>
                    <a href={`${EXPLORER}/address/${f.backer}`} target="_blank" rel="noreferrer" style={{ gridTemplateColumns: "44px 1fr auto" }}>
                      <span className="rk">{i + 1}</span>
                      <span className="mono">{shortAddr(f.backer)}</span>
                      <span className="val">{fmtNum(f.amount, 4)} ETH</span>
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">Nobody yet.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function BackBox({ d, onDone }: { d: ProjectDetail; onDone: () => void }) {
  const [amount, setAmount] = useState("0.001");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  const n = Number(amount);
  const ok = Number.isFinite(n) && n >= 0.0001;

  async function back() {
    setBusy(true);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      setMsg({ text: "Confirm in your wallet…" });
      const hash = await wallet.writeContract({ account, chain: wallet.chain, address: SHOWCASE!, abi: showcaseAbi, functionName: "back", args: [BigInt(d.id), note.trim().slice(0, 140)], value: parseEther(amount) });
      setMsg({ text: "Sending… waiting for the network." });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Backing failed.");
      setMsg({ text: `Done. You backed ${d.name}.`, kind: "ok" });
      setNote("");
      onDone();
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel trade">
      <span className="eyebrow">Back this project</span>
      <div className="amount">
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} inputMode="decimal" aria-label="Amount in ETH" />
        <span>ETH</span>
      </div>
      <div className="chips">
        {CHIPS.map((c) => (
          <button type="button" key={c} className={amount === c ? "on" : ""} onClick={() => setAmount(c)}>
            {c}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Leave a note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Keep building" />
      </label>
      <div className="quote-line">
        <span>Builder gets</span>
        <b>{ok ? fmtNum(n * (1 - d.feeBps / 10_000), 5) : "–"} ETH</b>
      </div>
      <button className="btn buy big full" onClick={back} disabled={busy || !ok || d.hidden || !SHOWCASE}>
        {busy ? "Sending…" : d.hidden ? "Backing closed" : `Back with ${ok ? amount : "…"} ETH`}
      </button>
      <small className="muted">Backing is a gift to the builder. You don't get tokens, shares or a refund. Platform fee {d.feeBps / 100}%.</small>
      {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
    </div>
  );
}

function BuilderBox({ d, onDone }: { d: ProjectDetail; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  async function withdraw() {
    setBusy(true);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      const hash = await wallet.writeContract({ account, chain: wallet.chain, address: SHOWCASE!, abi: showcaseAbi, functionName: "withdraw", args: [] });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("The withdrawal failed.");
      setMsg({ text: "Sent to your wallet.", kind: "ok" });
      onDone();
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel creator-tools">
      <div className="quote-line">
        <span className="eyebrow">Your corner · builder</span>
      </div>
      <div className="quote-line">
        <span>Waiting for you</span>
        <b>{fmtNum(d.pending, 5)} ETH</b>
      </div>
      <button className="btn bell full" onClick={withdraw} disabled={busy || d.pending <= 0}>
        {busy ? "Sending…" : "Withdraw"}
      </button>
      <small className="muted">Everything backers have sent you on the Showcase, after the platform fee.</small>
      {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
    </div>
  );
}
