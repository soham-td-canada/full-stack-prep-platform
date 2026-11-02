"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import StructuredAnswer from "./structured-answer";
import { evaluateStructured, structuredComplete } from "@/lib/structured";
import {
  checkOutput, endSession, readiness, recordAttempt,
  reviewCard, selectQuestion, sessionSummary, skipQuestion, startSession, weaknessCards,
} from "@/lib/learning";
import { allConcepts, allModes, emptyProgress, type ActiveMode, type ModuleId, type Attempt, type Concept, type Progress, type Question, type Result } from "@/lib/model";
import { moduleRegistry } from "@/lib/modules";
import { moduleProgressStore, progressStores as stores } from "@/lib/progress-stores";
import { calculateRequiredWork, selectRequiredQuestion, sessionPresets } from "@/lib/required-work";
import { formatElapsed, ModeProgressCard, RequiredCount, SessionHeader, StatusBadge } from "./progress-ui";
import { configuredModules } from "@/lib/modules";

function Code({ children }: { children: string }) {
  return <pre tabIndex={0} className="overflow-x-auto border border-gray-300 bg-gray-50 p-5 text-base leading-7"><code>{children}</code></pre>;
}

export default function DrillApp({ moduleId = "javascript-typescript" }: { moduleId?: ModuleId }) {
  const store = stores[moduleId];
  const trainingModule = moduleRegistry[moduleId];
  const { questions, concepts } = trainingModule;
  const { progress, loaded, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [mode, setMode] = useState<ActiveMode | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [cardRevealed, setCardRevealed] = useState(false);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [sessionConflict, setSessionConflict] = useState(false);
  const cards = useMemo(() => weaknessCards(progress, questions), [progress, questions]);
  const activeCard = cards[reviewIndex];
  const lastMistake = progress.attempts.findLast((a) => a.questionId === activeCard?.id && a.finalResult !== "correct");
  const cardField = activeCard?.structured?.fields.find((field) => field.misconceptionTag && lastMistake?.mistakeTags.includes(field.misconceptionTag))
    ?? activeCard?.structured?.fields.find((field) => lastMistake?.failedFields?.includes(field.id))
    ?? activeCard?.structured?.fields[0];
  const structuredCard: Question | undefined = activeCard?.structured && cardField
    ? { ...activeCard, structured: { ...activeCard.structured, fields: [cardField] } } : undefined;
  const reviewComplete = structuredCard ? structuredComplete(structuredCard, reviewAnswer) : !!reviewAnswer.trim();
  const checkpoint = useMemo(() => readiness(progress, questions, trainingModule.readinessConfig),
    [progress, questions, trainingModule]);
  const work = loaded ? calculateRequiredWork(progress, trainingModule) : null;
  const sessionSize = progress.selectedSessionSize;
  const summary = sessionSummary(progress, questions, trainingModule.readinessConfig);
  useEffect(() => { store.hydrate(); }, [store]);

  function open(next: Question, selectedMode: ActiveMode | null, current: Progress) {
    if (current.session && !current.session.completed && current.resume?.attemptIndex === null &&
      current.resume.questionId !== next.id) {
      setSessionConflict(true);
      return;
    }
    setMode(selectedMode);
    setQuestion(next);
    setReviewing(false);
    store.update({ ...current, recentQuestions: [...current.recentQuestions, next.id].slice(-10),
      resume: { questionId: next.id, answer: "", revealed: false, attemptIndex: null, practiceMode: selectedMode } });
  }
  function start(selectedMode: ActiveMode | null) {
    const current = store.getSnapshot().progress;
    if (current.session && !current.session.completed && current.resume?.attemptIndex === null) {
      setSessionConflict(true);
      return;
    }
    const modeWork = work?.modes.find((m) => m.mode === selectedMode);
    const focus = (!selectedMode || modeWork?.requiredRemaining) && work?.totalRequiredRemaining ? "required" : "optional";
    const presets = sessionPresets(trainingModule, selectedMode);
    const size = !selectedMode || presets.includes(sessionSize) ? sessionSize : presets[Math.floor(presets.length / 2)];
    const isNewSession = !current.session || current.session.completed;
    let session = isNewSession
      ? startSession(current, size, questions, trainingModule.readinessConfig) : current;
    session = { ...session, session: session.session ? { ...session.session,
      mode: selectedMode, focus, ...(isNewSession ? { initialRequired: work?.totalRequiredRemaining } : {}) } : null };
    const next = focus === "required" ? selectedMode
      ? selectQuestion(questions, selectedMode, session, trainingModule.readinessConfig)
      : selectRequiredQuestion(session, trainingModule) :
      selectQuestion(questions.filter((q) => !session.attempts.some((a) => a.questionId === q.id)), selectedMode, session, trainingModule.readinessConfig);
    if (!next) {
      store.update(endSession(session));
      home();
      return;
    }
    open(next, selectedMode, session);
  }
  function nextQuestion() {
    const current = store.getSnapshot().progress;
    if (current.session?.completed) {
      home();
      return;
    }
    const next = current.session?.focus === "required" ? selectRequiredQuestion(current, trainingModule, mode) :
      selectQuestion(questions.filter((q) => !current.attempts.some((a) => a.questionId === q.id)), mode, current, trainingModule.readinessConfig);
    if (!next) {
      store.update(endSession(current));
      home();
      return;
    }
    open(next, mode, current);
  }
  function home() {
    setMode(null);
    setQuestion(null);
    setReviewing(false);
    setSessionConflict(false);
  }
  function resume() {
    setSessionConflict(false);
    const saved = progress.resume;
    const last = questions.find((q) => q.id === saved?.questionId);
    if (!last || (progress.session?.completed && saved?.attemptIndex === null)) {
      start(null);
      return;
    }
    setMode(saved?.practiceMode === null ? null : saved?.practiceMode === undefined
      ? last.mode === "legacyConcept" ? "reconstruction" : last.mode
      : saved.practiceMode === "legacyConcept" ? "reconstruction" : saved.practiceMode);
    setQuestion(last);
    setReviewing(false);
  }
  function continueMustDo() {
    if (progress.resume && progress.session?.focus === "required" && !progress.session.completed) resume();
    else start(null);
  }
  const saved = question?.id === progress.resume?.questionId ? progress.resume : null;
  const attempt = saved?.attemptIndex !== null && saved?.attemptIndex !== undefined ? progress.attempts[saved.attemptIndex] : undefined;

  return (
    <div className="space-y-8">
      {error && <p role="alert" className="border border-black p-4 text-sm">{error}</p>}
      {!loaded ? <p role="status">Loading local progress...</p> : question ? (
        <div className="space-y-4">
        {progress.session && <SessionHeader title={trainingModule.shortTitle}
          mode={question.mode === "legacyConcept" ? "reconstruction" : question.mode}
          required={work!.totalRequiredRemaining} session={progress.session} answered={summary?.questions ?? 0} graded={!!attempt} />}
        <Training key={question.id} question={question} saved={saved} attempt={attempt}
          sessionComplete={progress.session?.completed ?? false}
          onHome={home} onNext={nextQuestion}
          onEnd={() => { store.update(endSession(store.getSnapshot().progress)); home(); }}
          onSkip={() => {
            const current = skipQuestion(store.getSnapshot().progress, question.id);
            store.update(current);
            nextQuestion();
          }}
          onDraft={(answer, revealed) => {
            const current = store.getSnapshot().progress;
            store.update({ ...current, resume: { questionId: question.id, answer, revealed, attemptIndex: current.resume?.attemptIndex ?? null, practiceMode: mode } });
          }}
          onGrade={(finalResult, answer, autoResult) => {
            const current = store.getSnapshot().progress;
            if (current.resume?.attemptIndex !== null) return;
            const updated = recordAttempt(current, question, finalResult, Date.now(), answer, autoResult);
            store.update({ ...updated, resume: { questionId: question.id, answer, revealed: true, attemptIndex: updated.attempts.length - 1, practiceMode: mode } });
          }}
          /></div>
      ) : reviewing ? (
        <section className="space-y-5" aria-labelledby="review-heading">
          <button onClick={home}>Back to dashboard</button>
          <h2 id="review-heading" className="text-2xl font-bold">Weakness Review</h2>
          <p className="text-sm text-gray-600">Recall the demonstrated mistake. Reviews do not change readiness. Recover through a related game question and a later, different retention question.</p>
          {cards[reviewIndex] ? <>
            <p>Card {reviewIndex + 1} of {cards.length}</p>
            <h3 className="text-xl">{cardField ? `Recall the demonstrated mistake: ${cardField.label}` : cards[reviewIndex].misconception.prompt}</h3>
            {structuredCard && <p>{activeCard.prompt}</p>}
            {cards[reviewIndex].code && <Code>{cards[reviewIndex].code}</Code>}
            {structuredCard ? <StructuredAnswer question={structuredCard} answer={reviewAnswer} disabled={cardRevealed} onChange={setReviewAnswer} /> : <>
            <label className="block" htmlFor="review-answer">Your recalled concept / fix</label>
            <textarea id="review-answer" rows={2} value={reviewAnswer} disabled={cardRevealed}
              onChange={(e) => setReviewAnswer(e.target.value)} />
            </>}
            {!cardRevealed ? <button disabled={!reviewComplete} onClick={() => setCardRevealed(true)}>Reveal explanation</button> : <>
              {structuredCard && <p>{evaluateStructured(structuredCard, reviewAnswer).result === "correct" ? "Correct recall" : "Needs another review"}.
                Expected: {cardField?.kind === "text" ? cardField.accepted[0] : cardField?.correct.join(", ")}</p>}
              <p className="border-l-2 border-black pl-4">{cards[reviewIndex].misconception.answer}</p>
              {!structuredCard && <p>Did your original explanation cover the mistake?</p>}
              {(structuredCard ? [evaluateStructured(structuredCard, reviewAnswer).result === "correct"] : [true, false]).map((successful) => <button key={String(successful)} onClick={() => {
                store.update(reviewCard(store.getSnapshot().progress, cards[reviewIndex].id, successful));
                setReviewIndex(reviewIndex + 1);
                setCardRevealed(false);
                setReviewAnswer("");
              }}>{successful ? (reviewIndex + 1 < cards.length ? "Understood - next card" : "Understood - finish review") : "Needs another review"}</button>)}
            </>}
          </> : <><p>Review complete. Cards retire after successful game practice and later retention, not review alone.</p><button onClick={home}>Back to drills</button></>}
        </section>
      ) : (
        <>
          <section className="module-overview surface space-y-3 p-5" aria-label="Module required work">
            <RequiredCount count={work!.totalRequiredRemaining} />
            <StatusBadge ready={work!.status === "READY TO MOVE ON"}>{work!.status}</StatusBadge>
            <p>{work!.mustDoAreas} MUST-DO AREAS · <span className="secondary">{work!.optional} optional unseen questions</span></p>
            {work!.status === "READY TO MOVE ON" && <><p>Core interview requirements demonstrated.</p><p>Recommended next step: Move to the next interview topic.</p></>}
            <details className="text-sm secondary"><summary>About required questions</summary>
              <p>Required questions are a deterministic practice plan for your remaining must-do requirements, assuming successful validation. One question may clear multiple requirements. This is an achievable estimate, not a guaranteed shortest path. The number can change if new weaknesses are discovered. Skips and flashcards do not clear requirements.</p>
            </details>
          </section>
          {sessionConflict && <section className="surface space-y-3 p-4" aria-labelledby="session-conflict-heading">
            <h2 id="session-conflict-heading" className="font-semibold">Session already in progress</h2>
            <p>Your unfinished answer is saved. Resume this session or end it before starting a different practice session.</p>
            <button className="primary" onClick={resume}>Resume active session</button>
            <button onClick={() => { store.update(endSession(progress)); home(); }}>End current session</button>
          </section>}
          {summary?.completed && <section className="space-y-2 border border-black p-5" aria-labelledby="session-heading">
            <h2 id="session-heading" className="text-xl font-bold">SESSION COMPLETE</h2>
            <p>Questions completed: {summary.questions}</p>
            <p>{summary.correct} correct · {summary.missed} missed / retry · {summary.skipped} skipped</p>
            <p>Elapsed: {progress.session?.startedAt === undefined ? "Not recorded in this older session" : formatElapsed(summary.elapsed)}</p>
            <p>Must-do gaps resolved: {summary.resolved} / Remaining: {summary.remaining}</p>
            <p>New weaknesses detected: {summary.newWeaknesses}</p>
            {checkpoint.mustDo.some((gap) => !progress.session?.initialMustDo.includes(gap.id)) && <p className="secondary">
              New must-do evidence: {checkpoint.mustDo.filter((gap) => !progress.session?.initialMustDo.includes(gap.id)).map((gap) => gap.label).join(" · ")}
            </p>}
            <p>REQUIRED WORK — Before: {progress.session?.initialRequired ?? "Not recorded in this older session"} · Now: {work!.totalRequiredRemaining}</p>
            {progress.session?.initialRequired !== undefined && <p>{work!.totalRequiredRemaining - progress.session.initialRequired > 0 ? "+" : ""}{work!.totalRequiredRemaining - progress.session.initialRequired} required change
              {work!.totalRequiredRemaining > progress.session.initialRequired && " — New validation work was identified. This is useful evidence, not a penalty."}</p>}
            <p>Recommended next: {work!.priority[0] ? `${allModes[work!.priority[0].mode]} — ${work!.priority[0].requiredRemaining} required` : "Move to the next interview topic."}</p>
            {work!.totalRequiredRemaining > 0 && <button className="primary" onClick={() => {
              store.update({ ...progress, session: null, resume: null }); start(null);
            }}>Continue another session</button>}
            <button onClick={() => { store.update({ ...progress, session: null, resume: null }); home(); }}>Stop for now</button>
          </section>}
          <section className="space-y-3 border border-gray-300 p-5" aria-labelledby="continue-heading">
            <h2 id="continue-heading" className="font-bold">{work!.status === "READY TO MOVE ON" ? "NEXT MODULE" : "CONTINUE"}</h2>
            <p>Last session: {progress.resume ? `${questions.find((q) => q.id === progress.resume?.questionId)?.concepts.map((c) => allConcepts[c]).join(" / ")} / ${allModes[questions.find((q) => q.id === progress.resume?.questionId)!.mode]}` : "Not started"}</p>
            <p>Current MUST DO: {work!.mustDoAreas} / Overall status: {work!.status}</p>
            {checkpoint.mustDo.length > 0 ? <button className="primary" onClick={continueMustDo}>{moduleId === "javascript-typescript" ? "Continue Must-Do Practice" : `Continue ${trainingModule.shortTitle} Must-Do`}</button>
              : <NextModule selected={moduleId} />}
            {progress.resume && (!progress.session?.completed || progress.resume.attemptIndex !== null) &&
              <button aria-label="Resume saved question" onClick={resume}>{progress.session && !progress.session.completed ? "Resume Session" : "Review saved answer"}</button>}
            <label className="block" htmlFor="session-size">Session size (next session)</label>
            <select id="session-size" value={sessionSize} onChange={(e) => {
              const size = Number(e.target.value);
              store.update({ ...progress, selectedSessionSize: size });
            }}>
              {[1, 3, 5, 10, 20].map((size) => <option key={size} value={size}>{size} {size < 5 ? "deep exercises" : "questions"}</option>)}
            </select>
            {progress.session && !progress.session.completed && <p>Active session: {summary?.questions} / {progress.session.size} questions. The selected limit applies to your next session.</p>}
            {progress.session && !progress.session.completed && <button onClick={() => { store.update(endSession(progress)); home(); }}>End Session</button>}
            <p className="secondary text-sm">Must-do: roughly 2–3 min per standard question. Review / architecture: 1, 3 or 5 exercises, roughly 8–15 min each. Pacing is guidance only.</p>
          </section>
          <section className="space-y-3" aria-labelledby="must-do-next">
            <h2 id="must-do-next" className="text-lg font-bold">MUST DO NEXT</h2>
            {work!.priority.length ? <ol className="must-do-list">{work!.priority.map((m) =>
              <li key={m.mode}><button onClick={() => start(m.mode)}>{allModes[m.mode]} — {m.requiredRemaining} required</button></li>)}</ol> :
              <p>Required work is done. Optional practice can safely wait.</p>}
            <p className="secondary text-sm">DONE / OPTIONAL: {work!.modes.filter((m) => !m.requiredRemaining).map((m) => `✓ ${allModes[m.mode]}`).join(" · ") || "No modes cleared yet"}</p>
          </section>
          <h2 className="text-lg font-bold">MODE PROGRESS</h2>
          <nav aria-label="Training modes" className="grid gap-3 sm:grid-cols-2">
            {work!.modes.map((m) => <ModeProgressCard key={m.mode} work={m} onStart={() => start(m.mode)}
              presets={sessionPresets(trainingModule, m.mode)} selectedSize={sessionSize}
              onSizeChange={(size) => store.update({ ...progress, selectedSessionSize: size })} />)}
          </nav>
          <section className="space-y-4" aria-labelledby="readiness-heading">
            <h2 id="readiness-heading" className="text-xl font-bold">{moduleId === "javascript-typescript" ? "JS / TS" : trainingModule.title.toUpperCase()} READINESS</h2>
            <strong>{work!.status}</strong>
            {trainingModule.frameworkVersion && <p className="text-sm secondary">Question context: {trainingModule.frameworkVersion}. {trainingModule.versionNotes}</p>}
            <p>Must-do: {checkpoint.mustDo.length} / Core coverage: {checkpoint.coreCoverage} / {trainingModule.readinessConfig.concepts.length}</p>
            <details className="secondary text-sm"><summary>Secondary readiness statistics</summary><p>Recent core score: {Math.round(checkpoint.recentAccuracy * 100)}% / Medium: {Math.round(checkpoint.mediumAccuracy * 100)}% / Hard: {Math.round(checkpoint.hardAccuracy * 100)}% ({checkpoint.hardAttempts} recent attempts)</p></details>
            <p className="text-sm text-gray-600">Readiness uses distinct core questions, reconstruction and practical success, consistent medium evidence, and hard/debug exposure under this module&apos;s configured requirements. Optional depth and flashcard scores never substitute for practice evidence. Repeated core misconceptions block readiness. Practice verbal explanations separately.</p>
            {Object.entries(checkpoint.dimensionPerformance ?? {}).length > 0 && <p className="text-sm">Architecture evidence: {Object.entries(checkpoint.dimensionPerformance).map(([id, value]) => `${id} ${value.correct} correct / ${value.attempts} attempted`).join(" · ")}</p>}
            <h3 className="font-bold">MUST DO - Core interview gaps</h3>
            {checkpoint.mustDo.length ? <ul className="space-y-2">{checkpoint.mustDo.map((gap) => <li key={gap.id}>{gap.label}</li>)}</ul>
              : <p>No unresolved must-do gaps. Continued drilling has lower value than studying another interview area.</p>}
            <details>
              <summary>Concept readiness</summary>
              <div className="divide-y divide-gray-300 border-y border-gray-300">
                {(Object.keys(concepts) as Concept[]).map((concept) => {
                  const state = checkpoint.conceptPerformance[concept];
                  return <div key={concept} className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <div><h3>{allConcepts[concept]}</h3>
                      <p className="mt-1 text-xs text-gray-600">{state.correct}/{state.total} correct / Recent {state.total ? `${Math.round(state.recentAccuracy * 100)}%` : "--"}</p>
                    </div>
                    <strong className="text-sm uppercase">{state.status}</strong>
                  </div>;
                })}
              </div>
            </details>
            <details>
              <summary>CAN DO LATER - Optional depth ({checkpoint.canDoLater.length} exercises)</summary>
              <p className="my-2 text-sm">Extra variants and advanced detail are optional, not prerequisites.</p>
              <ul className="space-y-2">{checkpoint.canDoLater.map((q) => <li key={q.id}>
                <button className="text-left" onClick={() => {
                  const current = !progress.session || progress.session.completed
                    ? startSession(progress, sessionSize, questions, trainingModule.readinessConfig) : progress;
                  open(q, null, current);
                }}>{q.prompt}</button>
              </li>)}</ul>
            </details>
            {checkpoint.warnings.map((warning) => <p key={warning} className="border-l-2 border-gray-400 pl-4 text-sm">{warning}</p>)}
            <details className="secondary text-sm"><summary>Question bank — optional variety, not the finish line</summary>
              <p>Available: {work!.modes.reduce((s, m) => s + m.available, 0)} · Attempted: {work!.modes.reduce((s, m) => s + m.attempted, 0)} · Unseen: {work!.modes.reduce((s, m) => s + m.unseen, 0)} · Optional unseen: {work!.optional}</p>
              <p>You do not need to complete every available question.</p>
            </details>
          </section>
          {cards.length > 0 && <section className="space-y-3 border border-black p-5" aria-labelledby="weakness-heading">
            <h2 id="weakness-heading" className="font-bold">WEAKNESS REVIEW</h2>
            <p>{cards.length} {cards.length === 1 ? "card" : "cards"} targeting demonstrated mistakes</p>
            <button onClick={() => {
              setReviewIndex(0);
              setCardRevealed(false);
              setReviewAnswer("");
              setReviewing(true);
            }}>Review Weak Areas</button>
          </section>}
        </>
      )}
      {loaded && <footer className="space-y-3 border-t border-gray-300 pt-5 text-sm text-gray-600">
        <p>Local to this browser. Structured answers are graded deterministically; debugging and implementations are self-assessed. No conceptual essays, network grading or code execution. Reset clears only progress for this module.</p>
        <button onClick={() => {
          if (window.confirm(`Erase ${trainingModule.title} progress in this browser? This cannot be undone.`)) {
            store.update(emptyProgress(), true);
            home();
          }

        }}>Reset local progress</button>
      </footer>}
    </div>
  );
}

function NextModule({ selected }: { selected: ModuleId }) {
  useEffect(() => { Object.values(stores).forEach((store) => store.hydrate()); }, []);
  const snapshots = useSyncExternalStore(moduleProgressStore.subscribe, moduleProgressStore.getSnapshot, moduleProgressStore.getServerSnapshot);
  const ordered = [...configuredModules.slice(configuredModules.findIndex((m) => m.id === selected) + 1),
    ...configuredModules.slice(0, configuredModules.findIndex((m) => m.id === selected))];
  const target = ordered.find((m) => {
    const snapshot = snapshots[configuredModules.findIndex((configured) => configured.id === m.id)];
    return snapshot.loaded && readiness(snapshot.progress, m.questions, m.readinessConfig).mustDo.length > 0;
  });
  if (snapshots.some((snapshot) => !snapshot.loaded)) return <p>Finding the next configured module...</p>;
  return target ? <p>Next: {target.title} <Link className="action-link" href={target.path}>Move to next module</Link></p> :
    <p className="secondary">All configured modules are ready. Optional review can wait.</p>;
}

function Training({ question, saved, attempt, sessionComplete, onGrade, onDraft, onNext, onHome, onEnd, onSkip }: {
  question: Question;
  saved: Progress["resume"];
  attempt?: Attempt;
  sessionComplete: boolean;
  onGrade: (result: Result, answer: string, autoResult: Result | null) => void;
  onDraft: (answer: string, revealed: boolean) => void;
  onNext: () => void;
  onHome: () => void;
  onEnd: () => void;
  onSkip: () => void;
}) {
  const [answer, setAnswer] = useState(saved?.answer ?? "");
  const [revealed, setRevealed] = useState(saved?.revealed ?? false);
  const graded = useRef(!!attempt);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const solution = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (revealed) solution.current?.focus(); }, [revealed]);
  useEffect(() => () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
  }, []);
  const structuredEvaluation = question.structured && revealed ? evaluateStructured(question, answer) : null;
  const complete = question.structured ? structuredComplete(question, answer) : !!answer.trim();

  function saveDraftNow(value: string, isRevealed: boolean) {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    onDraft(value, isRevealed);
  }

  function scheduleDraft(value: string) {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      onDraft(value, false);
    }, 350);
  }

  function grade(result: Result, autoResult: Result | null = null) {
    if (graded.current) return;
    graded.current = true;
    onGrade(result, answer, autoResult);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!complete || revealed) return;
    setRevealed(true);
    saveDraftNow(answer, true);
    if (question.structured) {
      const result = evaluateStructured(question, answer).result;
      grade(result, result);
      return;
    }
    if (question.mode === "prints") {
      const result = checkOutput(answer, question.answer) ? "correct" : "miss";
      grade(result, result);
    }
  }

  return <section className="space-y-5" aria-labelledby="question-heading">
    <div className="flex flex-wrap gap-2"><button onClick={() => {
      saveDraftNow(answer, revealed);
      onHome();
    }}>Back to dashboard</button>
    <button className="secondary-action" onClick={() => { saveDraftNow(answer, revealed); onEnd(); }}>End Session</button>
    {!attempt && <button className="secondary-action" onClick={onSkip}>Skip question</button>}</div>
    <p className="text-sm uppercase tracking-wide">{allModes[question.mode]} / {question.difficulty} / {question.depth === "core" ? "CORE INTERVIEW PRACTICE" : "OPTIONAL DEPTH"}</p>
    {question.frameworkVersion && <p className="text-sm text-gray-600">Framework context: {question.frameworkVersion}{question.versionSensitive ? " · version-sensitive" : ""}</p>}
    {question.versionNotes && <p className="text-sm text-gray-600">{question.versionNotes}</p>}
    <p className="secondary text-sm">Suggested pacing: {question.mode === "codeReview" || question.mode === "architecture" ? "~8–15 min" :
      question.difficulty === "hard" || question.mode === "implement" ? "~4–6 min" : "~2–3 min"}. Guidance only.</p>
    <h2 ref={heading} tabIndex={-1} id="question-heading" className="text-2xl font-semibold">{question.prompt}</h2>
    <p className="text-sm text-gray-600">{question.concepts.map((c) => allConcepts[c]).join(" / ")}</p>
    {question.code && <Code>{question.mode === "codeReview" ? question.code.split("\n").map((line, i) => `${String(i + 1).padStart(3)} | ${line}`).join("\n") : question.code}</Code>}
    {question.mode === "debug" && !question.structured && <p className="text-sm">Answer all four: what is wrong, why, the smallest good fix, and time/space complexity when relevant.</p>}
    <form onSubmit={submit} className="space-y-3">
      {question.structured ? <>
        <p className="text-sm">Commit every part before revealing. Concepts accept equivalent aliases without punctuation/case sensitivity; predicted outputs match exactly except outer whitespace. Selections are graded as complete sets.</p>
        <StructuredAnswer question={question} answer={answer} disabled={revealed} onChange={(value) => {
          setAnswer(value);
          scheduleDraft(value);
        }} />
      </> : <>
      <label htmlFor="answer" className="block font-semibold">{question.mode === "prints" ? "Your predicted output / behaviour" : "Your answer"}</label>
      {question.mode === "prints" && <p id="answer-help" className="text-sm text-gray-600">One log per line. Strings have no quotes; no extra labels. Match values and order exactly. Only outer whitespace and trailing spaces are ignored.</p>}
      <textarea id="answer" rows={question.mode === "implement" ? 12 : 5}
        className={question.mode === "implement" || question.mode === "prints" ? "font-mono" : ""}
        aria-describedby={question.mode === "prints" ? "answer-help" : undefined}
        spellCheck={false} value={answer} onChange={(e) => {
          setAnswer(e.target.value);
          scheduleDraft(e.target.value);
        }} disabled={revealed} required />
      </>}
      {!revealed && <button type="submit" disabled={!complete}>Submit answer</button>}
    </form>
    {revealed && <div className="space-y-5 border-t border-black pt-5">
      {structuredEvaluation && <div>
        <h3 className="font-bold">Structured feedback</h3>
        <p>Score: {Math.round(structuredEvaluation.score * 100)}%{structuredEvaluation.result === "miss" && structuredEvaluation.score === 0 ? " (critical mistakes or no correct parts)" : ""}</p>
        {question.structured!.fields.map((field) => <p key={field.id}>
          {field.label}: {structuredEvaluation.failed.includes(field.id) ? "Needs correction" : "Correct"}
          {field.severity === "critical" && structuredEvaluation.failed.includes(field.id) ? " (fundamental gap)" : ""}
        </p>)}
        <p>No manual grading: incomplete sets, wrong priorities and critical findings are scored deterministically.</p>
      </div>}
      <h3 ref={solution} tabIndex={-1} className="text-xl font-bold">Expected answer</h3>
      {question.mode === "prints" || question.structured ? <Code>{question.answer}</Code> : <p>{question.answer}</p>}
      {question.reference && <Code>{question.reference}</Code>}
      <div><h3 className="mb-2 font-bold">Why / Generalize</h3><p>{question.explanation}</p></div>
      {!attempt ? <div className="space-y-3">
        <p>Compare your original answer, not what you know after revealing. Count it correct only if the essential reasoning and requested fix are present.</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => grade("correct")}>I got it right</button>
          <button onClick={() => grade("partial")}>Partly right</button>
          <button onClick={() => grade("miss")}>I missed something</button>
        </div>
      </div> : <>
        <p role="status" className="font-bold">{`${attempt.finalResult === "correct" ? "Correct" : attempt.finalResult === "partial" ? "Partial" : "Not correct"}${question.mode !== "prints" && !question.structured ? " (self-assessed)" : ""}`}</p>
        <button onClick={onNext}>{sessionComplete ? "Finish session" : "Next question"}</button>
      </>}
    </div>}
  </section>;
}
