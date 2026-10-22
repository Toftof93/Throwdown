import { TickerBadge } from "./TickerBadge";

export type ProspectusProps = {
  address: string;
  name: string;
  symbol: string;
  image?: string | null;
  description?: string;
  pair: string;
  listsAt: string;
  rows: [string, string][];
  seals: { label: string; good?: boolean }[];
  kicker?: string;
};

// The one-page fact sheet every listing gets.
export function Prospectus(p: ProspectusProps) {
  return (
    <aside className="prospectus">
      <p className="kicker">
        <span>{p.kicker ?? "Prospectus"}</span>
        <span>{p.pair}</span>
      </p>
      <div className="ph">
        <TickerBadge symbol={p.symbol || "?"} image={p.image} address={p.address} size={58} />
        <div>
          <h2>{p.name || "Your token"}</h2>
          <span>${p.symbol || "TICKER"}</span>
        </div>
      </div>
      {p.description && <p className="desc">{p.description}</p>}
      <dl style={p.description ? undefined : { marginTop: 10 }}>
        <dt>Opens</dt>
        <dd>{p.listsAt}</dd>
        {p.rows.map(([k, v]) => (
          <Frag key={k} k={k} v={v} />
        ))}
      </dl>
      <div className="seal">
        {p.seals.map((s) => (
          <i key={s.label} className={s.good ? "g" : ""}>
            {s.label}
          </i>
        ))}
      </div>
    </aside>
  );
}

function Frag({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
