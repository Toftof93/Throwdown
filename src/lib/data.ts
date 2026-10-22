import "server-only";
import { createPublicClient, http, keccak256, encodeAbiParameters, getAbiItem, zeroAddress, type Address, type Hex, type AbiEvent } from "viem";
import { CHAIN, FACTORY, POOL_MANAGER, RPC_URL, START_BLOCK } from "./config";
import { factoryAbi, hookAbi, poolManagerAbi, tokenAbi, erc20Abi } from "./abi";
import { priceFromSqrt, mcapForTick, SUPPLY } from "./math";
import { parseMeta, type Meta } from "./meta";

export const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL, { batch: true }) });

const LAUNCHED = getAbiItem({ abi: factoryAbi, name: "Launched" }) as AbiEvent;
const ROUND_SETTLED = getAbiItem({ abi: factoryAbi, name: "RoundSettled" }) as AbiEvent;
const FEES = getAbiItem({ abi: factoryAbi, name: "FeesClaimed" }) as AbiEvent;
const SWAP = getAbiItem({ abi: poolManagerAbi, name: "Swap" }) as AbiEvent;
const TRANSFER = getAbiItem({ abi: erc20Abi, name: "Transfer" }) as AbiEvent;

export const ROUND = 86_400;
export const BATTLE_LEN = 86_400;

export type Swap = { block: string; time: number; tx: Hex; trader: Address; side: "buy" | "sell" | "buyback"; eth: number; tokens: number; price: number };

// ------------------------------------------------------------------ logs

async function logs(event: AbiEvent, address: Address, args: Record<string, unknown> | undefined, from: bigint, to: bigint): Promise<any[]> {
  if (from > to) return [];
  try {
    return await client.getLogs({ address, event, args, fromBlock: from, toBlock: to } as any);
  } catch (e) {
    // Most RPCs cap how many blocks one query can cover; split the range and try again.
    if (to - from < 1000n) throw e;
    const mid = from + (to - from) / 2n;
    return [...(await logs(event, address, args, from, mid)), ...(await logs(event, address, args, mid + 1n, to))];
  }
}

let ethCache: { at: number; usd: number | null } | null = null;

export async function ethUsd(): Promise<number | null> {
  if (ethCache && Date.now() - ethCache.at < 60_000) return ethCache.usd;
  let usd: number | null = null;
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    usd = Number((await r.json()).data.amount) || null;
  } catch {}
  ethCache = { at: Date.now(), usd: usd ?? ethCache?.usd ?? null };
  return ethCache.usd;
}

// ----------------------------------------------------------------- state

async function slot0(poolId: Hex): Promise<{ sqrtPriceX96: bigint; tick: number }> {
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId, 6n]));
  const v = BigInt(await client.readContract({ address: POOL_MANAGER!, abi: poolManagerAbi, functionName: "extsload", args: [slot] }));
  const sqrtPriceX96 = v & ((1n << 160n) - 1n);
  let tick = Number((v >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000;
  return { sqrtPriceX96, tick };
}

// ----------------------------------------------------------------- swaps

const blockTimes = new Map<string, number>();

async function timesFor(blocks: bigint[]): Promise<void> {
  const need = [...new Set(blocks.map(String))].filter((b) => !blockTimes.has(b));
  for (let i = 0; i < need.length; i += 50) {
    const part = need.slice(i, i + 50);
    const got = await Promise.all(part.map((b) => client.getBlock({ blockNumber: BigInt(b) }).catch(() => null)));
    got.forEach((b, j) => b && blockTimes.set(part[j], Number(b.timestamp)));
  }
}

// Who actually sent each trade (the Swap event only shows the router).
const txFrom = new Map<string, Address>();

async function sendersFor(hashes: Hex[]): Promise<void> {
  const need = [...new Set(hashes)].filter((h) => !txFrom.has(h));
  for (let i = 0; i < need.length; i += 50) {
    const part = need.slice(i, i + 50);
    const got = await Promise.all(part.map((hash) => client.getTransaction({ hash }).catch(() => null)));
    got.forEach((t, j) => t && txFrom.set(part[j], t.from));
  }
}

async function swapLogs(poolIds: Hex[], from: bigint, to: bigint): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < poolIds.length; i += 40) {
    out.push(...(await logs(SWAP, POOL_MANAGER!, { id: poolIds.slice(i, i + 40) }, from, to)));
  }
  return out;
}

