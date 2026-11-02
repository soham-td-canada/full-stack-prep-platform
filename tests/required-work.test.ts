import { describe, expect, it } from "vitest";
import { calculateRequiredWork, selectRequiredQuestion } from "@/lib/required-work";
import { moduleRegistry } from "@/lib/modules";
import { emptyProgress } from "@/lib/model";
import { endSession, readiness, recordAttempt, sessionElapsed, skipQuestion, startSession } from "@/lib/learning";
import { readyReactProgress, structuredSolution } from "./react-fixtures";
import { readyProgress } from "./fixtures";
import { readyNextProgress } from "./nextjs-fixtures";
import { evaluateStructured, readStructuredAnswer } from "@/lib/structured";

describe("required-work planner", () => {
  for (const trainingModule of Object.values(moduleRegistry)) {
    it(`plans actual readiness evidence for ${trainingModule.title}`, () => {
      const progress = emptyProgress();
      const work = calculateRequiredWork(progress, trainingModule);
      expect(work.totalRequiredRemaining).toBeGreaterThan(0);
      expect(work.totalRequiredRemaining).toBe(work.modes.reduce((sum, m) => sum + m.requiredRemaining, 0));
      expect(work.totalRequiredRemaining).toBeLessThan(trainingModule.questions.length);
      let projected = progress;
      for (const id of work.plan) {
        const q = trainingModule.questions.find((q) => q.id === id)!;
        projected = recordAttempt(projected, q, "correct", projected.attempts.length + 1,
          q.structured ? structuredSolution(q) : q.answer, q.structured ? "correct" : null);
      }
      expect(readiness(projected, trainingModule.questions, trainingModule.readinessConfig).mustDo).toEqual([]);
      expect(calculateRequiredWork(projected, trainingModule).totalRequiredRemaining).toBe(0);
      expect(work.modes.every((m) => m.available === m.attempted + m.unseen)).toBe(true);
      expect(work.modes.every((m) => m.breakdown.reduce((s, b) => s + b.count, 0) === m.requiredRemaining)).toBe(true);
      expect(calculateRequiredWork(progress, trainingModule)).toBe(work);
    }, 60_000);
  }
  it("never equates unseen bank depth with required work, including after deployments", () => {
    const fixtures = [readyProgress(), readyReactProgress(), readyNextProgress()];
    Object.values(moduleRegistry).forEach((module, index) => {
      const progress = fixtures[index];
      const before = calculateRequiredWork(progress, module);
      expect(before.totalRequiredRemaining).toBe(0);
      const extra = { ...module.questions[0], id: "future-optional", depth: "optional" as const };
      const after = calculateRequiredWork(progress, { ...module, questions: [...module.questions, extra] });
      expect(after.status).toBe("READY TO MOVE ON");
      expect(after.totalRequiredRemaining).toBe(0);
      expect(after.modes.find((m) => m.mode === extra.mode)?.state).toBe("required-work-complete");
    });
  });
  it("distinguishes complete modes from required-work-complete modes", () => {
    const trainingModule = moduleRegistry.react;
    const progress = readyReactProgress();
    const prediction = calculateRequiredWork(progress, trainingModule).modes.find((m) => m.mode === "prediction")!;
    expect(prediction).toMatchObject({ state: "complete", unseen: 0, requiredRemaining: 0 });
    const reconstruction = calculateRequiredWork(progress, trainingModule).modes.find((m) => m.mode === "reconstruction")!;
    expect(reconstruction.requiredRemaining).toBe(0);
    expect(reconstruction.state).toBe(reconstruction.unseen ? "required-work-complete" : "complete");
  });
  it("reactivates real weaknesses, prioritizes review, and does not select completed modes", () => {
    const trainingModule = moduleRegistry.react;
    const q = trainingModule.questions.find((q) => q.id === "react-review-catalog")!;
    const fields = JSON.parse(structuredSolution(q));
    fields.deps = ["FINE AS-IS"];
    const answer = JSON.stringify(fields);
    const progress = recordAttempt(readyReactProgress(), q, "miss", Date.now(), answer, "miss");
    const work = calculateRequiredWork(progress, trainingModule);
    expect(work.totalRequiredRemaining).toBeGreaterThan(0);
    expect(work.priority[0].mode).toBe("codeReview");
    const selected = selectRequiredQuestion(progress, trainingModule)!;
    expect(work.modes.find((m) => m.mode === selected.mode)?.state).toBe("required");
    expect(selected.mode).not.toBe("prediction");
  }, 60_000);
  it("counts a single missing implementation as one validation rather than all unseen variants", () => {
    const trainingModule = moduleRegistry["javascript-typescript"];
    const progress = readyProgress();
    progress.attempts = progress.attempts.filter((a) => a.questionId !== "ts-guard");
    const work = calculateRequiredWork(progress, trainingModule);
    expect(work.totalRequiredRemaining).toBe(1);
    expect(work.modes.find((m) => m.mode === "implement")?.requiredRemaining).toBe(1);
    expect(work.modes.find((m) => m.mode === "implement")?.breakdown).toEqual([
      { label: "Complete one TypeScript runtime guard", count: 1 },
    ]);
    const q = selectRequiredQuestion(progress, trainingModule)!;
    const passed = recordAttempt(progress, q, true, Date.now(), q.answer);
    expect(calculateRequiredWork(passed, trainingModule).totalRequiredRemaining).toBe(0);
  });
  it("plans distinct, spaced recovery evidence for recurring misconceptions", () => {
    const trainingModule = moduleRegistry.react;
    const q = trainingModule.questions.find((q) => q.id === "react-r-best-effect")!;
    const values = readStructuredAnswer(structuredSolution(q));
    const field = q.structured!.fields.find((field) => field.id === "answer")!;
    if (field.kind !== "select") throw new Error("Expected a structured choice.");
    values.answer = [field.choices.find((choice) => !field.correct.includes(choice.id))!.id];
    const answer = JSON.stringify(values);
    const result = evaluateStructured(q, answer).result;
    let progress = readyReactProgress();
    for (let i = 0; i < 2; i++) progress = recordAttempt(progress, q, result, i + 1000, answer, result);
    expect(readiness(progress, trainingModule.questions, trainingModule.readinessConfig).conceptPerformance.reactEffects.recurring.length).toBeGreaterThan(0);
    const work = calculateRequiredWork(progress, trainingModule);
    expect(work.totalRequiredRemaining).toBeGreaterThanOrEqual(4);
    expect(work.modes.some((m) => m.state === "required")).toBe(true);
    for (const id of work.plan) {
      const question = trainingModule.questions.find((q) => q.id === id)!;
      progress = recordAttempt(progress, question, "correct", progress.attempts.length + 1000, structuredSolution(question), "correct");
    }
    expect(readiness(progress, trainingModule.questions, trainingModule.readinessConfig).mustDo).toEqual([]);
  }, 60_000);
  it("honors module-configured priority and deep session presets", async () => {
    const { modePriority, sessionPresets } = await import("@/lib/required-work");
    const configured = { ...moduleRegistry.react, practiceConfig: {
      modePriority: { debug: 200 }, sessionSizes: { codeReview: [1, 2, 3] },
    } };
    expect(modePriority(configured, "debug")).toBe(200);
    expect(sessionPresets(configured, "codeReview")).toEqual([1, 2, 3]);
    expect(sessionPresets(configured, null)).toEqual([5, 10, 20]);
    const work = calculateRequiredWork(emptyProgress(), configured);
    expect(work.priority[0].mode).toBe("debug");
  });
});

