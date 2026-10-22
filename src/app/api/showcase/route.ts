import { showcaseBoard } from "@/lib/showcase";
import { SHOWCASE } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!SHOWCASE) return Response.json({ live: false });
  try {
    return Response.json({ live: true, ...(await showcaseBoard()) }, { headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=20" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't read the chain right now." }, { status: 502 });
  }
}
