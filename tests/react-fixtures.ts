import { reactQuestions } from "@/data/react-questions";
import { recordAttempt } from "@/lib/learning";
import { emptyProgress, type Question } from "@/lib/model";

export function structuredSolution(question: Question) {
  if (!question.structured) throw new Error("Expected structured fixture.");
  return JSON.stringify(Object.fromEntries(question.structured.fields.map((field) =>
    [field.id, field.kind === "text" ? [field.accepted[0]] : field.correct])));
}

export function readyReactProgress() {
  return reactQuestions.filter((q) => q.depth === "core").reduce((progress, question) =>
    recordAttempt(progress, question, "correct", progress.attempts.length + 1, structuredSolution(question), "correct"), emptyProgress());
}
