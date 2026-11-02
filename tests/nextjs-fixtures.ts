import { nextjsQuestions } from "@/data/nextjs-questions";
import { recordAttempt } from "@/lib/learning";
import { emptyProgress, type Progress, type Question } from "@/lib/model";
import { evaluateStructured } from "@/lib/structured";

export function nextjsStructuredSolution(question: Question) {
  if (!question.structured) throw new Error("Expected a structured Next.js exercise.");
  return JSON.stringify(Object.fromEntries(question.structured.fields.map((field) =>
    [field.id, field.kind === "text" ? [field.accepted[0]] : field.correct])));
}

export function readyNextProgress(): Progress {
  return nextjsQuestions.filter((question) => question.depth === "core").reduce((progress, question) => {
    const answer = nextjsStructuredSolution(question);
    const result = evaluateStructured(question, answer).result;
    return recordAttempt(progress, question, result, progress.attempts.length + 1, answer, result);
  }, emptyProgress());
}
