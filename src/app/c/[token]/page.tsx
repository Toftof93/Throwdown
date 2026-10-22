import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { CoinView } from "@/components/CoinView";
import { LIVE } from "@/lib/config";
import { listings } from "@/lib/data";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = LIVE && isAddress(token) ? (await listings().catch(() => [])).find((r) => r.token.toLowerCase() === token.toLowerCase()) : undefined;
  return { title: row ? `$${row.symbol} · ${row.name} on Throwdown` : "Throwdown" };
}

export default async function CoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAddress(token)) notFound();
  return <CoinView address={token} />;
}
