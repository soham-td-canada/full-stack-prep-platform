"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { moduleProgressStore, progressStores } from "@/lib/progress-stores";
import { configuredModules } from "@/lib/modules";
import { calculateRequiredWork } from "@/lib/required-work";
import { RequiredCount, StatusBadge } from "./progress-ui";

export default function ModuleDirectory() {
  const snapshots = useSyncExternalStore(moduleProgressStore.subscribe, moduleProgressStore.getSnapshot, moduleProgressStore.getServerSnapshot);
  useEffect(() => { Object.values(progressStores).forEach((store) => store.hydrate()); }, []);
  if (snapshots.some((snapshot) => !snapshot.loaded)) return <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10 sm:px-10">
    <h1 className="text-3xl font-bold tracking-tight">INTERVIEW DRILL</h1>
    <p role="status">Loading your module progress...</p>
  </main>;
  const entries = configuredModules.map((trainingModule, index) => ({
    trainingModule, index, snapshot: snapshots[index],
    work: snapshots[index].loaded ? calculateRequiredWork(snapshots[index].progress, trainingModule) : null,
  }));
  const recent = entries.filter((entry) => entry.snapshot.progress.attempts.length || entry.snapshot.progress.session)
    .toSorted((a, b) => Math.max(b.snapshot.progress.attempts.at(-1)?.timestamp ?? 0, b.snapshot.progress.session?.startedAt ?? 0) -
      Math.max(a.snapshot.progress.attempts.at(-1)?.timestamp ?? 0, a.snapshot.progress.session?.startedAt ?? 0))[0];
  const recommended = recent?.work?.totalRequiredRemaining ? recent :
    entries.find((entry) => entry.work?.status === "IN PROGRESS") ??
    entries.find((entry) => entry.work?.totalRequiredRemaining);
  const rank = (status: string | undefined) => status === "IN PROGRESS" ? 0 : status === "READY TO MOVE ON" ? 1 : 2;
  const ordered = entries.toSorted((a, b) => rank(a.work?.status) - rank(b.work?.status) || a.index - b.index);
  return <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10 sm:px-10">
    <header>
      <h1 className="text-3xl font-bold tracking-tight">INTERVIEW DRILL</h1>
      <p className="mt-2 secondary">Clear the required work, then move on. You do not need to complete every available question.</p>
    </header>
    {recommended && <section className="surface current-module p-4 space-y-2" aria-label="Recommended module">
      <p className="secondary text-sm">{recent ? "WELCOME BACK" : "START HERE"}</p>
      <strong>{recommended.trainingModule.title}</strong>
      <p>{recommended.work!.totalRequiredRemaining} REQUIRED LEFT</p>
      <Link className="action-link" href={recommended.trainingModule.path}>Continue {recommended.trainingModule.shortTitle}</Link>
    </section>}
    <p>{configuredModules.length} modules configured</p>
    <section aria-label="Configured interview modules" className="grid gap-4 sm:grid-cols-2">
      {ordered.map(({ trainingModule }) => <ModuleCard key={trainingModule.id} module={trainingModule} current={trainingModule.id === recommended?.trainingModule.id} />)}
    </section>
  </main>;
}

function ModuleCard({ module, current }: { module: (typeof configuredModules)[number]; current: boolean }) {
  const store = progressStores[module.id];
  const { progress, loaded, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => { store.hydrate(); }, [store]);
  const state = loaded ? calculateRequiredWork(progress, module) : null;
  const active = progress.session && !progress.session.completed;
  return <article className={`surface space-y-3 p-5 ${current ? "current-module" : ""}`}>
    <h2 className="text-xl font-bold"><Link className="underline" href={module.path}>{module.title}</Link></h2>
    {state ? <>
      <StatusBadge ready={state.status === "READY TO MOVE ON"}>{state.status}</StatusBadge>
      {current && <span className="text-sm secondary"> · CURRENT</span>}
      <RequiredCount count={state.totalRequiredRemaining} compact />
      <p>{state.mustDoAreas} MUST-DO AREAS</p>
      {active && <p className="secondary">Session paused: {progress.attempts.length - progress.session!.startAttempt} / {progress.session!.size}</p>}
      <Link className="action-link" href={module.path}>{active ? "Resume Session" : state.totalRequiredRemaining ? progress.attempts.length ? "Continue" : "Start module" : "View optional review"}</Link>
      <p className="secondary text-sm">{state.modes.reduce((sum, m) => sum + m.attempted, 0)} / {state.modes.reduce((sum, m) => sum + m.available, 0)} attempted · {state.optional} optional unseen</p>
    </> : <p>Loading progress...</p>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
