import { expect, test } from "@playwright/test";
import { questions } from "../data/questions";
import { recordAttempt, startSession } from "../lib/learning";
import { emptyProgress } from "../lib/model";
import { readyProgress } from "../tests/fixtures";

const storageKey = "js-ts-drill.progress.v1";

test("root shows only configured module dashboards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "INTERVIEW DRILL" })).toBeVisible();
  await expect(page.getByRole("link", { name: "JavaScript / TypeScript" })).toHaveAttribute("href", "/modules/javascript-typescript");
  await expect(page.getByRole("link", { name: "React" })).toHaveAttribute("href", "/modules/react");
  await expect(page.getByText("2 modules configured")).toBeVisible();
});

test("prediction, feedback, persistence and different next-question flow", async ({ page }) => {
  await page.goto("/modules/javascript-typescript");
  await expect(page.getByRole("heading", { name: "JAVASCRIPT / TYPESCRIPT DRILL" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Training modes" }).getByRole("button")).toHaveCount(4);
  await page.getByRole("button", { name: "What Prints?", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Expected answer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit answer" })).toBeDisabled();
  const originalCode = await page.locator("pre").innerText();
  await page.getByLabel("Your predicted output / behaviour").fill("undefined\n3");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("status")).toHaveText("Correct");
  await expect(page.getByLabel("Your predicted output / behaviour")).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await expect(page.getByRole("status")).toHaveText("Correct");
  await expect(page.getByLabel("Your predicted output / behaviour")).toHaveValue("undefined\n3");
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.locator("pre").first()).not.toHaveText(originalCode);
});

test("Concept Reconstruction grades individual blanks without prose override", async ({ page }) => {
  await page.goto("/modules/javascript-typescript");
  await page.getByRole("button", { name: "Concept Reconstruction", exact: true }).click();
  await page.getByLabel("X", { exact: true }).fill("incorrect");
  await page.getByLabel("Y", { exact: true }).fill("initialization");
  await page.getByLabel("A", { exact: true }).fill("inner function");
  await page.getByLabel("B", { exact: true }).fill("lexical");
  await page.getByLabel("C", { exact: true }).fill("returned");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByText("Score: 80%", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as Correct" })).toHaveCount(0);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).attempts[0], storageKey);
  expect(saved).toMatchObject({ autoResult: "partial", finalResult: "partial", overridden: false, score: 0.8 });
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await expect(page.getByRole("status")).toHaveText("Partial");
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("incorrect");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).attempts.length, storageKey)).toBe(1);
});

for (const mode of ["Debug It", "Implement It"]) {
  test(`${mode}: write, reveal, self-assess and save`, async ({ page }) => {
    await page.goto("/modules/javascript-typescript");
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.getByLabel("Your answer", { exact: true }).fill("My reasoned original answer and proposed implementation.");
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByRole("heading", { name: "Expected answer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next question" })).toHaveCount(0);
    await page.getByRole("button", { name: "I missed something" }).click();
    await expect(page.getByRole("status")).toHaveText("Not correct (self-assessed)");
    await page.reload();
    await page.getByRole("button", { name: "Resume saved question" }).click();
    await expect(page.getByRole("status")).toHaveText("Not correct (self-assessed)");
  });
}

test("weakness cards require recall and reviews do not change readiness", async ({ page }) => {
  await page.goto("/modules/javascript-typescript");
  await expect(page.getByRole("button", { name: "Review Weak Areas" })).toHaveCount(0);
  const question = questions.find((q) => q.id === "copy-spread")!;
  const progress = [1, 2, 3].reduce((p, time) => recordAttempt(p, question, false, time), emptyProgress());
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: storageKey, progress });
  await page.reload();
  await page.getByRole("button", { name: "Review Weak Areas" }).click();
  await expect(page.getByRole("button", { name: "Reveal explanation" })).toBeDisabled();
  await page.getByLabel("Your recalled concept / fix").fill("Spread retains the same nested user reference.");
  await page.getByRole("button", { name: "Reveal explanation" }).click();
  await expect(page.getByText("Spread copies top-level properties.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Understood - finish review" }).click();
  await page.getByRole("button", { name: "Back to drills" }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(saved.attempts).toEqual(progress.attempts);
  expect(saved.reviews["copy-spread"].successful).toBe(true);
  await expect(page.getByText("References / Copying: 2 more core questions")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Review Weak Areas" })).toBeVisible();
});

