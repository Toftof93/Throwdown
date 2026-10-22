import { notFound } from "next/navigation";
import { ProjectView } from "@/components/ProjectView";

export const metadata = { title: "Showcase · Throwdown" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <ProjectView id={id} />;
}
