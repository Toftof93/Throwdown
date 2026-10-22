import "server-only";
import { getAbiItem, type Address, type Hex, type AbiEvent } from "viem";
import { SHOWCASE, SHOWCASE_BLOCK } from "./config";
import { showcaseAbi } from "./abi";
import { client, logs, ethUsd } from "./data";
import { parseMeta, type Meta } from "./meta";

const BACKED = getAbiItem({ abi: showcaseAbi, name: "Backed" }) as AbiEvent;
export const DAY = 86_400;

export type ProjectCard = { id: number; name: string; builder: Address; image: string | null; tagline: string; raised: number; today: number; backers: number; listedAt: number };

type Raw = { id: number; name: string; builder: Address; listedAt: number; hidden: boolean; raised: number; backers: number; meta: Meta; today: number };

const read = (functionName: string, args: unknown[] = []) => client.readContract({ address: SHOWCASE!, abi: showcaseAbi, functionName, args });

async function project(id: number, day: number): Promise<Raw> {
  const [p, name, meta, today] = (await Promise.all([read("projects", [BigInt(id)]), read("names", [BigInt(id)]), read("meta", [BigInt(id)]), read("dayRaised", [BigInt(day), BigInt(id)])])) as [any, string, string, bigint];
  return { id, name, builder: p.builder, listedAt: Number(p.listedAt), hidden: p.hidden, raised: Number(p.raised) / 1e18, backers: Number(p.backers), meta: parseMeta(meta), today: Number(today) / 1e18 };
}

const card = (r: Raw): ProjectCard => ({
  id: r.id,
  name: r.name,
  builder: r.builder,
  image: r.meta.image ?? null,
  tagline: (r.meta.description ?? "").split("\n")[0].slice(0, 140),
  raised: r.raised,
  today: r.today,
  backers: r.backers,
  listedAt: r.listedAt,
});

export type ShowcaseData = { now: number; day: number; dayEnd: number; ethUsd: number | null; feeBps: number; today: ProjectCard[]; top: ProjectCard[]; newest: ProjectCard[] };

let cache: { at: number; data: ShowcaseData; raws: Raw[] } | null = null;
let loading: Promise<{ data: ShowcaseData; raws: Raw[] }> | null = null;

async function load() {
  if (cache && Date.now() - cache.at < 6000) return cache;
  loading ??= (async () => {
    try {
      const [head, n, fee, usd] = await Promise.all([client.getBlock(), read("projectCount") as Promise<bigint>, read("feeBps") as Promise<number>, ethUsd()]);
      const now = Number(head.timestamp);
      const day = Math.floor(now / DAY);
      const raws = await Promise.all(Array.from({ length: Number(n) }, (_, i) => project(i + 1, day)));
      const shown = raws.filter((r) => !r.hidden).map(card);
      const data: ShowcaseData = {
        now,
        day,
        dayEnd: (day + 1) * DAY,
        ethUsd: usd,
        feeBps: Number(fee),
        today: shown.filter((p) => p.today > 0).sort((a, b) => b.today - a.today),
        top: [...shown].sort((a, b) => b.raised - a.raised || a.id - b.id),
        newest: [...shown].reverse(),
      };
      cache = { at: Date.now(), data, raws };
      return cache;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export async function showcaseBoard(): Promise<ShowcaseData> {
  return (await load()).data;
}

export type Backing = { backer: Address; amount: number; note: string; time: number; tx: Hex };

export type ProjectDetail = ProjectCard & {
  now: number;
  dayEnd: number;
  ethUsd: number | null;
  feeBps: number;
  meta: Meta;
  rank: number | null;
  hidden: boolean;
  pending: number;
  backings: Backing[];
  topBackers: { backer: Address; amount: number }[];
};

const blockTimes = new Map<string, number>();

export async function projectDetail(id: number): Promise<ProjectDetail | null> {
  const { data, raws } = await load();
  const r = raws.find((x) => x.id === id);
  if (!r) return null;
  const head = await client.getBlockNumber();
  const evs = await logs(BACKED, SHOWCASE!, { id: BigInt(id) }, SHOWCASE_BLOCK, head);
  const need = [...new Set(evs.slice(-100).map((l) => String(l.blockNumber)))].filter((b) => !blockTimes.has(b));
  await Promise.all(need.map(async (b) => blockTimes.set(b, Number((await client.getBlock({ blockNumber: BigInt(b) })).timestamp))));
  const totals = new Map<string, { backer: Address; amount: number }>();
  for (const l of evs) {
    const k = String(l.args.backer).toLowerCase();
    const t = totals.get(k) ?? { backer: l.args.backer, amount: 0 };
    t.amount += Number(l.args.amount) / 1e18;
    totals.set(k, t);
  }
  const pending = Number((await read("pending", [r.builder])) as bigint) / 1e18;
  const rank = data.today.findIndex((p) => p.id === id);
  return {
    ...card(r),
    now: data.now,
    dayEnd: data.dayEnd,
    ethUsd: data.ethUsd,
    feeBps: data.feeBps,
    meta: r.meta,
    rank: rank >= 0 ? rank + 1 : null,
    hidden: r.hidden,
    pending,
    backings: evs
      .slice(-100)
      .reverse()
      .map((l) => ({ backer: l.args.backer, amount: Number(l.args.amount) / 1e18, note: String(l.args.note ?? "").slice(0, 140), time: blockTimes.get(String(l.blockNumber)) ?? 0, tx: l.transactionHash })),
    topBackers: [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, 10),
  };
}
