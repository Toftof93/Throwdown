import { projectDetail } from "@/lib/showcase";
import { SHOWCASE } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!SHOWCASE || !Number.isInteger(id) || id < 1) return Response.json({ error: "No such project." }, { status: 404 });
  try {
    const d = await projectDetail(id);
    return d ? Response.json(d) : Response.json({ error: "No such project." }, { status: 404 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't read the chain right now." }, { status: 502 });
  }
}
