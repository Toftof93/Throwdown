import { battleDetail } from "@/lib/data";
import { LIVE } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!LIVE || !Number.isInteger(id) || id < 1) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const d = await battleDetail(id);
    if (!d) return Response.json({ error: "No such battle." }, { status: 404 });
    return Response.json(d, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=10" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't read the chain right now." }, { status: 502 });
  }
}