describe("session lifecycle and timing", () => {
  it("keeps completed answers when ending early; unfinished work is not a miss", () => {
    const trainingModule = moduleRegistry["javascript-typescript"];
    const session = startSession(emptyProgress(), 10, trainingModule.questions, trainingModule.readinessConfig, 1000);
    const answered = recordAttempt(session, trainingModule.questions[0], true, 2000);
    const ended = endSession(answered, 6500);
    expect(ended.attempts).toEqual(answered.attempts);
    expect(ended.attempts).toHaveLength(1);
    expect(ended.session).toMatchObject({ completed: true, startedAt: 1000, endedAt: 6500 });
    expect(sessionElapsed(ended.session?.startedAt, 9000, ended.session?.endedAt)).toBe(5);
  });
  it("tracks skips separately and does not satisfy readiness or reset the clock", () => {
    const trainingModule = moduleRegistry.react;
    const initial = startSession(emptyProgress(), 3, trainingModule.questions, trainingModule.readinessConfig, 1000);
    const skipped = skipQuestion(initial, trainingModule.questions[0].id, 5000);
    expect(skipped.attempts).toEqual(initial.attempts);
    expect(skipped.session?.startedAt).toBe(1000);
    expect(skipped.session?.skipped).toEqual([trainingModule.questions[0].id]);
    expect(calculateRequiredWork(skipped, trainingModule).totalRequiredRemaining).toBe(calculateRequiredWork(initial, trainingModule).totalRequiredRemaining);
    expect(sessionElapsed(skipped.session?.startedAt, 9000)).toBe(8);
  });
});
