// Prices on Go Listed, kept in plain numbers for display.

export const SUPPLY = 1_000_000_000;
const Q96 = 2 ** 96;

/** Quote per token (human units) from a pool's sqrtPriceX96. */
export function priceFromSqrt(sqrtPriceX96: bigint, tokenIsZero: boolean, quoteDecimals: number): number {
  const s = Number(sqrtPriceX96) / Q96;
  const p = s * s; // currency1 per currency0, raw units
  const raw = tokenIsZero ? p : 1 / p; // quote per token, raw units
  return raw * 10 ** (18 - quoteDecimals);
}

/** The factory's startTick for a given starting market cap (in quote units). */
export function tickForMcap(mcap: number, quoteDecimals: number): number {
  const raw = (mcap / SUPPLY) * 10 ** (quoteDecimals - 18);
  return Math.floor(Math.log(raw) / Math.log(1.0001));
}

export function mcapForTick(tick: number, quoteDecimals: number): number {
  return 1.0001 ** tick * 10 ** (18 - quoteDecimals) * SUPPLY;
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(digits) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(digits) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(digits === 0 ? 0 : 1) + "K";
  if (a >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: digits });
  if (a === 0) return "0";
  if (a >= 1e-4) return n.toPrecision(3).replace(/(\.\d*?[1-9])0+$/, "$1");
  // Tiny prices count their zeros, the way trading screens do: 0.00000000485 -> 0.0₈485
  const [m, e] = a.toExponential(2).split("e");
  const zeros = -Number(e) - 1;
  const sub = String(zeros).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
  return (n < 0 ? "-" : "") + "0.0" + sub + m.replace(".", "").replace(/0+$/, "");
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return "$" + fmtNum(n, Math.abs(n) >= 1e4 ? 1 : 2);
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return (n >= 0 ? "+" : "") + n.toFixed(Math.abs(n) >= 100 ? 0 : 1) + "%";
}

export function shortAddr(a: string): string {
  return a.slice(0, 6) + "…" + a.slice(-4);
}
