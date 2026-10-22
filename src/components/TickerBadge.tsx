// A token's logo: its image if it has one, otherwise its ticker set in a coloured box.
const COLORS = ["#34d17b", "#f5b73b", "#5aa9ff", "#ff7a59", "#c48bff", "#2fd3c4", "#ff5fa2", "#e6e1d3"];

export function TickerBadge({ symbol, image, address, size = 40 }: { symbol: string; image?: string | null; address: string; size?: number }) {
  let h = 0;
  for (const ch of address.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = COLORS[h % COLORS.length];
  if (image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="badge img" src={image} alt="" width={size} height={size} style={{ width: size, height: size }} referrerPolicy="no-referrer" />;
  const s = symbol.slice(0, 5).toUpperCase();
  return (
    <span className="badge" style={{ width: size, height: size, background: c, fontSize: size * (s.length > 3 ? 0.24 : 0.32) }} aria-hidden>
      {s}
    </span>
  );
}
