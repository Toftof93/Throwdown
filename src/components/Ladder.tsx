import { TickerBadge } from "./TickerBadge";
import { fmtNum, fmtUsd } from "@/lib/math";
import type { CoinCard } from "@/lib/data";

export function Ladder({ coins, usd, limit }: { coins: CoinCard[]; usd: number | null; limit?: number }) {
  const list = limit ? coins.slice(0, limit) : coins;
  if (!list.length) return <p className="empty">No projects in this round yet. The first one in is leading.</p>;
  return (
    <ol className="ladder">
      {list.map((c, i) => (
        <li key={c.token} className={i < 3 && c.arenaNet > 0 ? "prize" : ""}>
          <a href={`/c/${c.token}`}>
            <span className="rk">{i + 1}</span>
            <TickerBadge symbol={c.symbol} image={c.image} address={c.token} size={36} />
            <span className="nm">
              <b>
                ${c.symbol} {c.bondState === "active" && <span className="shield">Bonded</span>}
              </b>
              <span>{c.name}</span>
            </span>
            <span className="val">
              {c.arenaNet >= 0 ? "+" : "−"}
              {fmtNum(Math.abs(c.arenaNet), 3)} ETH in
              <small>{usd != null ? `${fmtUsd(c.mcap * usd)} cap` : `${fmtNum(c.mcap, 3)} ETH cap`}</small>
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}