function toSwap(l: any): Swap {
  // ETH is always currency0 on Throwdown.
  const qRaw = Number(l.args.amount0), tRaw = Number(l.args.amount1);
  // Amounts are the trader's side: negative means the trader paid it in.
  return {
    block: String(l.blockNumber),
    time: blockTimes.get(String(l.blockNumber)) ?? 0,
    tx: l.transactionHash,
    trader: txFrom.get(l.transactionHash) ?? l.args.sender,
    // The factory only ever swaps to run a prize or bond buyback.
    side: FACTORY && l.args.sender.toLowerCase() === FACTORY.toLowerCase() ? "buyback" : qRaw < 0 ? "buy" : "sell",
    eth: Math.abs(qRaw) / 1e18,
    tokens: Math.abs(tRaw) / 1e18,
    price: priceFromSqrt(l.args.sqrtPriceX96, false, 18),
  };
}

// The block at a given time, found by binary search and cached for a few minutes.
const blockAtCache = new Map<number, { at: number; block: bigint }>();

async function blockAt(ts: number): Promise<bigint> {
  const key = Math.floor(ts / 300);
  const c = blockAtCache.get(key);
  if (c && Date.now() - c.at < 300_000) return c.block;
  const head = await client.getBlock();
  let lo = START_BLOCK, hi = head.number;
  if (Number(head.timestamp) <= ts) return head.number;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    const b = await client.getBlock({ blockNumber: mid });
    if (Number(b.timestamp) < ts) lo = mid;
    else hi = mid;
  }
  blockAtCache.set(key, { at: Date.now(), block: hi });
  return hi;
}


// ---------------------------------------------------------------- coins

export type CoinRow = { token: Address; creator: Address; round: number; battle: number; poolId: Hex; name: string; symbol: string; openAt: number; creatorAmount: number; unlockAt: number; bond: number; block: string };

let listCache: { rows: CoinRow[]; to: bigint } = { rows: [], to: START_BLOCK - 1n };
let listing: Promise<CoinRow[]> | null = null;

export async function listings(): Promise<CoinRow[]> {
  if (!FACTORY) return [];
  listing ??= (async () => {
    try {
      const head = await client.getBlockNumber();
      const fresh = await logs(LAUNCHED, FACTORY, undefined, listCache.to + 1n, head);
      const rows: CoinRow[] = fresh.map((l) => ({
        token: l.args.token,
        creator: l.args.creator,
        round: Number(l.args.round),
        battle: Number(l.args.battle),
        poolId: l.args.poolId,
        name: l.args.name,
        symbol: l.args.symbol,
        openAt: Number(l.args.openAt),
        creatorAmount: Number(l.args.creatorAmount) / 1e18,
        unlockAt: Number(l.args.unlockAt),
        bond: Number(l.args.bond) / 1e18,
        block: String(l.blockNumber),
      }));
      listCache = { rows: [...listCache.rows, ...rows], to: head };
      return listCache.rows;
    } finally {
      setTimeout(() => (listing = null), 3000);
    }
  })();
  return listing;
}

type State = { creator: Address; locked: number; unlockAt: number; bond: number; bondSettled: boolean; bondBroken: boolean; bondEnd: number; burned: number; supply: number; price: number; arenaNet: number; battleNet: number };

async function state(row: CoinRow): Promise<State> {
  const [c, supply, s, sc, broken, bondEnd] = await Promise.all([
    client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "coins", args: [row.token] }) as Promise<any[]>,
    client.readContract({ address: row.token, abi: tokenAbi, functionName: "totalSupply" }) as Promise<bigint>,
    slot0(row.poolId),
    hookAddr().then((h) => client.readContract({ address: h, abi: hookAbi, functionName: "scores", args: [row.poolId] }) as Promise<[bigint, bigint]>),
    row.bond ? (client.readContract({ address: row.token, abi: tokenAbi, functionName: "bondBroken" }) as Promise<boolean>) : Promise.resolve(false),
    row.bond ? (client.readContract({ address: row.token, abi: tokenAbi, functionName: "bondEnd" }) as Promise<bigint>) : Promise.resolve(0n),
  ]);
  return {
    creator: c[0],
    unlockAt: Number(c[6]),
    locked: Number(c[7]) / 1e18,
    bond: Number(c[8]) / 1e18,
    bondSettled: c[9],
    burned: Number(c[10]) / 1e18,
    bondBroken: broken,
    bondEnd: Number(bondEnd),
    supply: Number(supply) / 1e18,
    price: priceFromSqrt(s.sqrtPriceX96, false, 18),
    arenaNet: Number(sc[0]) / 1e18,
    battleNet: Number(sc[1]) / 1e18,
  };
}

