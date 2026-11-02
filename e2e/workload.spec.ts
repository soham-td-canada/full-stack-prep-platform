import { expect, test, type Page } from "@playwright/test";
import { moduleRegistry } from "../lib/modules";
import { calculateRequiredWork } from "../lib/required-work";
import { emptyProgress, type Progress, type Question } from "../lib/model";
import { startSession } from "../lib/learning";
import { readyReactProgress } from "../tests/react-fixtures";

const trainingModule = moduleRegistry.react;
const key = trainingModule.storageKey;

async function seed(page: Page, progress: Progress) {
  await page.goto(trainingModule.path);
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key, progress });
  await page.reload();
}

async function fill(page: Page, question: Question) {
  for (const field of question.structured!.fields) {
    if (field.kind === "text") await page.getByLabel(field.label, { exact: true }).fill(field.accepted[0]);
    else if (field.multiple) {
      const group = page.getByRole("group", { name: `${field.label} (select all that apply)`, exact: true });
      for (const id of field.correct) await group.getByLabel(id, { exact: true }).check();
    } else await page.getByLabel(field.label, { exact: true }).selectOption(field.correct[0]);
  }
}

test("root and module show required counts, breakdowns, mode priority, and a bounded resumable session", async ({ page }) => {
  const work = calculateRequiredWork(emptyProgress(), trainingModule);
  await page.goto("/");
  const modules = page.getByRole("region", { name: "Configured interview modules" });
  await expect(modules.getByTestId("required-count")).toHaveCount(3);
  await page.screenshot({ path: "test-results/root-workload.png", fullPage: true });
  await page.getByRole("link", { name: "React", exact: true }).click();
  await expect(page.getByRole("region", { name: "Module required work" })).toContainText(`${work.totalRequiredRemaining}`);
  const mustDo = page.getByRole("region", { name: "MUST DO NEXT" });
  await expect(mustDo.getByRole("listitem").first()).toContainText("Code Review / Refactor");
  for (const mode of ["debug", "codeReview"] as const) {
    const card = page.getByRole("article", { name: `${trainingModule.modes[mode]} progress` });
    await expect(card).toContainText(`${work.modes.find((m) => m.mode === mode)!.requiredRemaining} REQUIRED LEFT`);
    await card.getByText("Why work remains").click();
    await expect(card.getByRole("list")).toBeVisible();
  }
  await page.getByLabel("Session size (next session)").selectOption("10");
  await page.getByRole("button", { name: "Continue React Must-Do" }).click();
  await page.screenshot({ path: "test-results/react-workload.png", fullPage: true });
  const header = page.getByRole("region", { name: "Current session" });
  await expect(header).toContainText("Question 1 / 10");
  await expect(header).toContainText(`${work.totalRequiredRemaining}`);
  const id = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).resume.questionId, key);
  expect(work.modes.find((m) => m.mode === trainingModule.questions.find((q) => q.id === id)!.mode)?.state).toBe("required");
  const start = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).session.startedAt, key);
  await expect(header.getByText("Elapsed: 00:00")).not.toBeVisible({ timeout: 4000 });
  await fill(page, trainingModule.questions.find((q) => q.id === id)!);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(header).toContainText("Question 2 / 10");
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await expect(header).toContainText("Question 2 / 10");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).session.startedAt, key)).toBe(start);
  await page.getByRole("button", { name: "End Session", exact: true }).click();
  await expect(page.getByRole("region", { name: "SESSION COMPLETE" })).toContainText("Before:");
  await expect(page.getByRole("region", { name: "SESSION COMPLETE" })).toContainText("Now:");
  await page.screenshot({ path: "test-results/session-summary.png", fullPage: true });
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).attempts.length, key)).toBe(1);
});

