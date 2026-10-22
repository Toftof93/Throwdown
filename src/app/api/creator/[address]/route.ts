import { isAddress } from "viem";
import { creatorView } from "@/lib/data";
import { LIVE } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!LIVE || !isAddress(address)) return Response.json({ pending: 0, coins: [] });
  try {
    return Response.json(await creatorView(address));
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't read the chain right now." }, { status: 502 });
  }
}
