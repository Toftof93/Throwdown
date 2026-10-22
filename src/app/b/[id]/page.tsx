import { notFound } from "next/navigation";
import { BattleView } from "@/components/BattleView";

export const metadata = { title: "Fight · Throwdown" };

export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <BattleView id={id} />;
}
