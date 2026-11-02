import { expect, test, type Page } from "@playwright/test";
import { reactQuestions } from "../data/react-questions";
import type { Question } from "../lib/model";
import { recordAttempt, startSession } from "../lib/learning";
import { REACT_STORAGE_KEY, STORAGE_KEY } from "../lib/persistence";
import { readyReactProgress, structuredSolution } from "../tests/react-fixtures";
import { readyProgress } from "../tests/fixtures";

const q = (id: string) => reactQuestions.find((question) => question.id === `react-${id}`)!;
async function fill(page: Page, question: Question) {
  for (const field of question.structured!.fields) {
    if (field.kind === "text") await page.getByLabel(field.label, { exact: true }).fill(field.accepted[0]);
    else if (field.multiple) {
      const group = page.getByRole("group", { name: `${field.label} (select all that apply)`, exact: true });
      for (const answer of field.correct) await group.getByLabel(answer, { exact: true }).check();
    } else await page.getByLabel(field.label, { exact: true }).selectOption(field.correct[0]);
  }
}
async function resumeFixture(page: Page, question: Question) {
  await page.evaluate(({ key, questionId, mode }) => {
    const progress = JSON.parse(localStorage.getItem(key)!);
    progress.resume = { questionId, answer: "", revealed: false, attemptIndex: null, practiceMode: mode };
    localStorage.setItem(key, JSON.stringify(progress));
  }, { key: REACT_STORAGE_KEY, questionId: question.id, mode: question.mode });
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
}

test("select React, complete Predict It, persist and resume without modifying JS/TS", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress: readyProgress() });
  await page.reload();
  const jsBefore = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await page.getByRole("link", { name: "React", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/react$/);
  await expect(page.getByRole("heading", { name: "REACT DRILL" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Training modes" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Concept Questions" })).toHaveCount(0);
  await page.getByRole("button", { name: "Predict It", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit answer" })).toBeDisabled();
  const id = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).resume.questionId, REACT_STORAGE_KEY);
  const question = reactQuestions.find((q) => q.id === id)!;
  await fill(page, question);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("status")).toHaveText("Correct");
  await expect(page.getByRole("button", { name: "I got it right" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await expect(page.getByRole("status")).toHaveText("Correct");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).attempts.length, REACT_STORAGE_KEY)).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(jsBefore);
});

test("X/Y/Z, full matching, Debug It and review use deterministic structured interactions", async ({ page }) => {
  await page.goto("/modules/react");
  await page.getByRole("button", { name: "Predict It", exact: true }).click();
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  for (const id of ["xyz", "hook-match", "debug-loop", "review-basic", "review-catalog"]) {
    const question = q(id);
    await resumeFixture(page, question);
    await expect(page.getByRole("heading", { name: "Expected answer" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit answer" })).toBeDisabled();
    await fill(page, question);
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByRole("status")).toHaveText("Correct");
    await expect(page.getByRole("heading", { name: "Structured feedback" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as Correct" })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to dashboard" }).click();
  }
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).attempts.length, REACT_STORAGE_KEY)).toBe(5);
});

test("structured drafts survive refresh; mistakes generate targeted review without readiness credit", async ({ page }) => {
  await page.goto("/modules/react");
  await page.getByRole("button", { name: "Predict It", exact: true }).click();
  await resumeFixture(page, q("xyz"));
  await page.getByLabel("X", { exact: true }).fill("ref.current");
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("ref.current");
  await expect(page.getByLabel("Y", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Submit answer" })).toBeDisabled();
  await resumeFixture(page, q("ref"));
  await page.getByLabel("Truth", { exact: true }).selectOption("True");
  await page.getByLabel("Correction", { exact: true }).selectOption("Refs are state");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("status")).toHaveText("Not correct");
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await page.getByRole("button", { name: "Review Weak Areas" }).click();
  await expect(page.getByRole("button", { name: "Reveal explanation" })).toBeDisabled();
  await page.getByLabel("Truth", { exact: true }).selectOption("False");
  await page.getByRole("button", { name: "Reveal explanation" }).click();
  await expect(page.getByText("Correct recall.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Understood - finish review" }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), REACT_STORAGE_KEY);
  expect(saved.attempts).toHaveLength(1);
  expect(saved.attempts[0].finalResult).toBe("miss");
  expect(saved.reviews["react-ref"].successful).toBe(true);
  await page.reload();
  await expect(page.getByRole("region", { name: "REACT READINESS" }).getByText("IN PROGRESS", { exact: true })).toBeVisible();
});

test("a final realistic review unlocks readiness with optional depth unfinished", async ({ page }) => {
  await page.goto("/modules/react");
  const question = q("review-profile");
  let progress = readyReactProgress();
  progress.attempts = progress.attempts.filter((a) =>
    a.questionId !== question.id &&
    (reactQuestions.find((candidate) => candidate.id === a.questionId)?.reviewLevel !== 3 ||
      a.questionId === "react-review-realistic-catalog"));
  progress = startSession(progress, 10, reactQuestions);
  progress.resume = { questionId: question.id, answer: "", revealed: false, attemptIndex: null, practiceMode: "codeReview" };
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: REACT_STORAGE_KEY, progress });
  await page.reload();
  const section = page.getByRole("region", { name: "REACT READINESS" });
  await expect(section.getByText(/20. Demonstrate review judgment/)).toBeVisible();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await fill(page, question);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await expect(section.getByText("READY TO MOVE ON", { exact: true })).toBeVisible();
  await expect(section.getByText("Must-do: 0 / Core coverage: 10 / 10")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue React Must-Do" })).toHaveCount(0);
  await page.getByText(/CAN DO LATER - Optional depth/).click();
  await expect(page.getByRole("button", { name: q("optional-lanes").prompt })).toBeVisible();
  await page.reload();
  await expect(section.getByText("READY TO MOVE ON", { exact: true })).toBeVisible();
});

test("poor realistic review blocks readiness even after otherwise strong results", async ({ page }) => {
  await page.goto("/modules/react");
  const question = q("review-catalog");
  const answer = JSON.parse(structuredSolution(question));
  answer.deps = ["FINE AS-IS"];
  const progress = recordAttempt(readyReactProgress(), question, "miss", Date.now(), JSON.stringify(answer), "miss");
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: REACT_STORAGE_KEY, progress });
  await page.reload();
  await expect(page.getByRole("region", { name: "REACT READINESS" }).getByText(/20. Demonstrate review judgment/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue React Must-Do" })).toBeVisible();
});
