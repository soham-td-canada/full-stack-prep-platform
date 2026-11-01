import { questions } from "@/data/questions";
import { implementationGroups, recordAttempt } from "@/lib/learning";
import { concepts, emptyProgress, type Concept } from "@/lib/model";
import { evaluateStructured } from "@/lib/structured";

export function structuredSolution(question: (typeof questions)[number], wrongField?: string) {
  if (!question.structured) throw new Error(`Not a structured question: ${question.id}`);
  return JSON.stringify(Object.fromEntries(question.structured.fields.map((field) => {
    if (field.id !== wrongField) return [field.id, field.kind === "text" ? [field.accepted[0]] : field.correct];
    if (field.kind === "text") return [field.id, ["not an accepted answer"]];
    const incorrect = field.choices.find((choice) => !field.correct.includes(choice.id));
    return [field.id, field.multiple ? [incorrect?.id ?? ""] : [incorrect?.id ?? ""]];
  })));
}

export function recordStructured(progress: ReturnType<typeof emptyProgress>, question: (typeof questions)[number],
  timestamp: number, wrongField?: string) {
  const answer = structuredSolution(question, wrongField);
  const result = evaluateStructured(question, answer).result;
  return recordAttempt(progress, question, result, timestamp, answer, result);
}

export function readyProgress() {
  let progress = emptyProgress();
  for (const concept of Object.keys(concepts) as Concept[]) {
    for (const mode of ["reconstruction", "prints", "debug"] as const) {
      const q = questions.find((q) => q.concepts.includes(concept) && q.mode === mode &&
        q.depth === "core" && (mode === "debug" ? q.difficulty === "medium" : true));
      if (!q) throw new Error(`Missing fixture question: ${concept}/${mode}`);
      const answer = q.structured ? structuredSolution(q) : q.answer;
      progress = recordAttempt(progress, q, "correct", progress.attempts.length + 1, answer,
        q.structured ? "correct" : null);
    }
  }
  for (const group of implementationGroups) {
    const q = questions.find((q) => q.id === group.questions[0])!;
    progress = recordAttempt(progress, q, "correct", progress.attempts.length + 1);
  }
  for (const id of ["scope-loop", "this-bound", "proto-class"]) {
    progress = recordAttempt(progress, questions.find((q) => q.id === id)!, "correct", progress.attempts.length + 1);
  }
  return progress;
}
