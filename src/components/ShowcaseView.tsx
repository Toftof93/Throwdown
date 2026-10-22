"use client";

import { useEffect, useState } from "react";
import type { ShowcaseData, ProjectCard } from "@/lib/showcase";
import { TickerBadge } from "./TickerBadge";
import { useNow, countdown } from "./useBoard";
import { fmtNum, fmtUsd } from "@/lib/math";

type State = (ShowcaseData & { live: true }) | { live: false } | null;

function Row({ p, rank, value, sub }: { p: ProjectCard; rank?: number; value: string; sub: string }) {
  return (
    <li>
      <a href={`/p/${p.id}`}>
        {rank != null && <span className="rk">{rank}</span>}
        <TickerBadge symbol={p.name.replace(/[^A-Za-z0-9]/g, "") || "?"} image={p.image} address={`showcase-${p.id}`} size={40} />
        <span className="nm">
          <b>{p.name}</b>
          <span>{p.tagline || "No description yet."}</span>
        </span>
        <span className="val">
          {value}
          <small>{sub}</small>
        </span>
      </a>
    </li>
  );
}

export function ShowcaseView() {
  const [d, setD] = useState<State>(null);
  const [tab, setTab] = useState<"top" | "newest">("top");
  useEffect(() => {
    const pull = () =>
      fetch("/api/showcase", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !j.error && setD(j))
        .catch(() => {});
    void pull();
    const i = setInterval(pull, 12_000);
    return () => clearInterval(i);
  }, []);
  const b = d && d.live ? d : null;
  const now = useNow(b?.now);
  const list = b ? (tab === "top" ? b.top : b.newest) : [];

  return (
    <main className="showcase wrap">
      <section className="poster">
        <p className="eyebrow">Project Showcase</p>
        <h1 className="display">
          No token? <span className="b">Still fight.</span>
        </h1>
        <p className="lead">Apps, products, art, anything you're building. List it, and people back it with ETH that goes straight to you. Every day the most-backed projects top the card.</p>
        <div className="cta-row">
          <a href="/showcase/new" className="btn bell big">
            List your project
          </a>
          <a href="/launch" className="btn big">
            Launch a token instead
          </a>
        </div>
        <div className="kicker-row">
          <span>No token needed</span>
          <span>Backing goes to the builder</span>
          <span>Daily ranking</span>
        </div>
      </section>

      {d && !d.live && <p className="notice warn" style={{ marginTop: 18 }}>The Showcase opens soon.</p>}

      <section className="sec">
        <div className="belt">
          <div>
            <span className="eyebrow">Today's most backed</span>
            <div className="pool">{b ? fmtNum(b.today.reduce((a, p) => a + p.today, 0), 4) : "–"} ETH</div>
            <p>Backed across {b ? b.today.length : "–"} projects today. The ranking resets at midnight UTC.</p>
          </div>
          <div className="clock">
            <b>{b ? countdown(b.dayEnd - now) : "--:--"}</b>
            <span>until the reset</span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Today's card</h3>
          </div>
          {!b ? (
            <p className="empty">Loading…</p>
          ) : b.today.length ? (
            <ul className="ladder">
              {b.today.slice(0, 10).map((p, i) => (
                <Row key={p.id} p={p} rank={i + 1} value={`${fmtNum(p.today, 4)} ETH`} sub={b.ethUsd != null ? fmtUsd(p.today * b.ethUsd) : "today"} />
              ))}
            </ul>
          ) : (
            <p className="empty">Nobody has backed a project today yet. Be the first.</p>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="sec-row">
          <h2>All projects</h2>
          <div className="tabs">
            <button className={tab === "top" ? "on" : ""} onClick={() => setTab("top")}>
              Most backed
            </button>
            <button className={tab === "newest" ? "on" : ""} onClick={() => setTab("newest")}>
              Newest
            </button>
          </div>
        </div>
        <div className="panel">
          {!b ? (
            <p className="empty">Loading…</p>
          ) : list.length ? (
            <ul className="rows">
              {list.map((p) => (
                <Row key={p.id} p={p} value={`${fmtNum(p.raised, 4)} ETH`} sub={`${p.backers} backer${p.backers === 1 ? "" : "s"}`} />
              ))}
            </ul>
          ) : (
            <p className="empty">
              No projects yet.{" "}
              <a className="link" href="/showcase/new">
                List the first one →
              </a>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
