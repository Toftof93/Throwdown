"use client";

import { useBoard, useNow, countdown } from "./useBoard";
import { FightCard } from "./FightCard";
import { Ladder } from "./Ladder";
import { fmtNum, fmtUsd } from "@/lib/math";
import type { BoardData } from "@/lib/data";

const BILL = ["Live on Robinhood Chain", "Launch free, pay gas", "Ranked daily", "Top 3 win buybacks", "Liquidity locked forever", "1v1 if you want it"];

export function Home() {
  const raw = useBoard() as (BoardData & { live: true }) | { live: false } | null;
  const b = raw && raw.live ? raw : null;
  const now = useNow(b?.now);
  const live = b?.battles.filter((f) => f.status === "live" || f.status === "starting" || f.status === "ended") ?? [];
  const open = b?.battles.filter((f) => f.status === "open") ?? [];
  const done = b?.battles.filter((f) => f.status === "settled").slice(0, 6) ?? [];

  return (
    <>
      <section className="poster">
        <div className="bill" aria-hidden>
          <div className="bill-track">
            {[0, 1].map((k) => (
              <span key={k}>
                {BILL.map((t) => (
                  <span key={t}>
                    {t}
                    <i>★</i>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
        <p className="eyebrow">The first launchpad where projects can fight</p>
        <h1 className="display">
          <span className="r">Launch your project.</span>
          <br />
          <span className="w">
            Fight if you <em>want.</em>
          </span>
        </h1>
        <p className="lead">A launchpad on Robinhood Chain. Every launch gets ranked daily, and the top 3 win buybacks. Call out a rival for a 1v1 if you're feeling brave.</p>
        <div className="cta-row">
          <a href="/launch" className="btn bell big">
            Launch your project
          </a>
          <a href="/launch?mode=challenge" className="btn red big">
            Start a fight
          </a>
        </div>
        <div className="tale">
          <div>
            <b>{b ? b.arena.length + b.upcoming.length : "–"}</b>
            <span>Projects</span>
          </div>
          <div>
            <b>{b ? live.length + open.length : "–"}</b>
            <span>Fights</span>
          </div>
          <div>
            <b>{b ? `${fmtNum(b.pool, 3)} ETH` : "–"}</b>
            <span>Prize pool</span>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="belt">
          <div>
            <span className="eyebrow">Today's Arena prize pool</span>
            <div className="pool">
              {b ? fmtNum(b.pool, 4) : "–"} ETH{b?.ethUsd != null && <small>{fmtUsd(b.pool * b.ethUsd)}</small>}
            </div>
            <p>10% of every fee collected. Top 3 projects by net ETH in split it 50/30/20 as buybacks.</p>
          </div>
          <div className="clock">
            <b>{b ? countdown(b.roundEnd - now) : "--:--"}</b>
            <span>until the final bell</span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Arena standings</h3>
            <a className="link" href="/arena">
              Full card →
            </a>
          </div>
          {b ? <Ladder coins={b.arena} usd={b.ethUsd} limit={8} /> : <p className="empty">Loading the card…</p>}
        </div>
      </section>

      <section className="sec">
        <div className="sec-row">
          <h2>Live fights</h2>
          <a className="link" href="/launch?mode=challenge">
            Call someone out →
          </a>
        </div>
        {live.length ? (
          <div className="fights">
            {live.map((f) => (
              <FightCard key={f.id} f={f} now={now} />
            ))}
          </div>
        ) : (
          <div className="panel">
            <p className="empty">No fights on right now. Start one and the whole site watches.</p>
          </div>
        )}
      </section>

      <section className="sec">
        <div className="belt">
          <div>
            <span className="eyebrow">Project Showcase</span>
            <div className="pool" style={{ fontSize: "clamp(30px, 4.5vw, 46px)" }}>No token? Still fight.</div>
            <p>List your app or product without a token. People back it with ETH that goes straight to you, and the most-backed projects top the daily card.</p>
          </div>
          <a href="/showcase" className="btn bell big">
            See the Showcase
          </a>
        </div>
      </section>

      {open.length > 0 && (
        <section className="sec" id="open">
          <div className="sec-row">
            <h2>Open challenges</h2>
            <span className="eyebrow">Answer before the clock runs out</span>
          </div>
          <div className="fights">
            {open.map((f) => (
              <FightCard key={f.id} f={f} now={now} />
            ))}
          </div>
        </section>
      )}

      {b && b.hall.length > 0 && (
        <section className="sec">
          <div className="sec-row">
            <h2>Hall of fame</h2>
          </div>
          <div className="hall">
            {b.hall.map((h) => (
              <div className="card" key={h.round}>
                <h4>{new Date(h.round * 86400 * 1000).toLocaleDateString([], { month: "short", day: "numeric" })} Arena</h4>
                {h.winners.map((w, i) => (
                  <a key={w.token} href={`/c/${w.token}`}>
                    <span>
                      <span className="medal">{i + 1}</span>${w.symbol}
                    </span>
                    <b>{fmtNum(w.burned)} burned</b>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="sec">
          <div className="sec-row">
            <h2>Results</h2>
          </div>
          <div className="fights">
            {done.map((f) => (
              <FightCard key={f.id} f={f} now={now} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
