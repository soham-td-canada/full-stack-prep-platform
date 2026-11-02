"use client";

import { useEffect, useState } from "react";
import { sessionElapsed } from "@/lib/learning";
import { allModes, type ActiveMode, type Progress } from "@/lib/model";
import type { ModeWork } from "@/lib/required-work";

export function RequiredCount({ count, compact = false }: { count: number; compact?: boolean }) {
  return <div className={compact ? "required-count compact" : "required-count"} data-testid="required-count">
    <strong>{count}</strong> <span>REQUIRED{!compact && " QUESTIONS LEFT"}</span>
    {!compact && <p>to be ready to move on</p>}
  </div>;
}

export function StatusBadge({ ready, children }: { ready?: boolean; children: React.ReactNode }) {
  return <span className={`status-badge ${ready ? "status-ready" : "status-required"}`}>{ready && "✓ "}{children}</span>;
}

export function ModeProgressCard({ work, onStart, presets, selectedSize, onSizeChange }: {
  work: ModeWork; onStart: () => void; presets: number[]; selectedSize: number; onSizeChange: (size: number) => void;
}) {
  const label = work.state === "required" ? `${work.requiredRemaining} REQUIRED LEFT` :
    work.state === "complete" ? "COMPLETE" : "REQUIRED WORK COMPLETE";
  return <article className={`mode-card ${work.state}`} aria-label={`${allModes[work.mode]} progress`}>
    <h3 className="font-semibold">{allModes[work.mode]}</h3>
    <StatusBadge ready={work.state !== "required"}>{label}</StatusBadge>
    <p className="secondary">{work.attempted} / {work.available} attempted · {work.unseen} unseen</p>
    <p>{work.requiredRemaining} required{work.optional > 0 && <span className="secondary"> · {work.optional} optional questions</span>}</p>
    <button aria-label={allModes[work.mode]} disabled={work.state === "complete"} onClick={onStart}
      className={work.state === "required" ? "primary" : "secondary-action"}>
      {work.state === "required" ? `Continue ${work.requiredRemaining} Required` :
        work.state === "complete" ? "Complete — no unseen questions" : "Optional Practice"}
    </button>
    {work.state !== "complete" && <details className="secondary"><summary>Session size & pacing</summary>
      <label className="block" htmlFor={`size-${work.mode}`}>Session size for {allModes[work.mode]}</label>
      <select id={`size-${work.mode}`} value={presets.includes(selectedSize) ? selectedSize : presets[Math.floor(presets.length / 2)]}
        onChange={(event) => onSizeChange(Number(event.target.value))}>
        {presets.map((size) => <option key={size} value={size}>{size} {presets[0] === 1 ? "exercises" : "questions"}</option>)}
      </select>
      <p>{presets[0] === 1 ? "~8–15 min per deep exercise" : "~2–3 min per standard question"}. Guidance only.</p>
    </details>}
    {work.breakdown.length > 0 && <details><summary>Why work remains</summary>
      <ul>{work.breakdown.map((b) => <li className="breakdown-row" key={b.label}><span>{b.label}</span><strong>{b.count}</strong></li>)}</ul>
    </details>}
  </article>;
}

export function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function SessionTimer({ session }: { session: NonNullable<Progress["session"]> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (session.completed || session.startedAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session.completed, session.startedAt]);
  if (session.startedAt === undefined) return <span className="session-timer">Elapsed: not recorded</span>;
  return <span aria-live="off" className="session-timer">Elapsed: {formatElapsed(sessionElapsed(session.startedAt, now, session.endedAt))}</span>;
}

export function SessionHeader({ title, mode, required, session, answered, graded }: {
  title: string; mode: ActiveMode; required: number; session: NonNullable<Progress["session"]>; answered: number; graded: boolean;
}) {
  const done = answered + (session.skipped?.length ?? 0);
  const position = Math.min(session.size, done + (graded ? 0 : 1));
  return <header role="region" className="session-header" aria-label="Current session">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong>{title} / {allModes[mode]}</strong><RequiredCount count={required} compact />
    </div>
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>Question {position} / {session.size}</span><SessionTimer session={session} />
    </div>
    <progress aria-label={`${done} of ${session.size} session questions completed`} value={done} max={session.size} />
  </header>;
}
