import { allConcepts as concepts, type ActiveMode, type Attempt, type Concept, type Progress, type Question, type ReadinessConfig, type Result } from "./model";
import { evaluateStructured, structuredComplete } from "./structured";

export const implementationGroups = [
  { id: "debounce", label: "Complete trailing debounce once", questions: ["timing-debounce", "implement-debounce-controls"] },
  { id: "higher-order", label: "Implement a basic curried function", questions: ["curry-sum"] },
  { id: "guard", label: "Complete one TypeScript runtime guard", questions: ["ts-guard", "implement-unknown-array-guard"] },
];

const misconceptions: { tag: string; concept: Concept; pattern: RegExp; explanation: string; negativeClaim?: boolean }[] = [
  { tag: "promise-macrotask", concept: "eventLoop", pattern: /(?:promise|then|reaction|promise callback)s?.{0,20}(?:run|use|are|go|queued).{0,15}(?:\bmacro.?task|\btask queue)/i,
    explanation: "Promise reactions use microtasks, not the task/macrotask queue." },
  { tag: "microtasks-after-timers", concept: "eventLoop", pattern: /microtasks?.{0,20}(?:run|drain|execute).{0,10}after.{0,15}(?:timer|macro.?task|timeout)/i,
    explanation: "Microtasks drain before the next timer task." },
  { tag: "classical-inheritance", concept: "prototypes", pattern: /(?:javascript )?classes.{0,15}(?:use|have|implement).{0,15}classical inheritance/i,
    explanation: "JavaScript classes use prototypes underneath; they do not replace prototype inheritance." },
  { tag: "spread-deep-clone", concept: "copying", pattern: /(?:spread|shallow cop(?:y|ies)|\{\s*\.\.\.).{0,25}(?:deep.?clon|deep.?cop|recursively clon)/i,
    explanation: "Spread copies only one level; nested objects remain shared references." },
  { tag: "unknown-unsafe", concept: "typescript", pattern: /unknown.{0,25}(?:can be used freely|needs no narrowing|requires no checks|bypasses type)/i,
    explanation: "unknown requires checking/narrowing before unsafe operations." },
  { tag: "promise-not-microtask", concept: "eventLoop", negativeClaim: true,
    pattern: /(?:promise|then|reaction|callback)s?.{0,25}(?:not|never|aren't|don't).{0,20}(?:run|use|queued|microtask).{0,15}microtask|promise.{0,25}(?:not|aren't).{0,10}microtasks/i,
    explanation: "Promise reactions do run as microtasks." },
  { tag: "arrow-not-lexical", concept: "this", negativeClaim: true,
    pattern: /arrow.{0,25}(?:not|never|don't|doesn't).{0,20}(?:capture|retain|use).{0,25}(?:lexical|enclosing).{0,15}this/i,
    explanation: "Arrows capture lexical this from the enclosing invocation." },
  { tag: "spread-independent-nested", concept: "copying", negativeClaim: true,
    pattern: /(?:spread|shallow cop(?:y|ies)).{0,40}nested.{0,25}(?:not shared|independent|separate|not aliased)/i,
    explanation: "Shallow copies retain shared nested references; they do not isolate nested mutation." },
  { tag: "unknown-without-narrowing", concept: "typescript", negativeClaim: true,
    pattern: /unknown.{0,35}(?:without narrowing|does not require narrowing|doesn't need checking)/i,
    explanation: "Unsafe operations on unknown need narrowing/validation first." },
  { tag: "promise-all-waits-for-all", concept: "promises", pattern: /promise\.all.{0,80}(?:waits?|settles?).{0,50}(?:every|all).{0,30}(?:reject|settle)|promise\.all.{0,80}(?:rejects?|fails?).{0,25}(?:only|after|when).{0,30}(?:every|all).{0,20}(?:settle|reject)/i,
    explanation: "Promise.all rejects when an input rejection is observed; it does not wait for all inputs to settle." },
  { tag: "typescript-union-no-narrowing", concept: "typescript", negativeClaim: true,
    pattern: /(?:union|discriminated union|narrowing).{0,55}(?:does not|doesn't|don't|never|no need).{0,30}(?:need|require|necessary|narrow)|(?:no need|unnecessary).{0,30}narrow/i,
    explanation: "A union must be narrowed before accessing members that are not shared by every variant." },
  { tag: "tdz-reads-undefined", concept: "scope",
    pattern: /(?:let|const|lexical binding|tdz|temporal dead zone).{0,55}(?:read|access|use|returns?|gives?).{0,35}undefined|typeof.{0,40}(?:let|const|lexical).{0,40}(?:returns?|is).{0,15}undefined/i,
    explanation: "Reading a let/const binding in its temporal dead zone throws ReferenceError; it does not produce undefined." },
];

export function mistakeTags(question: Question, answer: string) {
  if (question.structured) return structuredComplete(question, answer) ? evaluateStructured(question, answer).mistakeTags : [];
  const statements = answer.split(/[!?;\n]+|\.(?=\s|$)/);
  return misconceptions.filter((m) => question.concepts.includes(m.concept) &&
    statements.some((clause) =>
      !/\b(?:incorrect|false|wrong|not true)\b/i.test(clause) &&
      (m.negativeClaim || !/\b(?:not|never|doesn't|cannot|can't)\b/i.test(clause)) && m.pattern.test(clause)))
    .map((m) => m.tag);
}

export function allowedMistakeTags(question: Question) {
  if (question.structured) return question.structured.fields.flatMap((field) => field.misconceptionTag ? [field.misconceptionTag] : []);
  if (question.mode === "legacyConcept") return [];
  return misconceptions.filter((m) => question.concepts.includes(m.concept)).map((m) => m.tag);
}

export const accuracy = (attempts: Attempt[]) =>
  attempts.length ? attempts.reduce((sum, a) => sum + (a.score ?? (a.finalResult === "correct" ? 1 : a.finalResult === "partial" ? 0.5 : 0)), 0) / attempts.length : 0;
function latestUniqueQuestions(attempts: Attempt[], limit = Number.POSITIVE_INFINITY) {
  const seen = new Set<string>();
  const latest: Attempt[] = [];
  for (let index = attempts.length - 1; index >= 0 && latest.length < limit; index--) {
    const attempt = attempts[index];
    if (seen.has(attempt.questionId)) continue;
    seen.add(attempt.questionId);
    latest.push(attempt);
  }
  return latest.reverse();
}
const isCore = (a: Attempt, bank: Question[]) => {
  const question = bank.find((q) => q.id === a.questionId);
  return question !== undefined && question.mode !== "legacyConcept" &&
    (question.depth !== "optional" || (a.finalResult !== "correct" && a.mistakeTags.length > 0));
};
const related = (progress: Progress, concept: Concept, bank: Question[]) =>
  progress.attempts.filter((a) => a.concepts.includes(concept) && isCore(a, bank));

function recovered(progress: Progress, after: number, concept: Concept) {
  const passes = progress.attempts.map((a, index) => ({ a, index })).filter(({ a, index }) =>
    index > after && a.concepts.includes(concept) && a.finalResult === "correct");
  const eligibleQuestions = new Set<string>();
  let nextEarlier = 0;
  for (const later of passes) {
    while (nextEarlier < passes.length && passes[nextEarlier].index <= later.index - 3) {
      eligibleQuestions.add(passes[nextEarlier].a.questionId);
      nextEarlier++;
    }
    if (eligibleQuestions.size > 1 ||
        (eligibleQuestions.size === 1 && !eligibleQuestions.has(later.a.questionId))) return true;
  }
  return false;
}

export function unresolvedTags(progress: Progress, concept: Concept, bank: Question[] = []) {
  const tags = new Set([...misconceptions.filter((m) => m.concept === concept).map((m) => m.tag),
    ...bank.filter((q) => q.concepts.includes(concept) && q.structured).flatMap(allowedMistakeTags)]);
  return [...tags].filter((tag) => {
    const misses = progress.attempts.map((a, index) => ({ a, index })).filter(({ a }) =>
      a.finalResult !== "correct" && a.mistakeTags.includes(tag));
    return misses.length >= 2 && !recovered(progress, misses.at(-1)!.index, concept);
  });
}

export function mastery(progress: Progress, concept: Concept, bank: Question[] = [],
  conceptualMode: ActiveMode = "reconstruction") {
  const allRelated = related(progress, concept, bank);
  const attempts = latestUniqueQuestions(allRelated);
  const recent = latestUniqueQuestions(allRelated.slice(-6), 6);
  const hard = latestUniqueQuestions(attempts.filter((a) => a.difficulty === "hard"), 10);
  const total = attempts.length;
  const varied = new Set(attempts.map((a) => a.questionId)).size >= 2;
  const recurring = unresolvedTags(progress, concept, bank);
  const weak = (recent.length >= 3 && accuracy(recent) < 0.7) || recurring.length > 0;
  const reconstruction = attempts.some((a) => bank.find((q) => q.id === a.questionId)?.mode === conceptualMode && a.finalResult === "correct");
  const practical = attempts.some((a) => {
    const mode = bank.find((q) => q.id === a.questionId)?.mode;
    return mode !== undefined && mode !== conceptualMode && mode !== "legacyConcept" && a.finalResult === "correct";
  });
  const isReview = concept === "reactReview";
  const reconstructed = isReview ? true : reconstruction;
  const ready = total >= 3 && recent.length >= 3 && varied && reconstructed && practical && !weak;
  return {
    total, correct: attempts.filter((a) => a.finalResult === "correct").length,
    recentCount: recent.length, recentAccuracy: accuracy(recent), hardAccuracy: accuracy(hard),
    hardEvidence: hard.length >= 2, recurring, reconstruction: reconstructed, practical, varied,
    status: weak ? "Weak" : ready ? "Ready" : total >= 2 ? "Almost Ready" : "Learning",
  };
}

export function readiness(progress: Progress, bank: Question[], config: ReadinessConfig = {
  concepts: [...new Set(bank.flatMap((question) => question.concepts))],
  conceptualMode: "reconstruction",
  requiredImplementationGroups: bank.some((question) => question.module === "react")
    ? [] : implementationGroups.map((group) => group.id),
  reviewGate: bank.some((question) => question.module === "react") ? {
    mode: "codeReview",
    realisticReviewLevel: 3,
    minimumReviews: 3,
    minimumReviewAccuracy: 0.8,
    minimumRealisticReviews: 2,
    minimumRealisticAccuracy: 0.8,
    requireNoRealisticMiss: true,
    label: "20. Demonstrate review judgment: 3 distinct reviews, including 2 realistic reviews at 80%, with no fundamental miss",
  } : undefined,
}) {
  const subjectConcepts = config.concepts;
  const mustDo: { id: string; label: string; concept?: Concept }[] = [];
  const states = subjectConcepts.map((concept) => {
    const state = mastery(progress, concept, bank, config.conceptualMode);
    if (state.status !== "Ready") {
      const reason = state.recurring.length ? "recurring core misconception"
        : state.status === "Weak" ? "recent core accuracy below 70%"
        : state.total < 3 ? `${3 - state.total} more core question${state.total === 2 ? "" : "s"}`
        : state.recentCount < 3 ? "practice 3 distinct questions recently"
        : !state.varied ? "try a different question"
        : !state.reconstruction ? "complete reconstruction correctly once" : "solve a practical question";
      mustDo.push({ id: concept, concept, label: `${concepts[concept]}: ${reason}` });
    }
    return state;
  });
  const core = progress.attempts.filter((a) => isCore(a, bank));
  const recent = latestUniqueQuestions(core.slice(-30), 30);
  const medium = latestUniqueQuestions(core.filter((a) => a.difficulty === "medium").slice(-10), 10);
  const hard = latestUniqueQuestions(core.filter((a) => a.difficulty === "hard").slice(-10), 10);
  const debug = latestUniqueQuestions(core.filter((a) => bank.find((q) => q.id === a.questionId)?.mode === "debug").slice(-6), 6);
  if (recent.length < 20 || accuracy(recent) < 0.82) mustDo.push({
    id: "recent", label: recent.length < 20 ? `${20 - recent.length} more distinct core questions` : "Recent core accuracy: aim for 82%, not 100%",
  });
  if (medium.length < 6 || new Set(medium.map((a) => a.questionId)).size < 3 || accuracy(medium) < 0.8)
    mustDo.push({ id: "medium", label: "Handle medium questions consistently (6 distinct questions, 3 variants, 80%)" });
  if (hard.length < 3 || new Set(hard.map((a) => a.questionId)).size < 2)
    mustDo.push({ id: "hard", label: "Attempt 3 core hard questions across 2 variants to expose gaps; passing all is not required" });
  if (debug.length < 3 || new Set(debug.map((a) => a.questionId)).size < 2 || accuracy(debug) < 0.7)
    mustDo.push({ id: "debug", label: "Complete debugging/code reasoning: 3 distinct questions across 2 variants with 70% accuracy" });
  const latestResults = new Map(latestUniqueQuestions(progress.attempts).map((attempt) =>
    [attempt.questionId, attempt.finalResult]));
  const completedImplementations = bank.filter((q) =>
    q.mode === "implement" && latestResults.get(q.id) === "correct").map((q) => q.id);
  for (const group of implementationGroups.filter((candidate) =>
    config.requiredImplementationGroups.includes(candidate.id))) {
    if (!group.questions.some((id) => completedImplementations.includes(id)))
      mustDo.push({ id: group.id, label: group.label });
  }
  const reviewGate = config.reviewGate;
  if (reviewGate) {
    const reviews = latestUniqueQuestions(core.filter((attempt) =>
      bank.find((question) => question.id === attempt.questionId)?.mode === reviewGate.mode)
      .slice(-reviewGate.minimumReviews * 2), reviewGate.minimumReviews);
    const realistic = latestUniqueQuestions(core.filter((attempt) =>
      bank.find((question) => question.id === attempt.questionId)?.reviewLevel === reviewGate.realisticReviewLevel)
      .slice(-reviewGate.minimumRealisticReviews * 2), reviewGate.minimumRealisticReviews);
    if (reviews.length < reviewGate.minimumReviews || accuracy(reviews) < reviewGate.minimumReviewAccuracy ||
        realistic.length < reviewGate.minimumRealisticReviews ||
        accuracy(realistic) < reviewGate.minimumRealisticAccuracy ||
        (reviewGate.requireNoRealisticMiss && realistic.some((attempt) => attempt.finalResult === "miss"))) {
      mustDo.push({ id: "realistic-review", label: reviewGate.label });
    }
  }
  const canDoLater = bank.filter((q) => q.mode !== "legacyConcept" && q.depth === "optional" && !progress.attempts.some((a) =>
    a.questionId === q.id && a.finalResult === "correct"));
  const warnings = subjectConcepts.filter((c) =>
    progress.attempts.filter((a) => a.concepts.includes(c) && a.overridden).length >= 3)
    .map((c) => `Several ${concepts[c]} answers were manually overridden. Consider one extra review to confirm understanding. This does not block readiness.`);
  return {
    status: mustDo.length === 0 ? "READY TO MOVE ON" : states.filter((s) => s.status === "Ready").length >= 7 ? "ALMOST READY" : "BUILDING READINESS",
    mustDo, canDoLater, warnings, coreCoverage: states.filter((s) => s.total > 0).length,
    recentAccuracy: accuracy(recent), mediumAccuracy: accuracy(medium), hardAccuracy: accuracy(hard),
    hardAttempts: hard.length, completedImplementations,
    conceptPerformance: Object.fromEntries(subjectConcepts.map((c, index) => [c, states[index]])),
  };
}

export function weaknessCards(progress: Progress, bank: Question[]) {
  const missesByQuestion = new Map<string, { a: Attempt; index: number }[]>();
  progress.attempts.forEach((a, index) => {
    if (a.finalResult === "correct" || !isCore(a, bank)) return;
    const misses = missesByQuestion.get(a.questionId) ?? [];
    misses.push({ a, index });
    missesByQuestion.set(a.questionId, misses);
  });
  const bankConceptList = [...new Set(bank.flatMap((question) => question.concepts))];
  const weakConcepts = new Set(bankConceptList.filter((concept) =>
    mastery(progress, concept, bank).status === "Weak"));
  return bank.filter((q) => {
    const misses = missesByQuestion.get(q.id) ?? [];
    const last = misses.at(-1);
    if (!last) return false;
    const recentMisses = misses.filter(({ index }) => index >= progress.attempts.length - 30);
    const weak = q.concepts.some((concept) => weakConcepts.has(concept));
    if (recentMisses.length < 2 && !weak && !last.a.mistakeTags.length) return false;
    const review = progress.reviews[q.id];
    return !(review?.successful && review.afterAttempt > last.index &&
      q.concepts.every((c) => recovered(progress, review.afterAttempt - 1, c)));
  });
}

export function reviewCard(progress: Progress, questionId: string, successful: boolean): Progress {
  return { ...progress, reviews: { ...progress.reviews, [questionId]: { successful, afterAttempt: progress.attempts.length } } };
}

export function selectQuestion(bank: Question[], mode: ActiveMode | null, progress: Progress): Question | undefined {
  const checkpoint = readiness(progress, bank);
  const candidates = bank.filter((q) => q.mode !== "legacyConcept" && (!mode || q.mode === mode));
  const recentIds = progress.recentQuestions.length ? progress.recentQuestions.slice(-5) : progress.attempts.slice(-5).map((a) => a.questionId);
  const lastId = progress.resume?.questionId ?? progress.attempts.at(-1)?.questionId;
  const notRecent = candidates.filter((q) => !recentIds.includes(q.id) && q.id !== lastId);
  const pool = notRecent.length ? notRecent : candidates.filter((q) => q.id !== lastId);
  const available = pool.length ? pool : candidates;
  const ids = checkpoint.mustDo.map((gap) => gap.id);
  const targetConcepts = checkpoint.mustDo.flatMap((gap) => gap.concept ? [gap.concept] : []);
  const previousMode = bank.find((q) => q.id === progress.attempts.at(-1)?.questionId)?.mode;
  const rank = (q: Question) => {
    let score = 0;
    if (!ids.length) score += q.depth === "optional" ? 50 : (progress.attempts.length % 5 === 0 ? 55 : 0);
    else {
      if (q.depth === "core") score += 20;
      if (q.depth === "core" && q.concepts.some((c) => targetConcepts.includes(c))) score += 50;
      if (q.concepts.some((c) => checkpoint.conceptPerformance[c].status === "Weak")) score += 40;
      if (implementationGroups.some((group) => ids.includes(group.id) && group.questions.includes(q.id))) score += 75;
      if (ids.includes("debug") && q.mode === "debug") score += 30;
      if (q.module === "react" && q.depth === "core") {
        if (q.mode === "codeReview") score += ids.includes("realistic-review") ? 65 : targetConcepts.includes("reactReview") ? 25 : 0;
        if (q.reviewLevel === 3 && ids.includes("realistic-review") && progress.attempts.length >= 5) score += 30;
        if (q.concepts.some((c) => ["reactEffects", "reactState", "reactPerformance"].includes(c) && targetConcepts.includes(c))) score += 12;
        if (q.mode === "reconstruction" && q.concepts.some((c) => !checkpoint.conceptPerformance[c].reconstruction)) score += 35;
      }
      if (ids.includes("hard") && progress.attempts.length >= 5 && q.difficulty === "hard") score += 30;
      if (ids.includes("medium") && progress.attempts.length >= 2 && q.difficulty === "medium") score += 25;
      const total = Math.min(...q.concepts.map((c) => checkpoint.conceptPerformance[c].total));
      score += q.difficulty === (total === 0 ? "easy" : "medium") ? 10 : 0;
      if (q.mode === "reconstruction" && q.concepts.some((c) => !checkpoint.conceptPerformance[c].reconstruction)) score += 15;
      if (q.mode !== previousMode) score += 8;
      if (progress.attempts.length > 0 && progress.attempts.length % 8 === 0 &&
          q.depth === "core" && q.concepts.every((c) => checkpoint.conceptPerformance[c].status === "Ready")) score += 85;
    }
    const lastSeen = progress.attempts.findLastIndex((a) => a.questionId === q.id);
    return score - (lastSeen + 1) / (progress.attempts.length + 1);
  };
  return available.map((question) => ({ question, rank: rank(question) }))
    .toSorted((a, b) => b.rank - a.rank)[0]?.question;
}

export function checkOutput(response: string, expected: string) {
  const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim().split("\n").map((line) => line.trimEnd()).join("\n");
  return response.trim().length > 0 && normalize(response) === normalize(expected);
}

export function recordAttempt(progress: Progress, question: Question, result: boolean | Result, timestamp = Date.now(),
  answer = "", autoResult: Result | null = null): Progress {
  const finalResult = typeof result === "boolean" ? result ? "correct" : "miss" : result;
  const evaluation = question.structured ? evaluateStructured(question, answer) : null;
  if (evaluation && (evaluation.result !== finalResult || autoResult !== finalResult)) {
    throw new Error("Structured attempts must use the deterministic grade.");
  }
  const attempts = [...progress.attempts, {
    questionId: question.id, concepts: question.concepts, difficulty: question.difficulty,
    correct: finalResult === "correct", timestamp, autoResult, finalResult,
    overridden: autoResult !== null && autoResult !== finalResult,
    mistakeTags: question.structured || question.mode === "debug" ? mistakeTags(question, answer) : [],
    ...(evaluation ? { score: evaluation.score, failedFields: evaluation.failed } : {}),
  }];
  return { ...progress, attempts, session: progress.session ? {
    ...progress.session, completed: attempts.length - progress.session.startAttempt >= progress.session.size,
  } : null };
}

export function overrideAttempt(progress: Progress, index: number, finalResult: Result): Progress {
  if (!progress.attempts[index]) throw new Error("Cannot override a missing attempt.");
  if (progress.attempts[index].score !== undefined) throw new Error("Structured grades cannot be overridden.");
  return { ...progress, attempts: progress.attempts.map((a, i) => i === index ? {
    ...a, finalResult, correct: finalResult === "correct", overridden: a.autoResult !== null && a.autoResult !== finalResult,
  } : a) };
}

export function startSession(progress: Progress, size: 10 | 20 | 30, bank: Question[]): Progress {
  return { ...progress, resume: null, session: { size, startAttempt: progress.attempts.length,
    initialMustDo: readiness(progress, bank).mustDo.map((gap) => gap.id),
    initialCards: weaknessCards(progress, bank).map((q) => q.id), completed: false } };
}

export function sessionSummary(progress: Progress, bank: Question[]) {
  if (!progress.session) return null;
  const checkpoint = readiness(progress, bank);
  return {
    completed: progress.session.completed,
    questions: progress.attempts.length - progress.session.startAttempt,
    resolved: progress.session.initialMustDo.filter((id) => !checkpoint.mustDo.some((gap) => gap.id === id)).length,
    remaining: checkpoint.mustDo.length,
    newWeaknesses: weaknessCards(progress, bank).filter((q) => !progress.session!.initialCards.includes(q.id)).length,
    status: checkpoint.status,
  };
}