let hookCache: Address | null = null;
async function hookAddr(): Promise<Address> {
  hookCache ??= (await client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "hook" })) as Address;
  return hookCache;
}

const metaCache = new Map<string, { at: number; meta: string }>();

async function metaOf(token: Address): Promise<Meta> {
  const c = metaCache.get(token);
  if (c && Date.now() - c.at < 20_000) return parseMeta(c.meta);
  const meta = (await client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "meta", args: [token] }).catch(() => "")) as string;
  metaCache.set(token, { at: Date.now(), meta });
  return parseMeta(meta);
}

export type Battle = { id: number; a: Address; b: Address | null; start: number; pot: number; settled: boolean; winner: Address | null; rival: string };

async function battles(): Promise<Battle[]> {
  const n = Number(await client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "battleCount" }));
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const raw = await Promise.all(ids.map((id) => client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "battles", args: [BigInt(id)] }) as Promise<any>));
  return raw.map((b, i) => ({
    id: ids[i],
    a: b.a,
    b: b.b === zeroAddress ? null : b.b,
    start: Number(b.start),
    pot: Number(b.pot) / 1e18,
    settled: b.settled,
    winner: b.winner === zeroAddress ? null : b.winner,
    rival: b.rival,
  }));
}

async function roundInfo(r: number) {
  const [pool, settled, winners] = (await client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "rounds", args: [BigInt(r)] })) as [bigint, boolean, Address[], Address[]];
  return { pool: Number(pool) / 1e18, settled, winners: winners.filter((w) => w !== zeroAddress) };
}

// ----------------------------------------------------------------- views

export type CoinCard = {
  token: Address;
  name: string;
  symbol: string;
  image: string | null;
  creator: Address;
  round: number;
  battle: number;
  openAt: number;
  live: boolean;
  price: number;
  mcap: number;
  arenaNet: number;
  battleNet: number;
  bond: number;
  bondState: "none" | "active" | "kept" | "broken" | "burned";
  burned: number;
};

export type BattleCard = Battle & { status: "open" | "starting" | "live" | "ended" | "settled" | "unanswered"; coinA: CoinCard; coinB: CoinCard | null };

export type BoardData = {
  now: number;
  ethUsd: number | null;
  round: number;
  roundEnd: number;
  pool: number;
  arena: CoinCard[];
  upcoming: CoinCard[];
  battles: BattleCard[];
  toSettle: { round: number; coins: number }[];
  hall: { round: number; winners: { token: Address; symbol: string; name: string; prize: number; burned: number }[] }[];
  coins: CoinCard[];
};

function card(row: CoinRow, s: State, meta: Meta, now: number): CoinCard {
  return {
    token: row.token,
    name: row.name,
    symbol: row.symbol,
    image: meta.image ?? null,
    creator: s.creator,
    round: row.round,
    battle: row.battle,
    openAt: row.openAt,
    live: now >= row.openAt,
    price: s.price,
    mcap: s.price * s.supply,
    arenaNet: s.arenaNet,
    battleNet: s.battleNet,
    bond: s.bond,
    bondState: !s.bond ? "none" : s.bondSettled ? (s.bondBroken ? "burned" : "kept") : s.bondBroken ? "broken" : "active",
    burned: s.burned,
  };
}

function battleCard(b: Battle, cards: Map<string, CoinCard>, now: number): BattleCard | null {
  const coinA = cards.get(b.a.toLowerCase());
  if (!coinA) return null;
  const coinB = b.b ? cards.get(b.b.toLowerCase()) ?? null : null;
  const status = b.settled ? "settled" : !b.b ? (now < b.start ? "open" : "unanswered") : now < b.start ? "starting" : now < b.start + BATTLE_LEN ? "live" : "ended";
  return { ...b, status, coinA, coinB };
}

let boardCache: { at: number; data: BoardData } | null = null;
let boarding: Promise<BoardData> | null = null;

