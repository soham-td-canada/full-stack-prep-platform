import { describe, expect, it } from "vitest";
import { questions } from "@/data/questions";
import { moduleRegistry } from "@/lib/modules";
import { implementationGroups, readiness, recordAttempt, weaknessCards } from "@/lib/learning";
import { emptyProgress, modes, type Concept } from "@/lib/model";
import { evaluateStructured } from "@/lib/structured";
import { recordStructured, structuredSolution } from "./fixtures";

const bank = questions.filter((question) => question.mode !== "legacyConcept");
const syllabusConcepts = ["scope", "this", "prototypes", "eventLoop", "promises", "copying",
  "timing", "currying", "typescript", "reasoning"] as const satisfies readonly Concept[];
const question = (id: string) => {
  const found = bank.find((item) => item.id === `js-recon-${id}`);
  if (!found) throw new Error(`Unknown reconstruction question: ${id}`);
  return found;
};

describe("JavaScript/TypeScript Concept Reconstruction", () => {
  it("uses the four requested modes and structured reconstruction across all ten syllabus areas", () => {
    expect(Object.keys(modes)).toEqual(["prints", "reconstruction", "debug", "implement"]);
    expect(modes).not.toHaveProperty("concept");
    expect(questions.some((item) => item.mode === "legacyConcept")).toBe(true);
    for (const concept of syllabusConcepts) {
      expect(bank.some((item) => item.mode === "reconstruction" && item.concepts.includes(concept))).toBe(true);
    }
    expect(implementationGroups.flatMap((group) => group.questions).every((id) =>
      bank.some((item) => item.id === id && item.mode === "implement"))).toBe(true);
  });

  it("keeps module routes, modes, progress keys, and readiness rules in separate registry entries", () => {
    const javascript = moduleRegistry["javascript-typescript"];
    const react = moduleRegistry.react;
    expect(javascript.path).toBe("/modules/javascript-typescript");
    expect(react.path).toBe("/modules/react");
    expect(javascript.storageKey).not.toBe(react.storageKey);
    expect(javascript.readinessConfig.requiredImplementationGroups).toEqual(["debounce", "higher-order", "guard"]);
    expect(react.readinessConfig.reviewGate?.mode).toBe("codeReview");
    expect(javascript.readinessConfig.concepts).toEqual(syllabusConcepts);
  });

  it("authors deterministic correct responses for every shared structured type", () => {
    const types = new Set(bank.filter((item) => item.mode === "reconstruction")
      .map((item) => item.structured?.type));
    expect(types).toEqual(new Set(["multiBlank", "completeSentence", "conceptInference", "reasonInference",
      "matching", "categorization", "ordering", "trueFalse", "bestExplanation"]));
    for (const item of bank.filter((candidate) => candidate.mode === "reconstruction")) {
      expect(evaluateStructured(item, structuredSolution(item)).result, item.id).toBe("correct");
    }
  });

  it("grades multi-blanks independently and accepts technically equivalent aliases", () => {
    const item = question("scope-xyz");
    const answer = JSON.stringify({ X: ["LET  or CONST"], Y: ["Declaration initialization"],
      A: ["returned function"], B: ["enclosing"], C: ["completed execution"] });
    expect(evaluateStructured(item, answer)).toMatchObject({ result: "correct", score: 1, failed: [] });
    const partial = evaluateStructured(item, JSON.stringify({
      X: ["function"], Y: ["declaration initialization"], A: ["inner function"],
      B: ["lexical"], C: ["returned"],
    }));
    expect(partial).toMatchObject({ result: "partial", score: 0.8, failed: ["X"] });
    expect(evaluateStructured(question("unknown-blank"), '{"blank":["refined"]}').result).toBe("correct");
  });

  it("requires complete exact mappings, inference, and reason identification", () => {
    expect(evaluateStructured(question("promise-match"), structuredSolution(question("promise-match"))).result).toBe("correct");
    expect(evaluateStructured(question("prototype-inference"), '{"concept":["prototype chain"]}').result).toBe("correct");
    expect(evaluateStructured(question("microtask-reason"),
      '{"reason":["the runtime drains microtasks before the next task"]}').result).toBe("correct");
    expect(evaluateStructured(question("all-vs-settled"), '{"C":["use allSettled"]}').result).toBe("correct");
  });

  it("grades categorization, ordering, true/false correction, and best explanation", () => {
    const categories = question("copy-categories");
    expect(evaluateStructured(categories, structuredSolution(categories)).result).toBe("correct");
    const wrongCategory = evaluateStructured(categories, structuredSolution(categories, "nested"));
    expect(wrongCategory.failed).toEqual(["nested"]);
    const order = question("event-loop-order");
    const reordered = JSON.parse(structuredSolution(order)) as Record<string, string[]>;
    [reordered["1"], reordered["2"]] = [reordered["2"], reordered["1"]];
    expect(evaluateStructured(order, JSON.stringify(reordered)).result).toBe("partial");
    expect(evaluateStructured(question("tdz-false"), structuredSolution(question("tdz-false"))).result).toBe("correct");
    expect(evaluateStructured(question("unknown-best-explanation"),
      structuredSolution(question("unknown-best-explanation"))).result).toBe("correct");
  });

  it("turns repeated Promise.all and unknown/any misconceptions into MUST DO weakness evidence", () => {
    for (const [id, field, tag, concept] of [
      ["promise-match", "Promise.all", "promise-all-waits-for-all", "promises"],
      ["unknown-best-explanation", "answer", "unknown-unsafe", "typescript"],
    ] as const) {
      let progress = emptyProgress();
      for (let index = 0; index < 2; index++) progress = recordStructured(progress, question(id), index, field);
      expect(progress.attempts.at(-1)?.mistakeTags).toContain(tag);
      expect(readiness(progress, bank).mustDo.some((gap) =>
        gap.concept === concept && gap.label.includes("misconception"))).toBe(true);
      expect(weaknessCards(progress, bank).map((item) => item.id)).toContain(question(id).id);
    }
  });

  it("keeps historical prose attempts but does not count them as conceptual or practical evidence", () => {
    const historical = questions.find((item) => item.id === "scope-closure")!;
    const progress = recordAttempt(emptyProgress(), historical, "correct", 1, "Previously graded answer");
    const checkpoint = readiness(progress, questions);
    expect(historical.mode).toBe("legacyConcept");
    expect(checkpoint.conceptPerformance.scope.total).toBe(0);
    expect(checkpoint.status).not.toBe("READY TO MOVE ON");
  });
});
