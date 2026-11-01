import { expect, it } from "vitest";
import { questions } from "@/data/questions";
import { concepts, modes, type Concept } from "@/lib/model";
import { coreHardQuestions } from "@/data/core-hard-questions";
import { implementationGroups } from "@/lib/learning";

it("keeps core-depth and required-implementation IDs linked to real exercises", () => {
  for (const id of coreHardQuestions) {
    expect(questions.find((q) => q.id === id)?.depth, id).toBe("core");
  }
  for (const group of implementationGroups) {
    for (const id of group.questions) {
      expect(questions.find((q) => q.id === id), id).toMatchObject({ mode: "implement" });
    }
  }
});

it("keeps a varied bank within the requested size and mode distribution", () => {
  const active = questions.filter((question) => question.mode !== "legacyConcept");
  expect(active.length).toBeGreaterThanOrEqual(150);
  expect(active.length).toBeLessThanOrEqual(190);
  const ranges: Record<keyof typeof modes, [number, number]> = {
    prints: [55, 65], reconstruction: [25, 40], debug: [40, 50], implement: [25, 35],
  };
  for (const mode of Object.keys(modes) as (keyof typeof modes)[]) {
    const bank = active.filter(q => q.mode === mode);
    expect(bank.length, mode).toBeGreaterThanOrEqual(ranges[mode][0]);
    expect(bank.length, mode).toBeLessThanOrEqual(ranges[mode][1]);
    for (const difficulty of ["easy", "medium", "hard"]) {
      const minimum = difficulty === "hard" && mode === "reconstruction" ? 1 : 3;
      expect(bank.filter(q => q.difficulty === difficulty).length, `${mode}/${difficulty}`).toBeGreaterThanOrEqual(minimum);
    }
  }
});

it.each(Object.keys(concepts) as Concept[])("%s has reconstruction and practical coverage", concept => {
  const bank = questions.filter(q => q.concepts.includes(concept));
  expect(bank.some(q => q.mode === "reconstruction"), `${concept}/reconstruction`).toBe(true);
  expect(bank.some(q => q.mode === "prints"), `${concept}/prints`).toBe(true);
  expect(bank.some(q => q.mode === "debug"), `${concept}/debug`).toBe(true);
});

it("provides specific review metadata, unique prompts, and code on practical exercises", () => {
  const reconstruction = questions.filter(q => q.mode === "reconstruction");
  expect(reconstruction.every((q) => q.structured && !Object.hasOwn(q, "rubric"))).toBe(true);
  expect(new Set(reconstruction.map(q => q.prompt)).size).toBe(reconstruction.length);
  for (const q of questions) {
    expect(q.misconception.prompt.trim().length, q.id).toBeGreaterThan(20);
    expect(q.misconception.answer, q.id).toBe(q.explanation);
    expect(q.concepts.length, q.id).toBeGreaterThan(0);
    expect(new Set(q.concepts).size, q.id).toBe(q.concepts.length);
    if (q.mode === "prints" || q.mode === "debug") expect(q.code?.trim(), q.id).toBeTruthy();
    if (q.mode === "implement") expect(q.reference?.trim(), q.id).toBeTruthy();
  }
});
