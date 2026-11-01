"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { progressStores } from "@/lib/progress-stores";
import { configuredModules } from "@/lib/modules";
import { readiness } from "@/lib/learning";
import { allConcepts, type Concept } from "@/lib/model";

export default function ModuleDirectory() {
  return <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10 sm:px-10">
    <header>
      <h1 className="text-3xl font-bold tracking-tight">INTERVIEW DRILL</h1>
      <p className="mt-2 text-gray-600">Active recall, practical reasoning, and independent progress by subject.</p>
    </header>
    <p>{configuredModules.length} modules configured</p>
    <section aria-label="Configured interview modules" className="grid gap-4 sm:grid-cols-2">
      {configuredModules.map((module) => <ModuleCard key={module.id} module={module} />)}
    </section>
  </main>;
}

function ModuleCard({ module }: { module: (typeof configuredModules)[number] }) {
  const store = progressStores[module.id];
  const { progress, loaded, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => { store.hydrate(); }, [store]);
  const state = readiness(progress, module.questions, module.readinessConfig);
  const summary = module.questions.find((question) => question.id === progress.resume?.questionId);
  const weak = Object.entries(state.conceptPerformance).filter(([, value]) => value.status === "Weak");
  return <article className="space-y-3 border border-gray-300 p-5">
    <h2 className="text-xl font-bold"><Link className="underline" href={module.path}>{module.title}</Link></h2>
    <p>{module.syllabusRange}</p>
    <strong>{loaded ? state.status : "Loading progress..."}</strong>
    <p>MUST DO: {state.mustDo.length} / CAN DO LATER: {state.canDoLater.length}</p>
    <p>Recent core performance: {state.coreCoverage ? `${Math.round(state.recentAccuracy * 100)}%` : "--"}</p>
    <p>Resume point: {summary ? summary.concepts.map((id) => allConcepts[id]).join(" / ") : "Not started"}</p>
    <p>Weak concepts: {weak.length ? weak.map(([id]) => allConcepts[id as Concept]).join(", ") : "None detected"}</p>
    <Link className="font-semibold underline" href={module.path}>{progress.resume ? "Continue" : "Review"}</Link>
    {error && <p role="alert">{error}</p>}
  </article>;
}
