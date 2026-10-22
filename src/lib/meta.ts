// A coin's profile, stored on-chain as JSON and editable by its creator.

export type Meta = { description?: string; image?: string; x?: string; telegram?: string; website?: string };

const url = (v: unknown) => (typeof v === "string" && v.length < 400 && /^https:\/\/[^\s"<>]+$/.test(v) ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export function parseMeta(s: string | undefined | null): Meta {
  try {
    const m = JSON.parse(s || "{}");
    if (!m || typeof m !== "object") return {};
    return { description: text(m.description, 500), image: url(m.image), x: url(m.x), telegram: url(m.telegram), website: url(m.website) };
  } catch {
    return {};
  }
}
