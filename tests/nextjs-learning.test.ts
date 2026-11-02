import { describe, expect, it } from "vitest";
import { moduleRegistry } from "@/lib/modules";
import { nextConcepts, nextModes, emptyProgress } from "@/lib/model";
import { nextjsQuestions } from "@/data/nextjs-questions";
import {
  readiness, recordAttempt, selectQuestion, weaknessCards, reviewCard,
} from "@/lib/learning";
import { evaluateStructured } from "@/lib/structured";
import { createProgressStore, type LocalStorage } from "@/lib/persistence";
import type { Question } from "@/lib/model";
import { readyNextProgress } from "./nextjs-fixtures";

const solution = (question: Question, wrongField?: string) => JSON.stringify(Object.fromEntries(
  question.structured!.fields.map((field) => {
    if (field.id !== wrongField) return [field.id, field.kind === "text" ? [field.accepted[0]] : field.correct];
    if (field.kind === "text") return [field.id, ["not an accepted answer"]];
    const incorrect = field.choices.find((choice) => !field.correct.includes(choice.id));
    return [field.id, [incorrect?.id ?? ""]];
  }),
));

function record(progress: ReturnType<typeof emptyProgress>, question: Question, wrongField?: string) {
  const answer = solution(question, wrongField);
  const result = evaluateStructured(question, answer).result;
  return recordAttempt(progress, question, result, progress.attempts.length + 1, answer, result);
}