test("reaches READY TO MOVE ON with optional work remaining and without perfect accuracy", async ({ page }) => {
  await page.goto("/modules/javascript-typescript");
  const guard = questions.find((q) => q.id === "ts-guard")!;
  let progress = readyProgress();
  progress.attempts = progress.attempts.filter((a) => a.questionId !== guard.id);
  progress = recordAttempt(progress, questions.find((q) => q.id === "promise-race")!, "partial");
  progress = recordAttempt(progress, questions.find((q) => q.id === "print-spread-getter")!, false);
  progress = startSession(progress, 10, questions);
  progress.resume = { questionId: guard.id, answer: "", revealed: false, attemptIndex: null };
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: storageKey, progress });
  await page.reload();
  await expect(page.getByText("Complete one TypeScript runtime guard", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await page.getByLabel("Your answer", { exact: true }).fill(guard.reference!);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await page.getByRole("button", { name: "I got it right" }).click();
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  const readinessSection = page.getByRole("region", { name: "JS / TS READINESS" });
  await expect(readinessSection.getByText("READY TO MOVE ON", { exact: true })).toBeVisible();
  await expect(readinessSection.getByText("Must-do: 0 / Core coverage: 10 / 10")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue Must-Do Practice" })).toHaveCount(0);
  await expect(page.getByText("Recommended next step: Move to the next interview topic.")).toBeVisible();
  await page.getByText(/CAN DO LATER - Optional depth/).click();
  await expect(page.getByRole("button", { name: /Implement a JavaScript trailing debounce with cancel/ })).toBeVisible();
  await page.reload();
  await expect(readinessSection.getByText("READY TO MOVE ON", { exact: true })).toBeVisible();
});

test("session completion stops drilling and persists its checkpoint", async ({ page }) => {
  await page.goto("/modules/javascript-typescript");
  let progress = startSession(emptyProgress(), 10, questions);
  for (let i = 0; i < 9; i++) progress = recordAttempt(progress, questions[0], true, i);
  progress.resume = { questionId: "scope-closure", answer: "", revealed: false, attemptIndex: null, practiceMode: "reconstruction" };
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: storageKey, progress });
  await page.reload();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await page.getByLabel("X", { exact: true }).fill("let / const");
  await page.getByLabel("Y", { exact: true }).fill("initialization");
  await page.getByLabel("A", { exact: true }).fill("inner function");
  await page.getByLabel("B", { exact: true }).fill("lexical");
  await page.getByLabel("C", { exact: true }).fill("returned");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByRole("heading", { name: "SESSION COMPLETE" })).toBeVisible();
  await expect(page.getByText("Questions completed: 10")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit answer" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "SESSION COMPLETE" })).toBeVisible();
  await page.getByRole("button", { name: "Resume saved question" }).click();
  await expect(page.getByRole("status")).toHaveText("Correct");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(saved.attempts).toHaveLength(10);
  expect(saved.session.completed).toBe(true);
  expect(saved.attempts[9]).toMatchObject({ autoResult: "correct", finalResult: "correct", overridden: false });
});

test("corrupt storage is visible and only cleared by a confirmed reset", async ({ page }) => {
  await page.goto("/modules/javascript-typescript");
  await page.evaluate((key) => localStorage.setItem(key, "{"), storageKey);
  await page.reload();
  const storageAlert = page.getByRole("alert").filter({ hasText: "Cannot load local progress" });
  await expect(storageAlert).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("{");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset local progress" }).click();
  await expect(storageAlert).toHaveCount(0);
  await page.reload();
  await expect(storageAlert).toHaveCount(0);
  await expect(page.getByText("Last session: Not started")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue Must-Do Practice" })).toBeVisible();
});
