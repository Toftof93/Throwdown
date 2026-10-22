"use client";

import { createPublicClient, createWalletClient, custom, http, type Address, type Chain, type EIP1193Provider } from "viem";
import { useEffect, useState } from "react";
import { CHAIN, RPC_URL } from "./config";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { on?: (e: string, f: (...a: any[]) => void) => void; removeListener?: (e: string, f: (...a: any[]) => void) => void };
  }
}

export const publicClient = createPublicClient({ chain: CHAIN, transport: http(CHAIN.id === 31337 ? CHAIN.rpcUrls.default.http[0] : RPC_URL) });

export class WalletError extends Error {}

/** Connects the browser wallet and makes sure it is on Go Listed's chain (or the one given). */
export async function connect(chain: Chain = CHAIN) {
  if (typeof window === "undefined" || !window.ethereum) throw new WalletError("No wallet found. Open this page in Rabby or MetaMask.");
  const wallet = createWalletClient({ chain, transport: custom(window.ethereum) });
  const [account] = await wallet.requestAddresses();
  if ((await wallet.getChainId()) !== chain.id) {
    try {
      await wallet.switchChain({ id: chain.id });
    } catch (e) {
      // Only add the network when the wallet doesn't know it; a cancelled switch stops here.
      const code = (e as { code?: number; cause?: { code?: number } }).code ?? (e as { cause?: { code?: number } }).cause?.code;
      if (code !== 4902) throw e;
      await wallet.addChain({ chain });
    }
  }
  return { wallet, account };
}

/** A short, human message for a failed wallet action. */
export function walletMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(msg)) return "You cancelled in your wallet.";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH for this, including gas.";
  if (/NotOpen/i.test(msg)) return "Trading opens soon.";
  if (/Expired/.test(msg)) return "The trade took too long to confirm. Try again.";
  if (/TooLittleReceived/i.test(msg)) return "The price moved past your slippage limit. Try again.";
  if (/QuoteNotEnabled/i.test(msg)) return "That pair isn't available right now.";
  if (/TooSmall/.test(msg)) return "The smallest backing is 0.0001 ETH.";
  if (/Hidden\b/.test(msg)) return "Backing is closed for this project.";
  if (/NothingToWithdraw/.test(msg)) return "There's nothing to withdraw yet.";
  if (/BadName/i.test(msg)) return "Check the name (1–64 characters) and ticker (1–16 characters).";
  return (e as { shortMessage?: string }).shortMessage ?? msg.split("\n")[0];
}

/** The connected account, without prompting. */
export function useAccount(): [Address | null, (a: Address | null) => void] {
  const [account, setAccount] = useState<Address | null>(null);
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((a) => setAccount((a as Address[])[0] ?? null)).catch(() => {});
    const on = (a: Address[]) => setAccount(a[0] ?? null);
    eth.on?.("accountsChanged", on);
    return () => eth.removeListener?.("accountsChanged", on);
  }, []);
  return [account, setAccount];
}
