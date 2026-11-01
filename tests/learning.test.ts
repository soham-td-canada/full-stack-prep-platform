import { describe, expect, it } from "vitest";
import { questions } from "@/data/questions";
import {
  accuracy, checkOutput, mastery, overrideAttempt, readiness, recordAttempt,
  reviewCard, selectQuestion, sessionSummary, startSession, weaknessCards,
} from "@/lib/learning";
import { emptyProgress } from "@/lib/model";
import { readyProgress, recordStructured } from "./fixtures";
import { evaluateStructured } from "@/lib/structured";

const q = (id: string) => {
  const question = questions.find((q) => q.id === id);
  if (!question) throw new Error(`Unknown fixture ${id}`);
  return question;
};

describe("interview readiness, not perfection", () => {
  it("classifies missing coverage and implementations MUST DO; advanced depth CAN DO LATER", () => {
    const state = readiness(emptyProgress(), questions);
    expect(state.mustDo.some((gap) => gap.id === "scope")).toBe(true);
    expect(state.mustDo.some((gap) => gap.id === "debounce")).toBe(true);
    expect(state.canDoLater).toContainEqual(q("implement-debounce-controls"));
    expect(state.canDoLater).toContainEqual(q("print-spread-getter"));
    expect(state.canDoLater).not.toContainEqual(q("timing-debounce"));
    expect(state.coreCoverage).toBe(0);
  });
  it("allows moving on with optional work unfinished and core implementations completed once", () => {
    const state = readiness(readyProgress(), questions);
    expect(state.status).toBe("READY TO MOVE ON");
    expect(state.mustDo).toEqual([]);
    expect(state.coreCoverage).toBe(10);
    expect(state.canDoLater.length).toBeGreaterThan(10);
    expect(state.completedImplementations).toContain("timing-debounce");
    expect(state.completedImplementations).not.toContain("implement-debounce-controls");
  });
  it("accepts a successful advanced debounce as core implementation evidence without forcing another variant", () => {
    let progress = readyProgress();
    progress = { ...progress, attempts: progress.attempts.filter((a) => a.questionId !== "timing-debounce") };
    progress = recordAttempt(progress, q("implement-debounce-controls"), true);
    expect(readiness(progress, questions).mustDo.some((gap) => gap.id === "debounce")).toBe(false);
    expect(readiness(progress, questions).status).toBe("READY TO MOVE ON");
  });
  it("reopens a core implementation requirement after the learner later misses that implementation", () => {
    const regressed = recordAttempt(readyProgress(), q("curry-sum"), "miss");
    expect(readiness(regressed, questions).mustDo.some((gap) => gap.id === "higher-order")).toBe(true);
  });
  it("allows 87% recent core accuracy and one obscure event-loop hard miss", () => {
    let progress = readyProgress();
    const seen = new Set(progress.attempts.map((attempt) => attempt.questionId));
    const unused = questions.filter((question) => question.mode !== "legacyConcept" &&
      question.depth === "core" && !seen.has(question.id));
    const missConcepts = new Set<string>();
    const misses = [];
    for (const question of unused) {
      const [concept] = question.concepts;
      if (question.concepts.length !== 1 || missConcepts.has(concept)) continue;
      misses.push(question);
      missConcepts.add(concept);
      if (misses.length === 4) break;
    }
    const missIds = new Set(misses.map((question) => question.id));
    for (const question of misses) progress = recordAttempt(progress, question, false);
    for (const question of unused.filter((candidate) => !missIds.has(candidate.id)).slice(0, 26))
      progress = recordAttempt(progress, question, true);
    progress = recordAttempt(progress, q("print-await-two-checkpoints"), false);
    const state = readiness(progress, questions);
    expect(state.recentAccuracy).toBeCloseTo(26 / 30);
    expect(state.hardAccuracy).toBe(1);
    expect(state.mustDo.map((gap) => gap.label)).toEqual([]);
    expect(state.status).toBe("READY TO MOVE ON");
  });
  it("does not let strong overall accuracy hide under-practiced prototypes or weak TypeScript narrowing", () => {
    let progress = readyProgress();
    progress = { ...progress, attempts: progress.attempts.filter((a) => !a.concepts.includes("prototypes")) };
    for (const id of ["debug-typescript-narrowing", "debug-typescript-exhaustive"])
      progress = recordAttempt(progress, q(id), "miss");
    progress = recordStructured(progress, q("js-recon-unknown-best-explanation"), progress.attempts.length + 1, "answer");
    const seen = new Set(progress.attempts.map((a) => a.questionId));
    const additional = questions.filter((question) => question.depth === "core" &&
      !question.concepts.includes("prototypes") && !question.concepts.includes("typescript") && !seen.has(question.id)).slice(0, 27);
    for (const question of additional) progress = recordAttempt(progress, question, "correct");
    const state = readiness(progress, questions);
    expect(accuracy(progress.attempts)).toBeGreaterThan(0.91);
    expect(state.mustDo.some((gap) => gap.concept === "prototypes")).toBe(true);
    expect(state.mustDo.some((gap) => gap.concept === "typescript")).toBe(true);
    expect(state.status).not.toBe("READY TO MOVE ON");
  });
  it("requires distinct core question variants for readiness sample sizes", () => {
    const repeated = Array.from({ length: 30 }, () => q("scope-var"))
      .reduce((progress, question) => recordAttempt(progress, question, "correct"), emptyProgress());
    const state = readiness(repeated, questions);
    expect(state.recentAccuracy).toBe(1);
    expect(state.mustDo.some((gap) => gap.id === "recent")).toBe(true);
    expect(mastery(repeated, "scope", questions).status).not.toBe("Ready");

    const stale = Array.from({ length: 30 }, () => q("scope-var"))
      .reduce((progress, question) => recordAttempt(progress, question, "correct"), readyProgress());
    expect(readiness(stale, questions).mustDo.some((gap) => gap.id === "recent")).toBe(true);
  });
  it("keeps a repeated Promise.all fail-fast misconception under MUST DO", () => {
    let progress = emptyProgress();
    for (let i = 0; i < 2; i++) progress = recordStructured(progress, q("js-recon-promise-match"), i, "Promise.all");
    expect(progress.attempts[0].mistakeTags).toContain("promise-all-waits-for-all");
    expect(readiness(progress, questions).mustDo.some((gap) =>
      gap.concept === "promises" && gap.label.includes("misconception"))).toBe(true);
    expect(weaknessCards(progress, questions).map((question) => question.id)).toContain("js-recon-promise-match");
  });
  it("does not block on Promise.any minor detail or prototype descriptor misses", () => {
    let progress = readyProgress();
    for (const id of ["promise-race", "print-spread-getter"])
      progress = recordAttempt(progress, q(id), "partial");
    expect(readiness(progress, questions).status).toBe("READY TO MOVE ON");
  });
  it("blocks recent core weakness even when lifetime accuracy is strong", () => {
    let progress = readyProgress();
    for (const id of ["copy-spread", "debug-copy-shallow-settings"])
      progress = recordAttempt(progress, q(id), false);
    progress = recordStructured(progress, q("js-recon-copy-categories"), progress.attempts.length + 1, "nested");
    expect(mastery(progress, "copying", questions).status).toBe("Weak");
    expect(readiness(progress, questions).mustDo.some((gap) => gap.concept === "copying")).toBe(true);
  });
  it("blocks repeated structured Promise/copy misconceptions", () => {
    for (const [id, field, concept] of [
      ["js-recon-class-true-false", "truth", "prototypes"],
      ["js-recon-copy-categories", "nested", "copying"],
    ] as const) {
      let progress = readyProgress();
      for (let i = 0; i < 2; i++) progress = recordStructured(progress, q(id), i, field);
      const state = readiness(progress, questions);
      expect(state.mustDo.some((gap) => gap.concept === concept && gap.label.includes("misconception"))).toBe(true);
      expect(weaknessCards(progress, questions).map((q) => q.id)).toContain(id);
    }
  });
  it("uses the latest result per distinct core question and hard variant, including partial credit", () => {
    let progress = readyProgress();
    const distinct = questions.filter((question) => question.mode !== "legacyConcept" && question.depth === "core").slice(0, 30);
    for (let i = 0; i < distinct.length; i++) progress = recordAttempt(progress, distinct[i], i < 3 ? "miss" : "correct");
    expect(readiness(progress, questions).recentAccuracy).toBe(0.9);
    for (let i = 0; i < 12; i++) progress = recordAttempt(progress, q("loop-nested"), i < 2 ? "miss" : "partial");
    expect(readiness(progress, questions).hardAccuracy).toBe(1);
    expect(readiness(progress, questions).hardAttempts).toBe(10);
    expect(accuracy(progress.attempts.slice(-10))).toBe(0.5);
  });
  it("requires meaningful varied coverage, medium consistency, debug performance and hard exposure", () => {
    const progress = readyProgress();
    const without = { ...progress, attempts: progress.attempts.filter((a) => a.difficulty !== "hard") };
    expect(readiness(without, questions).mustDo.some((gap) => gap.id === "hard")).toBe(true);
    const weakMedium = { ...progress, attempts: progress.attempts.map((a) => a.difficulty === "medium"
      ? { ...a, finalResult: "miss" as const, correct: false } : a) };
    expect(readiness(weakMedium, questions).mustDo.some((gap) => gap.id === "medium")).toBe(true);
    const noDebug = { ...progress, attempts: progress.attempts.filter((a) => q(a.questionId).mode !== "debug") };
    expect(readiness(noDebug, questions).mustDo.some((gap) => gap.id === "debug")).toBe(true);
    const repeat = recordAttempt(recordAttempt(recordAttempt(emptyProgress(), q("scope-var"), true), q("scope-var"), true), q("scope-var"), true);
    expect(mastery(repeat, "scope", questions).status).not.toBe("Ready");
  });
});

