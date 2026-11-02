import { accuracy, defaultPracticeThresholds, implementationGroups, isCore, latestUniqueQuestions, readiness } from "./learning";
import { type ActiveMode, type Attempt, type Progress, type Question } from "./model";
import type { TrainingModule } from "./modules";

export type ModeState = "required" | "required-work-complete" | "complete";
export interface ModeWork {
  mode: ActiveMode;
  available: number;
  attempted: number;
  unseen: number;
  optional: number;
  requiredRemaining: number;
  state: ModeState;
  breakdown: { label: string; count: number }[];
}
export interface RequiredWork {
  totalRequiredRemaining: number;
  modes: ModeWork[];
  priority: ModeWork[];
  plan: string[];
  optional: number;
  mustDoAreas: number;
  status: "NOT STARTED" | "IN PROGRESS" | "READY TO MOVE ON";
}

type Gap = { id: string; label: string; deficit: number };
const cache = new WeakMap<Progress["attempts"], Map<TrainingModule, RequiredWork>>();

function evidenceGaps(progress: Progress, module: TrainingModule): Gap[] {
  const bank = module.questions;
  const config = module.readinessConfig;
  const state = readiness(progress, bank, config);
  const core = progress.attempts.filter((a) => isCore(a, bank));
  const thresholds = config.practiceThresholds ?? defaultPracticeThresholds;
  const byId = new Map(bank.map((q) => [q.id, q]));
  const gaps: Gap[] = [];
  function add(id: string, label: string, deficit: number) {
    if (state.mustDo.some((gap) => gap.id === id)) gaps.push({ id, label, deficit: Math.max(0.001, deficit) });
  }
  // Accuracy distance is continuous so replacement evidence is useful even before a gate clears.
  function distance(attempts: Attempt[], minimum: number, target = 0) {
    return Math.max(0, minimum - attempts.length) + Math.max(0, target - accuracy(attempts)) * Math.max(minimum, attempts.length);
  }
  for (const concept of config.concepts) {
    const c = state.conceptPerformance[concept];
    const gap = state.mustDo.find((g) => g.id === concept);
    if (!gap) continue;
    let recovery = 0;
    for (const tag of c.recurring) {
      const lastMiss = progress.attempts.findLastIndex((a) => a.finalResult !== "correct" && a.mistakeTags.includes(tag));
      const passes = progress.attempts.slice(lastMiss + 1).filter((a) => a.finalResult === "correct" && a.concepts.includes(concept));
      recovery += Math.max(0.25, 2 - new Set(passes.map((a) => a.questionId)).size);
    }
    add(concept, gap.label.split(":")[0], Math.max(0, 3 - c.total) +
      Number(!c.reconstruction) + Number(!c.practical) +
      Math.max(0, 0.7 - c.recentAccuracy) * 3 + recovery);
  }
  const recent = latestUniqueQuestions(core.slice(-Math.max(30, thresholds.recentCoreWindow)), thresholds.recentCoreWindow);
  const medium = latestUniqueQuestions(core.filter((a) => a.difficulty === "medium").slice(-10), 10);
  const hard = latestUniqueQuestions(core.filter((a) => a.difficulty === "hard").slice(-10), 10);
  const debug = latestUniqueQuestions(core.filter((a) => byId.get(a.questionId)?.mode === "debug").slice(-6), 6);
  add("recent", "Core validation", distance(recent, thresholds.minimumCoreQuestions, thresholds.minimumRecentAccuracy));
  add("medium", "Medium validation", distance(medium, Math.max(thresholds.minimumMediumQuestions, thresholds.minimumMediumDistinct), thresholds.minimumMediumAccuracy));
  add("hard", "Hard validation", distance(hard, Math.max(thresholds.minimumHardQuestions, thresholds.minimumHardDistinct)));
  add("debug", "Debugging validation", distance(debug, Math.max(thresholds.minimumDebugQuestions, thresholds.minimumDebugDistinct), thresholds.minimumDebugAccuracy));
  for (const group of implementationGroups) add(group.id, group.label, 1);
  const gate = config.reviewGate;
  if (gate) {
    const reviews = latestUniqueQuestions(core.filter((a) => byId.get(a.questionId)?.mode === gate.mode)
      .slice(-gate.minimumReviews * 2), gate.minimumReviews);
    const realistic = latestUniqueQuestions(core.filter((a) => byId.get(a.questionId)?.reviewLevel === gate.realisticReviewLevel)
      .slice(-gate.minimumRealisticReviews * 2), gate.minimumRealisticReviews);
    add("realistic-review", "Realistic review validation",
      distance(reviews, gate.minimumReviews, gate.minimumReviewAccuracy) +
      distance(realistic, gate.minimumRealisticReviews, gate.minimumRealisticAccuracy) +
      (gate.requireNoRealisticMiss ? realistic.filter((a) => a.finalResult === "miss").length : 0));
  }
  for (const dimension of config.readinessDimensions ?? []) {
    const d = state.dimensionPerformance[dimension.id];
    add(`dimension-${dimension.id}`, dimension.label, Math.max(0, dimension.minimumQuestions - d.attempts) +
      Math.max(0, dimension.minimumCorrect - d.correct) +
      Math.max(0, (dimension.minimumAccuracy ?? 0) - d.accuracy) * Math.max(d.attempts, dimension.minimumQuestions));
  }
  return gaps;
}