export async function board(): Promise<BoardData> {
  if (boardCache && Date.now() - boardCache.at < 8000) return boardCache.data;
  boarding ??= (async () => {
    try {
      const [rows, head, usd, bs] = await Promise.all([listings(), client.getBlock(), ethUsd(), battles()]);
      const now = Number(head.timestamp);
      const round = Math.floor(now / ROUND);
      const [states, metas, cur] = await Promise.all([Promise.all(rows.map(state)), Promise.all(rows.map((r) => metaOf(r.token))), roundInfo(round)]);
      const cards = rows.map((r, i) => card(r, states[i], metas[i], now));
      const byAddr = new Map(cards.map((c) => [c.token.toLowerCase(), c]));
      const arena = cards.filter((c) => c.round === round && c.live).sort((a, b) => b.arenaNet - a.arenaNet);
      const upcoming = cards.filter((c) => !c.live).sort((a, b) => a.openAt - b.openAt);

      // Past rounds with coins that nobody has settled yet.
      const pastRounds = [...new Set(rows.map((r) => r.round))].filter((r) => r < round).sort((a, b) => b - a);
      const infos = await Promise.all(pastRounds.map(async (r) => ({ r, info: await roundInfo(r) })));
      const toSettle = infos.filter((x) => !x.info.settled).map((x) => ({ round: x.r, coins: rows.filter((c) => c.round === x.r).length }));

      const settledLogs = FACTORY ? await logs(ROUND_SETTLED, FACTORY, undefined, START_BLOCK, head.number) : [];
      const hall = settledLogs
        .map((l) => ({
          round: Number(l.args.round),
          winners: (l.args.winners as Address[])
            .map((w, k) => ({ w, k }))
            .filter(({ w }) => w !== zeroAddress)
            .map(({ w, k }) => {
              const c = byAddr.get(w.toLowerCase());
              return { token: w, symbol: c?.symbol ?? "?", name: c?.name ?? "", prize: Number(l.args.prizes[k]) / 1e18, burned: Number(l.args.burned[k]) / 1e18 };
            }),
        }))
        .filter((h) => h.winners.length)
        .reverse()
        .slice(0, 8);

      const data: BoardData = {
        now,
        ethUsd: usd,
        round,
        roundEnd: (round + 1) * ROUND,
        pool: cur.pool,
        arena,
        upcoming,
        battles: bs.map((b) => battleCard(b, byAddr, now)).filter((b): b is BattleCard => !!b).reverse(),
        toSettle,
        hall,
        coins: [...cards].reverse(),
      };
      boardCache = { at: Date.now(), data };
      return data;
    } finally {
      boarding = null;
    }
  })();
  return boarding;
}

export type Fan = { address: Address; balance: number; pct: number };

export type CoinDetail = CoinCard & {
  now: number;
  ethUsd: number | null;
  poolId: Hex;
  meta: Meta;
  startPrice: number;
  supply: number;
  locked: number;
  unlockAt: number;
  creatorAmount: number;
  bondEnd: number;
  protocolBps: number;
  rank: number | null;
  roundEnd: number;
  roundPool: number;
  roundSettled: boolean;
  battleInfo: BattleCard | null;
  swaps: Swap[];
  fans: Fan[];
  launchBlock: string;
};

const holderCache = new Map<string, { to: bigint; bal: Map<string, bigint> }>();

async function holders(token: Address, from: bigint, head: bigint): Promise<Map<string, bigint>> {
  const c = holderCache.get(token) ?? { to: from - 1n, bal: new Map<string, bigint>() };
  const evs = await logs(TRANSFER, token, undefined, c.to + 1n, head);
  for (const e of evs) {
    const f = String(e.args.from).toLowerCase(), t = String(e.args.to).toLowerCase(), v = e.args.value as bigint;
    if (f !== zeroAddress) c.bal.set(f, (c.bal.get(f) ?? 0n) - v);
    if (t !== zeroAddress) c.bal.set(t, (c.bal.get(t) ?? 0n) + v);
  }
  c.to = head;
  holderCache.set(token, c);
  return c.bal;
}

const detailCache = new Map<string, { at: number; d: CoinDetail }>();

