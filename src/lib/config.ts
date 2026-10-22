import type { Address, Chain } from "viem";
import { CHAINS, robinhoodMainnet } from "./chains";

// Where Throwdown lives. Set these in Vercel once the contracts are deployed; the admin page
// prints the exact values. Until a factory is set, the site runs in preview mode.
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || robinhoodMainnet.id);

export const CHAIN: Chain = CHAINS.find((c) => c.id === chainId) ?? robinhoodMainnet;

// Uniswap's official v4 PoolManager on Robinhood Chain mainnet.
const OFFICIAL_POOL_MANAGER: Record<number, Address> = {
  4663: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
};

const addr = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

export const POOL_MANAGER = addr(process.env.NEXT_PUBLIC_POOL_MANAGER) ?? OFFICIAL_POOL_MANAGER[CHAIN.id];
export const FACTORY = addr(process.env.NEXT_PUBLIC_FACTORY);
export const ROUTER = addr(process.env.NEXT_PUBLIC_ROUTER);
export const START_BLOCK = BigInt(process.env.NEXT_PUBLIC_START_BLOCK || "0");
export const RPC_URL = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || CHAIN.rpcUrls.default.http[0];
export const LIVE = Boolean(FACTORY && ROUTER && POOL_MANAGER);
export const EXPLORER = CHAIN.blockExplorers?.default.url ?? "";
export const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://throwdown.fun";
