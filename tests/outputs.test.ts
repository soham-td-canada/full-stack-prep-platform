import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";
import { questions } from "@/data/questions";

// Execute only the repository-authored fixtures, never learner input.
it.each(questions.filter((q) => q.mode === "prints"))("$id has a correct expected output", async (question) => {
  const logs: string[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const code = ts.transpileModule(question.code!, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  try {
    runInNewContext(code, {
      console: { log: (...values: unknown[]) => logs.push(values.map(String).join(" ")) },
      queueMicrotask,
      setTimeout: (fn: () => void, delay: number) => {
        const timer = setTimeout(fn, delay);
        timers.push(timer);
        return timer;
      },
      clearTimeout,
    }, { timeout: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 60));
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error) logs.push(String(error.name));
    else throw error;
  } finally {
    timers.forEach(clearTimeout);
  }
  expect(logs.join("\n")).toBe(question.answer);
});
