import { expect, test, type Page } from "@playwright/test";
import { moduleRegistry } from "../lib/modules";
import { nextjsQuestions } from "../data/nextjs-questions";
import type { Question } from "../lib/model";
import { readyNextProgress } from "../tests/nextjs-fixtures";

const trainingModule = moduleRegistry["nextjs-frontend-architecture"];
const storageKey = trainingModule.storageKey;

async function fillQuestion(page: Page, question: Question) {
  for (const field of question.structured!.fields) {
    if (field.kind === "text") {
      await page.getByLabel(field.label, { exact: true }).fill(field.accepted[0]);
    } else if (field.multiple) {
      const group = page.getByRole("group", { name: `${field.label} (select all that apply)`, exact: true });
      for (const answer of field.correct) await group.getByLabel(answer, { exact: true }).check();
    } else {
      await page.getByLabel(field.label, { exact: true }).selectOption(field.correct[0]);
    }
  }
}

async function resumeQuestion(page: Page, question: Question) {
  await page.evaluate(({ key, questionId, mode }) => {
    const progress = JSON.parse(localStorage.getItem(key)!);
    progress.resume = { questionId, answer: "", revealed: false, attemptIndex: null, practiceMode: mode };
    localStorage.setItem(key, JSON.stringify(progress));
  }, { key: storageKey, questionId: question.id, mode: question.mode });
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
}

async function completeMode(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const questionId = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).resume.questionId, storageKey);
  const question = nextjsQuestions.find((candidate) => candidate.id === questionId)!;
  const expectedMode = Object.entries(trainingModule.modes).find(([, modeLabel]) => modeLabel === label)?.[0];
  expect(question.mode).toBe(expectedMode);
  await fillQuestion(page, question);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("status")).toHaveText("Correct");
  await page.getByRole("button", { name: "Back to dashboard" }).click();
}

test("Next.js module runs all four modes, resumes, diagnoses architecture, and reaches readiness without optional depth", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Next.js + Frontend Architecture" }).click();
  await expect(page).toHaveURL(/\/modules\/nextjs-frontend-architecture$/);
  await expect(page.getByRole("heading", { name: "NEXT.JS + FRONTEND ARCHITECTURE DRILL" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Training modes" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByText("Question context: Next.js 16.4.3. Caching exercises assume cacheComponents: true, matching next.config.ts.")).toBeVisible();

  await completeMode(page, "Predict It");
  await completeMode(page, "Concept Reconstruction");
  await completeMode(page, "Debug It");
  await completeMode(page, "Architecture & Diagnosis");

  const pdp = nextjsQuestions.find((question) => question.id === "nextfa-pdp-freshness-matrix")!;
  await resumeQuestion(page, pdp);
  const firstPdpField = pdp.structured!.fields[0];
  if (firstPdpField.kind === "select") {
    await page.getByLabel(firstPdpField.label, { exact: true }).selectOption(firstPdpField.correct[0]);
  }
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  if (firstPdpField.kind === "select") {
    await expect(page.getByLabel(firstPdpField.label, { exact: true })).toHaveValue(firstPdpField.correct[0]);
  }
  await fillQuestion(page, pdp);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("status")).toHaveText("Correct");
  await page.getByRole("button", { name: "Back to dashboard" }).click();

  const performance = nextjsQuestions.find((question) => question.id === "nextfa-performance-server-evidence")!;
  await resumeQuestion(page, performance);
  await expect(page.getByRole("heading", { name: performance.prompt })).toBeVisible();
  await fillQuestion(page, performance);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("status")).toHaveText("Correct");
  await page.getByRole("button", { name: "Back to dashboard" }).click();

  const ready = readyNextProgress();
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: storageKey, progress: ready });
  await page.reload();
  const readiness = page.getByRole("region", { name: "NEXT.JS + FRONTEND ARCHITECTURE READINESS" });
  await expect(readiness.getByText("READY TO MOVE ON", { exact: true })).toBeVisible();
  await expect(readiness.getByText("Must-do: 0 / Core coverage: 10 / 10")).toBeVisible();
  await expect(readiness.getByText(/CAN DO LATER - Optional depth \(2 exercises\)/)).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(saved.attempts.some((attempt: { questionId: string }) =>
    attempt.questionId === "nextfa-route-groups-optional")).toBe(false);
});

test("PDP, monorepo and performance architecture errors remain graded and persisted rather than self-overridden", async ({ page }) => {
  await page.goto(trainingModule.path);
  await page.getByRole("button", { name: "Architecture & Diagnosis", exact: true }).click();
  await page.getByRole("button", { name: "Back to dashboard" }).click();

  for (const id of ["arch-pdp-legal-price", "arch-separate-repositories", "arch-incident-ttfb"]) {
    const question = nextjsQuestions.find((q) => q.id === `nextfa-${id}`)!;
    await resumeQuestion(page, question);
    await expect(page.getByRole("button", { name: "Submit answer" })).toBeDisabled();
    await fillQuestion(page, question);
    const field = question.structured!.fields[0];
    if (field.kind !== "select") throw new Error("Expected a select-only architecture exercise.");
    const wrong = field.choices.find((choice) => !field.correct.includes(choice.id))!;
    await page.getByLabel(field.label, { exact: true }).selectOption(wrong.id);
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByRole("status")).toHaveText("Not correct");
    await expect(page.getByRole("button", { name: "Correct", exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Resume saved question" }).click();
    await expect(page.getByRole("status")).toHaveText("Not correct");
    await expect(page.getByLabel(field.label, { exact: true })).toHaveValue(wrong.id);
    await page.getByRole("button", { name: "Back to dashboard" }).click();
  }
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(saved.attempts).toHaveLength(3);
  for (const attempt of saved.attempts) {
    expect(attempt.finalResult).toBe("miss");
    expect(attempt.score).toBe(0);
    expect(attempt.overridden).toBe(false);
    expect(attempt.failedFields).toEqual(["decision"]);
    expect(attempt.mistakeTags).toHaveLength(1);
  }
  expect(await page.evaluate(() => localStorage.getItem("react-drill.progress.v1"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("js-ts-drill.progress.v1"))).toBeNull();
});
