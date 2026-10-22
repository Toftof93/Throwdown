import { isAddress } from "viem";
import { coinDetail } from "@/lib/data";
import { LIVE } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!LIVE || !isAddress(token)) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const d = await coinDetail(token);
    if (!d) return Response.json({ error: "This coin isn't on Throwdown." }, { status: 404 });
    return Response.json(d, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=10" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't read the chain right now." }, { status: 502 });
  }
}
