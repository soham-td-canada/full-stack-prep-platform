import type { Question, Result, StructuredField } from "./model";

export type StructuredAnswer = Record<string, string[]>;
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function readStructuredAnswer(answer: string): StructuredAnswer {
  if (!answer) return {};
  const value: unknown = JSON.parse(answer);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Object.values(value).every((entry) => Array.isArray(entry) && entry.every((item) => typeof item === "string"))) {
    throw new Error("Invalid structured answer.");
  }
  return value as StructuredAnswer;
}

export function fieldCorrect(field: StructuredField, values: string[] = []) {
  if (field.kind === "text") return values.length === 1 &&
    field.accepted.some((alias) => field.exact
      ? alias.replace(/\r\n/g, "\n").trim() === values[0].replace(/\r\n/g, "\n").trim()
      : normalize(alias) === normalize(values[0]));
  return values.length === field.correct.length && new Set(values).size === values.length &&
    field.correct.every((id) => values.includes(id));
}

export function structuredValidDraft(question: Question, answer: string) {
  if (!question.structured) throw new Error(`Missing structured exercise: ${question.id}`);
  const values = readStructuredAnswer(answer);
  return Object.keys(values).every((id) => question.structured!.fields.some((field) => field.id === id)) &&
    question.structured.fields.every((field) => {
      const selected = values[field.id] ?? [];
      if (field.kind === "text") return selected.length <= 1;
      return (field.multiple || selected.length <= 1) &&
        new Set(selected).size === selected.length &&
        selected.every((id) => id === "" || field.choices.some((choice) => choice.id === id));
    });
}

export function structuredComplete(question: Question, answer: string) {
  if (!structuredValidDraft(question, answer)) return false;
  const values = readStructuredAnswer(answer);
  return question.structured!.fields.every((field) => (values[field.id]?.length ?? 0) > 0 &&
    values[field.id].every((value) => !!value.trim()));
}

export function evaluateStructured(question: Question, answer: string) {
  if (!question.structured) throw new Error(`Missing structured exercise: ${question.id}`);
  if (!structuredComplete(question, answer)) throw new Error("Complete every part before submitting.");
  const values = readStructuredAnswer(answer);
  const failed = question.structured.fields.filter((field) => !fieldCorrect(field, values[field.id]));
  const criticalMiss = failed.some((field) => field.severity === "critical");
  const result: Result = !failed.length ? "correct" :
    criticalMiss || failed.length === question.structured.fields.length ? "miss" : "partial";
  const score = criticalMiss ? 0 : (question.structured.fields.length - failed.length) / question.structured.fields.length;
  return { result, score, failed: failed.map((field) => field.id),
    mistakeTags: [...new Set(failed.flatMap((field) => field.misconceptionTag ? [field.misconceptionTag] : []))] };
}
