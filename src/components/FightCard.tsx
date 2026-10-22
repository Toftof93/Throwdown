import { TickerBadge } from "./TickerBadge";
import { countdown } from "./useBoard";
import { fmtNum } from "@/lib/math";
import type { BattleCard } from "@/lib/data";

const eth = (v: number) => `${v >= 0 ? "" : "−"}${fmtNum(Math.abs(v), 3)} ETH`;

/** Share of the tug-of-war bar for side A, from both sides' net ETH in. */
export function tugShare(a: number, b: number) {
  const pa = Math.max(0, a), pb = Math.max(0, b);
  return pa + pb > 0 ? pa / (pa + pb) : 0.5;
}

export function FightCard({ f, now }: { f: BattleCard; now: number }) {
  const share = tugShare(f.coinA.battleNet, f.coinB?.battleNet ?? 0);
  const end = f.start + 86400;
  const label =
    f.status === "open" ? `Answer in ${countdown(f.start - now)}` : f.status === "starting" ? `Starts in ${countdown(f.start - now)}` : f.status === "live" ? `${countdown(end - now)} left` : f.status === "ended" ? "Final bell. Awaiting result" : f.status === "settled" ? "Settled" : "Nobody answered";
  return (
    <a className={`fight ${f.status === "open" ? "ghost" : ""}`} href={`/b/${f.id}`}>
      <div className="ftop">
        <span className={`status ${f.status === "live" ? "live" : "wait"}`}>{label}</span>
        <span className="eyebrow">Pot {fmtNum(f.pot, 4)} ETH</span>
      </div>
      <div className="sides">
        <div className="fside">
          <TickerBadge symbol={f.coinA.symbol} image={f.coinA.image} address={f.coinA.token} size={44} />
          <div style={{ minWidth: 0 }}>
            <b>${f.coinA.symbol}</b>
            <span>{eth(f.coinA.battleNet)}</span>
          </div>
        </div>
        <span className="vs">VS</span>
        <div className="fside b">
          {f.coinB ? <TickerBadge symbol={f.coinB.symbol} image={f.coinB.image} address={f.coinB.token} size={44} /> : <span className="wanted">?</span>}
          <div style={{ minWidth: 0 }}>
            <b>${f.coinB?.symbol ?? f.rival}</b>
            <span>{f.coinB ? eth(f.coinB.battleNet) : "Wanted"}</span>
          </div>
        </div>
      </div>
      <div className="tug" aria-hidden>
        <i className="r" style={{ width: `${share * 100}%` }} />
        <i className="b" style={{ width: `${(1 - share) * 100}%` }} />
      </div>
      {f.winner && (
        <div className="ffoot">
          <span className="winner-tag">WINNER ${f.winner === f.coinA.token ? f.coinA.symbol : f.coinB?.symbol}</span>
        </div>
      )}
    </a>
  );
}