describe("structured reconstruction replaces prose conceptual grading", () => {
  it("keeps old conceptual attempts out of readiness and legacy questions out of practice", () => {
    const old = q("concept-copy-alias");
    expect(old.mode).toBe("legacyConcept");
    expect(selectQuestion(questions, null, emptyProgress())?.mode).not.toBe("legacyConcept");
    const history = recordAttempt(emptyProgress(), old, "miss", 1, "Object spread deep-copies nested data.", "miss");
    expect(readiness(history, questions).conceptPerformance.copying.total).toBe(0);
    expect(evaluateStructured(q("js-recon-shallow-copy"), '{"blank":["shallow"]}').result).toBe("correct");
  });
  it("keeps learner overrides for self-assessed practical modes, not deterministic concepts", () => {
    const practical = recordAttempt(emptyProgress(), q("debug-copy-shallow-settings"), "partial", 1, "A valid fix", "miss");
    const overridden = overrideAttempt(practical, 0, "correct");
    expect(overridden.attempts[0]).toMatchObject({ finalResult: "correct", overridden: true });
    expect(accuracy(overridden.attempts)).toBe(1);
    expect(() => recordStructured(emptyProgress(), q("js-recon-unknown-best-explanation"), 1, "answer"))
      .not.toThrow();
  });
});

