// A token's logo: its image if it has one, otherwise its ticker on a bone-white tile.

export function TickerBadge({ symbol, image, address, size = 40 }: { symbol: string; image?: string | null; address: string; size?: number }) {
  const c = "#efe9dc"; // one tile colour for every token
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
