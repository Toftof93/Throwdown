import { roundCoins } from "@/lib/data";
import { LIVE } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ r: string }> }) {
  const r = Number((await params).r);
  if (!LIVE || !Number.isInteger(r) || r < 0) return Response.json({ coins: [] });
  return Response.json({ coins: await roundCoins(r) });
}
