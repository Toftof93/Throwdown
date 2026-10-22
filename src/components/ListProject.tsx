"use client";

import { useState } from "react";
import { decodeEventLog } from "viem";
import { SHOWCASE } from "@/lib/config";
import { showcaseAbi } from "@/lib/abi";
import { connect, publicClient, walletMessage } from "@/lib/wallet";
import { TickerBadge } from "./TickerBadge";

const https = (v: string) => (/^https:\/\/\S+$/.test(v) ? v : undefined);

export function ListProject() {
  const [f, setF] = useState({ name: "", description: "", image: "", x: "", telegram: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!SHOWCASE) return;
    if (!f.name.trim()) return setMsg({ text: "Give your project a name.", kind: "err" });
    setBusy(true);
    setMsg(null);
    try {
      const { wallet, account } = await connect();
      const meta = JSON.stringify({ description: f.description.trim().slice(0, 500) || undefined, image: https(f.image.trim()), x: https(f.x.trim()), telegram: https(f.telegram.trim()), website: https(f.website.trim()) });
      setMsg({ text: "Confirm in your wallet…" });
      const hash = await wallet.writeContract({ account, chain: wallet.chain, address: SHOWCASE, abi: showcaseAbi, functionName: "list", args: [f.name.trim(), meta] });
      setMsg({ text: "Listing… waiting for the network." });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Listing failed.");
      let id = 0;
      for (const log of rc.logs) {
        try {
          const ev = decodeEventLog({ abi: showcaseAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "Listed") id = Number((ev.args as unknown as { id: bigint }).id);
        } catch {}
      }
      setMsg({ text: "You're listed.", kind: "ok" });
      if (id) location.href = `/p/${id}`;
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="listing wrap">
      <div>
        <p className="eyebrow">Project Showcase</p>
        <h1 className="display">
          Show what <em>you're building.</em>
        </h1>
        <p className="muted" style={{ fontSize: 16, margin: 0 }}>
          No token needed. List your app, product or idea, and people can back it with ETH that goes to your wallet. Listing is free; you only pay gas.
        </p>
        {!SHOWCASE && <p className="notice warn" style={{ marginTop: 18 }}>The Showcase opens soon.</p>}
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Project name</span>
            <input value={f.name} onChange={set("name")} maxLength={64} placeholder="Moon Maps" required />
          </label>
          <label className="field">
            <span>What is it, and why should people back it?</span>
            <textarea value={f.description} onChange={set("description")} maxLength={500} placeholder="The first line shows on the Showcase card." />
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
          <button className="btn big full bell" disabled={busy || !SHOWCASE}>
            {busy ? "Listing…" : "List my project"}
          </button>
          <small className="muted">Backing is a gift to you. Don't promise backers tokens, profits or refunds.</small>
          {msg && <p className={`notice ${msg.kind ?? ""}`}>{msg.text}</p>}
        </form>
      </div>
      <aside className="prospectus">
        <p className="kicker">Showcase card</p>
        <div className="ph">
          <TickerBadge symbol={f.name.replace(/[^A-Za-z0-9]/g, "") || "NEW"} image={https(f.image.trim())} address="showcase-preview" size={56} />
          <div style={{ minWidth: 0 }}>
            <h2>{f.name.trim() || "Your project"}</h2>
            <span>No token</span>
          </div>
        </div>
        {f.description.trim() && <p className="desc">{f.description.trim()}</p>}
        <dl>
          <dt>Backing goes to</dt>
          <dd>Your wallet</dd>
          <dt>Ranked by</dt>
          <dd>ETH backed today</dd>
          <dt>Cost to list</dt>
          <dd>Gas only</dd>
        </dl>
      </aside>
    </main>
  );
}
