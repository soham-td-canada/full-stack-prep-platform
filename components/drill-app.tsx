"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import StructuredAnswer from "./structured-answer";
import { evaluateStructured, structuredComplete } from "@/lib/structured";
import {
  checkOutput, readiness, recordAttempt,
  reviewCard, selectQuestion, sessionSummary, startSession, weaknessCards,
} from "@/lib/learning";
import { allConcepts, allModes, emptyProgress, type ActiveMode, type ModuleId, type Attempt, type Concept, type Progress, type Question, type Result } from "@/lib/model";
import { moduleRegistry } from "@/lib/modules";
import { progressStores as stores } from "@/lib/progress-stores";

function Code({ children }: { children: string }) {
  return <pre tabIndex={0} className="overflow-x-auto border border-gray-300 bg-gray-50 p-5 text-base leading-7"><code>{children}</code></pre>;
}

export default function DrillApp({ moduleId = "javascript-typescript" }: { moduleId?: ModuleId }) {
  const store = stores[moduleId];
  const trainingModule = moduleRegistry[moduleId];
  const { questions, modes, concepts } = trainingModule;
  const { progress, loaded, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [mode, setMode] = useState<ActiveMode | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [sessionSize, setSessionSize] = useState<10 | 20 | 30>(10);
  const [reviewing, setReviewing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [cardRevealed, setCardRevealed] = useState(false);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const cards = weaknessCards(progress, questions);
  const activeCard = cards[reviewIndex];
  const lastMistake = progress.attempts.findLast((a) => a.questionId === activeCard?.id && a.finalResult !== "correct");
  const cardField = activeCard?.structured?.fields.find((field) => field.misconceptionTag && lastMistake?.mistakeTags.includes(field.misconceptionTag))
    ?? activeCard?.structured?.fields.find((field) => lastMistake?.failedFields?.includes(field.id))
    ?? activeCard?.structured?.fields[0];
  const structuredCard: Question | undefined = activeCard?.structured && cardField
    ? { ...activeCard, structured: { ...activeCard.structured, fields: [cardField] } } : undefined;
  const reviewComplete = structuredCard ? structuredComplete(structuredCard, reviewAnswer) : !!reviewAnswer.trim();
  const checkpoint = readiness(progress, questions, trainingModule.readinessConfig);
  const summary = sessionSummary(progress, questions);
  useEffect(() => { store.hydrate(); }, [store]);

  function open(next: Question, selectedMode: ActiveMode | null, current: Progress) {
    setMode(selectedMode);
    setQuestion(next);
    setReviewing(false);
    store.update({ ...current, recentQuestions: [...current.recentQuestions, next.id].slice(-10),
      resume: { questionId: next.id, answer: "", revealed: false, attemptIndex: null, practiceMode: selectedMode } });
  }
  function start(selectedMode: ActiveMode | null) {
    const current = store.getSnapshot().progress;
    const session = !current.session || current.session.completed ? startSession(current, sessionSize, questions) : current;
    const next = selectQuestion(questions, selectedMode, session);
    if (!next) throw new Error(`No questions available for ${selectedMode ?? "must-do practice"}.`);
    open(next, selectedMode, session);
  }
  function nextQuestion() {
    const current = store.getSnapshot().progress;
    if (current.session?.completed) {
      home();
      return;
    }
    const next = selectQuestion(questions, mode, current);
    if (!next) throw new Error("No next question available.");
    open(next, mode, current);
  }
  function home() {
    setMode(null);
    setQuestion(null);
    setReviewing(false);
  }
  function resume() {
    const saved = progress.resume;
    const last = questions.find((q) => q.id === saved?.questionId);
    if (!last || (progress.session?.completed && saved?.attemptIndex === null)) {
      start(null);
      return;
    }
    setMode(saved?.practiceMode === undefined || saved.practiceMode === null
      ? last.mode === "legacyConcept" ? "reconstruction" : last.mode
      : saved.practiceMode === "legacyConcept" ? "reconstruction" : saved.practiceMode);
    setQuestion(last);
    setReviewing(false);
  }
  function continueMustDo() {
    const last = questions.find((q) => q.id === progress.resume?.questionId);
    if (last?.depth === "core" && progress.resume?.attemptIndex === null && !progress.session?.completed &&
        checkpoint.mustDo.some((gap) => gap.concept && last.concepts.includes(gap.concept))) resume();
    else start(null);
  }
  const saved = question?.id === progress.resume?.questionId ? progress.resume : null;
  const attempt = saved?.attemptIndex !== null && saved?.attemptIndex !== undefined ? progress.attempts[saved.attemptIndex] : undefined;

  return (
    <div className="space-y-8">
      {error && <p role="alert" className="border border-black p-4 text-sm">{error}</p>}
      {!loaded ? <p role="status">Loading local progress...</p> : question ? (
        <Training key={question.id} question={question} saved={saved} attempt={attempt}
          sessionLabel={`${summary?.questions ?? 0} / ${progress.session?.size ?? sessionSize} questions`}
          sessionComplete={progress.session?.completed ?? false}
          onHome={home} onNext={nextQuestion}
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
          />
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
          <ModuleDashboard selected={moduleId} />
          {summary?.completed && <section className="space-y-2 border border-black p-5" aria-labelledby="session-heading">
            <h2 id="session-heading" className="text-xl font-bold">SESSION COMPLETE</h2>
            <p>Questions completed: {summary.questions}</p>
            <p>Must-do gaps resolved: {summary.resolved} / Remaining: {summary.remaining}</p>
            <p>New weaknesses detected: {summary.newWeaknesses}</p>
            <p>Current status: {summary.status}</p>
            <p>Recommended next action: {summary.status === "READY TO MOVE ON" ? "Move to the next interview topic." : "Complete remaining MUST DO items when you return."}</p>
          </section>}
          <section className="space-y-3 border border-gray-300 p-5" aria-labelledby="continue-heading">
            <h2 id="continue-heading" className="font-bold">CONTINUE</h2>
            <p>Last session: {progress.resume ? `${questions.find((q) => q.id === progress.resume?.questionId)?.concepts.map((c) => allConcepts[c]).join(" / ")} / ${allModes[questions.find((q) => q.id === progress.resume?.questionId)!.mode]}` : "Not started"}</p>
            <p>Current MUST DO: {checkpoint.mustDo.length} / Overall status: {checkpoint.status}</p>
            {checkpoint.mustDo.length > 0 ? <button onClick={continueMustDo}>{moduleId === "react" ? "Continue React Must-Do" : "Continue Must-Do Practice"}</button>
              : <p className="font-bold">Recommended next step: Move to the next interview topic.</p>}
            {progress.resume && <button onClick={resume}>Resume saved question</button>}
            <label className="block" htmlFor="session-size">Optional session limit</label>
            <select id="session-size" value={sessionSize} onChange={(e) => {
              const size = Number(e.target.value);
              if (size === 10 || size === 20 || size === 30) setSessionSize(size);
            }}>
              {[10, 20, 30].map((size) => <option key={size} value={size}>{size} questions</option>)}
            </select>
            {progress.session && !progress.session.completed && <p>Active session: {summary?.questions} / {progress.session.size} questions. The selected limit applies to your next session.</p>}
          </section>
          <nav aria-label="Training modes" className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(modes) as ActiveMode[]).map((key) => <button key={key} onClick={() => start(key)}
              className="min-h-20 text-left text-xl">{allModes[key]}{!checkpoint.mustDo.length && <span className="block text-sm">Optional extra practice</span>}</button>)}
          </nav>
          <section className="space-y-4" aria-labelledby="readiness-heading">
            <h2 id="readiness-heading" className="text-xl font-bold">{moduleId === "react" ? "REACT READINESS" : "JS / TS READINESS"}</h2>
            <strong>{checkpoint.status}</strong>
            <p>Must-do: {checkpoint.mustDo.length} / Core coverage: {checkpoint.coreCoverage} / 10</p>
            <p>Recent core score: {Math.round(checkpoint.recentAccuracy * 100)}% / Medium: {Math.round(checkpoint.mediumAccuracy * 100)}% / Hard: {Math.round(checkpoint.hardAccuracy * 100)}% ({checkpoint.hardAttempts} recent attempts)</p>
            <p className="text-sm text-gray-600">Three distinct core questions per area, structured reconstruction and practical success, 82% recent core score, 80% medium accuracy, hard/debug exposure, and required core implementations or reviews. Optional depth and flashcard scores never substitute for game evidence. Repeated critical misconceptions block readiness. Practice verbal explanations separately.</p>
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
                  const current = !progress.session || progress.session.completed ? startSession(progress, sessionSize, questions) : progress;
                  open(q, null, current);
                }}>{q.prompt}</button>
              </li>)}</ul>
            </details>
            {checkpoint.warnings.map((warning) => <p key={warning} className="border-l-2 border-gray-400 pl-4 text-sm">{warning}</p>)}
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