test("complete is disabled, unseen optional work does not block readiness, and migration keeps evidence", async ({ page }) => {
  const progress = readyReactProgress();
  const unseen = trainingModule.questions.find((q) => q.mode === "reconstruction")!;
  progress.attempts = progress.attempts.filter((a) => a.questionId !== unseen.id);
  const work = calculateRequiredWork(progress, trainingModule);
  expect(work.totalRequiredRemaining).toBe(0);
  await seed(page, progress);
  const prediction = page.getByRole("article", { name: "Predict It progress" });
  await expect(prediction).toContainText("COMPLETE");
  await expect(prediction.getByRole("button", { name: "Predict It", exact: true })).toBeDisabled();
  const reconstruction = page.getByRole("article", { name: "Concept Reconstruction progress" });
  await expect(reconstruction).toContainText("REQUIRED WORK COMPLETE");
  const overview = page.getByRole("region", { name: "Module required work" });
  await expect(overview).toContainText("READY TO MOVE ON");
  await expect(overview).toContainText("0 REQUIRED QUESTIONS LEFT");
  await page.screenshot({ path: "test-results/ready-workload.png", fullPage: true });
  await expect(page.getByRole("link", { name: "Move to next module" })).toBeVisible();
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.schemaVersion = 5;
    delete saved.selectedSessionSize;
    localStorage.setItem(key, JSON.stringify(saved));
  }, key);
  await page.reload();
  const restored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(restored.schemaVersion).toBe(6);
  expect(restored.attempts).toEqual(progress.attempts);
  await expect(overview).toContainText("READY TO MOVE ON");
});

test("clearing a final required review shows a genuine before/after stopping point", async ({ page }) => {
  const question = trainingModule.questions.find((q) => q.id === "react-review-profile")!;
  let progress = readyReactProgress();
  progress.attempts = progress.attempts.filter((a) => a.questionId !== question.id &&
    (trainingModule.questions.find((q) => q.id === a.questionId)?.reviewLevel !== 3 ||
      a.questionId === "react-review-realistic-catalog"));
  const before = calculateRequiredWork(progress, trainingModule).totalRequiredRemaining;
  expect(before).toBeGreaterThan(0);
  progress = startSession(progress, 1, trainingModule.questions, trainingModule.readinessConfig);
  progress.session!.initialRequired = before;
  progress.resume = { questionId: question.id, answer: "", revealed: false, attemptIndex: null, practiceMode: "codeReview" };
  await seed(page, progress);
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await fill(page, question);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await page.getByRole("button", { name: "Finish session" }).click();
  const summary = page.getByRole("region", { name: "SESSION COMPLETE" });
  await expect(summary).toContainText(`Before: ${before}`);
  await expect(summary).toContainText("Now: 0");
  await expect(page.getByRole("region", { name: "Module required work" })).toContainText("READY TO MOVE ON");
});

test("mobile session keeps workload, position and clock visible without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(trainingModule.path);
  await page.getByRole("button", { name: "Continue React Must-Do" }).click();
  const header = page.getByRole("region", { name: "Current session" });
  await expect(header).toContainText("REQUIRED");
  await expect(header).toContainText("Question 1 / 10");
  await expect(header).toContainText("Elapsed:");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-session.png", fullPage: true });
});

test("opening and skipping never clear required evidence", async ({ page }) => {
  await seed(page, emptyProgress());
  const before = calculateRequiredWork(emptyProgress(), trainingModule).totalRequiredRemaining;
  await page.getByRole("button", { name: "Continue React Must-Do" }).click();
  await page.getByRole("button", { name: "Skip question" }).click();
  await expect(page.getByRole("region", { name: "Current session" })).toContainText(`${before}`);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(saved.attempts).toHaveLength(0);
  expect(saved.session.skipped).toHaveLength(1);
});

test("all configured module overviews retain a compact visual hierarchy", async ({ page }) => {
  for (const trainingModule of Object.values(moduleRegistry)) {
    await page.goto(trainingModule.path);
    await expect(page.getByRole("region", { name: "Module required work" })).toContainText("REQUIRED QUESTIONS LEFT");
    await page.screenshot({ path: `test-results/${trainingModule.id}-overview.png`, fullPage: true });
  }
});

test("deep modes default to three exercises and explicit short must-do sessions are honored", async ({ page }) => {
  await page.goto(trainingModule.path);
  await page.getByRole("button", { name: "Code Review / Refactor", exact: true }).click();
  await expect(page.getByRole("region", { name: "Current session" })).toContainText("Question 1 / 3");
  await page.getByRole("button", { name: "End Session", exact: true }).click();
  await page.getByLabel("Session size (next session)").selectOption("1");
  await page.getByRole("button", { name: "Continue React Must-Do" }).click();
  await expect(page.getByRole("region", { name: "Current session" })).toContainText("Question 1 / 1");
});
