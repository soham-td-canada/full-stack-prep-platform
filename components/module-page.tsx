import Link from "next/link";
import DrillApp from "@/components/drill-app";
import { moduleRegistry } from "@/lib/modules";
import type { ModuleId } from "@/lib/model";

export default function ModulePage({ moduleId }: { moduleId: ModuleId }) {
  const trainingModule = moduleRegistry[moduleId];
  return <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-8">
    <header className="mb-5 space-y-2">
      <Link href="/" className="underline">All interview modules</Link>
      <h1 className="text-2xl font-bold tracking-tight">{trainingModule.title.toUpperCase()} DRILL</h1>
    </header>
    <DrillApp key={trainingModule.id} moduleId={trainingModule.id} />
  </main>;
}
