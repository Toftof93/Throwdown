import { LaunchForm } from "@/components/LaunchForm";

export const metadata = { title: "Launch · Throwdown" };

export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ mode?: string; answer?: string }> }) {
  const { mode, answer } = await searchParams;
  const id = Number(answer);
  return <LaunchForm initialMode={mode === "challenge" ? "challenge" : "arena"} answerId={Number.isInteger(id) && id > 0 ? id : undefined} />;
}