export async function coinDetail(token: Address): Promise<CoinDetail | null> {
  const hit = detailCache.get(token.toLowerCase());
  if (hit && Date.now() - hit.at < 2500) return hit.d;
  const rows = await listings();
  const row = rows.find((r) => r.token.toLowerCase() === token.toLowerCase());
  if (!row) return null;
  const [s, head, meta, protocolBps, usd, startTick, info] = await Promise.all([
    state(row),
    client.getBlock(),
    metaOf(row.token),
    client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "protocolBps" }) as Promise<number>,
    ethUsd(),
    client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "startTick" }) as Promise<number>,
    roundInfo(row.round),
  ]);
  const now = Number(head.timestamp);
  const c = card(row, s, meta, now);

  // Rank in its Arena round, and its battle if it has one.
  const mates = rows.filter((r) => r.round === row.round);
  const mateStates = await Promise.all(mates.map((r) => (r.token === row.token ? Promise.resolve(s) : state(r))));
  const order = mates.map((r, i) => ({ t: r.token, net: mateStates[i].arenaNet })).sort((a, b) => b.net - a.net);
  const rank = c.live ? order.findIndex((o) => o.t === row.token) + 1 : null;
  let battleInfo: BattleCard | null = null;
  if (row.battle) {
    const b = (await battles()).find((x) => x.id === row.battle)!;
    const other = [b.a, b.b].find((x) => x && x.toLowerCase() !== row.token.toLowerCase());
    const map = new Map<string, CoinCard>([[row.token.toLowerCase(), c]]);
    if (other) {
      const orow = rows.find((r) => r.token.toLowerCase() === other.toLowerCase());
      if (orow) map.set(other.toLowerCase(), card(orow, await state(orow), await metaOf(orow.token), now));
    }
    battleInfo = battleCard(b, map, now);
  }

  const raw = await swapLogs([row.poolId], BigInt(row.block), head.number);
  const last = raw.slice(-500);
  await Promise.all([timesFor(last.map((l) => l.blockNumber)), sendersFor(last.map((l) => l.transactionHash))]);
  const bal = await holders(row.token, BigInt(row.block), head.number);
  const skip = new Set([POOL_MANAGER!, FACTORY!, zeroAddress].map((a) => a.toLowerCase()));
  const fans = [...bal.entries()]
    .filter(([a, v]) => v > 0n && !skip.has(a))
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .slice(0, 10)
    .map(([a, v]) => ({ address: a as Address, balance: Number(v) / 1e18, pct: (Number(v) / 1e18 / s.supply) * 100 }));

  const d: CoinDetail = {
    ...c,
    now,
    ethUsd: usd,
    poolId: row.poolId,
    meta,
    startPrice: mcapForTick(Number(startTick), 18) / SUPPLY,
    supply: s.supply,
    locked: s.locked,
    unlockAt: s.unlockAt,
    creatorAmount: row.creatorAmount,
    bondEnd: s.bondEnd,
    protocolBps: Number(protocolBps),
    rank,
    roundEnd: (row.round + 1) * ROUND,
    roundPool: info.pool,
    roundSettled: info.settled,
    battleInfo,
    swaps: last.map(toSwap),
    fans,
    launchBlock: row.block,
  };
  detailCache.set(token.toLowerCase(), { at: Date.now(), d });
  return d;
}

export async function battleDetail(id: number) {
  const b = (await battles()).find((x) => x.id === id);
  if (!b) return null;
  const [a, bb] = await Promise.all([coinDetail(b.a), b.b ? coinDetail(b.b) : Promise.resolve(null)]);
  if (!a) return null;
  return { battle: a.battleInfo!, a, b: bb };
}

export async function roundCoins(r: number): Promise<Address[]> {
  return (await listings()).filter((c) => c.round === r).map((c) => c.token);
}

export async function creatorView(creator: Address) {
  const rows = await listings();
  const states = await Promise.all(rows.map(async (r) => ({ r, s: await state(r) })));
  const pending = Number(await client.readContract({ address: FACTORY!, abi: factoryAbi, functionName: "pending", args: [creator] })) / 1e18;
  return {
    pending,
    coins: states
      .filter(({ s }) => s.creator.toLowerCase() === creator.toLowerCase())
      .map(({ r, s }) => ({ token: r.token, name: r.name, symbol: r.symbol, openAt: r.openAt, bond: s.bond, burned: s.burned }))
      .reverse(),
  };
}