function memoryStorage(): LocalStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("Next.js + Frontend Architecture module", () => {
  it("registers an isolated module with the exact four modes and all ten areas", () => {
    const trainingModule = moduleRegistry["nextjs-frontend-architecture"];
    expect(trainingModule.path).toBe("/modules/nextjs-frontend-architecture");
    expect(trainingModule.storageKey).not.toBe(moduleRegistry.react.storageKey);
    expect(trainingModule.storageKey).not.toBe(moduleRegistry["javascript-typescript"].storageKey);
    expect(trainingModule.frameworkVersion).toBe("Next.js 16.4.3");
    expect(Object.values(trainingModule.modes)).toEqual([
      "Predict It", "Concept Reconstruction", "Debug It", "Architecture & Diagnosis",
    ]);
    expect(new Set(trainingModule.questions.flatMap((question) => question.concepts)))
      .toEqual(new Set(Object.keys(nextConcepts)));
    expect(trainingModule.questions.every((question) =>
      question.module === trainingModule.id && question.structured)).toBe(true);
    expect(new Set(trainingModule.questions.map((question) => question.mode)))
      .toEqual(new Set(Object.keys(nextModes)));
    expect(trainingModule.questions.some((question) =>
      question.versionSensitive && question.versionNotes?.includes("cacheComponents: true"))).toBe(true);
  });

  it("uses the generic structured renderer types for all reconstruction interactions", () => {
    const reconstruction = nextjsQuestions.filter((question) => question.mode === "reconstruction");
    expect(new Set(reconstruction.map((question) => question.structured?.type))).toEqual(new Set([
      "matching", "multiBlank", "completeSentence", "conceptInference", "reasonInference",
      "categorization", "ordering", "trueFalse", "bestExplanation",
    ]));
    for (const question of nextjsQuestions) {
      expect(evaluateStructured(question, solution(question)).result, question.id).toBe("correct");
      const partial = evaluateStructured(question, solution(question, question.structured!.fields[0].id));
      expect(partial.result, question.id).not.toBe("correct");
    }
    expect(nextjsQuestions.find((question) => question.id === "nextfa-route-boundary-match")?.structured?.type)
      .toBe("matching");
    expect(nextjsQuestions.find((question) => question.id === "nextfa-cache-xyz")?.structured?.type)
      .toBe("multiBlank");
    expect(nextjsQuestions.find((question) => question.id === "nextfa-pdp-freshness-matrix")?.structured?.type)
      .toBe("categorization");
  });

  it("selects questions by the configured module modes", () => {
    const config = moduleRegistry["nextjs-frontend-architecture"].readinessConfig;
    for (const mode of Object.keys(nextModes) as (keyof typeof nextModes)[]) {
      expect(selectQuestion(nextjsQuestions, mode, emptyProgress(), config)?.mode).toBe(mode);
    }
  });

  it("makes architecture, PDP, monorepo, large-app, and performance evidence mandatory", () => {
    const config = moduleRegistry["nextjs-frontend-architecture"].readinessConfig;
    const reconstructionOnly = nextjsQuestions.filter((question) => question.mode === "reconstruction")
      .reduce((progress, question) => record(progress, question), emptyProgress());
    expect(readiness(reconstructionOnly, nextjsQuestions, config).mustDo.some((gap) =>
      gap.id === "dimension-architecture")).toBe(true);

    const complete = readyNextProgress();
    const completeCheckpoint = readiness(complete, nextjsQuestions, config);
    expect(completeCheckpoint.mustDo, JSON.stringify(completeCheckpoint.mustDo)).toEqual([]);
    expect(completeCheckpoint.status).toBe("READY TO MOVE ON");
    expect(completeCheckpoint.canDoLater.length).toBeGreaterThan(0);

    let weakPdp = complete;
    const freshPdp = nextjsQuestions.find((question) => question.id === "nextfa-pdp-freshness-matrix")!;
    const resilientPdp = nextjsQuestions.find((question) => question.id === "nextfa-pdp-graceful-degradation")!;
    weakPdp = record(weakPdp, freshPdp, "inventory");
    weakPdp = record(weakPdp, resilientPdp, "answer");
    const blocked = readiness(weakPdp, nextjsQuestions, config);
    expect(blocked.mustDo.some((gap) => gap.id === "dimension-pdp")).toBe(true);
    expect(blocked.status).not.toBe("READY TO MOVE ON");
  });

  describe("Next.js bank accuracy and structured grading stress tests", () => {
    it("meets volume/distribution and guarantees production coverage for 21-30", () => {
      expect(nextjsQuestions.length).toBeGreaterThanOrEqual(150);
      expect(nextjsQuestions.length).toBeLessThanOrEqual(180);
      const ranges = { prediction: [25, 35], reconstruction: [35, 45], debug: [30, 40], architecture: [55, 65] };
      for (const [mode, [min, max]] of Object.entries(ranges)) {
        const count = nextjsQuestions.filter((q) => q.mode === mode).length;
        expect(count, `${mode}: ${count}`).toBeGreaterThanOrEqual(min);
        expect(count, `${mode}: ${count}`).toBeLessThanOrEqual(max);
      }
      for (const concept of Object.keys(nextConcepts) as (keyof typeof nextConcepts)[]) {
        const questions = nextjsQuestions.filter((q) => q.concepts.includes(concept));
        expect(questions.some((q) => q.mode === "reconstruction"), concept).toBe(true);
        expect(questions.some((q) => q.mode === "architecture"), concept).toBe(true);
        expect(questions.some((q) => q.mode === "debug"), concept).toBe(true);
        for (const difficulty of ["easy", "medium", "hard"]) {
          expect(questions.some((q) => q.difficulty === difficulty), `${concept}/${difficulty}`).toBe(true);
        }
        expect(questions.some((q) => q.structured!.fields.some((f) => f.misconceptionTag)), concept).toBe(true);
      }
      for (const concept of ["nextPdp", "nextArchitecture", "nextPerformance"] as const) {
        expect(nextjsQuestions.filter((q) => q.mode === "architecture" && q.concepts.includes(concept)).length)
          .toBeGreaterThanOrEqual(15);
      }
    });

    it("has unique, bounded select-only exercises with balanced answer positions", () => {
      expect(new Set(nextjsQuestions.map((q) => q.id)).size).toBe(nextjsQuestions.length);
      expect(new Set(nextjsQuestions.map((q) => q.prompt)).size).toBe(nextjsQuestions.length);
      const positions = new Set<number>();
      for (const q of nextjsQuestions) {
        expect(q.explanation.length, q.id).toBeGreaterThan(60);
        expect(q.structured!.fields.length, q.id).toBeGreaterThan(0);
        expect(new Set(q.structured!.fields.map((f) => f.id)).size, q.id).toBe(q.structured!.fields.length);
        if (q.mode === "debug") expect(q.code, q.id).toBeTruthy();
        for (const f of q.structured!.fields) {
          expect(f.kind, `${q.id}/${f.id}`).toBe("select");
          if (f.kind !== "select") continue;
          expect(new Set(f.choices.map((c) => c.id)).size).toBe(f.choices.length);
          expect(f.correct.length).toBeGreaterThan(0);
          expect(f.correct.every((id) => f.choices.some((c) => c.id === id))).toBe(true);
          if (!f.multiple) {
            expect(f.correct).toHaveLength(1);
            positions.add(f.choices.findIndex((c) => c.id === f.correct[0]));
          }
        }
      }
      expect(positions.size).toBeGreaterThanOrEqual(3);
    });

    it("pins the installed dependency/config and every framework-sensitive assumption", async () => {
      const { readFile } = await import("node:fs/promises");
      const manifest = JSON.parse(await readFile("package.json", "utf8"));
      const installed = JSON.parse(await readFile("node_modules/next/package.json", "utf8"));
      const config = await readFile("next.config.ts", "utf8");
      expect(manifest.dependencies.next).toBe("16.4.3");
      expect(installed.version).toBe(manifest.dependencies.next);
      expect(config).toContain("cacheComponents: true");
      expect(config).toContain("partialPrefetching: true");
      for (const q of nextjsQuestions) {
        expect(q.frameworkVersion, q.id).toBe(installed.version);
        const frameworkConcept = q.concepts.some((c) =>
          ["nextRouting", "nextBoundaries", "nextDataFetching", "nextRendering", "nextCaching", "nextDataBoundaries", "nextMutations"].includes(c));
        const api = /use cache|cacheLife|cacheTag|revalidateTag|updateTag|revalidatePath|cookies\(\)|headers\(\)/.test(`${q.prompt} ${q.code} ${q.explanation}`);
        if (frameworkConcept || api) {
          expect(q.versionSensitive, q.id).toBe(true);
          expect(q.versionNotes, q.id).toContain("16.4.3");
          expect(q.versionNotes, q.id).toContain("cacheComponents: true");
          expect(q.prompt, q.id).toContain("Next.js 16.4.3, Cache Components enabled:");
          expect(q.reference, q.id).toMatch(/^https:\/\/nextjs\.org\/docs\/app\//);
        }
      }
      const docs = [
        "01-getting-started/05-server-and-client-components.md", "01-getting-started/08-caching.md",
        "01-getting-started/09-revalidating.md", "01-getting-started/15-route-handlers.md",
        "03-api-reference/04-functions/revalidateTag.md", "03-api-reference/04-functions/revalidatePath.md",
        "03-api-reference/01-directives/use-cache.md", "03-api-reference/03-file-conventions/error.md",
      ];
      for (const path of docs) {
        expect((await readFile(`node_modules/next/dist/docs/01-app/${path}`, "utf8")).length).toBeGreaterThan(100);
      }
    });

    it("rejects every distractor, records exact failed fields/tags, and zeroes critical mistakes", () => {
      for (const q of nextjsQuestions) {
        const correct = JSON.parse(solution(q));
        expect(evaluateStructured(q, solution(q))).toMatchObject({ result: "correct", score: 1, failed: [], mistakeTags: [] });
        for (const f of q.structured!.fields) {
          if (f.kind !== "select") continue;
          for (const distractor of f.choices.filter((c) => !f.correct.includes(c.id))) {
            const wrong = JSON.stringify({ ...correct, [f.id]: [distractor.id] });
            const grade = evaluateStructured(q, wrong);
            expect(grade.result, `${q.id}/${f.id}/${distractor.id}`).not.toBe("correct");
            expect(grade.failed).toEqual([f.id]);
            if (f.misconceptionTag) expect(grade.mistakeTags).toContain(f.misconceptionTag);
            if (f.severity === "critical") expect(grade).toMatchObject({ score: 0, result: "miss" });
          }
          const incomplete = JSON.stringify({ ...correct, [f.id]: [] });
          expect(() => evaluateStructured(q, incomplete)).toThrow("Complete every part");
          const unknown = JSON.stringify({ ...correct, [f.id]: ["fabricated-choice"] });
          expect(() => evaluateStructured(q, unknown)).toThrow("Complete every part");
          if (f.multiple) {
            const duplicated = JSON.stringify({ ...correct, [f.id]: [...f.correct, f.correct[0]] });
            expect(() => evaluateStructured(q, duplicated)).toThrow();
            expect(evaluateStructured(q, JSON.stringify({ ...correct, [f.id]: [...f.correct].reverse() })).result)
              .toBe("correct");
          }
        }
      }
    });

    it.each([
      ["nextfa-arch-pdp-legal-price", "Cache content separately"],
      ["nextfa-arch-pdp-reservation", "Server validates/reserves"],
      ["nextfa-arch-separate-repositories", "Separate repositories"],
      ["nextfa-arch-mono-ci-scale", "Dependency-aware affected"],
      ["nextfa-arch-incident-ttfb", "Correlate backend"],
      ["nextfa-arch-incident-cache", "Compare cache/rendering"],
      ["nextfa-arch-incident-inp", "Profile client bundle"],
      ["nextfa-arch-ui-mutation-alternative", "Server Action reusing"],
      ["nextfa-cache-webhook-expiry", "revalidateTag(tag, { expire: 0 })"],
    ])("keeps the substantive decision correct for %s", (id, expected) => {
      const q = nextjsQuestions.find((q) => q.id === id)!;
      const field = q.structured!.fields[0];
      expect(field.kind).toBe("select");
      if (field.kind === "select") expect(field.correct[0]).toContain(expected);
    });
  });

  describe("Next.js readiness profiles A-G", () => {
    const config = moduleRegistry["nextjs-frontend-architecture"].readinessConfig;
    const question = (id: string) => nextjsQuestions.find((q) => q.id === `nextfa-${id}`)!;
    const miss = (progress: ReturnType<typeof emptyProgress>, id: string) => {
      const q = question(id);
      return record(progress, q, q.structured!.fields[0].id);
    };
    const repeated = (id: string) => miss(miss(readyNextProgress(), id), id);

    it("A: strong recall without mixed-freshness PDP architecture is not ready", () => {
      const progress = nextjsQuestions.filter((q) => q.depth === "core" &&
        !(q.mode === "architecture" && q.readinessDimensions?.includes("pdp")))
        .reduce((p, q) => record(p, q), emptyProgress());
      expect(readiness(progress, nextjsQuestions, config).mustDo.map((g) => g.id)).toContain("dimension-pdp");
      expect(readiness(progress, nextjsQuestions, config).status).not.toBe("READY TO MOVE ON");
    });
    it("B: excellent architecture does not erase recurring root client-boundary mistakes", () => {
      expect(readiness(repeated("debug-root-client"), nextjsQuestions, config).mustDo.some((g) =>
        g.concept === "nextBoundaries")).toBe(true);
    });
    it("C: 84-88% recent accuracy with an isolated cache edge miss can still be ready", () => {
      let progress = readyNextProgress();
      for (const id of ["cache-webhook-expiry", "route-tree-predict", "nested-loading", "debug-query-modal", "debug-shared-domain-cycle", "cls-image"]) {
        progress = miss(progress, id);
      }
      const checkpoint = readiness(progress, nextjsQuestions, config);
      expect(checkpoint.recentAccuracy).toBeGreaterThanOrEqual(0.84);
      expect(checkpoint.recentAccuracy).toBeLessThanOrEqual(0.88);
      expect(checkpoint.mustDo, JSON.stringify(checkpoint.mustDo)).toEqual([]);
      expect(checkpoint.status).toBe("READY TO MOVE ON");
    });
    it("D: generic UI state in Query is a must-do despite strong architecture", () => {
      expect(readiness(repeated("debug-query-modal"), nextjsQuestions, config).mustDo.some((g) =>
        g.concept === "nextDataFetching")).toBe(true);
    });
    it("E: missing monorepo trade-offs blocks readiness", () => {
      let progress = readyNextProgress();
      for (const id of ["arch-related-monorepo", "arch-separate-repositories", "arch-mono-ci-scale", "arch-mono-governance"]) {
        progress = miss(progress, id);
      }
      expect(readiness(progress, nextjsQuestions, config).mustDo.map((g) => g.id)).toContain("dimension-monorepo");
    });
    it("F: React optimization skills do not replace backend/cache/TTFB diagnosis", () => {
      let progress = readyNextProgress();
      for (const id of ["arch-incident-ttfb", "arch-incident-cache", "arch-incident-cdn-only", "arch-incident-server-waterfall"]) {
        progress = miss(progress, id);
      }
      expect(readiness(progress, nextjsQuestions, config).mustDo.map((g) => g.id)).toContain("dimension-performance");
    });
    it("G: an isolated advanced tool-specific miss remains optional", () => {
      const progress = miss(readyNextProgress(), "mono-tool-specific-optional");
      const checkpoint = readiness(progress, nextjsQuestions, config);
      expect(checkpoint.mustDo).toEqual([]);
      expect(checkpoint.canDoLater.map((q) => q.id)).toContain("nextfa-mono-tool-specific-optional");
    });
    it("old correct totals and easy recall cannot swamp recent architecture misses", () => {
      let progress = readyNextProgress();
      const incidents = nextjsQuestions.filter((q) => q.id.startsWith("nextfa-arch-incident-")).slice(0, 8);
      for (const q of incidents) progress = record(progress, q, q.structured!.fields[0].id);
      for (const q of nextjsQuestions.filter((q) => q.mode === "reconstruction")) progress = record(progress, q);
      const checkpoint = readiness(progress, nextjsQuestions, config);
      expect(checkpoint.mustDo.map((g) => g.id)).toContain("dimension-performance");
      expect(checkpoint.mustDo.map((g) => g.id)).toContain("dimension-architecture");
    });
    it("requires architecture-mode evidence in every mandatory dimension", () => {
      const progress = nextjsQuestions.filter((q) => q.depth === "core" && q.mode !== "architecture")
        .reduce((p, q) => record(p, q), emptyProgress());
      const checkpoint = readiness(progress, nextjsQuestions, config);
      for (const dimension of config.readinessDimensions!) {
        expect(checkpoint.mustDo.map((g) => g.id)).toContain(`dimension-${dimension.id}`);
      }
    });
    it("repeating one correct scenario cannot manufacture breadth", () => {
      let progress = emptyProgress();
      for (let i = 0; i < 100; i++) progress = record(progress, question("arch-pdp-legal-price"));
      expect(readiness(progress, nextjsQuestions, config).mustDo.map((g) => g.id)).toContain("dimension-pdp");
    });
    it("weakness cards require demonstrated mistakes, and review alone cannot clear readiness", () => {
      expect(weaknessCards(emptyProgress(), nextjsQuestions)).toEqual([]);
      let progress = repeated("debug-internal-hop");
      expect(weaknessCards(progress, nextjsQuestions).map((q) => q.id)).toContain("nextfa-debug-internal-hop");
      progress = reviewCard(progress, "nextfa-debug-internal-hop", true);
      expect(readiness(progress, nextjsQuestions, config).mustDo.some((g) => g.concept === "nextDataBoundaries")).toBe(true);
    });
  });

  it("allows non-perfect recent scores and does not require optional depth", () => {
    let progress = readyNextProgress();
    for (const [id, field] of [
      ["nextfa-route-tree-predict", "layouts"],
      ["nextfa-rendering-choice", "answer"],
      ["nextfa-cache-statement-check", "truth"],
    ]) {
      progress = record(progress, nextjsQuestions.find((question) => question.id === id)!, field);
    }
    const checkpoint = readiness(progress, nextjsQuestions, moduleRegistry["nextjs-frontend-architecture"].readinessConfig);
    expect(checkpoint.recentAccuracy).toBeGreaterThanOrEqual(0.82);
    expect(checkpoint.mustDo, JSON.stringify(checkpoint.mustDo)).toEqual([]);
    expect(checkpoint.status).toBe("READY TO MOVE ON");
    expect(checkpoint.canDoLater.some((question) => question.id === "nextfa-route-groups-optional")).toBe(true);
  });

  it("detects repeated client-boundary misconceptions and creates only targeted weakness cards", () => {
    const question = nextjsQuestions.find((item) => item.id === "nextfa-client-module-graph")!;
    let progress = record(emptyProgress(), question, "graph");
    progress = record(progress, question, "graph");
    const checkpoint = readiness(progress, nextjsQuestions, moduleRegistry["nextjs-frontend-architecture"].readinessConfig);
    expect(checkpoint.mustDo.some((gap) => gap.concept === "nextBoundaries" && gap.label.includes("misconception"))).toBe(true);
    expect(weaknessCards(progress, nextjsQuestions).map((item) => item.id)).toContain(question.id);
  });

  it("persists Next.js progress independently from JavaScript/TypeScript", () => {
    const storage = memoryStorage();
    const nextModule = moduleRegistry["nextjs-frontend-architecture"];
    const jsModule = moduleRegistry["javascript-typescript"];
    const nextStore = createProgressStore(() => storage, nextModule.storageKey, nextModule.questions);
    const jsStore = createProgressStore(() => storage, jsModule.storageKey, jsModule.questions);
    nextStore.hydrate();
    jsStore.hydrate();
    const nextQuestion = nextModule.questions[0];
    nextStore.update(record(emptyProgress(), nextQuestion));
    expect(storage.getItem(nextModule.storageKey)).not.toBeNull();
    expect(storage.getItem(jsModule.storageKey)).toBeNull();
    expect(jsStore.getSnapshot().progress.attempts).toHaveLength(0);
    expect(nextStore.getSnapshot().progress.attempts[0].questionId).toBe(nextQuestion.id);
    expect(storage.getItem(nextModule.storageKey)).not.toContain("prompt");
  });

  it("round-trips the expanded bank's correct/partial/missed attempts, failed fields, tags, review and draft", () => {
    const storage = memoryStorage();
    const trainingModule = moduleRegistry["nextjs-frontend-architecture"];
    const store = createProgressStore(() => storage, trainingModule.storageKey, nextjsQuestions);
    store.hydrate();
    let progress = readyNextProgress();
    for (const q of nextjsQuestions) {
      progress = record(progress, q, q.structured!.fields[0].id);
    }
    const draftQuestion = nextjsQuestions.find((q) => q.id === "nextfa-arch-route-tree-recovery")!;
    const draft = JSON.stringify({ shell: ["shop/layout.tsx"] });
    progress = {
      ...reviewCard(progress, "nextfa-debug-internal-hop", true),
      resume: { questionId: draftQuestion.id, answer: draft, revealed: false, attemptIndex: null, practiceMode: "architecture" },
    };
    store.update(progress);
    const restored = createProgressStore(() => storage, trainingModule.storageKey, nextjsQuestions);
    restored.hydrate();
    expect(restored.getSnapshot().error).toBeNull();
    expect(restored.getSnapshot().progress).toEqual(progress);
    expect(progress.attempts.some((a) => a.finalResult === "partial")).toBe(true);
    expect(progress.attempts.some((a) => a.finalResult === "miss")).toBe(true);
    const raw = storage.getItem(trainingModule.storageKey)!;
    expect(raw).not.toContain("explanation");
    expect(raw).not.toContain("frameworkVersion");
  });
});