describe("targeted remediation and retention", () => {
  it("activates mistake cards, but reviews alone do not grant mastery", () => {
    let progress = recordAttempt(recordAttempt(emptyProgress(), q("copy-spread"), false), q("copy-spread"), false);
    expect(weaknessCards(progress, questions).map((q) => q.id)).toEqual(["copy-spread"]);
    const before = readiness(progress, questions);
    progress = reviewCard(progress, "copy-spread", true);
    expect(readiness(progress, questions)).toEqual(before);
    expect(weaknessCards(progress, questions).map((q) => q.id)).toEqual(["copy-spread"]);
  });
  it("retires a reviewed card only after related practice and later different retention; reactivates on regression", () => {
    let progress = recordAttempt(recordAttempt(emptyProgress(), q("copy-spread"), false), q("copy-spread"), false);
    progress = reviewCard(progress, "copy-spread", true);
    progress = recordStructured(progress, q("js-recon-copy-categories"), progress.attempts.length + 1);
    expect(weaknessCards(progress, questions)).toHaveLength(1);
    progress = recordAttempt(recordAttempt(progress, q("scope-var"), true), q("this-call"), true);
    progress = recordAttempt(progress, q("print-array-spread-alias"), true);
    expect(weaknessCards(progress, questions)).toEqual([]);
    progress = recordAttempt(recordAttempt(progress, q("copy-spread"), false), q("copy-spread"), false);
    expect(weaknessCards(progress, questions).map((q) => q.id)).toContain("copy-spread");
  });
  it("does not create optional-edge-case cards without a core misconception", () => {
    let progress = readyProgress();
    progress = recordAttempt(recordAttempt(progress, q("print-spread-getter"), false), q("print-spread-getter"), false);
    expect(weaknessCards(progress, questions)).toEqual([]);
  });
});