function ModuleDashboard({ selected }: { selected: ModuleId }) {
  useEffect(() => { Object.values(stores).forEach((store) => store.hydrate()); }, []);
  return <nav aria-label="Interview modules" className="grid gap-3 sm:grid-cols-2">
    {Object.values(moduleRegistry).map((trainingModule) => <ModuleCard key={trainingModule.id} trainingModule={trainingModule} selected={selected} />)}
  </nav>;
}

function ModuleCard({ trainingModule, selected }: {
  trainingModule: (typeof moduleRegistry)[ModuleId];
  selected: ModuleId;
}) {
  const store = stores[trainingModule.id];
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const state = readiness(snapshot.progress, trainingModule.questions, trainingModule.readinessConfig);
  const weak = Object.entries(state.conceptPerformance).filter(([, value]) => value.status === "Weak");
  const resume = trainingModule.questions.find((q) => q.id === snapshot.progress.resume?.questionId);
  return <div className="space-y-2 border border-gray-300 p-4">
    <Link href={trainingModule.path} className="font-bold underline">{trainingModule.title}</Link>
    <p>{snapshot.loaded ? state.status === "READY TO MOVE ON" ? state.status : "IN PROGRESS" : "Loading..."}</p>
    <p>MUST DO: {state.mustDo.length} remaining / CAN DO LATER: {state.canDoLater.length}</p>
    <p>Recent core performance: {state.coreCoverage ? `${Math.round(state.recentAccuracy * 100)}%` : "--"}</p>
    <p>Resume point: {resume ? resume.concepts.map((id) => allConcepts[id]).join(" / ") : "Not started"}</p>
    {weak.length > 0 && <p>Weak areas: {weak.map(([id]) => allConcepts[id as Concept]).join(", ")}</p>}
    {snapshot.error && trainingModule.id !== selected && <p role="alert">{trainingModule.title}: {snapshot.error}</p>}
  </div>;
}

function Training({ question, saved, attempt, sessionLabel, sessionComplete, onGrade, onDraft, onNext, onHome }: {
  question: Question;
  saved: Progress["resume"];
  attempt?: Attempt;
  sessionLabel: string;
  sessionComplete: boolean;
  onGrade: (result: Result, answer: string, autoResult: Result | null) => void;
  onDraft: (answer: string, revealed: boolean) => void;
  onNext: () => void;
  onHome: () => void;
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
    <button onClick={() => {
      saveDraftNow(answer, revealed);
      onHome();
    }}>Back to dashboard</button>
    <p className="text-sm uppercase tracking-wide">{allModes[question.mode]} / {question.difficulty} / {question.depth === "core" ? "CORE INTERVIEW PRACTICE" : "OPTIONAL DEPTH"}</p>
    <p>{sessionLabel}</p>
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
