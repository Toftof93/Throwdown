"use client";

import { useMemo } from "react";
import { fmtNum } from "@/lib/math";

type Point = { time: number; price: number };
type Candle = { t: number; o: number; h: number; l: number; c: number };

const STEPS = [60, 300, 900, 3600, 4 * 3600, 86400];

// Candles built from the pool's own trades.
export function Chart({ points, start, openAt, now, marker }: { points: Point[]; start: number; openAt: number; now: number; marker?: number | null }) {
  const candles = useMemo(() => {
    const series = [{ time: openAt, price: start }, ...points.filter((p) => p.time >= openAt)];
    const span = Math.max(now, series[series.length - 1].time) - openAt;
    const step = STEPS.find((s) => span / s <= 60) ?? 86400;
    const out: Candle[] = [];
    let prev = start;
    for (const p of series) {
      const t = Math.floor(p.time / step) * step;
      const last = out[out.length - 1];
      if (last && last.t === t) {
        last.h = Math.max(last.h, p.price);
        last.l = Math.min(last.l, p.price);
        last.c = p.price;
      } else {
        // Fill quiet stretches with flat candles so time stays even.
        if (last) for (let x = last.t + step; x < t && out.length < 400; x += step) out.push({ t: x, o: prev, h: prev, l: prev, c: prev });
        out.push({ t, o: prev, h: Math.max(prev, p.price), l: Math.min(prev, p.price), c: p.price });
      }
      prev = p.price;
    }
    return { list: out.slice(-90), step };
  }, [points, start, openAt, now]);

  const { list: cs, step } = candles;
  const W = 800, H = 300, PAD = 54;
  const hi = Math.max(...cs.map((c) => c.h));
  const lo = Math.min(...cs.map((c) => c.l));
  const range = hi - lo || hi * 0.1 || 1;
  const y = (v: number) => 12 + (1 - (v - (lo - range * 0.08)) / (range * 1.16)) * (H - 30);
  const cw = (W - PAD) / Math.max(cs.length, 20);
  const ticks = [hi, lo + range / 2, lo];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Price chart">
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={0} x2={W - PAD} y1={y(v)} y2={y(v)} stroke="#23271f" strokeDasharray="3 5" />
            <text x={W - PAD + 6} y={y(v) + 4} className="axis">
              {fmtNum(v)}
            </text>
          </g>
        ))}
        {cs.map((c, i) => {
          const up = c.c >= c.o;
          const col = up ? "#34d17b" : "#ff5c4d";
          const x = i * cw + cw / 2;
          const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
          return (
            <g key={c.t}>
              <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1.2} />
              <rect x={x - cw * 0.32} y={top} width={cw * 0.64} height={Math.max(1.5, bot - top)} fill={col} rx={1} />
            </g>
          );
        })}
        {marker != null && cs.length > 0 && marker >= cs[0].t && (
          // Where the replay is, on the price chart.
          <line className="marker" x1={((marker - cs[0].t) / step) * cw} x2={((marker - cs[0].t) / step) * cw} y1={0} y2={H} />
        )}
      </svg>
    </div>
  );
}