function projectSuccess(progress: Progress, question: Question): Progress {
  const attempt: Attempt = {
    questionId: question.id, concepts: question.concepts, difficulty: question.difficulty,
    correct: true, timestamp: 0, autoResult: "correct", finalResult: "correct",
    overridden: false, mistakeTags: [], score: 1,
  };
  return { ...progress, attempts: [...progress.attempts, attempt] };
}

export function modePriority(module: TrainingModule, mode: ActiveMode) {
  return module.practiceConfig?.modePriority?.[mode] ??
    (module.readinessConfig.readinessDimensions?.some((d) => d.mode === mode) ? 100 :
      module.readinessConfig.reviewGate?.mode === mode ? 90 : mode === "implement" ? 80 :
        mode === "debug" ? 70 : mode === module.readinessConfig.conceptualMode ? 60 : 50);
}

export function calculateRequiredWork(progress: Progress, module: TrainingModule): RequiredWork {
  const saved = cache.get(progress.attempts)?.get(module);
  if (saved) return saved;
  const initial = readiness(progress, module.questions, module.readinessConfig);
  const plan: { question: Question; label: string }[] = [];
  let projected: Progress = { ...progress, session: null, resume: null };
  let gaps = evidenceGaps(projected, module);
  const candidates = module.questions.filter((q) => q.mode !== "legacyConcept" && q.depth === "core");
  // One exercise can satisfy several gates; never sum independent requirement deficits.
  while (gaps.length) {
    if (plan.length >= Math.max(200, candidates.length * 3)) {
      throw new Error(`${module.title}: remaining readiness requirements cannot be planned from the configured core bank.`);
    }
    const previous = new Map(gaps.map((g) => [g.id, g]));
    const total = gaps.reduce((sum, g) => sum + g.deficit, 0);
    const last = projected.attempts.at(-1)?.questionId;
    const recent = projected.attempts.slice(-3).map((a) => a.questionId);
    const checkpoint = readiness(projected, module.questions, module.readinessConfig);
    const seen = new Set(projected.attempts.map((a) => a.questionId));
    // Bound expensive engine projections using varied candidates that target unresolved gates.
    const shortlist = candidates.filter((q) => q.id !== last).map((question) => {
      let score = 0;
      for (const gap of gaps) {
        if (question.concepts.some((c) => c === gap.id)) {
          score += Math.min(gap.deficit, 3) * 10;
          if (question.mode === module.readinessConfig.conceptualMode &&
            question.concepts.some((c) => !checkpoint.conceptPerformance[c].reconstruction)) score += 10;
          if (question.mode !== module.readinessConfig.conceptualMode &&
            question.concepts.some((c) => !checkpoint.conceptPerformance[c].practical)) score += 10;
        }
        if (gap.id === "recent" || gap.id === question.difficulty ||
          (gap.id === "debug" && question.mode === "debug")) score += Math.min(gap.deficit, 3) * 5;
        if (gap.id === "realistic-review" && question.mode === module.readinessConfig.reviewGate?.mode)
          score += question.reviewLevel === module.readinessConfig.reviewGate.realisticReviewLevel ? 35 : 20;
        if (question.readinessDimensions?.some((d) => gap.id === `dimension-${d}`) &&
          module.readinessConfig.readinessDimensions?.some((d) => gap.id === `dimension-${d.id}` &&
            (!d.mode || d.mode === question.mode))) score += 25;
        if (implementationGroups.some((g) => g.id === gap.id && g.questions.includes(question.id))) score += 35;
      }
      return { question, score: score + (seen.has(question.id) ? 0 : 8) - (recent.includes(question.id) ? 15 : 0) };
    }).toSorted((a, b) => b.score - a.score);
    const representatives = new Map<string, Question>();
    for (const { question } of shortlist) {
      const signature = [question.mode, question.difficulty, ...question.concepts,
        question.reviewLevel, ...(question.readinessDimensions ?? []),
        ...implementationGroups.filter((g) => g.questions.includes(question.id)).map((g) => g.id)].join("|");
      if (!representatives.has(signature)) representatives.set(signature, question);
      if (representatives.size >= 12) break;
    }
    const ranked = [...representatives.values()].map((question) => {
      const next = projectSuccess(projected, question);
      const nextGaps = evidenceGaps(next, module);
      const reduction = total - nextGaps.reduce((sum, g) => sum + g.deficit, 0);
      const gains = gaps.map((g) => ({
        ...g, gain: g.deficit - (nextGaps.find((n) => n.id === g.id)?.deficit ?? 0),
      })).toSorted((a, b) => b.gain - a.gain);
      const lastSeen = projected.attempts.findLastIndex((a) => a.questionId === question.id);
      return { question, next, nextGaps, label: gains[0]?.label ?? previous.values().next().value?.label ?? "Retention validation",
        rank: reduction * 1000 - (recent.includes(question.id) ? 50 : 0) +
          modePriority(module, question.mode as ActiveMode) / 100 - (lastSeen + 1) / (projected.attempts.length + 1) };
    }).toSorted((a, b) => b.rank - a.rank);
    const chosen = ranked[0];
    if (!chosen) throw new Error(`${module.title}: no distinct question can validate the remaining requirements.`);
    plan.push({ question: chosen.question, label: chosen.label });
    projected = chosen.next;
    gaps = chosen.nextGaps;
  }
  // Remove redundant validations without weakening any gate, including retention spacing.
  for (let index = plan.length - 1; index >= 0; index--) {
    const smaller = plan.filter((_, candidateIndex) => candidateIndex !== index);
    const final = smaller.reduce((state, item) => projectSuccess(state, item.question), progress);
    if (!readiness(final, module.questions, module.readinessConfig).mustDo.length) plan.splice(index, 1);
  }
  const attempted = new Set(progress.attempts.map((a) => a.questionId));
  const modes = (Object.keys(module.modes) as ActiveMode[]).map((mode): ModeWork => {
    const bank = module.questions.filter((q) => q.mode === mode);
    const work = plan.filter((p) => p.question.mode === mode);
    const breakdown = new Map<string, number>();
    work.forEach((p) => breakdown.set(p.label, (breakdown.get(p.label) ?? 0) + 1));
    const unseen = bank.filter((q) => !attempted.has(q.id)).length;
    const requiredIds = new Set(work.map((p) => p.question.id));
    return {
      mode, available: bank.length, attempted: bank.length - unseen, unseen,
      optional: bank.filter((q) => !attempted.has(q.id) && !requiredIds.has(q.id)).length,
      requiredRemaining: work.length,
      state: work.length ? "required" : unseen ? "required-work-complete" : "complete",
      breakdown: [...breakdown].map(([label, count]) => ({ label, count })),
    };
  });
  const result: RequiredWork = {
    totalRequiredRemaining: plan.length, plan: plan.map((p) => p.question.id), modes,
    priority: modes.filter((m) => m.requiredRemaining > 0).toSorted((a, b) =>
      modePriority(module, b.mode) - modePriority(module, a.mode)),
    optional: modes.reduce((sum, m) => sum + m.optional, 0),
    mustDoAreas: initial.mustDo.length,
    status: !initial.mustDo.length ? "READY TO MOVE ON" : progress.attempts.length ? "IN PROGRESS" : "NOT STARTED",
  };
  const entries = cache.get(progress.attempts) ?? new Map<TrainingModule, RequiredWork>();
  entries.set(module, result);
  cache.set(progress.attempts, entries);
  return result;
}

export function selectRequiredQuestion(progress: Progress, module: TrainingModule, mode: ActiveMode | null = null) {
  const work = calculateRequiredWork(progress, module);
  const ids = work.plan.filter((id) => !mode || module.questions.find((q) => q.id === id)?.mode === mode);
  const recent = progress.recentQuestions.slice(-3);
  const last = progress.resume?.questionId;
  const id = ids.find((id) => id !== last && !recent.includes(id)) ?? ids.find((id) => id !== last) ?? ids[0];
  return module.questions.find((q) => q.id === id);
}

export function sessionPresets(module: TrainingModule, mode: ActiveMode | null) {
  return (mode && module.practiceConfig?.sessionSizes?.[mode]) ||
    (mode === "codeReview" || mode === "architecture" || mode === "implement" ? [1, 3, 5] :
      mode === "debug" ? [5, 10] : [5, 10, 20]);
}