describe("bounded sessions and question priority", () => {
  it("completes exactly at the chosen limit and reports resolved/remaining gaps and weaknesses", () => {
    let progress = readyProgress();
    progress = { ...progress, attempts: progress.attempts.filter((a) => !a.concepts.includes("scope")) };
    progress = startSession(progress, 10, questions);
    for (const id of ["js-recon-scope-xyz", "debug-scope-handler", "print-lexical-not-caller"]) {
      const question = q(id);
      progress = question.structured
        ? recordStructured(progress, question, progress.attempts.length + 1)
        : recordAttempt(progress, question, true);
    }
    expect(sessionSummary(progress, questions)?.completed).toBe(false);
    const seen = new Set(progress.attempts.map((a) => a.questionId));
    for (const question of questions.filter((candidate) => candidate.mode !== "legacyConcept" &&
      candidate.depth === "core" && !seen.has(candidate.id)).slice(0, 7)) {
      progress = recordAttempt(progress, question, true);
      seen.add(question.id);
    }
    expect(sessionSummary(progress, questions)).toMatchObject({ completed: true, questions: 10, resolved: 1 });
    expect(sessionSummary(progress, questions)!.remaining).toBeGreaterThan(0);
    expect(startSession(progress, 20, questions).session).toMatchObject({
      size: 20, startAttempt: progress.attempts.length, completed: false,
    });
  });
  it("prioritizes unresolved core concepts and different styles over strong/optional variants", () => {
    const progress = readyProgress();
    const weakened = recordAttempt(recordAttempt(recordAttempt(progress, q("copy-spread"), false), q("copy-spread"), false), q("copy-spread"), false);
    const bank = [q("scope-var"), q("js-recon-copy-categories"), q("print-spread-getter"), q("debug-copy-shallow-settings")];
    expect(selectQuestion(bank, null, weakened)?.concepts).toContain("copying");
    expect(selectQuestion(bank, null, weakened)?.depth).toBe("core");
  });
  it("avoids the last five questions and never immediately duplicates when alternatives exist", () => {
    const bank = questions.filter((q) => q.mode === "prints").slice(0, 8);
    const progress = bank.slice(0, 5).reduce((p, q) => recordAttempt(p, q, false), emptyProgress());
    expect(bank.slice(0, 5).map((q) => q.id)).not.toContain(selectQuestion(bank, "prints", progress)?.id);
    const small = bank.slice(0, 2);
    const repeated = small.reduce((p, q) => recordAttempt(p, q, true), emptyProgress());
    expect(selectQuestion(small, "prints", repeated)?.id).toBe(small[0].id);
    expect(selectQuestion([], "prints", progress)).toBeUndefined();
  });
  it("also avoids recently opened but unanswered questions", () => {
    const bank = questions.filter((q) => q.mode === "prints").slice(0, 8);
    const progress = { ...emptyProgress(), recentQuestions: bank.slice(0, 5).map((q) => q.id) };
    expect(progress.recentQuestions).not.toContain(selectQuestion(bank, "prints", progress)?.id);
  });
  it("occasionally checks strong concepts for retention while must-do work remains", () => {
    let progress = readyProgress();
    for (let i = 0; i < 3; i++) progress = recordAttempt(progress, q("copy-spread"), false);
    progress = recordAttempt(progress, q("scope-var"), true);
    expect(progress.attempts.length % 8).toBe(0);
    const selected = selectQuestion(questions, "prints", progress)!;
    expect(selected.concepts.every((c) => mastery(progress, c, questions).status === "Ready")).toBe(true);
  });
  it("prioritizes optional depth after ready, with occasional retention", () => {
    const progress = readyProgress();
    expect(selectQuestion(questions, "prints", progress)?.depth).toBe("optional");
  });
});

it("checks exact output values/order while normalizing CRLF and outer whitespace", () => {
  expect(checkOutput("  \r\n1\r\n2  \r\n", "1\n2")).toBe(true);
  expect(checkOutput("2\n1", "1\n2")).toBe(false);
  expect(checkOutput("'Ada'", "Ada")).toBe(false);
  expect(checkOutput(" ", " ")).toBe(false);
});
