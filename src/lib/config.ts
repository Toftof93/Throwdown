import type { Address, Chain } from "viem";
import { CHAINS, robinhoodMainnet } from "./chains";

// Where Throwdown lives. Set these in Vercel once the contracts are deployed; the admin page
// prints the exact values. Until a factory is set, the site runs in preview mode.
// Values pasted into Vercel often carry stray spaces, quotes or a "KEY=" prefix; strip them.
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^[A-Z_]+=/, "").replace(/^["']|["']$/g, "").trim();
const addr = (v: string | undefined) => {
  const m = clean(v).match(/0x[0-9a-fA-F]{40}/);
  return m ? (m[0] as Address) : undefined;
};
const chainId = Number(clean(process.env.NEXT_PUBLIC_CHAIN_ID) || robinhoodMainnet.id);

export const CHAIN: Chain = CHAINS.find((c) => c.id === chainId) ?? robinhoodMainnet;

// Uniswap's official v4 PoolManager on Robinhood Chain mainnet.
const OFFICIAL_POOL_MANAGER: Record<number, Address> = {
  4663: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
};

export const POOL_MANAGER = addr(process.env.NEXT_PUBLIC_POOL_MANAGER) ?? OFFICIAL_POOL_MANAGER[CHAIN.id];
export const FACTORY = addr(process.env.NEXT_PUBLIC_FACTORY);
export const ROUTER = addr(process.env.NEXT_PUBLIC_ROUTER);
export const START_BLOCK = BigInt(clean(process.env.NEXT_PUBLIC_START_BLOCK).replace(/\D/g, "") || "0");
export const RPC_URL = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || CHAIN.rpcUrls.default.http[0];
export const LIVE = Boolean(FACTORY && ROUTER && POOL_MANAGER);
// Project Showcase (projects without a token) lives in its own contract and can be switched on separately.
export const SHOWCASE = addr(process.env.NEXT_PUBLIC_SHOWCASE);
export const SHOWCASE_BLOCK = BigInt(clean(process.env.NEXT_PUBLIC_SHOWCASE_BLOCK).replace(/\D/g, "") || "0") || START_BLOCK;
export const MISSING = [!POOL_MANAGER && "NEXT_PUBLIC_POOL_MANAGER", !FACTORY && "NEXT_PUBLIC_FACTORY", !ROUTER && "NEXT_PUBLIC_ROUTER"].filter(Boolean) as string[];
export const EXPLORER = CHAIN.blockExplorers?.default.url ?? "";
export const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://usethrowdown.xyz";
