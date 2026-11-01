import Link from "next/link";
import DrillApp from "@/components/drill-app";
import { moduleRegistry } from "@/lib/modules";
import type { ModuleId } from "@/lib/model";

export default function ModulePage({ moduleId }: { moduleId: ModuleId }) {
  const trainingModule = moduleRegistry[moduleId];
  return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-10">
    <header className="mb-10 space-y-3">
      <Link href="/" className="underline">All interview modules</Link>
      <h1 className="text-3xl font-bold tracking-tight">{trainingModule.title.toUpperCase()} DRILL</h1>
      <p className="text-gray-600">{Object.values(trainingModule.modes).join(" · ")}. Practice verbal explanations separately.</p>
    </header>
    <DrillApp key={trainingModule.id} moduleId={trainingModule.id} />
  </main>;
}
