"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Mark } from "./Mark";
import { connect, useAccount, walletMessage } from "@/lib/wallet";
import { shortAddr } from "@/lib/math";

const LINKS = [
  ["/", "Fights"],
  ["/arena", "Arena"],
  ["/launch", "Launch"],
  ["/showcase", "Showcase"],
  ["/creators", "Creators"],
  ["/how", "How it works"],
] as const;

export function Header() {
  const path = usePathname();
  const [account, setAccount] = useAccount();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function go() {
    setErr(null);
    try {
      const { account } = await connect();
      setAccount(account);
    } catch (e) {
      setErr(walletMessage(e));
      setTimeout(() => setErr(null), 4000);
    }
  }

  return (
    <header className="top">
      <a href="/" className="brand" aria-label="Throwdown home">
        <Mark />
        <span>Throwdown</span>
      </a>
      <nav className={open ? "open" : ""}>
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} className={path === href ? "on" : ""}>
            {label}
          </a>
        ))}
      </nav>
      <div className="top-right">
        <button className="btn wallet" onClick={go} title={err ?? undefined}>
          <i className={account ? "dot on" : "dot"} />
          {account ? shortAddr(account) : "Connect"}
        </button>
        <button className="menu" onClick={() => setOpen(!open)} aria-label="Menu">
          <span />
          <span />
        </button>
      </div>
      {err && <p className="toast">{err}</p>}
    </header>
  );
}
